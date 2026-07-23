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
    const voaKey = Deno.env.get("VOA_KEY");
    const voaToken = Deno.env.get("VOA_TOKEN");
    const voaBase = Deno.env.get("VOA_API_URL") || "https://api.voa.delivery";

    if (!voaKey || !voaToken) {
      return json({ erro: "VOA_KEY/VOA_TOKEN não configurados" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ erro: "Não autorizado" }, 401);

    const { pedido_id } = await req.json();
    if (!pedido_id) return json({ erro: "pedido_id obrigatório" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: pedido, error } = await supabase
      .from("pedidos")
      .select(
        `
        id, sequencia_pedido, modalidade, status, status_pagamento,
        cliente_nome, cliente_celular, total, valor_total, endereco_json,
        voa_order_id, tracking_url,
        pedido_itens (
          quantidade, observacoes, preco_unitario,
          produtos ( nome ),
          pedido_item_adicionais ( adicionais ( nome ) ),
          pedido_item_combo_escolhas ( nome_grupo, nome_produto )
        )
      `,
      )
      .eq("id", pedido_id)
      .single();

    if (error || !pedido) return json({ erro: "Pedido não encontrado" }, 404);

    if (pedido.modalidade !== "entrega") {
      return json({ ok: true, skipped: "não é entrega" });
    }

    if (pedido.status !== "pronto") {
      return json({ erro: "Pedido ainda não está pronto" }, 400);
    }

    if (pedido.voa_order_id) {
      return json({
        ok: true,
        voa_order_id: pedido.voa_order_id,
        tracking_url: pedido.tracking_url,
      });
    }

    const endereco = pedido.endereco_json as {
      cep?: string;
      rua?: string;
      numero?: string;
      bairro?: string;
      cidade?: string;
      uf?: string;
      complemento?: string;
      latitude?: number;
      longitude?: number;
    } | null;

    if (!endereco?.latitude || !endereco?.longitude) {
      return json({ erro: "Endereço sem coordenadas" }, 400);
    }

    const valorCentavos = Math.round(
      Number(pedido.valor_total ?? pedido.total ?? 0) * 100,
    );

    const items = (pedido.pedido_itens || []).map(
      (item: {
        quantidade: number;
        observacoes: string | null;
        produtos: { nome: string } | null;
        pedido_item_adicionais?: Array<{
          adicionais: { nome: string } | null;
        }>;
        pedido_item_combo_escolhas?: Array<{
          nome_grupo: string;
          nome_produto: string;
        }>;
      }) => {
        const subItems = [
          ...(item.pedido_item_adicionais || []).map((a) => ({
            description: a.adicionais?.nome || "Adicional",
            quantity: 1,
          })),
          ...(item.pedido_item_combo_escolhas || []).map((e) => ({
            description: `${e.nome_grupo}: ${e.nome_produto}`,
            quantity: 1,
          })),
        ];
        return {
          description: item.produtos?.nome || "Item",
          quantity: item.quantidade,
          notes: item.observacoes || undefined,
          sub_items: subItems.length ? subItems : undefined,
        };
      },
    );

    const body = {
      external_id: pedido.id,
      display_id: String(pedido.sequencia_pedido),
      customer: {
        name: pedido.cliente_nome,
        phone: (pedido.cliente_celular || "").replace(/\D/g, "") || "00000000000",
      },
      address: {
        country: "BR",
        state: endereco.uf || "SP",
        city: endereco.cidade || "",
        neighborhood: endereco.bairro || "",
        street: endereco.rua || "",
        number: endereco.numero || "S/N",
        zip_code: (endereco.cep || "").replace(/\D/g, ""),
        complement: endereco.complemento || "",
        coordinates: {
          latitude: Number(endereco.latitude),
          longitude: Number(endereco.longitude),
        },
      },
      payment: {
        prepaid: valorCentavos,
        pending: 0,
        methods: [
          {
            value: valorCentavos,
            method: "PIX",
            type: "ONLINE",
          },
        ],
      },
      items,
      external_data: { pedido_id: pedido.id },
    };

    const qs = new URLSearchParams({ key: voaKey, token: voaToken });
    const createRes = await fetch(
      `${voaBase}/v1/external-orders?${qs}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );

    const createJson = await createRes.json();
    if (!createRes.ok) {
      console.error("[VOA] create", createJson);
      return json(
        { erro: createJson?.message || "Falha ao criar pedido VOA" },
        502,
      );
    }

    const voaId = createJson.id as string;

    const readyRes = await fetch(
      `${voaBase}/v1/external-orders/${voaId}/ready?${qs}`,
      { method: "POST", headers: { "Content-Type": "application/json" } },
    );

    if (!readyRes.ok) {
      const readyErr = await readyRes.text();
      console.error("[VOA] ready", readyErr);
    }

    const trackingUrl =
      createJson.tracking_url ||
      createJson.trackingUrl ||
      null;

    await supabase
      .from("pedidos")
      .update({
        voa_order_id: voaId,
        tracking_url: trackingUrl,
      })
      .eq("id", pedido.id);

    return json({ ok: true, voa_order_id: voaId, tracking_url: trackingUrl });
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
