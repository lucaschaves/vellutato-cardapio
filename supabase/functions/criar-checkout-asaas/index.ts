import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsBrowser, respostaOpcoes } from "../_shared/cors.ts";
import { ehAnonOuAutenticado, uuidValido } from "../_shared/jwt.ts";
import { lerSegredos } from "../_shared/segredos.ts";

/** 1x1 PNG — OpenAPI do Asaas marca imageBase64 como required nos items */
const ITEM_IMAGE_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

type EnderecoSnap = {
  cep?: string;
  rua?: string;
  numero?: string | number;
  bairro?: string;
  cidade?: string;
  uf?: string;
  complemento?: string | null;
};

function somenteDigitos(valor: unknown): string {
  return typeof valor === "string" ? valor.replace(/\D/g, "") : "";
}

function enderecoAsaasCompleto(e: EnderecoSnap | null | undefined): boolean {
  if (!e) return false;
  const cep = somenteDigitos(e.cep);
  return Boolean(
    e.rua?.toString().trim() &&
      e.numero != null &&
      String(e.numero).trim() &&
      cep.length === 8 &&
      e.bairro?.toString().trim(),
  );
}

function extrairCepDeTexto(texto: string): string | null {
  const m = String(texto || "")
    .replace(/\s/g, "")
    .match(/(\d{5})-?(\d{3})/);
  return m ? `${m[1]}${m[2]}` : null;
}

function extrairNumeroDeTexto(texto: string): string {
  const t = String(texto || "");
  const m =
    t.match(/,\s*n[ºo°.]?\s*(\d+[A-Za-z\-/]*)/i) ||
    t.match(/\bn[ºo°.]?\s*(\d+[A-Za-z\-/]*)/i) ||
    t.match(/,\s*(\d+[A-Za-z\-/]*)\b/);
  return m?.[1]?.trim() || "S/N";
}

type ViaCepResultado = {
  cep: string;
  rua: string;
  bairro: string;
  cidade: string;
  uf: string;
  ibge: number | null;
};

async function consultarViaCep(cep: string): Promise<ViaCepResultado | null> {
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.erro) return null;
    const ibge = Number(data?.ibge);
    return {
      cep,
      rua: String(data?.logradouro || "").trim(),
      bairro: String(data?.bairro || "").trim(),
      cidade: String(data?.localidade || "").trim(),
      uf: String(data?.uf || "").trim(),
      ibge: Number.isFinite(ibge) ? ibge : null,
    };
  } catch {
    return null;
  }
}

async function codigoIbgePorCep(cep: string): Promise<number | null> {
  const via = await consultarViaCep(cep);
  return via?.ibge ?? null;
}

/** Endereço da loja (impressão) para preencher Asaas em retirada. */
async function enderecoLojaParaAsaas(
  // deno-lint-ignore no-explicit-any
  supabase: any,
): Promise<EnderecoSnap | null> {
  const { data, error } = await supabase
    .from("impressao_config")
    .select("config")
    .eq("id", 1)
    .maybeSingle();

  if (error || !data?.config) return null;

  const loja = (data.config as { loja?: Record<string, unknown> }).loja;
  if (!loja || typeof loja !== "object") return null;

  // Campos estruturados opcionais (se existirem no JSON).
  const cepEstruturado = somenteDigitos(loja.cep);
  if (
    cepEstruturado.length === 8 &&
    String(loja.rua || "").trim() &&
    String(loja.numero || "").trim() &&
    String(loja.bairro || "").trim()
  ) {
    return {
      cep: cepEstruturado,
      rua: String(loja.rua).trim(),
      numero: String(loja.numero).trim(),
      bairro: String(loja.bairro).trim(),
      cidade: String(loja.cidade || "").trim() || undefined,
      uf: String(loja.uf || "").trim() || undefined,
      complemento: "Retirada na loja",
    };
  }

  const texto = String(loja.endereco || "").trim();
  if (!texto) return null;

  const cep = extrairCepDeTexto(texto);
  if (!cep) return null;

  const via = await consultarViaCep(cep);
  if (!via) return null;

  return {
    cep: via.cep,
    rua: via.rua || texto.split(",")[0]?.trim() || "Loja",
    numero: extrairNumeroDeTexto(texto),
    bairro: via.bairro || "Centro",
    cidade: via.cidade || undefined,
    uf: via.uf || undefined,
    complemento: "Retirada na loja",
  };
}

function cpfValido(cpf: string): boolean {
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += Number(cpf[i]) * (10 - i);
  let resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  if (resto !== Number(cpf[9])) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += Number(cpf[i]) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  return resto === Number(cpf[10]);
}

