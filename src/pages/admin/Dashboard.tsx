import {
  Activity,
  AlertTriangle,
  BarChart3,
  Eye,
  Loader2,
  ShoppingBag,
  ShoppingCart,
  Ticket,
  TrendingDown,
  TrendingUp,
  Users,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AdminPageShell } from "../../components/AdminPageShell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { CANAL_LABEL, type CanalAnalytics } from "../../lib/analytics";
import {
  buscarAnalyticsPeriodo,
  type FunilEtapa,
  type PedidoOrigemResumo,
  type ProdutoRankingAnalytics,
  type ResumoCanal,
} from "../../lib/analyticsAdmin";
import {
  formatarMoeda,
  obterInicioPeriodo,
  obterValorPedido,
  ORIGEM_PEDIDO_LABEL,
  pedidoContaComoVenda,
  type PeriodoRelatorio,
} from "../../lib/pedidosAdmin";
import { supabase } from "../../lib/supabase";

interface ItemDashboard {
  quantidade: number;
  preco_unitario: number;
  produtos: { nome: string } | null;
}

interface PedidoDashboard {
  id: string;
  status: string;
  total: number | null;
  desconto_aplicado: number | null;
  origem: string;
  criado_em: string;
  cupom_id: string | null;
  cliente_id: string | null;
  cupons: { codigo: string } | null;
  clientes: { nome: string } | null;
  pedido_itens: ItemDashboard[];
}

interface ClienteRanking {
  nome: string;
  pedidos: number;
  receita: number;
}

interface CupomRanking {
  codigo: string;
  usos: number;
  descontoTotal: number;
}

interface ProdutoRanking {
  nome: string;
  quantidade: number;
  receita: number;
}

interface CanalReceita {
  origem: string;
  label: string;
  pedidos: number;
  receita: number;
  ticket: number;
}

type AbaDashboard = "vendas" | "comportamento";

const PERIODOS: { id: PeriodoRelatorio; label: string }[] = [
  { id: "hoje", label: "Hoje" },
  { id: "7dias", label: "7 dias" },
  { id: "30dias", label: "30 dias" },
  { id: "todos", label: "Todos" },
];

const CANAIS: { id: CanalAnalytics | "todos"; label: string }[] = [
  { id: "todos", label: "Todos os canais" },
  { id: "delivery", label: "Delivery" },
  { id: "mesa", label: "Mesa" },
  { id: "totem", label: "Totem" },
  { id: "balcao", label: "Balcão" },
];

function obterChaveDia(dataIso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(dataIso));
}

/** Início do período anterior de mesmo tamanho (para comparativo ▲▼). */
function obterInicioPeriodoAnterior(
  periodo: PeriodoRelatorio,
  inicioAtual: string | null,
): string | null {
  if (periodo === "todos" || !inicioAtual) return null;
  const inicio = new Date(inicioAtual);
  const dias = periodo === "hoje" ? 1 : periodo === "7dias" ? 7 : 30;
  inicio.setDate(inicio.getDate() - dias);
  return inicio.toISOString();
}

function calcularVariacao(atual: number, anterior: number): number | null {
  if (anterior <= 0) return null;
  return ((atual - anterior) / anterior) * 100;
}

