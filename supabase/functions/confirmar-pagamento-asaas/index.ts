/**
 * Confirma pagamento no retorno do checkout (?pago=1).
 * Consulta Asaas por externalReference e marca o pedido como pago
 * se o webhook ainda não tiver atualizado.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsBrowser, respostaOpcoes } from "../_shared/cors.ts";
import { ehAnonOuAdmin, uuidValido } from "../_shared/jwt.ts";
import { lerSegredos } from "../_shared/segredos.ts";

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsBrowser(req), "Content-Type": "application/json" },
  });
}

const STATUS_PAGO_ASAAS = new Set([
  "RECEIVED",
  "CONFIRMED",
  "RECEIVED_IN_CASH",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return respostaOpcoes(req);
  }

  try {
    if (!ehAnonOuAdmin(req)) {
      return json(req, { erro: "Não autorizado" }, 401);
    }
    const bodyIn = await req.json();
    const pedidoId = bodyIn?.pedido_id;
    if (!uuidValido(pedidoId)) {
      return json(req, { erro: "pedido_id inválido" }, 400);
    }

    const segredos = await lerSegredos([
      "ASAAS_API_KEY",
      "ASAAS_ENV",
      "ASAAS_API_URL",
    ]);
    const asaasKey = segredos.ASAAS_API_KEY;
    const asaasEnv = (segredos.ASAAS_ENV || "sandbox").toLowerCase();
    const asaasBase =
      segredos.ASAAS_API_URL ||
      (asaasEnv === "production"
        ? "https://api.asaas.com/v3"
        : "https://api-sandbox.asaas.com/v3");

    if (!asaasKey) return json(req, { erro: "ASAAS_API_KEY não configurada" }, 500);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: pedido, error } = await supabase
      .from("pedidos")
      .select("id, status_pagamento, asaas_checkout_id, asaas_payment_id")
      .eq("id", pedidoId)
      .single();

    if (error || !pedido) return json(req, { erro: "Pedido não encontrado" }, 404);

    if (pedido.status_pagamento === "pago") {
      return json(req, { ok: true, status_pagamento: "pago", ja_pago: true });
    }

    if (pedido.status_pagamento !== "aguardando") {
      return json(req, {
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
        req,
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
      return json(req, {
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
      await supabase.rpc("registrar_uso_cupom_ao_confirmar_pagamento", {
        p_pedido_id: pedido.id,
      });
    } catch (e) {
      console.error("[ASAAS SYNC] cupom", e);
    }

    try {
      await supabase.rpc("creditar_pontos_pedido", { p_pedido_id: pedido.id });
    } catch (e) {
      console.error("[ASAAS SYNC] pontos", e);
    }

    return json(req, {
      ok: true,
      status_pagamento: "pago",
      sincronizado: true,
      payment_id: paga.id,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[ASAAS SYNC]", msg);
    return json(req, { erro: msg }, 500);
  }
});
