import {
  ChevronDown,
  ChevronUp,
  History,
  Loader2,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import {
  formatarDataHora,
  formatarMoeda,
  obterClasseStatus,
  obterInicioPeriodo,
  obterValorPedido,
  STATUS_PEDIDO_LABEL,
  type PeriodoRelatorio,
} from "../../lib/pedidosAdmin";
import { supabase } from "../../lib/supabase";

interface ItemHistorico {
  id: string;
  quantidade: number;
  preco_unitario: number;
  observacoes: string | null;
  produtos: { nome: string } | null;
  pedido_item_adicionais: Array<{
    preco_aplicado: number;
    adicionais: { nome: string } | null;
  }>;
}

interface PedidoHistorico {
  id: string;
  sequencia_pedido: number;
  cliente_nome: string;
  cliente_celular: string | null;
  cliente_id: string | null;
  identificador: string;
  origem: string;
  status: string;
  total: number | null;
  valor_total: number | null;
  desconto_aplicado: number | null;
  criado_em: string;
  cupons: { codigo: string; tipo: string; valor: number } | null;
  pedido_itens: ItemHistorico[];
}

const PERIODOS: { id: PeriodoRelatorio; label: string }[] = [
  { id: "hoje", label: "Hoje" },
  { id: "7dias", label: "7 dias" },
  { id: "30dias", label: "30 dias" },
  { id: "todos", label: "Todos" },
];

const FILTROS_STATUS = [
  { id: "todos", label: "Todos os status" },
  { id: "pendente", label: "Pendente" },
  { id: "em_producao", label: "Em produção" },
  { id: "pronto", label: "Pronto" },
  { id: "entregue", label: "Entregue" },
  { id: "pago", label: "Pago" },
  { id: "cancelado", label: "Cancelado" },
];

export function HistoricoPedidos() {
  const [pedidos, setPedidos] = useState<PedidoHistorico[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [termoBusca, setTermoBusca] = useState("");
  const [periodo, setPeriodo] = useState<PeriodoRelatorio>("30dias");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [expandidoId, setExpandidoId] = useState<string | null>(null);

  const carregarHistorico = useCallback(async () => {
    try {
      setCarregando(true);

      let query = supabase
        .from("pedidos")
        .select(
          `
          id, sequencia_pedido, cliente_nome, cliente_celular, cliente_id,
          identificador, origem, status, total, valor_total, desconto_aplicado,
          criado_em,
          cupons ( codigo, tipo, valor ),
          pedido_itens (
            id, quantidade, preco_unitario, observacoes,
            produtos ( nome ),
            pedido_item_adicionais (
              preco_aplicado,
              adicionais ( nome )
            )
          )
        `,
        )
        .order("criado_em", { ascending: false })
        .limit(200);

      const inicio = obterInicioPeriodo(periodo);
      if (inicio) {
        query = query.gte("criado_em", inicio);
      }

      if (filtroStatus !== "todos") {
        query = query.eq("status", filtroStatus);
      }

      const { data, error } = await query;
      if (error) throw error;

      setPedidos((data as unknown as PedidoHistorico[]) || []);
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error("[ERRO - HISTÓRICO]", mensagem);
      toast.error("Falha ao carregar o histórico de pedidos.");
    } finally {
      setCarregando(false);
    }
  }, [filtroStatus, periodo]);

  useEffect(() => {
    void carregarHistorico();
  }, [carregarHistorico]);

  const pedidosFiltrados = useMemo(() => {
    const termo = termoBusca.trim().toLowerCase();
    if (!termo) return pedidos;

    return pedidos.filter((pedido) => {
      const campos = [
        pedido.cliente_nome,
        pedido.cliente_celular || "",
        pedido.identificador,
        String(pedido.sequencia_pedido),
        pedido.cupons?.codigo || "",
        pedido.pedido_itens
          .map((item) => item.produtos?.nome || "")
          .join(" "),
      ];

      return campos.some((campo) => campo.toLowerCase().includes(termo));
    });
  }, [pedidos, termoBusca]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <History size={28} className="text-cookie-primary" />
            Histórico de Pedidos
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Consulte pedidos finalizados, pagos e em andamento.
          </p>
        </div>

        <div className="relative w-full lg:w-80">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            size={16}
          />
          <Input
            placeholder="Buscar cliente, mesa ou produto..."
            value={termoBusca}
            onChange={(evento) => setTermoBusca(evento.target.value)}
            className="pl-9 dark:bg-[#1a1815]"
          />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
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

        <select
          value={filtroStatus}
          onChange={(evento) => setFiltroStatus(evento.target.value)}
          className="h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1815] px-3 text-sm text-gray-900 dark:text-white"
        >
          {FILTROS_STATUS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      {carregando ? (
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-cookie-primary" size={40} />
        </div>
      ) : pedidosFiltrados.length === 0 ? (
        <div className="text-center py-20 text-gray-500 bg-white dark:bg-surface-dark rounded-xl border border-dashed dark:border-gray-800">
          <History size={48} className="mx-auto mb-3 opacity-20" />
          <p className="text-lg font-medium">Nenhum pedido encontrado.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pedidosFiltrados.map((pedido) => {
            const expandido = expandidoId === pedido.id;
            const totalItens = pedido.pedido_itens.reduce(
              (acc, item) => acc + item.quantidade,
              0,
            );

            return (
              <div
                key={pedido.id}
                className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpandidoId(expandido ? null : pedido.id)
                  }
                  className="w-full px-5 py-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-6 text-left hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-black text-gray-900 dark:text-white">
                        #{pedido.sequencia_pedido}
                      </span>
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-full ${obterClasseStatus(pedido.status)}`}
                      >
                        {STATUS_PEDIDO_LABEL[pedido.status] || pedido.status}
                      </span>
                      <Badge variant="outline">{pedido.identificador}</Badge>
                      {pedido.cupons && (
                        <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 border-0">
                          Cupom {pedido.cupons.codigo}
                        </Badge>
                      )}
                    </div>
                    <p className="font-semibold text-gray-900 dark:text-white truncate">
                      {pedido.cliente_nome}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatarDataHora(pedido.criado_em)} · {totalItens}{" "}
                      {totalItens === 1 ? "item" : "itens"} ·{" "}
                      {pedido.origem}
                    </p>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <span className="text-xl font-black text-cookie-accent">
                      {formatarMoeda(obterValorPedido(pedido))}
                    </span>
                    {expandido ? (
                      <ChevronUp size={20} className="text-gray-400" />
                    ) : (
                      <ChevronDown size={20} className="text-gray-400" />
                    )}
                  </div>
                </button>

                {expandido && (
                  <div className="px-5 pb-5 border-t border-gray-100 dark:border-gray-800 pt-4 space-y-3">
                    {pedido.cliente_celular && (
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Celular: {pedido.cliente_celular}
                      </p>
                    )}

                    {(Number(pedido.desconto_aplicado || 0) > 0 ||
                      pedido.valor_total != null) && (
                      <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1 bg-gray-50 dark:bg-[#1a1815] rounded-xl p-3">
                        {pedido.valor_total != null && (
                          <p>
                            Subtotal: {formatarMoeda(pedido.valor_total)}
                          </p>
                        )}
                        {Number(pedido.desconto_aplicado || 0) > 0 && (
                          <p className="text-green-600 dark:text-green-400 font-medium">
                            Desconto
                            {pedido.cupons ? ` (${pedido.cupons.codigo})` : ""}:{" "}
                            -{formatarMoeda(pedido.desconto_aplicado)}
                          </p>
                        )}
                        <p className="font-bold text-gray-900 dark:text-white">
                          Total: {formatarMoeda(obterValorPedido(pedido))}
                        </p>
                      </div>
                    )}

                    {pedido.pedido_itens.map((item) => (
                      <div
                        key={item.id}
                        className="flex justify-between gap-4 text-sm bg-gray-50 dark:bg-[#1a1815] rounded-xl p-3"
                      >
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-white">
                            {item.quantidade}x {item.produtos?.nome || "Produto"}
                          </p>
                          {item.observacoes && (
                            <p className="text-xs text-gray-500 mt-1">
                              Obs: {item.observacoes}
                            </p>
                          )}
                          {item.pedido_item_adicionais.length > 0 && (
                            <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                              {item.pedido_item_adicionais.map((adicional, idx) => (
                                <p key={idx}>
                                  + {adicional.adicionais?.nome} (
                                  {formatarMoeda(adicional.preco_aplicado)})
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                        <span className="font-bold text-gray-900 dark:text-white shrink-0">
                          {formatarMoeda(item.preco_unitario * item.quantidade)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
