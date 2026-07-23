/**
 * Webhook oficial WhatsApp Cloud API (Meta).
 * - GET: verificação do challenge
 * - POST: mensagem inbound do cliente → abre/renova janela 24h
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function telefoneDigitos(waId: string): string {
  return waId.replace(/\D/g, "");
}

function extrairPedidoDaMensagem(texto: string): {
  sequencia: number | null;
  codigo: string | null;
} {
  const seq = texto.match(/#\s*(\d+)/);
  const codigo = texto.match(/[Cc][óo]digo:\s*([a-f0-9-]{8,})/i);
  return {
    sequencia: seq ? Number(seq[1]) : null,
    codigo: codigo?.[1] || null,
  };
}

async function enviarTexto(
  para: string,
  corpo: string,
): Promise<void> {
  const token = Deno.env.get("WHATSAPP_TOKEN");
  const phoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  if (!token || !phoneId) return;

  await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: para,
      type: "text",
      text: { preview_url: false, body: corpo },
    }),
  });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Verificação do webhook (Meta)
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const esperado = Deno.env.get("WHATSAPP_VERIFY_TOKEN");

    if (mode === "subscribe" && token && esperado && token === esperado) {
      return new Response(challenge || "", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") {
    return json({ erro: "method" }, 405);
  }

  try {
    const payload = await req.json();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const entries = payload?.entry || [];
    for (const entry of entries) {
      const changes = entry?.changes || [];
      for (const change of changes) {
        const value = change?.value;
        const messages = value?.messages || [];
        for (const msg of messages) {
          if (msg.type !== "text") continue;
          const from = telefoneDigitos(String(msg.from || ""));
          const texto = String(msg.text?.body || "");
          if (!from) continue;

          const { sequencia, codigo } = extrairPedidoDaMensagem(texto);
          let pedidoId: string | null = null;

          if (codigo) {
            const { data: recentes } = await supabase
              .from("pedidos")
              .select("id")
              .order("criado_em", { ascending: false })
              .limit(80);
            pedidoId =
              recentes?.find((p) =>
                String(p.id).toLowerCase().startsWith(codigo.toLowerCase()),
              )?.id || null;
          }

          if (!pedidoId && sequencia != null) {
            const { data } = await supabase
              .from("pedidos")
              .select("id")
              .eq("sequencia_pedido", sequencia)
              .order("criado_em", { ascending: false })
              .limit(1)
              .maybeSingle();
            pedidoId = data?.id || null;
          }

          // Fallback: último pedido desse telefone
          if (!pedidoId) {
            const celularLocal = from.startsWith("55") ? from.slice(2) : from;
            const { data } = await supabase
              .from("pedidos")
              .select("id")
              .or(
                `cliente_celular.eq.${from},cliente_celular.eq.${celularLocal},cliente_celular.ilike.%${celularLocal.slice(-9)}`,
              )
              .order("criado_em", { ascending: false })
              .limit(1)
              .maybeSingle();
            pedidoId = data?.id || null;
          }

          const janelaAte = new Date(
            Date.now() + 24 * 60 * 60 * 1000,
          ).toISOString();

          await supabase.from("whatsapp_sessoes").upsert(
            {
              telefone: from,
              janela_ate: janelaAte,
              ultimo_pedido_id: pedidoId,
              ultimo_inbound_em: new Date().toISOString(),
              atualizado_em: new Date().toISOString(),
            },
            { onConflict: "telefone" },
          );

          const conf =
            pedidoId != null
              ? `Pronto! Vamos te avisar por aqui a cada atualização do seu pedido. 🍪\nJanela ativa por 24h — se precisar, envie outra mensagem depois.`
              : `Recebemos sua mensagem! Envie o número do pedido (ex: #42) para vincularmos as atualizações.`;

          await enviarTexto(from, conf);
        }
      }
    }

    // Meta exige 200 rápido
    return json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[WHATSAPP WEBHOOK]", msg);
    // Ainda 200 para não reintentar infinito em bugs de parse
    return json({ ok: true, erro: msg });
  }
});
