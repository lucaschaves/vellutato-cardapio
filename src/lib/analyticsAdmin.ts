import {
  CANAL_LABEL,
  type CanalAnalytics,
} from "./analytics";
import { obterInicioPeriodo, type PeriodoRelatorio } from "./pedidosAdmin";
import { supabase } from "./supabase";

export type FunilEtapa = {
  evento: string;
  label: string;
  sessoes: number;
  taxaDoAnterior: number | null;
  taxaDoTopo: number | null;
};

export type ProdutoRankingAnalytics = {
  produtoId: string;
  nome: string;
  views: number;
  adds: number;
};

export type ResumoCanal = {
  canal: CanalAnalytics;
  label: string;
  sessoes: number;
  pageViews: number;
  productViews: number;
  addCart: number;
  beginCheckout: number;
  orderCreated: number;
  paymentOk: number;
  checkoutErrors: number;
  conversaoPedido: number;
  conversaoPago: number;
};

export type PedidoOrigemResumo = {
  origem: string;
  label: string;
  pedidos: number;
  pagos: number;
  aguardandoPagamento: number;
  receita: number;
};

const ETAPAS_FUNIL: { evento: string; label: string }[] = [
  { evento: "page_view", label: "Visitas" },
  { evento: "product_view", label: "Viu produto" },
  { evento: "add_cart", label: "Add carrinho" },
  { evento: "begin_checkout", label: "Checkout" },
  { evento: "order_created", label: "Pedido criado" },
  { evento: "payment_ok", label: "Pago" },
];

type EventoRow = {
  canal: CanalAnalytics;
  evento: string;
  sessao_id: string;
  produto_id: string | null;
  props: Record<string, unknown> | null;
};

function sessoesUnicas(
  rows: EventoRow[],
  evento?: string,
): Set<string> {
  const set = new Set<string>();
  for (const r of rows) {
    if (evento && r.evento !== evento) continue;
    set.add(r.sessao_id);
  }
  return set;
}