function DeltaBadge({ variacao }: { variacao: number | null }) {
  if (variacao == null) return null;
  const subiu = variacao >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-bold ${
        subiu
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-red-600 dark:text-red-400"
      }`}
      title="Comparado ao período anterior de mesmo tamanho"
    >
      {subiu ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {subiu ? "+" : ""}
      {variacao.toFixed(1)}%
    </span>
  );
}

export function Dashboard() {
  const [aba, setAba] = useState<AbaDashboard>("vendas");
  const [periodo, setPeriodo] = useState<PeriodoRelatorio>("hoje");
  const [canal, setCanal] = useState<CanalAnalytics | "todos">("todos");

  // Vendas
  const [pedidos, setPedidos] = useState<PedidoDashboard[]>([]);
  const [pedidosAnteriores, setPedidosAnteriores] = useState<PedidoDashboard[]>(
    [],
  );
  const [topClientesGeral, setTopClientesGeral] = useState<
    { nome: string; total_pedidos: number | null; valor_gasto: number | null }[]
  >([]);
  const [carregandoVendas, setCarregandoVendas] = useState(true);

  // Comportamento
  const [resumos, setResumos] = useState<ResumoCanal[]>([]);
  const [funil, setFunil] = useState<FunilEtapa[]>([]);
  const [topProdutos, setTopProdutos] = useState<ProdutoRankingAnalytics[]>([]);
  const [erros, setErros] = useState<{ motivo: string; qtd: number }[]>([]);
  const [pedidosOrigem, setPedidosOrigem] = useState<PedidoOrigemResumo[]>([]);
  const [carregandoComp, setCarregandoComp] = useState(true);

  const carregarVendas = useCallback(async () => {
    try {
      setCarregandoVendas(true);

      const inicioAtual = obterInicioPeriodo(periodo);
      const inicioAnterior = obterInicioPeriodoAnterior(periodo, inicioAtual);
      // Busca cobrindo período atual + anterior num único request.
      const inicioBusca = inicioAnterior ?? inicioAtual;

      let query = supabase
        .from("pedidos")
        .select(
          `
          id, status, total, desconto_aplicado, origem, criado_em,
          cupom_id, cliente_id,
          cupons!cupom_id ( codigo ),
          clientes ( nome ),
          pedido_itens (
            quantidade, preco_unitario,
            produtos ( nome )
          )
        `,
        )
        .order("criado_em", { ascending: false });

      if (inicioBusca) {
        query = query.gte("criado_em", inicioBusca);
      }

      const [resPedidos, resClientes] = await Promise.all([
        query,
        supabase
          .from("clientes")
          .select("nome, total_pedidos, valor_gasto")
          .order("valor_gasto", { ascending: false, nullsFirst: false })
          .limit(8),
      ]);

      if (resPedidos.error) throw resPedidos.error;
      if (resClientes.error) throw resClientes.error;

      const todos = (resPedidos.data as unknown as PedidoDashboard[]) || [];

      if (inicioAtual) {
        const corte = new Date(inicioAtual).getTime();
        setPedidos(
          todos.filter((p) => new Date(p.criado_em).getTime() >= corte),
        );
        setPedidosAnteriores(
          inicioAnterior
            ? todos.filter((p) => new Date(p.criado_em).getTime() < corte)
            : [],
        );
      } else {
        setPedidos(todos);
        setPedidosAnteriores([]);
      }
      setTopClientesGeral(resClientes.data || []);
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error("[ERRO - DASHBOARD]", mensagem);
      toast.error("Falha ao carregar os dados de vendas.");
    } finally {
      setCarregandoVendas(false);
    }
  }, [periodo]);

  const carregarComportamento = useCallback(async () => {
    try {
      setCarregandoComp(true);
      const dados = await buscarAnalyticsPeriodo(periodo, canal);
      setResumos(dados.resumos);
      setFunil(dados.funil);
      setTopProdutos(dados.topProdutos);
      setErros(dados.errosCheckout);
      setPedidosOrigem(dados.pedidosPorOrigem);
    } catch (erro: unknown) {
      const msg = erro instanceof Error ? erro.message : String(erro);
      console.error("[ANALYTICS]", msg);
      toast.error(
        "Falha ao carregar comportamento. Rode a migration analytics_canais no banco.",
      );
    } finally {
      setCarregandoComp(false);
    }
  }, [periodo, canal]);

  useEffect(() => {
    void carregarVendas();
  }, [carregarVendas]);

  useEffect(() => {
    void carregarComportamento();
  }, [carregarComportamento]);

  const metricas = useMemo(() => {
    const vendas = pedidos.filter((pedido) =>
      pedidoContaComoVenda(pedido.status),
    );
    const cancelados = pedidos.filter(
      (pedido) => pedido.status === "cancelado",
    );
    const emAberto = pedidos.filter(
      (pedido) =>
        !pedidoContaComoVenda(pedido.status) && pedido.status !== "cancelado",
    );

    const receitaTotal = vendas.reduce(
      (acc, pedido) => acc + obterValorPedido(pedido),
      0,
    );
    const ticketMedio = vendas.length > 0 ? receitaTotal / vendas.length : 0;

    const rankingMap = new Map<string, ProdutoRanking>();
    const vendasPorNome = new Map<string, number>();

    vendas.forEach((pedido) => {
      pedido.pedido_itens.forEach((item) => {
        const nome = item.produtos?.nome || "Produto sem nome";
        const atual = rankingMap.get(nome) || {
          nome,
          quantidade: 0,
          receita: 0,
        };
        atual.quantidade += item.quantidade;
        atual.receita += item.quantidade * Number(item.preco_unitario || 0);
        rankingMap.set(nome, atual);
        vendasPorNome.set(
          nome.toLowerCase(),
          (vendasPorNome.get(nome.toLowerCase()) || 0) + item.quantidade,
        );
      });
    });

    const produtosMaisVendidos = Array.from(rankingMap.values())
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 8);

    const porOrigem = vendas.reduce<Record<string, number>>((acc, pedido) => {
      const chave = pedido.origem || "outros";
      acc[chave] = (acc[chave] || 0) + 1;
      return acc;
    }, {});

    const canalMap = new Map<string, CanalReceita>();
    vendas.forEach((pedido) => {
      const origem = pedido.origem || "outros";
      const atual = canalMap.get(origem) || {
        origem,
        label: ORIGEM_PEDIDO_LABEL[origem] || origem,
        pedidos: 0,
        receita: 0,
        ticket: 0,
      };
      atual.pedidos += 1;
      atual.receita += obterValorPedido(pedido);
      canalMap.set(origem, atual);
    });
    const receitaPorCanal = Array.from(canalMap.values())
      .map((c) => ({ ...c, ticket: c.pedidos > 0 ? c.receita / c.pedidos : 0 }))
      .sort((a, b) => b.receita - a.receita);

    const porStatus = pedidos.reduce<Record<string, number>>((acc, pedido) => {
      acc[pedido.status] = (acc[pedido.status] || 0) + 1;
      return acc;
    }, {});

    const vendasPorDia = vendas.reduce<Record<string, number>>(
      (acc, pedido) => {
        const chave = obterChaveDia(pedido.criado_em);
        acc[chave] = (acc[chave] || 0) + obterValorPedido(pedido);
        return acc;
      },
      {},
    );

    const serieDiaria = Object.entries(vendasPorDia)
      .map(([dia, valor]) => ({ dia, valor }))
      .reverse()
      .slice(-7);

    const maxSerie = Math.max(...serieDiaria.map((item) => item.valor), 1);

    const taxaCancelamento =
      pedidos.length > 0 ? (cancelados.length / pedidos.length) * 100 : 0;

    const descontoTotal = vendas.reduce(
      (acc, pedido) => acc + Number(pedido.desconto_aplicado || 0),
      0,
    );

    const cupomMap = new Map<string, CupomRanking>();
    vendas.forEach((pedido) => {
      if (!pedido.cupons?.codigo) return;
      const codigo = pedido.cupons.codigo;
      const atual = cupomMap.get(codigo) || {
        codigo,
        usos: 0,
        descontoTotal: 0,
      };
      atual.usos += 1;
      atual.descontoTotal += Number(pedido.desconto_aplicado || 0);
      cupomMap.set(codigo, atual);
    });

    const cuponsMaisUsados = Array.from(cupomMap.values())
      .sort((a, b) => b.usos - a.usos)
      .slice(0, 6);

    const clienteMap = new Map<string, ClienteRanking>();
    vendas.forEach((pedido) => {
      if (!pedido.clientes?.nome) return;
      const nome = pedido.clientes.nome;
      const atual = clienteMap.get(nome) || {
        nome,
        pedidos: 0,
        receita: 0,
      };
      atual.pedidos += 1;
      atual.receita += obterValorPedido(pedido);
      clienteMap.set(nome, atual);
    });

    const clientesTopPeriodo = Array.from(clienteMap.values())
      .sort((a, b) => b.receita - a.receita)
      .slice(0, 6);

    return {
      receitaTotal,
      ticketMedio,
      totalPedidos: pedidos.length,
      pedidosPagos: vendas.length,
      pedidosAbertos: emAberto.length,
      cancelados: cancelados.length,
      taxaCancelamento,
      descontoTotal,
      cuponsMaisUsados,
      clientesTopPeriodo,
      produtosMaisVendidos,
      receitaPorCanal,
      vendasPorNome,
      porOrigem,
      porStatus,
      serieDiaria,
      maxSerie,
    };
  }, [pedidos]);

  const comparativo = useMemo(() => {
    if (pedidosAnteriores.length === 0) {
      return { receita: null, pedidos: null, ticket: null };
    }
    const vendasAnt = pedidosAnteriores.filter((p) =>
      pedidoContaComoVenda(p.status),
    );
    const receitaAnt = vendasAnt.reduce((a, p) => a + obterValorPedido(p), 0);
    const ticketAnt = vendasAnt.length > 0 ? receitaAnt / vendasAnt.length : 0;
    return {
      receita: calcularVariacao(metricas.receitaTotal, receitaAnt),
      pedidos: calcularVariacao(
        metricas.totalPedidos,
        pedidosAnteriores.length,
      ),
      ticket: calcularVariacao(metricas.ticketMedio, ticketAnt),
    };
  }, [pedidosAnteriores, metricas]);

  const maxFunil = Math.max(...funil.map((f) => f.sessoes), 1);
  const totalSessoes = resumos.reduce((a, r) => a + r.sessoes, 0);
  const totalPedidosEvt = resumos.reduce((a, r) => a + r.orderCreated, 0);

  const abandonoCarrinho = useMemo(() => {
    const addCart = funil.find((f) => f.evento === "add_cart")?.sessoes || 0;
    const pedidoCriado =
      funil.find((f) => f.evento === "order_created")?.sessoes || 0;
    if (addCart === 0) return null;
    return ((addCart - pedidoCriado) / addCart) * 100;
  }, [funil]);

  const vitrineMorta = useMemo(() => {
    return topProdutos
      .map((p) => {
        const vendidos = metricas.vendasPorNome.get(p.nome.toLowerCase()) || 0;
        const conv = p.views > 0 ? (vendidos / p.views) * 100 : 0;
        return { ...p, vendidos, conv };
      })
      .filter((p) => p.views >= 5)
      .sort((a, b) => a.conv - b.conv)
      .slice(0, 6);
  }, [topProdutos, metricas.vendasPorNome]);

  return (
    <AdminPageShell
      title={
        <h1 className="flex items-center gap-2">
          <BarChart3 size={28} className="text-cookie-primary" />
          Dashboard
        </h1>
      }
      description="Vendas e comportamento dos clientes num só lugar."
      actions={
        <div className="flex flex-wrap gap-2">
          {PERIODOS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setPeriodo(item.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                periodo === item.id
                  ? "bg-cookie-primary text-white border-cookie-primary"
                  : "bg-white dark:bg-surface-dark border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      }
      contentClassName="space-y-6"
    >
      {/* Abas */}
      <div className="flex gap-1 rounded-xl bg-gray-100 dark:bg-[#1a1815] p-1 w-fit">
        <button
          type="button"
          onClick={() => setAba("vendas")}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold transition-colors ${
            aba === "vendas"
              ? "bg-white dark:bg-surface-dark text-cookie-primary shadow-sm"
              : "text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
          }`}
        >
          <BarChart3 size={16} /> Vendas
        </button>
        <button
          type="button"
          onClick={() => setAba("comportamento")}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold transition-colors ${
            aba === "comportamento"
              ? "bg-white dark:bg-surface-dark text-cookie-primary shadow-sm"
              : "text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
          }`}
        >
          <Activity size={16} /> Comportamento
        </button>
      </div>

      {aba === "vendas" ? (
        carregandoVendas ? (
          <div className="flex justify-center py-20">
            <Loader2 className="animate-spin text-cookie-primary" size={40} />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <Card className="bg-white dark:bg-surface-dark border-gray-200 dark:border-gray-800">
                <CardHeader>
                  <CardDescription>Receita (pagos/entregues)</CardDescription>
                  <CardTitle className="text-2xl font-black text-cookie-accent flex items-center gap-2">
                    {formatarMoeda(metricas.receitaTotal)}
                    <DeltaBadge variacao={comparativo.receita} />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-gray-500 flex items-center gap-1">
                    <TrendingUp size={14} /> {metricas.pedidosPagos} pedidos
                    concluídos
                  </p>
                  {metricas.descontoTotal > 0 && (
                    <p className="text-xs text-green-600 dark:text-green-400 mt-2 font-medium">
                      Descontos (cupons): {formatarMoeda(metricas.descontoTotal)}
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-white dark:bg-surface-dark border-gray-200 dark:border-gray-800">
                <CardHeader>
                  <CardDescription>Ticket médio</CardDescription>
                  <CardTitle className="text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2">
                    {formatarMoeda(metricas.ticketMedio)}
                    <DeltaBadge variacao={comparativo.ticket} />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-gray-500">
                    Valor médio por pedido pago/entregue
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-white dark:bg-surface-dark border-gray-200 dark:border-gray-800">
                <CardHeader>
                  <CardDescription>Pedidos no período</CardDescription>
                  <CardTitle className="text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2">
                    {metricas.totalPedidos}
                    <DeltaBadge variacao={comparativo.pedidos} />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-gray-500 flex items-center gap-1">
                    <ShoppingBag size={14} /> {metricas.pedidosAbertos} em
                    andamento
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-white dark:bg-surface-dark border-gray-200 dark:border-gray-800">
                <CardHeader>
                  <CardDescription>Cancelamentos</CardDescription>
                  <CardTitle className="text-2xl font-black text-red-600 dark:text-red-400">
                    {metricas.cancelados}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-gray-500 flex items-center gap-1">
                    <XCircle size={14} /> {metricas.taxaCancelamento.toFixed(1)}%
                    do total
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <Card className="xl:col-span-2 bg-white dark:bg-surface-dark border-gray-200 dark:border-gray-800">
                <CardHeader>
                  <CardTitle>Receita por dia</CardTitle>
                  <CardDescription>
                    Últimos dias com vendas concluídas no período
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {metricas.serieDiaria.length === 0 ? (
                    <p className="text-sm text-gray-500 py-8 text-center">
                      Sem vendas concluídas neste período.
                    </p>
                  ) : (
                    <div className="flex items-end gap-3 h-48 pt-4">
                      {metricas.serieDiaria.map((item) => (
                        <div
                          key={item.dia}
                          className="flex-1 flex flex-col items-center gap-2 min-w-0"
                        >
                          <span className="text-[0.625rem] font-bold text-gray-500 truncate w-full text-center">
                            {formatarMoeda(item.valor)}
                          </span>
                          <div
                            className="w-full rounded-t-lg bg-cookie-primary/80 min-h-2 transition-all"
                            style={{
                              height: `${Math.max((item.valor / metricas.maxSerie) * 100, 8)}%`,
                            }}
                          />
                          <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                            {item.dia}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-white dark:bg-surface-dark border-gray-200 dark:border-gray-800">
                <CardHeader>
                  <CardTitle>Receita por canal</CardTitle>
                  <CardDescription>Ticket médio por origem</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {metricas.receitaPorCanal.length === 0 ? (
                    <p className="text-sm text-gray-500">Sem vendas.</p>
                  ) : (
                    metricas.receitaPorCanal.map((c) => (
                      <div
                        key={c.origem}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50 dark:bg-[#1a1815] text-sm"
                      >
                        <div>
                          <p className="font-semibold capitalize text-gray-800 dark:text-gray-200">
                            {c.label}
                          </p>
                          <p className="text-xs text-gray-500">
                            {c.pedidos} pedidos · ticket{" "}
                            {formatarMoeda(c.ticket)}
                          </p>
                        </div>
                        <span className="font-bold text-cookie-accent">
                          {formatarMoeda(c.receita)}
                        </span>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>

            <Card className="bg-white dark:bg-surface-dark border-gray-200 dark:border-gray-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShoppingBag size={18} />
                  Produtos mais vendidos
                </CardTitle>
                <CardDescription>
                  Ranking por quantidade (pedidos pagos/entregues)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {metricas.produtosMaisVendidos.length === 0 ? (
                  <p className="text-sm text-gray-500 py-6 text-center">
                    Nenhuma venda concluída no período selecionado.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {metricas.produtosMaisVendidos.map((produto, indice) => (
                      <div
                        key={produto.nome}
                        className="flex items-center gap-4 p-3 rounded-xl bg-gray-50 dark:bg-[#1a1815]"
                      >
                        <span className="w-8 h-8 rounded-full bg-cookie-primary/10 text-cookie-primary font-black flex items-center justify-center text-sm shrink-0">
                          {indice + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 dark:text-white truncate">
                            {produto.nome}
                          </p>
                          <p className="text-xs text-gray-500">
                            {produto.quantidade}{" "}
                            {produto.quantidade === 1 ? "unidade" : "unidades"}
                          </p>
                        </div>
                        <span className="font-bold text-cookie-accent shrink-0">
                          {formatarMoeda(produto.receita)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <Card className="bg-white dark:bg-surface-dark border-gray-200 dark:border-gray-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Ticket size={18} />
                    Cupons no período
                  </CardTitle>
                  <CardDescription>
                    Mais usados em vendas concluídas
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {metricas.cuponsMaisUsados.length === 0 ? (
                    <p className="text-sm text-gray-500 py-6 text-center">
                      Nenhum cupom usado no período.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {metricas.cuponsMaisUsados.map((cupom) => (
                        <div
                          key={cupom.codigo}
                          className="flex justify-between items-center p-3 rounded-xl bg-gray-50 dark:bg-[#1a1815] text-sm"
                        >
                          <span className="font-bold text-purple-700 dark:text-purple-300">
                            {cupom.codigo}
                          </span>
                          <div className="text-right">
                            <p className="font-semibold">{cupom.usos} usos</p>
                            <p className="text-xs text-green-600">
                              -{formatarMoeda(cupom.descontoTotal)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-white dark:bg-surface-dark border-gray-200 dark:border-gray-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users size={18} />
                    Clientes no período
                  </CardTitle>
                  <CardDescription>
                    Maior receita (vendas concluídas)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {metricas.clientesTopPeriodo.length === 0 ? (
                    <p className="text-sm text-gray-500 py-6 text-center">
                      Sem clientes identificados no período.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {metricas.clientesTopPeriodo.map((cliente) => (
                        <div
                          key={cliente.nome}
                          className="flex justify-between items-center p-3 rounded-xl bg-gray-50 dark:bg-[#1a1815] text-sm"
                        >
                          <div>
                            <p className="font-semibold text-gray-900 dark:text-white">
                              {cliente.nome}
                            </p>
                            <p className="text-xs text-gray-500">
                              {cliente.pedidos}{" "}
                              {cliente.pedidos === 1 ? "pedido" : "pedidos"}
                            </p>
                          </div>
                          <span className="font-bold text-cookie-accent">
                            {formatarMoeda(cliente.receita)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {topClientesGeral.length > 0 && (
              <Card className="bg-white dark:bg-surface-dark border-gray-200 dark:border-gray-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users size={18} />
                    Top clientes (geral)
                  </CardTitle>
                  <CardDescription>
                    Ranking histórico por valor gasto cadastrado
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {topClientesGeral.map((cliente, indice) => (
                      <div
                        key={`${cliente.nome}-${indice}`}
                        className="p-3 rounded-xl bg-gray-50 dark:bg-[#1a1815]"
                      >
                        <p className="font-semibold text-gray-900 dark:text-white truncate">
                          {cliente.nome}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {cliente.total_pedidos || 0} pedidos
                        </p>
                        <p className="text-sm font-bold text-cookie-accent mt-1">
                          {formatarMoeda(cliente.valor_gasto)}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {CANAIS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCanal(c.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${
                  canal === c.id
                    ? "bg-gray-950 text-white dark:bg-white dark:text-gray-950 border-transparent"
                    : "border-gray-200 dark:border-[#2a2c30] text-gray-600 dark:text-gray-300"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          {carregandoComp ? (
            <div className="flex items-center justify-center py-20 text-gray-400">
              <Loader2 className="animate-spin mr-2" size={20} />
              Carregando comportamento...
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Sessões</CardDescription>
                    <CardTitle className="text-2xl flex items-center gap-2">
                      <Users size={18} className="text-cookie-primary" />
                      {totalSessoes}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Pedidos (eventos)</CardDescription>
                    <CardTitle className="text-2xl flex items-center gap-2">
                      <ShoppingBag size={18} className="text-cookie-primary" />
                      {totalPedidosEvt}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Conversão visita → pedido</CardDescription>
                    <CardTitle className="text-2xl">
                      {funil[0]?.sessoes
                        ? (
                            ((funil.find((f) => f.evento === "order_created")
                              ?.sessoes || 0) /
                              funil[0].sessoes) *
                            100
                          ).toFixed(1)
                        : "0.0"}
                      %
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Abandono de carrinho</CardDescription>
                    <CardTitle className="text-2xl flex items-center gap-2 text-amber-600 dark:text-amber-400">
                      <ShoppingCart size={18} />
                      {abandonoCarrinho == null
                        ? "—"
                        : `${abandonoCarrinho.toFixed(1)}%`}
                    </CardTitle>
                  </CardHeader>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Funil de conversão</CardTitle>
                  <CardDescription>
                    Sessões únicas por etapa
                    {canal !== "todos" ? ` · ${CANAL_LABEL[canal]}` : " · todos os canais"}
                    . Filtre por Delivery para ver o funil do app.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {funil.every((f) => f.sessoes === 0) ? (
                    <p className="text-sm text-gray-500">
                      Sem eventos ainda. Navegue no delivery/cardápio para gerar
                      dados.
                    </p>
                  ) : (
                    funil.map((etapa, idx) => {
                      const anterior = idx > 0 ? funil[idx - 1] : null;
                      const perda =
                        anterior && anterior.sessoes > 0
                          ? Math.max(
                              0,
                              ((anterior.sessoes - etapa.sessoes) /
                                anterior.sessoes) *
                                100,
                            )
                          : null;
                      return (
                      <div key={etapa.evento} className="space-y-1">
                        <div className="flex justify-between text-sm gap-2">
                          <span className="font-semibold text-gray-800 dark:text-gray-200">
                            {etapa.label}
                          </span>
                          <span className="text-gray-500 shrink-0 text-right">
                            {etapa.sessoes}
                            {etapa.taxaDoTopo != null
                              ? ` · ${etapa.taxaDoTopo.toFixed(0)}% do topo`
                              : ""}
                            {perda != null && perda > 0
                              ? ` · −${perda.toFixed(0)}% vs anterior`
                              : ""}
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-gray-100 dark:bg-[#2a2c30] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-cookie-primary"
                            style={{
                              width: `${Math.max((etapa.sessoes / maxFunil) * 100, etapa.sessoes ? 4 : 0)}%`,
                            }}
                          />
                        </div>
                      </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle size={18} className="text-amber-500" />
                    Vitrine: muito vista, pouco vendida
                  </CardTitle>
                  <CardDescription>
                    Produtos com muitas visualizações e baixa conversão em venda
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {vitrineMorta.length === 0 ? (
                    <p className="text-sm text-gray-500 py-4 text-center">
                      Sem dados suficientes de visualização no período.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {vitrineMorta.map((p) => (
                        <div
                          key={p.produtoId}
                          className="flex items-center justify-between gap-3 p-3 rounded-xl bg-gray-50 dark:bg-[#1a1815] text-sm"
                        >
                          <span className="font-semibold text-gray-900 dark:text-white truncate">
                            {p.nome}
                          </span>
                          <span className="text-gray-500 shrink-0 flex items-center gap-3">
                            <span className="flex items-center gap-1">
                              <Eye size={13} /> {p.views}
                            </span>
                            <span>{p.vendidos} vend.</span>
                            <span
                              className={`font-bold ${
                                p.conv < 10
                                  ? "text-red-600 dark:text-red-400"
                                  : "text-gray-600 dark:text-gray-300"
                              }`}
                            >
                              {p.conv.toFixed(0)}%
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Por canal (eventos)</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {resumos.map((r) => (
                      <div
                        key={r.canal}
                        className="rounded-xl border border-gray-100 dark:border-[#2a2c30] p-3 text-sm"
                      >
                        <div className="font-bold text-gray-950 dark:text-white mb-1">
                          {r.label}
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-gray-600 dark:text-gray-400">
                          <span>Sessões: {r.sessoes}</span>
                          <span>Views produto: {r.productViews}</span>
                          <span>Carrinho: {r.addCart}</span>
                          <span>Checkout: {r.beginCheckout}</span>
                          <span>Pedidos: {r.orderCreated}</span>
                          <span>Pagos: {r.paymentOk}</span>
                          <span>
                            Conv. pedido: {r.conversaoPedido.toFixed(1)}%
                          </span>
                          <span>Erros: {r.checkoutErrors}</span>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Pedidos reais por origem</CardTitle>
                    <CardDescription>
                      Tabela pedidos (mesa / totem / balcão / delivery)
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {pedidosOrigem.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        Sem pedidos no período.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {pedidosOrigem.map((p) => (
                          <div
                            key={p.origem}
                            className="flex flex-wrap items-center justify-between gap-2 text-sm border-b border-gray-100 dark:border-[#2a2c30] py-2"
                          >
                            <span className="font-bold">{p.label}</span>
                            <span className="text-gray-500">
                              {p.pedidos} pedidos · {p.pagos} pagos
                              {p.aguardandoPagamento > 0
                                ? ` · ${p.aguardandoPagamento} aguard. pag.`
                                : ""}
                              {" · "}
                              {formatarMoeda(p.receita)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Produtos mais acessados</CardTitle>
                    <CardDescription>Views vs add to cart</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {topProdutos.length === 0 ? (
                      <p className="text-sm text-gray-500">Sem dados.</p>
                    ) : (
                      <ul className="space-y-2">
                        {topProdutos.map((p, i) => (
                          <li
                            key={p.produtoId}
                            className="flex justify-between text-sm gap-3"
                          >
                            <span className="font-medium truncate">
                              {i + 1}. {p.nome}
                            </span>
                            <span className="text-gray-500 shrink-0">
                              {p.views} views · {p.adds} adds
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Por que não concluiu</CardTitle>
                    <CardDescription>
                      Erros de checkout / fora do raio
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {erros.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        Nenhum erro registrado.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {erros.map((e) => (
                          <li
                            key={e.motivo}
                            className="flex justify-between text-sm"
                          >
                            <span className="font-medium">{e.motivo}</span>
                            <span className="text-gray-500">{e.qtd}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </>
      )}
    </AdminPageShell>
  );
}
