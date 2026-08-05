import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { lerSegredos } from "../_shared/segredos.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

async function codigoIbgePorCep(cep: string): Promise<number | null> {
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.erro) return null;
    const ibge = Number(data?.ibge);
    return Number.isFinite(ibge) ? ibge : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
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
    const siteUrlRaw =
      (typeof bodyIn?.site_url === "string" && bodyIn.site_url) ||
      segredos.SITE_URL ||
      "http://localhost:5173";
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
    if (!pedido_id) return json({ erro: "pedido_id obrigatório" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: pedido, error } = await supabase
      .from("pedidos")
      .select(
        `
        id, sequencia_pedido, total, valor_total, status_pagamento,
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

    if (!endereco?.rua || !endereco?.numero || !endereco?.cep || !endereco?.bairro) {
      return json(
        {
          erro:
            "Endereço incompleto para o pagamento. Informe CEP, rua, número e bairro.",
        },
        400,
      );
    }

    const cepLimpo = String(endereco.cep).replace(/\D/g, "");
    const telefone =
      (pedido.cliente_celular || "").replace(/\D/g, "") || undefined;
    const addressNumber = Number.parseInt(String(endereco.numero).replace(/\D/g, ""), 10);
    if (!Number.isFinite(addressNumber)) {
      return json({ erro: "Número do endereço inválido" }, 400);
    }

    // Schema Asaas: city = código IBGE (integer)
    const cityIbge = await codigoIbgePorCep(cepLimpo);
    if (!cityIbge) {
      return json(
        {
          erro:
            "Não foi possível obter a cidade (IBGE) pelo CEP. Verifique o endereço.",
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
      minutesToExpire: 30,
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

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