export async function buscarAnalyticsPeriodo(
  periodo: PeriodoRelatorio,
  canalFiltro: CanalAnalytics | "todos",
): Promise<{
  resumos: ResumoCanal[];
  funil: FunilEtapa[];
  topProdutos: ProdutoRankingAnalytics[];
  errosCheckout: { motivo: string; qtd: number }[];
  pedidosPorOrigem: PedidoOrigemResumo[];
}> {
  const inicio = obterInicioPeriodo(periodo);

  let qEventos = supabase
    .from("analytics_eventos")
    .select("canal, evento, sessao_id, produto_id, props")
    .order("criado_em", { ascending: false })
    .limit(15000);

  if (inicio) qEventos = qEventos.gte("criado_em", inicio);
  if (canalFiltro !== "todos") qEventos = qEventos.eq("canal", canalFiltro);

  let qPedidos = supabase
    .from("pedidos")
    .select("id, origem, status, status_pagamento, total")
    .limit(10000);

  if (inicio) qPedidos = qPedidos.gte("criado_em", inicio);
  if (canalFiltro !== "todos") qPedidos = qPedidos.eq("origem", canalFiltro);

  const [evRes, pedRes, prodRes] = await Promise.all([
    qEventos,
    qPedidos,
    supabase.from("produtos").select("id, nome").limit(5000),
  ]);

  if (evRes.error) throw new Error(evRes.error.message);
  if (pedRes.error) throw new Error(pedRes.error.message);

  const eventos = (evRes.data || []) as EventoRow[];
  const nomes = new Map<string, string>();
  for (const p of prodRes.data || []) {
    nomes.set(p.id as string, String(p.nome));
  }

  const canais: CanalAnalytics[] =
    canalFiltro === "todos"
      ? ["delivery", "mesa", "totem", "balcao"]
      : [canalFiltro];

  const resumos: ResumoCanal[] = canais.map((canal) => {
    const rows = eventos.filter((e) => e.canal === canal);
    const sessoes = sessoesUnicas(rows).size;
    const pageViews = sessoesUnicas(rows, "page_view").size;
    const productViews = sessoesUnicas(rows, "product_view").size;
    const addCart = sessoesUnicas(rows, "add_cart").size;
    const beginCheckout = sessoesUnicas(rows, "begin_checkout").size;
    const orderCreated = sessoesUnicas(rows, "order_created").size;
    const paymentOk = sessoesUnicas(rows, "payment_ok").size;
    const checkoutErrors = rows.filter((e) => e.evento === "checkout_error")
      .length;
    const base = pageViews || sessoes || 1;
    return {
      canal,
      label: CANAL_LABEL[canal],
      sessoes,
      pageViews,
      productViews,
      addCart,
      beginCheckout,
      orderCreated,
      paymentOk,
      checkoutErrors,
      conversaoPedido: (orderCreated / base) * 100,
      conversaoPago: (paymentOk / base) * 100,
    };
  });

  const rowsFunil =
    canalFiltro === "todos"
      ? eventos
      : eventos.filter((e) => e.canal === canalFiltro);

  const contagens = ETAPAS_FUNIL.map((e) => ({
    ...e,
    sessoes: sessoesUnicas(rowsFunil, e.evento).size,
  }));
  const topo = contagens[0]?.sessoes || 0;
  const funil: FunilEtapa[] = contagens.map((etapa, i) => {
    const ant = i > 0 ? contagens[i - 1].sessoes : null;
    return {
      evento: etapa.evento,
      label: etapa.label,
      sessoes: etapa.sessoes,
      taxaDoAnterior:
        ant && ant > 0 ? (etapa.sessoes / ant) * 100 : null,
      taxaDoTopo: topo > 0 ? (etapa.sessoes / topo) * 100 : null,
    };
  });

  const viewMap = new Map<string, number>();
  const addMap = new Map<string, number>();
  for (const e of rowsFunil) {
    if (!e.produto_id) continue;
    if (e.evento === "product_view") {
      viewMap.set(e.produto_id, (viewMap.get(e.produto_id) || 0) + 1);
    }
    if (e.evento === "add_cart") {
      addMap.set(e.produto_id, (addMap.get(e.produto_id) || 0) + 1);
    }
  }
  const ids = new Set([...viewMap.keys(), ...addMap.keys()]);
  const topProdutos: ProdutoRankingAnalytics[] = Array.from(ids)
    .map((id) => ({
      produtoId: id,
      nome: nomes.get(id) || "Produto",
      views: viewMap.get(id) || 0,
      adds: addMap.get(id) || 0,
    }))
    .sort((a, b) => b.views - a.views || b.adds - a.adds)
    .slice(0, 12);

  const erroMap = new Map<string, number>();
  for (const e of rowsFunil) {
    if (e.evento !== "checkout_error" && e.evento !== "cep_fora_raio") continue;
    const motivo =
      (e.props && typeof e.props.motivo === "string" && e.props.motivo) ||
      e.evento;
    erroMap.set(motivo, (erroMap.get(motivo) || 0) + 1);
  }
  const errosCheckout = Array.from(erroMap.entries())
    .map(([motivo, qtd]) => ({ motivo, qtd }))
    .sort((a, b) => b.qtd - a.qtd)
    .slice(0, 10);

  const pedMap = new Map<string, PedidoOrigemResumo>();
  for (const p of pedRes.data || []) {
    const origem = String(p.origem || "outros");
    const atual = pedMap.get(origem) || {
      origem,
      label: CANAL_LABEL[origem as CanalAnalytics] || origem,
      pedidos: 0,
      pagos: 0,
      aguardandoPagamento: 0,
      receita: 0,
    };
    atual.pedidos += 1;
    if (p.status === "pago" || p.status === "entregue") {
      atual.pagos += 1;
      atual.receita += Number(p.total || 0);
    }
    if (
      p.status === "aguardando_pagamento" ||
      p.status_pagamento === "aguardando"
    ) {
      atual.aguardandoPagamento += 1;
    }
    pedMap.set(origem, atual);
  }

  return {
    resumos,
    funil,
    topProdutos,
    errosCheckout,
    pedidosPorOrigem: Array.from(pedMap.values()).sort(
      (a, b) => b.pedidos - a.pedidos,
    ),
  };
}
