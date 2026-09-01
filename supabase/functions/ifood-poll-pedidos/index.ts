import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { lerSegredo } from "../_shared/segredos.ts";
import {
  acknowledgmentEventos,
  buscarPedidoIfood,
  carregarCredenciaisIfood,
  confirmarPedidoIfood,
  ehEventoCancelado,
  ehEventoNovoPedido,
  ehEventoParaConfirmar,
  listarMerchants,
  obterAccessTokenIfood,
  pollingEventos,
  type IfoodEvento,
} from "../_shared/ifood.ts";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function uuidParece(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(v);
}

function soDigitos(v: string): string {
  return v.replace(/\D/g, "");
}

function telefoneBr(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "object" && v !== null) {
    const o = v as Record<string, unknown>;
    const num = o.number ?? o.phoneNumber ?? o.nationalNumber;
    if (num != null) return telefoneBr(String(num));
  }
  const d = soDigitos(String(v));
  if (!d) return null;
  if (d.startsWith("55") && d.length >= 12) return d.slice(2);
  if (d.length >= 10 && d.length <= 11) return d;
  return d.slice(-11) || null;
}

type ItemIfood = {
  id?: string;
  name?: string;
  externalCode?: string;
  quantity?: number;
  unitPrice?: number;
  price?: number;
  totalPrice?: number;
  observations?: string;
  options?: Array<{
    name?: string;
    externalCode?: string;
    quantity?: number;
    unitPrice?: number;
    price?: number;
  }>;
};

type MapaProduto = Map<string, string>; // externalCode → produto_id
type MapaAdicional = Map<string, string>;

async function carregarMapas(sb: SupabaseClient): Promise<{
  produtos: MapaProduto;
  adicionais: MapaAdicional;
}> {
  const produtos: MapaProduto = new Map();
  const adicionais: MapaAdicional = new Map();

  const { data } = await sb
    .from("ifood_mapeamentos")
    .select("external_code, produto_id, adicional_id");

  for (const row of data || []) {
    const code = String(row.external_code || "").trim();
    if (!code) continue;
    if (row.produto_id) produtos.set(code, row.produto_id as string);
    if (row.adicional_id) adicionais.set(code, row.adicional_id as string);
  }

  return { produtos, adicionais };
}

async function resolverProdutoId(
  sb: SupabaseClient,
  code: string | undefined,
  mapas: { produtos: MapaProduto },
): Promise<string | null> {
  const c = (code || "").trim();
  if (!c) return null;
  if (mapas.produtos.has(c)) return mapas.produtos.get(c)!;
  if (uuidParece(c)) {
    const { data } = await sb.from("produtos").select("id").eq("id", c)
      .maybeSingle();
    if (data?.id) return data.id as string;
  }
  return null;
}

async function resolverAdicionalId(
  sb: SupabaseClient,
  code: string | undefined,
  mapas: { adicionais: MapaAdicional },
): Promise<string | null> {
  const c = (code || "").trim();
  if (!c) return null;
  if (mapas.adicionais.has(c)) return mapas.adicionais.get(c)!;
  if (uuidParece(c)) {
    const { data } = await sb.from("adicionais").select("id").eq("id", c)
      .maybeSingle();
    if (data?.id) return data.id as string;
  }
  return null;
}

async function upsertCliente(
  sb: SupabaseClient,
  nome: string,
  celular: string | null,
): Promise<string | null> {
  if (!celular) return null;
  const { data: existente } = await sb
    .from("clientes")
    .select("id, nome")
    .eq("celular", celular)
    .maybeSingle();

  if (existente?.id) {
    if (nome && (!existente.nome || existente.nome === "Cliente iFood")) {
      await sb.from("clientes").update({ nome }).eq("id", existente.id);
    }
    return existente.id as string;
  }

  const { data: criado, error } = await sb
    .from("clientes")
    .insert({
      nome: nome || "Cliente iFood",
      celular,
    })
    .select("id")
    .single();

  if (error) {
    console.warn("[ifood] upsert cliente:", error.message);
    return null;
  }
  return criado?.id as string ?? null;
}

