import { Activity, Loader2, ShoppingBag, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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
  type PeriodoRelatorio,
} from "../../lib/pedidosAdmin";

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

export function DashboardAnalytics() {
  const [periodo, setPeriodo] = useState<PeriodoRelatorio>("7dias");
  const [canal, setCanal] = useState<CanalAnalytics | "todos">("todos");
  const [carregando, setCarregando] = useState(true);
  const [resumos, setResumos] = useState<ResumoCanal[]>([]);
  const [funil, setFunil] = useState<FunilEtapa[]>([]);
  const [topProdutos, setTopProdutos] = useState<ProdutoRankingAnalytics[]>(
    [],
  );
  const [erros, setErros] = useState<{ motivo: string; qtd: number }[]>([]);
  const [pedidosOrigem, setPedidosOrigem] = useState<PedidoOrigemResumo[]>([]);

  const carregar = useCallback(async () => {
    try {
      setCarregando(true);
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
        "Falha ao carregar analytics. Rode a migration analytics_canais no banco.",
      );
    } finally {
      setCarregando(false);
    }
  }, [periodo, canal]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const maxFunil = Math.max(...funil.map((f) => f.sessoes), 1);
  const totalSessoes = resumos.reduce((a, r) => a + r.sessoes, 0);
  const totalPedidosEvt = resumos.reduce((a, r) => a + r.orderCreated, 0);

  return (
    <AdminPageShell
      title={
        <h1 className="flex items-center gap-2">
          <Activity className="text-[#6b1d2a]" size={26} />
          Analytics
        </h1>
      }
      description="Funil por canal: mesa, totem, balcão e delivery."
      actions={
        <div className="flex flex-wrap gap-2">
          {PERIODOS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriodo(p.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border ${
                periodo === p.id
                  ? "bg-[#6b1d2a] text-white border-[#6b1d2a]"
                  : "border-gray-200 dark:border-[#2a2c30] text-gray-600 dark:text-gray-300"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      }
      contentClassName="space-y-6"
    >
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

      {carregando ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="animate-spin mr-2" size={20} />
          Carregando analytics...
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Sessões</CardDescription>
                <CardTitle className="text-2xl flex items-center gap-2">
                  <Users size={18} className="text-[#6b1d2a]" />
                  {totalSessoes}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Pedidos (eventos)</CardDescription>
                <CardTitle className="text-2xl flex items-center gap-2">
                  <ShoppingBag size={18} className="text-[#6b1d2a]" />
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
                          ?.sessoes ||
                          0) /
                          funil[0].sessoes) *
                        100
                      ).toFixed(1)
                    : "0.0"}
                  %
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Funil</CardTitle>
              <CardDescription>
                Sessões únicas por etapa
                {canal !== "todos" ? ` · ${CANAL_LABEL[canal]}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {funil.every((f) => f.sessoes === 0) ? (
                <p className="text-sm text-gray-500">
                  Sem eventos ainda. Navegue no delivery/cardápio para gerar
                  dados.
                </p>
              ) : (
                funil.map((etapa) => (
                  <div key={etapa.evento} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-semibold text-gray-800 dark:text-gray-200">
                        {etapa.label}
                      </span>
                      <span className="text-gray-500">
                        {etapa.sessoes}
                        {etapa.taxaDoAnterior != null
                          ? ` · ${etapa.taxaDoAnterior.toFixed(0)}% do passo anterior`
                          : ""}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 dark:bg-[#2a2c30] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#6b1d2a]"
                        style={{
                          width: `${Math.max((etapa.sessoes / maxFunil) * 100, etapa.sessoes ? 4 : 0)}%`,
                        }}
                      />
                    </div>
                  </div>
                ))
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
                  <p className="text-sm text-gray-500">Sem pedidos no período.</p>
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
                  <p className="text-sm text-gray-500">Nenhum erro registrado.</p>
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
    </AdminPageShell>
  );
}
