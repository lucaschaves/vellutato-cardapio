import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  ChefHat,
  Clock,
  Printer,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useImpressaoAdmin } from "../../context/ImpressaoAdminContext";
import { supabase } from "../../lib/supabase";

// Tipagens
interface EscolhaComboPedido {
  nome_grupo: string;
  nome_produto: string;
  delta_preco: number;
}

interface ItemPedido {
  id: string;
  quantidade: number;
  observacoes: string;
  modo_consumo?: string | null;
  produtos: { nome: string };
  pedido_item_combo_escolhas?: EscolhaComboPedido[];
}

interface Pedido {
  id: string;
  sequencia_pedido: number;
  origem: "mesa" | "balcao";
  identificador: string;
  cliente_nome: string;
  status: "pendente" | "em_producao" | "pronto" | "entregue" | "cancelado";
  criado_em: string;
  pedido_itens: ItemPedido[];
}

export function PainelPedidos() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [statusConexao, setStatusConexao] = useState<
    "conectado" | "desconectado"
  >("desconectado");
  const { impressoraOffline, imprimirPedido } = useImpressaoAdmin();

  // Carrega os dados iniciais e monta o listener do Realtime
  useEffect(() => {
    carregarPedidosAtivos();

    // Inscrição no canal Realtime do Supabase
    const canalPedidos = supabase
      .channel("painel_cozinha")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedidos" },
        (payload) => {
          console.info(
            "[REALTIME] Atualização detectada na tabela pedidos:",
            payload,
          );
          // Para garantir que temos os itens atrelados (joins), recarregamos os pedidos ativos
          // Em um app de escala gigantesca, faríamos o patch manual no estado.
          carregarPedidosAtivos();
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setStatusConexao("conectado");
        } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
          setStatusConexao("desconectado");
          console.error(
            "[ERRO - REALTIME] Conexão com o servidor perdida. Status:",
            status,
          );
        }
      });

    return () => {
      supabase.removeChannel(canalPedidos);
    };
  }, []);

  const cancelarPedido = async (pedidoId: string) => {
    try {
      // Chamada da função que criamos no SQL
      const { error } = await supabase.rpc("cancelar_pedido_com_estoque", {
        p_pedido_id: pedidoId,
      });

      if (error) throw error;

      toast.success("Pedido cancelado e estoque atualizado!");
      carregarPedidosAtivos(); // Recarrega a lista
    } catch (erro: any) {
      console.error("Erro ao cancelar:", erro);
      toast.error("Falha ao cancelar pedido.");
    }
  };

  const carregarPedidosAtivos = async () => {
    try {
      setCarregando(true);
      // Removemos o filtro 'in' para garantir que nada fique oculto por erro de digitação de status
      const { data, error } = await supabase
        .from("pedidos")
        .select(
          `
          id, sequencia_pedido, origem, identificador, cliente_nome, status, criado_em,
          pedido_itens (
            id, quantidade, observacoes, modo_consumo,
            produtos ( nome ),
            pedido_item_combo_escolhas (
              nome_grupo, nome_produto, delta_preco
            )
          )
        `,
        )
        // KDS: exclui entregue, cancelado e pago (conta fechada no caixa)
        .not("status", "in", '("entregue","cancelado","pago")')
        .order("criado_em", { ascending: false }); // Pedidos novos primeiro

      if (error) throw new Error(error.message);

      setPedidos(data as unknown as Pedido[]);
    } catch (erro: any) {
      console.error("[ERRO - PAINEL] Falha ao carregar:", erro.message);
    } finally {
      setCarregando(false);
    }
  };

  // No seu PainelPedidos.tsx, garanta que o valor é enviado limpo:
  // Exemplo de como deve estar o seu disparador de status:
  const atualizarStatus = async (
    pedidoId: string,
    novoStatus: "pendente" | "em_producao" | "pronto" | "entregue" | "cancelado",
  ) => {
    console.log("novoStatus", novoStatus);
    const { error } = await supabase
      .from("pedidos")
      .update({ status: novoStatus }) // O valor aqui deve ser idêntico ao do banco
      .eq("id", pedidoId);

    if (error) toast.error(`Erro ao atualizar: ${error.message}`);
    else toast.success("Status atualizado!");
  };

  const enviarParaImpressora = async (pedido: Pedido) => {
    const sucesso = await imprimirPedido(pedido.id, { manual: true });
    if (sucesso) {
      console.info(
        `[IMPRESSÃO] Pedido #${pedido.sequencia_pedido} reenviado para a impressora.`,
      );
    }
  };

  // Separação em colunas (Kanban)
  const pendentes = pedidos.filter((p) => p.status === "pendente");
  const emProducao = pedidos.filter((p) => p.status === "em_producao");
  const prontos = pedidos.filter((p) => p.status === "pronto");

  // Subcomponente para renderizar o Card do Pedido
  const CardPedido = ({
    pedido,
    corBorder,
  }: {
    pedido: Pedido;
    corBorder: string;
  }) => (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className={`bg-white dark:bg-surface-dark border-l-4 ${corBorder} shadow-sm p-4 rounded-lg flex flex-col gap-3`}
    >
      <div className="flex justify-between items-start border-b border-gray-100 dark:border-gray-800 pb-2">
        <div>
          <h3 className="font-bold text-lg">
            #{pedido.sequencia_pedido} - {pedido.identificador}
          </h3>
          <p className="text-sm text-gray-500">{pedido.cliente_nome}</p>
        </div>
        <div className="flex gap-2">
          {(pedido.status === "pendente" || pedido.status === "em_producao") && (
              <button
                onClick={() => cancelarPedido(pedido.id)}
                className="p-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors flex justify-center items-center gap-2"
              >
                <Trash2 size={18} className="text-white" />
              </button>
            )}
          <button
            onClick={() => enviarParaImpressora(pedido)}
            className="p-2 bg-gray-100 dark:bg-gray-800 rounded-md hover:bg-gray-200 transition-colors"
            title="Imprimir Cupom"
          >
            <Printer size={20} className="text-gray-700 dark:text-gray-300" />
          </button>
        </div>
      </div>

      <ul className="flex-1 space-y-2">
        {pedido.pedido_itens.map((item) => (
          <li key={item.id} className="text-sm">
            <span className="font-bold">{item.quantidade}x</span>{" "}
            {item.produtos.nome}
            {item.modo_consumo === "levar" && (
              <span className="ml-1 text-[0.625rem] font-black uppercase tracking-wide text-orange-600 dark:text-orange-400">
                · LEVAR
              </span>
            )}
            {item.modo_consumo === "loja" && (
              <span className="ml-1 text-[0.625rem] font-black uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                · LOJA
              </span>
            )}
            {item.pedido_item_combo_escolhas &&
              item.pedido_item_combo_escolhas.length > 0 && (
                <ul className="ml-4 mt-0.5 space-y-0.5">
                  {item.pedido_item_combo_escolhas.map((escolha, idx) => (
                    <li
                      key={`${item.id}-combo-${idx}`}
                      className="text-xs text-gray-600 dark:text-gray-400"
                    >
                      {escolha.nome_grupo}: {escolha.nome_produto}
                      {Number(escolha.delta_preco) > 0 &&
                        ` (+R$ ${Number(escolha.delta_preco).toFixed(2)})`}
                    </li>
                  ))}
                </ul>
              )}
            {item.observacoes && (
              <p className="text-xs text-red-500 font-medium ml-4">
                Obs: {item.observacoes}
              </p>
            )}
          </li>
        ))}
      </ul>

      <div className="pt-2 flex gap-2 flex-col">
        {pedido.status === "pendente" && (
          <button
            onClick={() => atualizarStatus(pedido.id, "em_producao")}
            className="flex-1 bg-yellow-500 text-white py-2 rounded font-bold flex justify-center items-center gap-2"
          >
            <ChefHat size={18} /> Preparar
          </button>
        )}
        {pedido.status === "em_producao" && (
          <button
            onClick={() => atualizarStatus(pedido.id, "pronto")}
            className="flex-1 bg-green-500 text-white py-2 rounded font-bold flex justify-center items-center gap-2"
          >
            <CheckCircle2 size={18} /> Finalizar
          </button>
        )}
        {pedido.status === "pronto" && (
          <button
            onClick={() => atualizarStatus(pedido.id, "entregue")}
            className="flex-1 bg-gray-800 text-white py-2 rounded font-bold"
          >
            Entregue
          </button>
        )}
      </div>
    </motion.div>
  );

  return (
    <div className="h-full bg-gray-50 dark:bg-background-dark p-4 flex flex-col">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold dark:text-white">Fila de Produção</h1>
        <div className="flex items-center gap-2">
          {impressoraOffline && (
            <span className="flex items-center gap-1 text-orange-600 font-bold text-sm bg-orange-100 dark:bg-orange-900/30 px-3 py-1 rounded-full">
              <Printer size={16} /> Impressora offline
            </span>
          )}
          {statusConexao === "desconectado" && (
            <span className="flex items-center gap-1 text-red-500 font-bold text-sm bg-red-100 px-3 py-1 rounded-full">
              <AlertCircle size={16} /> Sem Conexão Realtime
            </span>
          )}
          <span className="text-sm bg-cookie-primary text-white px-4 py-2 rounded-lg font-medium">
            Total Ativos: {pedidos.length}
          </span>
        </div>
      </header>

      {carregando && pedidos.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin h-10 w-10 border-4 border-cookie-accent border-t-transparent rounded-full"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1 overflow-hidden">
          {/* Coluna PENDENTE */}
          <div className="flex flex-col bg-gray-100 dark:bg-[#1a1815] rounded-xl p-4 overflow-y-auto hide-scrollbar">
            <h2 className="font-bold text-lg mb-4 flex items-center gap-2 text-red-600">
              <Clock size={20} /> Novos ({pendentes.length})
            </h2>
            <div className="flex flex-col gap-4">
              <AnimatePresence>
                {pendentes.map((p) => (
                  <CardPedido
                    key={p.id}
                    pedido={p}
                    corBorder="border-red-500"
                  />
                ))}
              </AnimatePresence>
            </div>
          </div>

          {/* Coluna EM PRODUÇÃO */}
          <div className="flex flex-col bg-gray-100 dark:bg-[#1a1815] rounded-xl p-4 overflow-y-auto hide-scrollbar">
            <h2 className="font-bold text-lg mb-4 flex items-center gap-2 text-yellow-600">
              <ChefHat size={20} /> Preparando ({emProducao.length})
            </h2>
            <div className="flex flex-col gap-4">
              <AnimatePresence>
                {emProducao.map((p) => (
                  <CardPedido
                    key={p.id}
                    pedido={p}
                    corBorder="border-yellow-500"
                  />
                ))}
              </AnimatePresence>
            </div>
          </div>

          {/* Coluna PRONTO */}
          <div className="flex flex-col bg-gray-100 dark:bg-[#1a1815] rounded-xl p-4 overflow-y-auto hide-scrollbar">
            <h2 className="font-bold text-lg mb-4 flex items-center gap-2 text-green-600">
              <CheckCircle2 size={20} /> Prontos ({prontos.length})
            </h2>
            <div className="flex flex-col gap-4">
              <AnimatePresence>
                {prontos.map((p) => (
                  <CardPedido
                    key={p.id}
                    pedido={p}
                    corBorder="border-green-500"
                  />
                ))}
              </AnimatePresence>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