async function importarPedido(
  sb: SupabaseClient,
  order: Record<string, unknown>,
  autoConfirm: boolean,
  token: string,
  forcarConfirmPorEvento: boolean,
): Promise<{ pedidoId: string | null; criado: boolean; avisos: string[] }> {
  const avisos: string[] = [];
  const ifoodOrderId = String(order.id || "");
  if (!ifoodOrderId) throw new Error("Pedido iFood sem id");

  const { data: jaExiste } = await sb
    .from("pedidos")
    .select("id")
    .eq("ifood_order_id", ifoodOrderId)
    .maybeSingle();

  if (jaExiste?.id) {
    await sb.from("ifood_pedidos").upsert({
      ifood_order_id: ifoodOrderId,
      merchant_id: (order.merchant as { id?: string } | undefined)?.id ?? null,
      display_id: String(order.displayId ?? ""),
      status_ifood: String(
        (order as { orderStatus?: string }).orderStatus ??
          (order as { status?: string }).status ??
          "",
      ),
      order_type: String(order.orderType ?? ""),
      order_timing: String(order.orderTiming ?? ""),
      payload: order,
      pedido_id: jaExiste.id,
      atualizado_em: new Date().toISOString(),
    });
    return { pedidoId: jaExiste.id as string, criado: false, avisos };
  }

  const customer = (order.customer || {}) as Record<string, unknown>;
  const nome = String(customer.name || "Cliente iFood").trim() || "Cliente iFood";
  const celular = telefoneBr(customer.phone) ||
    telefoneBr(customer.phoneNumber) ||
    null;

  const clienteId = await upsertCliente(sb, nome, celular);

  const orderType = String(order.orderType || "DELIVERY").toUpperCase();
  const modalidade = orderType === "TAKEOUT" || orderType === "DINE_IN"
    ? "retirada"
    : "entrega";

  const totalObj = (order.total || {}) as Record<string, unknown>;
  const subtotal = Number(totalObj.subTotal ?? totalObj.itemsPrice ?? 0);
  const taxa = Number(totalObj.deliveryFee ?? 0);
  const desconto = Number(totalObj.benefits ?? totalObj.discount ?? 0);
  const valorTotal = Number(
    totalObj.orderAmount ?? totalObj.totalPrice ?? subtotal + taxa - desconto,
  );

  const delivery = (order.delivery || {}) as Record<string, unknown>;
  const endereco = delivery.deliveryAddress ?? order.deliveryAddress ?? null;

  const scheduled = (order.schedule || order.scheduled || {}) as Record<
    string,
    unknown
  >;
  const agendadoPara = order.orderTiming === "SCHEDULED"
    ? String(
      scheduled.deliveryDateTimeStart ??
        scheduled.scheduledDateTimeStart ??
        "",
    ) || null
    : null;

  const displayId = String(order.displayId ?? ifoodOrderId.slice(0, 8));
  const identificador = `iFood #${displayId}`;

  const mapas = await carregarMapas(sb);
  const itensRaw = (Array.isArray(order.items) ? order.items : []) as ItemIfood[];
  const itensNaoMapeados: unknown[] = [];
  const itensMapped: Array<{
    produto_id: string;
    quantidade: number;
    preco_unitario: number;
    observacoes: string | null;
    adicionais: Array<{ adicional_id: string; preco_aplicado: number }>;
  }> = [];

  for (const item of itensRaw) {
    const qtd = Math.max(Number(item.quantity) || 1, 1);
    const preco = Number(item.unitPrice ?? item.price ?? 0);
    const produtoId = await resolverProdutoId(sb, item.externalCode, mapas);
    const obsParts: string[] = [];
    if (item.observations) obsParts.push(String(item.observations));
    if (!produtoId) {
      itensNaoMapeados.push({
        name: item.name,
        externalCode: item.externalCode,
        quantity: qtd,
        unitPrice: preco,
      });
      avisos.push(
        `Item sem mapeamento: ${item.name || "?"} (externalCode=${
          item.externalCode || "—"
        })`,
      );
      continue;
    }

    const adicionais: Array<{ adicional_id: string; preco_aplicado: number }> =
      [];
    for (const opt of item.options || []) {
      const adcId = await resolverAdicionalId(sb, opt.externalCode, mapas);
      if (!adcId) {
        obsParts.push(`+ ${opt.name || opt.externalCode || "opção"}`);
        itensNaoMapeados.push({
          tipo: "opcao",
          parent: item.name,
          name: opt.name,
          externalCode: opt.externalCode,
        });
        continue;
      }
      adicionais.push({
        adicional_id: adcId,
        preco_aplicado: Number(opt.unitPrice ?? opt.price ?? 0),
      });
    }

    itensMapped.push({
      produto_id: produtoId,
      quantidade: qtd,
      preco_unitario: preco,
      observacoes: obsParts.length ? obsParts.join(" | ") : null,
      adicionais,
    });
  }

  const { data: pedido, error: errPedido } = await sb
    .from("pedidos")
    .insert({
      cliente_nome: nome,
      cliente_celular: celular,
      cliente_id: clienteId,
      status: agendadoPara ? "pendente" : "em_producao",
      origem: "ifood",
      identificador,
      total: valorTotal,
      valor_total: valorTotal,
      modalidade,
      status_pagamento: "pago",
      taxa_entrega: taxa,
      subtotal_itens: subtotal,
      desconto_aplicado: desconto > 0 ? desconto : null,
      endereco_json: endereco,
      agendado_para: agendadoPara,
      ifood_order_id: ifoodOrderId,
      impresso: false,
    })
    .select("id, sequencia_pedido")
    .single();

  if (errPedido || !pedido) {
    throw new Error(`insert pedido: ${errPedido?.message || "falha"}`);
  }

  const pedidoId = pedido.id as string;

  for (const item of itensMapped) {
    const { data: pi, error: errItem } = await sb
      .from("pedido_itens")
      .insert({
        pedido_id: pedidoId,
        produto_id: item.produto_id,
        quantidade: item.quantidade,
        preco_unitario: item.preco_unitario,
        observacoes: item.observacoes,
        modo_consumo: "levar",
      })
      .select("id")
      .single();

    if (errItem || !pi) {
      avisos.push(`Falha item: ${errItem?.message}`);
      continue;
    }

    for (const adc of item.adicionais) {
      await sb.from("pedido_item_adicionais").insert({
        pedido_item_id: pi.id,
        adicional_id: adc.adicional_id,
        preco_aplicado: adc.preco_aplicado,
      });
    }
  }

  const { error: errPos } = await sb.rpc("processar_pedido_pos_criacao", {
    p_pedido_id: pedidoId,
    p_cupom_id: null,
  });
  if (errPos) {
    avisos.push(`Estoque/stats: ${errPos.message}`);
    // Tenta ao menos insumos
    const { error: errIns } = await sb.rpc("baixar_insumos_pedido", {
      p_pedido_id: pedidoId,
    });
    if (errIns) avisos.push(`Insumos: ${errIns.message}`);
  }

  await sb.from("ifood_pedidos").upsert({
    ifood_order_id: ifoodOrderId,
    merchant_id: (order.merchant as { id?: string } | undefined)?.id ?? null,
    display_id: displayId,
    status_ifood: String(
      (order as { orderStatus?: string }).orderStatus ?? "PLACED",
    ),
    order_type: orderType,
    order_timing: String(order.orderTiming ?? ""),
    payload: order,
    pedido_id: pedidoId,
    itens_nao_mapeados: itensNaoMapeados,
    atualizado_em: new Date().toISOString(),
  });

  const statusIfood = String(
    (order as { orderStatus?: string }).orderStatus ??
      (order as { status?: string }).status ??
      "",
  ).toUpperCase();
  const deveConfirmar = autoConfirm && (
    forcarConfirmPorEvento ||
    statusIfood === "PLACED" ||
    statusIfood === "PLC" ||
    statusIfood === ""
  );

  if (deveConfirmar) {
    try {
      await confirmarPedidoIfood(token, ifoodOrderId);
    } catch (e) {
      avisos.push(`confirm: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { pedidoId, criado: true, avisos };
}

async function cancelarLocal(
  sb: SupabaseClient,
  ifoodOrderId: string,
): Promise<boolean> {
  const { data: pedido } = await sb
    .from("pedidos")
    .select("id, status")
    .eq("ifood_order_id", ifoodOrderId)
    .maybeSingle();

  if (!pedido?.id) return false;
  if (pedido.status === "cancelado") return true;

  const { error } = await sb.rpc("cancelar_pedido_com_estoque", {
    p_pedido_id: pedido.id,
  });
  if (error) {
    console.error("[ifood] cancelar:", error.message);
    await sb.from("pedidos").update({ status: "cancelado" }).eq(
      "id",
      pedido.id,
    );
  }
  return true;
}

async function processarEvento(
  sb: SupabaseClient,
  ev: IfoodEvento,
  token: string,
  autoConfirm: boolean,
): Promise<{ ack: boolean; detalhe: string }> {
  const { data: ja } = await sb
    .from("ifood_eventos")
    .select("id")
    .eq("id", ev.id)
    .maybeSingle();

  if (ja) return { ack: true, detalhe: "duplicado" };

  const orderId = ev.orderId || "";
  let pedidoId: string | null = null;
  let erro: string | null = null;
  let detalhe = ev.code || ev.fullCode || "evento";

  try {
    if (orderId && ehEventoNovoPedido(ev.code, ev.fullCode)) {
      // Retry leve se 404 (docs: até alguns minutos)
      let order: Record<string, unknown> | null = null;
      let lastErr = "";
      for (let i = 0; i < 3; i++) {
        try {
          order = await buscarPedidoIfood(token, orderId);
          break;
        } catch (e) {
          lastErr = e instanceof Error ? e.message : String(e);
          if (!lastErr.includes("404")) throw e;
          await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
        }
      }
      if (!order) throw new Error(lastErr || "order 404");

      const result = await importarPedido(
        sb,
        order,
        autoConfirm,
        token,
        ehEventoParaConfirmar(ev.code, ev.fullCode),
      );
      pedidoId = result.pedidoId;
      detalhe = result.criado
        ? `importado${result.avisos.length ? ` (${result.avisos.length} avisos)` : ""}`
        : "já existia";
      if (result.avisos.length) {
        console.warn("[ifood]", orderId, result.avisos);
      }
    } else if (orderId && ehEventoCancelado(ev.code, ev.fullCode)) {
      await cancelarLocal(sb, orderId);
      detalhe = "cancelado";
    } else {
      detalhe = `ignorado:${ev.code || ev.fullCode || "?"}`;
    }
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e);
    console.error("[ifood] evento", ev.id, erro);
  }

  await sb.from("ifood_eventos").upsert({
    id: ev.id,
    codigo: ev.code ?? null,
    full_code: ev.fullCode ?? null,
    order_id: orderId || null,
    criado_em_ifood: ev.createdAt ?? null,
    pedido_id: pedidoId,
    payload: ev,
    erro,
  });

  // ACK mesmo com erro de processamento desconhecido — evita fila infinita.
  // Em falha de import (ex.: 404 temporário), NÃO ack para retentar.
  const deveAck = !erro || !erro.includes("404");
  return { ack: deveAck, detalhe: erro ? `erro:${erro}` : detalhe };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200 });
  }

  try {
    const pollSecret = await lerSegredo("IFOOD_POLL_SECRET");
    const recebido =
      req.headers.get("x-ifood-poll-secret") ||
      new URL(req.url).searchParams.get("secret");

    if (!pollSecret || recebido !== pollSecret) {
      return json({ erro: "Não autorizado" }, 401);
    }

    const url = new URL(req.url);
    const acao = url.searchParams.get("acao") || "poll";
    const cred = await carregarCredenciaisIfood();
    const token = await obterAccessTokenIfood(cred);

    if (acao === "ping") {
      const merchants = await listarMerchants(token);
      const lista = Array.isArray(merchants)
        ? merchants
        : Array.isArray((merchants as { merchants?: unknown })?.merchants)
        ? (merchants as { merchants: unknown[] }).merchants
        : [];
      const ids = lista
        .map((m) =>
          typeof m === "object" && m && "id" in m
            ? String((m as { id: string }).id)
            : ""
        )
        .filter(Boolean);
      return json({
        ok: true,
        merchantId: cred.merchantId,
        merchantNaLista: ids.includes(cred.merchantId),
        merchants: ids.slice(0, 20),
      });
    }

    const autoConfirm =
      (await lerSegredo("IFOOD_AUTO_CONFIRM"))?.trim().toLowerCase() !==
        "false";

    // Cron a cada 1 min + duplo=1 ≈ polling ~30s (recomendação iFood)
    const duplo = url.searchParams.get("duplo") === "1" ||
      url.searchParams.get("duplo") === "true";

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    async function umaPassada(tok: string) {
      const eventos = await pollingEventos(tok, cred.merchantId);
      const resultados: Array<{ id: string; detalhe: string }> = [];
      const ackIds: string[] = [];

      for (const ev of eventos) {
        if (!ev?.id) continue;
        const r = await processarEvento(sb, ev, tok, autoConfirm);
        resultados.push({ id: ev.id, detalhe: r.detalhe });
        if (r.ack) ackIds.push(ev.id);
      }

      if (ackIds.length) {
        await acknowledgmentEventos(tok, ackIds);
      }

      return {
        eventos: eventos.length,
        processados: resultados.length,
        ack: ackIds.length,
        resultados,
      };
    }

    const passagem1 = await umaPassada(token);
    let passagem2: typeof passagem1 | null = null;

    if (duplo) {
      await new Promise((r) => setTimeout(r, 28_000));
      const token2 = await obterAccessTokenIfood(cred);
      passagem2 = await umaPassada(token2);
    }

    return json({
      ok: true,
      duplo,
      passagem1,
      passagem2,
    });
  } catch (e) {
    console.error("[ifood-poll]", e);
    return json(
      { erro: e instanceof Error ? e.message : String(e) },
      500,
    );
  }
});
