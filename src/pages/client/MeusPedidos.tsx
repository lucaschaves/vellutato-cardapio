import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ClipboardList,
  Loader2,
  Phone,
  RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  buscarMeusPedidos,
  STATUS_PEDIDO_CLIENTE,
  type MeuPedido,
} from "../../lib/meusPedidos";
import {
  formatarDataHora,
  formatarMoeda,
  obterClasseStatus,
} from "../../lib/pedidosAdmin";
import { supabase } from "../../lib/supabase";
import {
  aoTeclaTelefone,
  criarHandlerTelefone,
  lerCelularLocalStorage,
  normalizarTelefoneParaSalvar,
  salvarCelularLocalStorage,
  telefoneDigitosCompleto,
} from "../../lib/telefone";
import { urlCardapio } from "../../lib/urlCardapio";

export function MeusPedidos() {
  const navigate = useNavigate();
  const location = useLocation();

  const [celular, setCelular] = useState(() => lerCelularLocalStorage());
  const [pedidos, setPedidos] = useState<MeuPedido[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [buscou, setBuscou] = useState(false);

  const celularNormalizado = normalizarTelefoneParaSalvar(celular);
  const celularValido = telefoneDigitosCompleto(celular);

  const carregarPedidos = useCallback(async () => {
    if (!celularValido) {
      setPedidos([]);
      setCarregando(false);
      return;
    }

    try {
      setCarregando(true);
      const lista = await buscarMeusPedidos(celular);
      setPedidos(lista);
      setBuscou(true);
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error("[MEUS PEDIDOS]", mensagem);
      toast.error("Não foi possível carregar seus pedidos.");
    } finally {
      setCarregando(false);
    }
  }, [celular, celularValido]);

  useEffect(() => {
    if (celularValido) {
      void carregarPedidos();
    } else {
      setCarregando(false);
    }
  }, [carregarPedidos, celularValido]);

  useEffect(() => {
    if (!celularValido) return;

    const canal = supabase
      .channel(`meus-pedidos-${celularNormalizado}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "pedidos",
          filter: `cliente_celular=eq.${celularNormalizado}`,
        },
        () => {
          void carregarPedidos();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(canal);
    };
  }, [carregarPedidos, celularNormalizado, celularValido]);

  const handleBuscar = () => {
    if (!celularValido) {
      toast.error("Informe um celular válido com DDD.");
      return;
    }
    salvarCelularLocalStorage(celular);
    void carregarPedidos();
  };

  const voltar = () => navigate(urlCardapio("", location.search));

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      className="fixed inset-0 z-50 bg-gray-100 dark:bg-[#121212] flex flex-col"
    >
      <header className="shrink-0 bg-white dark:bg-[#181a1b] border-b border-gray-200 dark:border-[#2a2c30] px-4 py-4 flex items-center gap-3">
        <button
          type="button"
          onClick={voltar}
          className="p-2.5 bg-gray-100 dark:bg-[#2a2c30] rounded-full text-gray-900 dark:text-white active:scale-95 transition-all"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-extrabold text-gray-950 dark:text-white flex items-center gap-2">
            <ClipboardList size={20} className="text-[#ff5722]" />
            Meus pedidos
          </h1>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Acompanhe o status pelo celular informado no pedido
          </p>
        </div>
        {celularValido && (
          <button
            type="button"
            onClick={() => void carregarPedidos()}
            disabled={carregando}
            className="p-2.5 bg-gray-100 dark:bg-[#2a2c30] rounded-full text-gray-700 dark:text-gray-200 active:scale-95 disabled:opacity-50"
            title="Atualizar"
          >
            <RefreshCw size={18} className={carregando ? "animate-spin" : ""} />
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-4 max-w-lg mx-auto w-full space-y-4">
        {!celularValido && (
          <div className="bg-white dark:bg-[#181a1b] rounded-2xl p-5 border border-gray-200 dark:border-[#2a2c30] space-y-4">
            <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
              <Phone size={18} className="text-[#ff5722]" />
              <p className="text-sm font-medium">
                Digite o celular usado no pedido para ver o histórico.
              </p>
            </div>
            <input
              type="tel"
              inputMode="numeric"
              value={celular}
              onChange={criarHandlerTelefone(setCelular)}
              onKeyDown={aoTeclaTelefone}
              placeholder="(11) 98765-4321"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-[#2a2c30] bg-gray-50 dark:bg-[#242629] text-gray-900 dark:text-white"
            />
            <button
              type="button"
              onClick={handleBuscar}
              className="w-full bg-[#ff5722] hover:bg-[#e64a19] text-white font-bold py-3 rounded-xl active:scale-[0.98] transition-all"
            >
              Buscar pedidos
            </button>
          </div>
        )}

        {carregando && (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-[#ff5722]" size={36} />
          </div>
        )}

        {!carregando && celularValido && buscou && pedidos.length === 0 && (
          <div className="text-center py-16 text-gray-500">
            <ClipboardList size={48} className="mx-auto mb-3 opacity-20" />
            <p className="font-medium">Nenhum pedido encontrado para este celular.</p>
          </div>
        )}

        <AnimatePresence>
          {!carregando &&
            pedidos.map((pedido) => (
              <motion.div
                key={pedido.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white dark:bg-[#181a1b] rounded-2xl border border-gray-200 dark:border-[#2a2c30] overflow-hidden"
              >
                <div className="p-4 border-b border-gray-100 dark:border-[#2a2c30]">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="font-black text-gray-900 dark:text-white">
                      Pedido #{pedido.sequencia_pedido}
                    </span>
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded-full ${obterClasseStatus(pedido.status)}`}
                    >
                      {STATUS_PEDIDO_CLIENTE[pedido.status] || pedido.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {formatarDataHora(pedido.criado_em)} · {pedido.identificador}
                  </p>
                  <p className="text-lg font-black text-[#ff5722] mt-2">
                    {formatarMoeda(Number(pedido.total || 0))}
                  </p>
                  {Number(pedido.desconto_aplicado || 0) > 0 && (
                    <p className="text-xs text-green-600 font-medium mt-1">
                      Desconto aplicado: {formatarMoeda(pedido.desconto_aplicado)}
                    </p>
                  )}
                </div>

                <ul className="p-4 space-y-2">
                  {pedido.itens.map((item, idx) => (
                    <li key={idx} className="text-sm text-gray-800 dark:text-gray-200">
                      <span className="font-bold">{item.quantidade}x</span> {item.nome}
                      {item.observacoes && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          Obs: {item.observacoes}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
