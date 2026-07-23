import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const tokenEsperado = Deno.env.get("VOA_WEBHOOK_TOKEN");
    const tokenRecebido = new URL(req.url).searchParams.get("token");
    if (tokenEsperado && tokenRecebido !== tokenEsperado) {
      return json({ erro: "Não autorizado" }, 401);
    }

    const payload = await req.json();
    const voaId =
      payload?.id ||
      payload?.order_id ||
      payload?.orderId ||
      payload?.data?.id;
    const externalId =
      payload?.external_id ||
      payload?.externalId ||
      payload?.external_data?.pedido_id ||
      payload?.data?.external_id;
    const status =
      payload?.status || payload?.data?.status || payload?.event;
    const trackingUrl =
      payload?.tracking_url ||
      payload?.trackingUrl ||
      payload?.data?.tracking_url ||
      null;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let query = supabase.from("pedidos").select("id, status");
    if (externalId) query = query.eq("id", externalId);
    else if (voaId) query = query.eq("voa_order_id", voaId);
    else return json({ erro: "Sem id" }, 400);

    const { data: pedido } = await query.maybeSingle();
    if (!pedido) return json({ ok: true, ignored: true });

    const updates: Record<string, unknown> = {};
    if (trackingUrl) updates.tracking_url = trackingUrl;
    if (voaId) updates.voa_order_id = voaId;

    const statusNorm = String(status || "").toLowerCase();
    if (
      ["delivered", "entregue", "completed", "concluido"].some((s) =>
        statusNorm.includes(s),
      )
    ) {
      updates.status = "entregue";
    } else if (
      ["canceled", "cancelled", "cancelado"].some((s) =>
        statusNorm.includes(s),
      )
    ) {
      updates.status = "cancelado";
    }

    if (Object.keys(updates).length) {
      await supabase.from("pedidos").update(updates).eq("id", pedido.id);
    }

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
