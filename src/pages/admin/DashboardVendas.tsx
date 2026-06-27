import {
  BarChart3,
  Loader2,
  ShoppingBag,
  Ticket,
  TrendingUp,
  Users,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import {
  formatarMoeda,
  obterInicioPeriodo,
  obterValorPedido,
  pedidoContaComoVenda,
  STATUS_PEDIDO_LABEL,
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

const PERIODOS: { id: PeriodoRelatorio; label: string }[] = [
  { id: "hoje", label: "Hoje" },
  { id: "7dias", label: "7 dias" },
  { id: "30dias", label: "30 dias" },
  { id: "todos", label: "Todos" },
];

function obterChaveDia(dataIso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(dataIso));
}

export function DashboardVendas() {
  const [periodo, setPeriodo] = useState<PeriodoRelatorio>("7dias");
  const [pedidos, setPedidos] = useState<PedidoDashboard[]>([]);
  const [topClientesGeral, setTopClientesGeral] = useState<
    { nome: string; total_pedidos: number | null; valor_gasto: number | null }[]
  >([]);
  const [carregando, setCarregando] = useState(true);

  const carregarDados = useCallback(async () => {
    try {
      setCarregando(true);

      let query = supabase
        .from("pedidos")
        .select(
          `
          id, status, total, desconto_aplicado, origem, criado_em,
          cupom_id, cliente_id,
          cupons ( codigo ),
          clientes ( nome ),
          pedido_itens (
            quantidade, preco_unitario,
            produtos ( nome )
          )
        `,
        )
        .order("criado_em", { ascending: false });

      const inicio = obterInicioPeriodo(periodo);
      if (inicio) {
        query = query.gte("criado_em", inicio);
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

      setPedidos((resPedidos.data as unknown as PedidoDashboard[]) || []);
      setTopClientesGeral(resClientes.data || []);
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error("[ERRO - DASHBOARD]", mensagem);
      toast.error("Falha ao carregar os dados do dashboard.");
    } finally {
      setCarregando(false);
    }
  }, [periodo]);

  useEffect(() => {
    void carregarDados();
  }, [carregarDados]);

  const metricas = useMemo(() => {
    const vendas = pedidos.filter((pedido) =>
      pedidoContaComoVenda(pedido.status),
    );
    const cancelados = pedidos.filter((pedido) => pedido.status === "cancelado");
    const emAberto = pedidos.filter(
      (pedido) =>
        !pedidoContaComoVenda(pedido.status) && pedido.status !== "cancelado",
    );

    const receitaTotal = vendas.reduce(
      (acc, pedido) => acc + obterValorPedido(pedido),
      0,
    );
    const ticketMedio =
      vendas.length > 0 ? receitaTotal / vendas.length : 0;

    const rankingMap = new Map<string, ProdutoRanking>();

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

    const porStatus = pedidos.reduce<Record<string, number>>((acc, pedido) => {
      acc[pedido.status] = (acc[pedido.status] || 0) + 1;
      return acc;
    }, {});

    const vendasPorDia = vendas.reduce<Record<string, number>>((acc, pedido) => {
      const chave = obterChaveDia(pedido.criado_em);
      acc[chave] = (acc[chave] || 0) + obterValorPedido(pedido);
      return acc;
    }, {});

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
      porOrigem,
      porStatus,
      serieDiaria,
      maxSerie,
    };
  }, [pedidos]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <BarChart3 size={28} className="text-cookie-primary" />
            Dashboard de Vendas
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Visão geral de faturamento, ticket médio e produtos em destaque.
          </p>
        </div>

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
      </div>

      {carregando ? (
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-cookie-primary" size={40} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <Card className="bg-white dark:bg-surface-dark border-gray-200 dark:border-gray-800">
              <CardHeader>
                <CardDescription>Receita (pagos/entregues)</CardDescription>
                <CardTitle className="text-2xl font-black text-cookie-accent">
                  {formatarMoeda(metricas.receitaTotal)}
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
                <CardTitle className="text-2xl font-black text-gray-900 dark:text-white">
                  {formatarMoeda(metricas.ticketMedio)}
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
                <CardTitle className="text-2xl font-black text-gray-900 dark:text-white">
                  {metricas.totalPedidos}
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
                  <XCircle size={14} />{" "}
                  {metricas.taxaCancelamento.toFixed(1)}% do total
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
                <CardTitle>Por origem</CardTitle>
                <CardDescription>Pedidos concluídos</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.keys(metricas.porOrigem).length === 0 ? (
                  <p className="text-sm text-gray-500">Sem dados.</p>
                ) : (
                  Object.entries(metricas.porOrigem).map(([origem, qtd]) => (
                    <div
                      key={origem}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="font-medium capitalize text-gray-700 dark:text-gray-300">
                        {origem}
                      </span>
                      <span className="font-bold text-gray-900 dark:text-white">
                        {qtd}
                      </span>
                    </div>
                  ))
                )}

                <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                    Status geral
                  </p>
                  <div className="space-y-2">
                    {Object.entries(metricas.porStatus).map(([status, qtd]) => (
                      <div
                        key={status}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="text-gray-600 dark:text-gray-400">
                          {STATUS_PEDIDO_LABEL[status] || status}
                        </span>
                        <span className="font-bold">{qtd}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-white dark:bg-surface-dark border-gray-200 dark:border-gray-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users size={18} />
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
                <CardDescription>Mais usados em vendas concluídas</CardDescription>
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
                <CardDescription>Maior receita (vendas concluídas)</CardDescription>
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
      )}
    </div>
  );
}