function mensagensErroAsaas(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const obj = body as Record<string, unknown>;
  const erros = Array.isArray(obj.errors) ? obj.errors : [];
  const mensagens = erros
    .map((erro) => {
      if (!erro || typeof erro !== "object") return "";
      const e = erro as Record<string, unknown>;
      return String(e.description || e.message || e.code || "").trim();
    })
    .filter(Boolean);
  if (mensagens.length > 0) return mensagens;

  const unica = String(obj.message || obj.error || "").trim();
  return unica ? [unica] : [];
}

function mensagemAmigavelAsaas(mensagens: string[], status?: number): string {
  if (status === 401 || status === 403) {
    return "O pagamento está temporariamente indisponível. Entre em contato com a loja.";
  }
  if (status === 429) {
    return "Muitas tentativas de pagamento. Aguarde um instante e tente novamente.";
  }
  if (status != null && status >= 500) {
    return "O Asaas está temporariamente indisponível. Tente novamente em alguns instantes.";
  }
  const texto = mensagens.join(" ").toLowerCase();
  if (/cpfcnpj|cpf|cnpj/.test(texto)) {
    return "Informe um CPF válido para continuar com o pagamento.";
  }
  if (/postalcode|cep/.test(texto)) {
    return "O CEP informado não foi aceito pelo Asaas. Verifique o endereço.";
  }
  if (/phone|telefone/.test(texto)) {
    return "O telefone informado não foi aceito. Verifique o número com DDD.";
  }
  if (/email/.test(texto)) {
    return "O e-mail informado não foi aceito. Verifique e tente novamente.";
  }
  if (/customerdata|cliente/.test(texto)) {
    return "Os dados do cliente estão incompletos ou inválidos.";
  }
  return mensagens[0] || "O Asaas recusou os dados do pagamento.";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return respostaOpcoes(req);
  }

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsBrowser(req), "Content-Type": "application/json" },
    });

  try {
    if (!ehAnonOuAutenticado(req)) {
      return json({ erro: "Não autorizado" }, 401);
    }

    const bodyIn = await req.json();
    const segredos = await lerSegredos([
      "ASAAS_API_KEY",
      "ASAAS_ENV",
      "ASAAS_API_URL",
      "SITE_URL",
    ]);
    const asaasKey = segredos.ASAAS_API_KEY;
    const asaasEnv = (segredos.ASAAS_ENV || "sandbox").toLowerCase();
    const asaasBase =
      segredos.ASAAS_API_URL ||
      (asaasEnv === "production"
        ? "https://api.asaas.com/v3"
        : "https://api-sandbox.asaas.com/v3");
    const siteUrlEnv =
      (segredos.SITE_URL || "https://vellutatocookies.com.br").replace(
        /\/$/,
        "",
      );
    const originReq = (req.headers.get("Origin") || "").replace(/\/$/, "");
    const bodySite =
      typeof bodyIn?.site_url === "string"
        ? bodyIn.site_url.replace(/\/$/, "")
        : "";
    const siteUrlRaw =
      originReq.startsWith("http://localhost") ||
      originReq.startsWith("http://127.0.0.1")
        ? bodySite || originReq || siteUrlEnv
        : siteUrlEnv;
    const siteUrl = String(siteUrlRaw).replace(/\/$/, "");
    const isSandbox = asaasBase.includes("sandbox");
    const bridgeBase = `${Deno.env.get("SUPABASE_URL")}/functions/v1/asaas-callback`;

    /** Asaas só aceita https nas callbacks; localhost usa bridge. */
    const callbackUrl = (pathAndQuery: string) => {
      const path = pathAndQuery.startsWith("/")
        ? pathAndQuery
        : `/${pathAndQuery}`;
      const destino = `${siteUrl}${path}`;
      if (destino.startsWith("https://")) return destino;
      return `${bridgeBase}?to=${encodeURIComponent(destino)}`;
    };

    if (!asaasKey) {
      return json({ erro: "ASAAS_API_KEY não configurada" }, 500);
    }

    const pedido_id = bodyIn?.pedido_id;
    if (!uuidValido(pedido_id)) {
      return json({ erro: "pedido_id inválido" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: pedido, error } = await supabase
      .from("pedidos")
      .select(
        `
        id, sequencia_pedido, total, valor_total, status_pagamento, origem,
        cliente_nome, cliente_celular, cpf_nota, asaas_checkout_id, cliente_id,
        endereco_json, modalidade,
        clientes ( email )
      `,
      )
      .eq("id", pedido_id)
      .single();

    if (error || !pedido) {
      return json({ erro: "Pedido não encontrado" }, 404);
    }

    if (pedido.status_pagamento !== "aguardando") {
      return json({ erro: "Pedido não está aguardando pagamento" }, 400);
    }
    if (pedido.origem && pedido.origem !== "delivery") {
      return json({ erro: "Checkout só é permitido para pedidos delivery" }, 400);
    }
    const clienteBody = bodyIn?.cliente_id;
    if (clienteBody && uuidValido(clienteBody) && pedido.cliente_id) {
      if (String(clienteBody) !== String(pedido.cliente_id)) {
        return json({ erro: "Pedido não pertence a este cliente" }, 403);
      }
    }

    const hostCheckout = isSandbox ? "https://sandbox.asaas.com" : "https://asaas.com";
    const forcarNovo = Boolean(bodyIn?.forcar_novo);

    // Reusa o checkout existente só se ainda for válido e não pediram um novo.
    if (pedido.asaas_checkout_id && !forcarNovo) {
      const link =
        `${hostCheckout}/checkoutSession/show/${pedido.asaas_checkout_id}`;
      return json({
        checkout_id: pedido.asaas_checkout_id,
        checkout_url: link,
      });
    }

    const valor = Number(pedido.valor_total ?? pedido.total ?? 0);
    if (valor <= 0) return json({ erro: "Valor inválido" }, 400);

    const clienteRel = pedido.clientes as
      | { email?: string | null }
      | { email?: string | null }[]
      | null;
    const emailCliente = Array.isArray(clienteRel)
      ? clienteRel[0]?.email
      : clienteRel?.email;
    const email =
      (typeof bodyIn?.email === "string" && bodyIn.email.trim()) ||
      emailCliente?.trim() ||
      null;

    if (!email || !email.includes("@")) {
      return json(
        {
          erro:
            "E-mail do cliente é obrigatório para o pagamento. Faça login com Google ou complete o cadastro.",
        },
        400,
      );
    }

    // Usa o CPF salvo no pedido; o body é fallback para ambientes cuja RPC
    // ainda não persistiu p_cpf_nota. Nunca depende apenas do cliente.
    const cpfPedido = somenteDigitos(pedido.cpf_nota);
    const cpfBody = somenteDigitos(bodyIn?.cpf);
    const cpfCnpj = cpfPedido || cpfBody;
    if (!cpfValido(cpfCnpj)) {
      return json(
        {
          erro: "Informe um CPF válido para continuar com o pagamento.",
          codigo: "CPF_OBRIGATORIO",
          campo: "cpf",
        },
        400,
      );
    }

    if (!cpfPedido && cpfBody) {
      const { error: erroCpf } = await supabase
        .from("pedidos")
        .update({ cpf_nota: cpfBody })
        .eq("id", pedido.id);
      if (erroCpf) {
        console.warn("[ASAAS] Não foi possível persistir CPF no pedido:", erroCpf.message);
      }
    }

    let endereco = (pedido.endereco_json || null) as EnderecoSnap | null;

    if ((!endereco?.rua || !endereco?.cep) && pedido.cliente_id) {
      const { data: endPadrao } = await supabase
        .from("cliente_enderecos")
        .select("cep, rua, numero, bairro, cidade, uf, complemento")
        .eq("cliente_id", pedido.cliente_id)
        .order("padrao", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (endPadrao) endereco = endPadrao as EnderecoSnap;
    }

    if ((!endereco?.rua || !endereco?.cep) && bodyIn?.endereco) {
      endereco = bodyIn.endereco as EnderecoSnap;
    }

    const modalidade = String(pedido.modalidade || "");
    const ehRetirada = modalidade === "retirada";

    // Retirada: se o cliente não tem endereço, usa o da loja (Asaas exige endereço).
    if (!enderecoAsaasCompleto(endereco) && ehRetirada) {
      const enderecoLoja = await enderecoLojaParaAsaas(supabase);
      if (enderecoLoja) {
        console.info(
          "[ASAAS] Retirada sem endereço do cliente — usando endereço da loja",
          pedido.id,
        );
        endereco = enderecoLoja;
      }
    }

    if (!enderecoAsaasCompleto(endereco)) {
      return json(
        {
          erro: ehRetirada
            ? "Endereço da loja incompleto para o pagamento. Em Admin → Cupom de impressão, informe o endereço com CEP (ex.: Rua X, 123 — Bairro, Cidade/UF, 88000-000)."
            : "Endereço incompleto para o pagamento. Informe CEP, rua, número e bairro.",
        },
        400,
      );
    }

    const cepLimpo = somenteDigitos(endereco!.cep);
    const telefone =
      (pedido.cliente_celular || "").replace(/\D/g, "") || undefined;
    const addressNumberRaw = String(endereco!.numero ?? "").trim();
    const addressNumberParsed = Number.parseInt(
      addressNumberRaw.replace(/\D/g, ""),
      10,
    );
    const addressNumber = Number.isFinite(addressNumberParsed)
      ? addressNumberParsed
      : /s\/?n/i.test(addressNumberRaw)
        ? 0
        : NaN;
    if (!Number.isFinite(addressNumber)) {
      return json({ erro: "Número do endereço inválido" }, 400);
    }

    // Schema Asaas: city = código IBGE (integer)
    const cityIbge = await codigoIbgePorCep(cepLimpo);
    if (!cityIbge) {
      return json(
        {
          erro: ehRetirada
            ? "Não foi possível localizar o CEP da loja (IBGE). Verifique o endereço em Admin → Cupom de impressão."
            : "Não foi possível obter a cidade (IBGE) pelo CEP. Verifique o endereço.",
        },
        400,
      );
    }

    const nomeItem = `Pedido #${pedido.sequencia_pedido}`.slice(0, 30);

    // Retry pelo detalhe do pedido: cancel/expired voltam para /pedido
    const voltarPedido = forcarNovo || bodyIn?.callback_pedido === true;
    const cancelPath = voltarPedido
      ? `/pedido/${pedido.id}?cancelado=1`
      : `/checkout?cancelado=1&pedido=${pedido.id}`;
    const expiredPath = `/pedido/${pedido.id}?expirado=1`;

    // Alinhado ao CheckoutSessionSaveRequestDTO / CustomerDataDTO do MCP Asaas
    const payload = {
      billingTypes: ["PIX", "CREDIT_CARD"],
      chargeTypes: ["DETACHED"],
      // Asaas: mínimo 10, máximo 1440 (docs checkout)
      minutesToExpire: 10,
      externalReference: String(pedido.id).slice(0, 200),
      callback: {
        successUrl: callbackUrl(`/pedido/${pedido.id}?pago=1`),
        cancelUrl: callbackUrl(cancelPath),
        expiredUrl: callbackUrl(expiredPath),
      },
      items: [
        {
          name: nomeItem,
          description: "Pedido delivery Vellutato".slice(0, 150),
          quantity: 1,
          value: Number(valor.toFixed(2)),
          imageBase64: ITEM_IMAGE_B64,
        },
      ],
      customerData: {
        name: String(pedido.cliente_nome || "").slice(0, 100),
        email,
        cpfCnpj,
        phone: telefone,
        postalCode: cepLimpo,
        address: String(endereco.rua).trim(),
        addressNumber,
        complement: endereco.complemento
          ? String(endereco.complemento).slice(0, 255)
          : undefined,
        province: String(endereco.bairro).trim(),
        city: cityIbge,
      },
    };

    let res: Response;
    try {
      res = await fetch(`${asaasBase}/checkouts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          accept: "application/json",
          access_token: asaasKey,
        },
        body: JSON.stringify(payload),
      });
    } catch (erroRede) {
      console.error("[ASAAS] Falha de rede:", erroRede);
      return json(
        {
          erro:
            "Não foi possível conectar ao Asaas. Aguarde alguns instantes e tente novamente.",
          codigo: "ASAAS_INDISPONIVEL",
        },
        503,
      );
    }

    const respostaTexto = await res.text();
    let body: Record<string, unknown> = {};
    try {
      body = respostaTexto
        ? (JSON.parse(respostaTexto) as Record<string, unknown>)
        : {};
    } catch {
      console.error("[ASAAS] Resposta não JSON:", respostaTexto);
    }
    if (!res.ok) {
      console.error("[ASAAS] checkout", body);
      const detalhes = mensagensErroAsaas(body);
      return json(
        {
          erro: mensagemAmigavelAsaas(detalhes, res.status),
          codigo: "ASAAS_VALIDACAO",
          detalhes,
        },
        res.status >= 400 && res.status < 500 ? 400 : 502,
      );
    }

    const checkoutId = body.id as string;
    if (!checkoutId) {
      console.error("[ASAAS] Checkout criado sem ID:", body);
      return json(
        {
          erro: "O Asaas não retornou a identificação do pagamento.",
          codigo: "ASAAS_RESPOSTA_INVALIDA",
        },
        502,
      );
    }
    const checkoutUrl =
      (body.link as string) ||
      `${hostCheckout}/checkoutSession/show/${checkoutId}`;

    await supabase
      .from("pedidos")
      .update({ asaas_checkout_id: checkoutId })
      .eq("id", pedido.id);

    return json({ checkout_id: checkoutId, checkout_url: checkoutUrl });
  } catch (e) {
    console.error(e);
    return json({ erro: String(e) }, 500);
  }
});
