/**
 * Confirma pagamento no retorno do checkout (?pago=1).
 * Consulta Asaas por externalReference e marca o pedido como pago
 * se o webhook ainda não tiver atualizado.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const STATUS_PAGO_ASAAS = new Set([
  "RECEIVED",
  "CONFIRMED",
  "RECEIVED_IN_CASH",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const bodyIn = await req.json();
    const pedidoId = String(bodyIn?.pedido_id || "");
    if (!pedidoId) return json({ erro: "pedido_id obrigatório" }, 400);

    const asaasKey = Deno.env.get("ASAAS_API_KEY");
    const asaasEnv = (Deno.env.get("ASAAS_ENV") || "sandbox").toLowerCase();
    const asaasBase =
      Deno.env.get("ASAAS_API_URL") ||
      (asaasEnv === "production"
        ? "https://api.asaas.com/v3"
        : "https://api-sandbox.asaas.com/v3");

    if (!asaasKey) return json({ erro: "ASAAS_API_KEY não configurada" }, 500);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: pedido, error } = await supabase
      .from("pedidos")
      .select("id, status_pagamento, asaas_checkout_id, asaas_payment_id")
      .eq("id", pedidoId)
      .single();

    if (error || !pedido) return json({ erro: "Pedido não encontrado" }, 404);

    if (pedido.status_pagamento === "pago") {
      return json({ ok: true, status_pagamento: "pago", ja_pago: true });
    }

    if (pedido.status_pagamento !== "aguardando") {
      return json({
        ok: true,
        status_pagamento: pedido.status_pagamento,
        sincronizado: false,
      });
    }

    const url = new URL(`${asaasBase}/payments`);
    url.searchParams.set("externalReference", pedidoId);
    url.searchParams.set("limit", "20");

    const res = await fetch(url.toString(), {
      headers: {
        accept: "application/json",
        access_token: asaasKey,
      },
    });

    const data = await res.json();
    if (!res.ok) {
      console.error("[ASAAS SYNC]", data);
      return json(
        { erro: data?.errors?.[0]?.description || "Falha ao consultar Asaas" },
        502,
      );
    }

    const cobrancas = (data?.data || []) as Array<{
      id?: string;
      status?: string;
    }>;
    const paga = cobrancas.find((c) =>
      STATUS_PAGO_ASAAS.has(String(c.status || "").toUpperCase()),
    );

    if (!paga) {
      return json({
        ok: true,
        status_pagamento: "aguardando",
        sincronizado: false,
        aguardando_asaas: true,
      });
    }

    const { error: updErr } = await supabase
      .from("pedidos")
      .update({
        status_pagamento: "pago",
        status: "pendente",
        asaas_payment_id: paga.id || pedido.asaas_payment_id || null,
      })
      .eq("id", pedido.id)
      .eq("status_pagamento", "aguardando");

    if (updErr) throw updErr;

    try {
      await supabase.rpc("creditar_pontos_pedido", { p_pedido_id: pedido.id });
    } catch (e) {
      console.error("[ASAAS SYNC] pontos", e);
    }

    return json({
      ok: true,
      status_pagamento: "pago",
      sincronizado: true,
      payment_id: paga.id,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[ASAAS SYNC]", msg);
    return json({ erro: msg }, 500);
  }
});
