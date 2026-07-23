import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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
    const asaasKey = Deno.env.get("ASAAS_API_KEY");
    const asaasEnv = (Deno.env.get("ASAAS_ENV") || "sandbox").toLowerCase();
    const asaasBase =
      Deno.env.get("ASAAS_API_URL") ||
      (asaasEnv === "production"
        ? "https://api.asaas.com/v3"
        : "https://api-sandbox.asaas.com/v3");
    const siteUrlRaw =
      (typeof bodyIn?.site_url === "string" && bodyIn.site_url) ||
      Deno.env.get("SITE_URL") ||
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

    if (pedido.asaas_checkout_id) {
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

    // Alinhado ao CheckoutSessionSaveRequestDTO / CustomerDataDTO do MCP Asaas
    const payload = {
      billingTypes: ["PIX", "CREDIT_CARD"],
      chargeTypes: ["DETACHED"],
      minutesToExpire: 30,
      externalReference: String(pedido.id).slice(0, 200),
      callback: {
        successUrl: callbackUrl(`/delivery/pedido/${pedido.id}?pago=1`),
        cancelUrl: callbackUrl(
          `/delivery/checkout?cancelado=1&pedido=${pedido.id}`,
        ),
        expiredUrl: callbackUrl(
          `/delivery/pedido/${pedido.id}?expirado=1`,
        ),
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
        cpfCnpj: (pedido.cpf_nota || "").replace(/\D/g, "") || undefined,
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

    const res = await fetch(`${asaasBase}/checkouts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        accept: "application/json",
        access_token: asaasKey,
      },
      body: JSON.stringify(payload),
    });

    const body = await res.json();
    if (!res.ok) {
      console.error("[ASAAS] checkout", body);
      return json(
        { erro: body?.errors?.[0]?.description || "Falha ao criar checkout" },
        502,
      );
    }

    const checkoutId = body.id as string;
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
