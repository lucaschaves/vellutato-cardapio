/**
 * Envia Web Push + WhatsApp (se janela 24h ativa) ao mudar status do pedido.
 * Invocado pelo KDS após atualizar status.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FRASE_STATUS: Record<string, string> = {
  pendente: "Recebemos o seu pedido e já vamos preparar! 🍪",
  em_producao: "Seu pedido está em preparo! 👨‍🍳",
  pronto: "Seu pedido está pronto! 🎉",
  entregue: "Pedido entregue. Obrigado pela preferência! ❤️",
  cancelado: "Seu pedido foi cancelado.",
  aguardando_pagamento: "Aguardando confirmação do pagamento.",
  pago: "Pagamento confirmado! Pedido na fila.",
};

const LABEL: Record<string, string> = {
  pendente: "Recebido",
  em_producao: "Em preparo",
  pronto: "Pronto",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function telefoneDigitos(celular: string | null | undefined): string | null {
  const d = (celular || "").replace(/\D/g, "");
  if (d.length < 10) return null;
  return d.startsWith("55") ? d : `55${d}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const pedidoId = String(body?.pedido_id || "");
    if (!pedidoId) return json({ erro: "pedido_id obrigatório" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: pedido, error } = await supabase
      .from("pedidos")
      .select(
        "id, sequencia_pedido, status, cliente_celular, cliente_id, cliente_nome",
      )
      .eq("id", pedidoId)
      .single();

    if (error || !pedido) {
      return json({ erro: "Pedido não encontrado" }, 404);
    }

    const status = String(body?.status || pedido.status);
    const frase = FRASE_STATUS[status] || `Status: ${status}`;
    const label = LABEL[status] || status;
    const titulo = `Pedido #${pedido.sequencia_pedido ?? ""}`.trim();
    const siteUrl = (Deno.env.get("SITE_URL") || "").replace(/\/$/, "");
    const urlPedido = siteUrl
      ? `${siteUrl}/delivery/pedido/${pedido.id}`
      : `/delivery/pedido/${pedido.id}`;

    const resultados = {
      push: 0,
      pushErros: 0,
      whatsapp: false,
      whatsappMotivo: null as string | null,
    };

    // --- Web Push ---
    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:contato@vellutato.com";

    if (vapidPublic && vapidPrivate) {
      webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

      let query = supabase.from("push_subscriptions").select("*");
      if (pedido.cliente_id) {
        query = query.or(
          `pedido_id.eq.${pedido.id},cliente_id.eq.${pedido.cliente_id}`,
        );
      } else {
        query = query.eq("pedido_id", pedido.id);
      }

      const { data: subs } = await query;
      const payload = JSON.stringify({
        title: titulo,
        body: frase,
        url: urlPedido,
        tag: `pedido-${pedido.id}`,
      });

      for (const sub of subs || []) {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload,
          );
          resultados.push += 1;
        } catch (e: unknown) {
          resultados.pushErros += 1;
          const statusCode =
            e && typeof e === "object" && "statusCode" in e
              ? Number((e as { statusCode: number }).statusCode)
              : 0;
          console.error("[PUSH] falha", sub.endpoint.slice(0, 40), e);
          if (statusCode === 404 || statusCode === 410) {
            await supabase
              .from("push_subscriptions")
              .delete()
              .eq("endpoint", sub.endpoint);
          }
        }
      }
    }

    // --- WhatsApp (só se janela 24h ativa) ---
    const waToken = Deno.env.get("WHATSAPP_TOKEN");
    const waPhoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
    const telefone = telefoneDigitos(pedido.cliente_celular);

    if (!waToken || !waPhoneId) {
      resultados.whatsappMotivo = "whatsapp_nao_configurado";
    } else if (!telefone) {
      resultados.whatsappMotivo = "sem_telefone";
    } else {
      const { data: sessao } = await supabase
        .from("whatsapp_sessoes")
        .select("janela_ate, ultimo_pedido_id")
        .eq("telefone", telefone)
        .maybeSingle();

      const janelaOk =
        sessao?.janela_ate &&
        new Date(sessao.janela_ate).getTime() > Date.now();

      if (!janelaOk) {
        resultados.whatsappMotivo = "janela_inativa";
      } else {
        const nome =
          (pedido.cliente_nome || "").trim().split(/\s+/)[0] || "cliente";
        const texto =
          `Olá, ${nome}! 😊\n` +
          `*Pedido #${pedido.sequencia_pedido}*\n` +
          `${frase}\n\n` +
          `Status: *${label}*`;

        const resp = await fetch(
          `https://graph.facebook.com/v21.0/${waPhoneId}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${waToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              to: telefone,
              type: "text",
              text: { preview_url: false, body: texto },
            }),
          },
        );

        if (!resp.ok) {
          const errBody = await resp.text();
          console.error("[WHATSAPP] send failed", resp.status, errBody);
          resultados.whatsappMotivo = `api_${resp.status}`;
        } else {
          resultados.whatsapp = true;
        }
      }
    }

    return json({ ok: true, ...resultados });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[NOTIFICAR]", msg);
    return json({ erro: msg }, 500);
  }
});
