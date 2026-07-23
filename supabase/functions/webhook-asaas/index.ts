import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, asaas-access-token",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const tokenEsperado = Deno.env.get("ASAAS_WEBHOOK_TOKEN");
    const tokenRecebido =
      req.headers.get("asaas-access-token") ||
      new URL(req.url).searchParams.get("token");

    if (tokenEsperado && tokenRecebido !== tokenEsperado) {
      return json({ erro: "Não autorizado" }, 401);
    }

    const payload = await req.json();
    const event = payload?.event || payload?.type;
    const checkout = payload?.checkout || payload?.checkoutSession;
    const payment = payload?.payment;

    const externalRef =
      checkout?.externalReference ||
      payment?.externalReference ||
      payload?.externalReference;

    const checkoutId = checkout?.id || payment?.checkoutSession;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const eventosPagos = [
      "CHECKOUT_PAID",
      "PAYMENT_CONFIRMED",
      "PAYMENT_RECEIVED",
    ];

    if (!eventosPagos.includes(String(event))) {
      return json({ ok: true, ignored: event });
    }

    let pedidoQuery = supabase.from("pedidos").select("id, status_pagamento");

    if (externalRef) {
      pedidoQuery = pedidoQuery.eq("id", externalRef);
    } else if (checkoutId) {
      pedidoQuery = pedidoQuery.eq("asaas_checkout_id", checkoutId);
    } else {
      return json({ erro: "Sem referência de pedido" }, 400);
    }

    const { data: pedido, error } = await pedidoQuery.maybeSingle();
    if (error || !pedido) {
      // 2xx evita interromper a fila do Asaas (pedido pode ainda não existir / evento de teste)
      console.error("[ASAAS WEBHOOK] pedido não encontrado", {
        externalRef,
        checkoutId,
      });
      return json({ ok: true, ignored: "pedido_nao_encontrado" });
    }

    if (pedido.status_pagamento === "pago") {
      return json({ ok: true, already: true });
    }

    const { error: updErr } = await supabase
      .from("pedidos")
      .update({
        status_pagamento: "pago",
        status: "pendente",
        asaas_payment_id: payment?.id || null,
      })
      .eq("id", pedido.id);

    if (updErr) throw updErr;

    await supabase.rpc("creditar_pontos_pedido", { p_pedido_id: pedido.id });

    return json({ ok: true, pedido_id: pedido.id });
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
