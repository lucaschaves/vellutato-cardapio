import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Loader2,
  User,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "../../components/ui/badge";
import {
  formatarDataHora,
  formatarMoeda,
  obterClasseStatus,
  obterValorPedido,
  STATUS_PEDIDO_LABEL,
} from "../../lib/pedidosAdmin";
import { formatarTelefoneDeSalvo } from "../../lib/telefone";
import { supabase } from "../../lib/supabase";

interface ClienteDetalhe {
  id: string;
  nome: string;
  celular: string;
  total_pedidos: number | null;
  valor_gasto: number | null;
  ultimo_pedido: string | null;
  created_at: string | null;
}

interface ItemPedidoCliente {
  id: string;
  quantidade: number;
  preco_unitario: number;
  observacoes: string | null;
  produtos: { nome: string } | null;
}

interface PedidoCliente {
  id: string;
  sequencia_pedido: number;
  status: string;
  total: number | null;
  valor_total: number | null;
  desconto_aplicado: number | null;
  identificador: string;
  criado_em: string;
  cupons: { codigo: string } | null;
  pedido_itens: ItemPedidoCliente[];
}

export function DetalheCliente() {
  const { clienteId } = useParams<{ clienteId: string }>();
  const [cliente, setCliente] = useState<ClienteDetalhe | null>(null);
  const [pedidos, setPedidos] = useState<PedidoCliente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [expandidoId, setExpandidoId] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!clienteId) return;

    try {
      setCarregando(true);

      const { data: dataCliente, error: erroCliente } = await supabase
        .from("clientes")
        .select("*")
        .eq("id", clienteId)
        .single();

      if (erroCliente) throw erroCliente;

      const { data: dataPedidos, error: erroPedidos } = await supabase
        .from("pedidos")
        .select(
          `
          id, sequencia_pedido, status, total, valor_total, desconto_aplicado,
          identificador, criado_em,
          cupons ( codigo ),
          pedido_itens (
            id, quantidade, preco_unitario, observacoes,
            produtos ( nome )
          )
        `,
        )
        .eq("cliente_id", clienteId)
        .order("criado_em", { ascending: false })
        .limit(50);

      if (erroPedidos) throw erroPedidos;

      setCliente(dataCliente as ClienteDetalhe);
      setPedidos((dataPedidos as unknown as PedidoCliente[]) || []);
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error("[ERRO - DETALHE CLIENTE]", mensagem);
      toast.error("Falha ao carregar dados do cliente.");
    } finally {
      setCarregando(false);
    }
  }, [clienteId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (carregando) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-cookie-primary" size={40} />
      </div>
    );
  }

  if (!cliente) {
    return (
      <div className="p-6 max-w-4xl mx-auto text-center py-20">
        <p className="text-gray-500 mb-4">Cliente não encontrado.</p>
        <Link
          to="/admin/clientes"
          className="text-cookie-primary font-semibold hover:underline"
        >
          Voltar para clientes
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <Link
        to="/admin/clientes"
        className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-cookie-primary transition-colors"
      >
        <ArrowLeft size={16} />
        Voltar para clientes
      </Link>

      <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-800 rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-full bg-cookie-primary/10 text-cookie-primary">
            <User size={28} />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white truncate">
              {cliente.nome}
            </h1>
            <p className="text-gray-500 mt-1">
              {formatarTelefoneDeSalvo(cliente.celular)}
            </p>
            {cliente.created_at && (
              <p className="text-xs text-gray-400 mt-1">
                Cliente desde{" "}
                {new Date(cliente.created_at).toLocaleDateString("pt-BR")}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
          <div className="rounded-xl bg-gray-50 dark:bg-[#1a1815] p-4">
            <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">
              Pedidos
            </p>
            <p className="text-2xl font-black text-gray-900 dark:text-white mt-1">
              {cliente.total_pedidos || 0}
            </p>
          </div>
          <div className="rounded-xl bg-gray-50 dark:bg-[#1a1815] p-4">
            <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">
              Total gasto
            </p>
            <p className="text-2xl font-black text-cookie-accent mt-1">
              {formatarMoeda(cliente.valor_gasto)}
            </p>
          </div>
          <div className="rounded-xl bg-gray-50 dark:bg-[#1a1815] p-4">
            <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">
              Ticket médio
            </p>
            <p className="text-2xl font-black text-gray-900 dark:text-white mt-1">
              {cliente.total_pedidos && cliente.total_pedidos > 0
                ? formatarMoeda(
                    Number(cliente.valor_gasto || 0) / cliente.total_pedidos,
                  )
                : "—"}
            </p>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">
          Histórico de pedidos ({pedidos.length})
        </h2>

        {pedidos.length === 0 ? (
          <div className="text-center py-12 text-gray-500 bg-white dark:bg-surface-dark rounded-xl border border-dashed dark:border-gray-800">
            Nenhum pedido vinculado a este cliente.
          </div>
        ) : (
          <div className="space-y-3">
            {pedidos.map((pedido) => {
              const expandido = expandidoId === pedido.id;
              return (
                <div
                  key={pedido.id}
                  className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpandidoId(expandido ? null : pedido.id)
                    }
                    className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-bold text-gray-900 dark:text-white">
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
                            {pedido.cupons.codigo}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">
                        {formatarDataHora(pedido.criado_em)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-black text-cookie-accent">
                        {formatarMoeda(obterValorPedido(pedido))}
                      </span>
                      {expandido ? (
                        <ChevronUp size={18} className="text-gray-400" />
                      ) : (
                        <ChevronDown size={18} className="text-gray-400" />
                      )}
                    </div>
                  </button>

                  {expandido && (
                    <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-800 pt-3 space-y-2">
                      {Number(pedido.desconto_aplicado || 0) > 0 && (
                        <p className="text-xs text-green-600 font-medium">
                          Desconto: -{formatarMoeda(pedido.desconto_aplicado)}
                        </p>
                      )}
                      {pedido.pedido_itens.map((item) => (
                        <div
                          key={item.id}
                          className="flex justify-between text-sm bg-gray-50 dark:bg-[#1a1815] rounded-lg p-2"
                        >
                          <span>
                            {item.quantidade}x {item.produtos?.nome || "Item"}
                            {item.observacoes && (
                              <span className="block text-xs text-gray-500">
                                Obs: {item.observacoes}
                              </span>
                            )}
                          </span>
                          <span className="font-semibold shrink-0">
                            {formatarMoeda(
                              item.preco_unitario * item.quantidade,
                            )}
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
    </div>
  );
}
