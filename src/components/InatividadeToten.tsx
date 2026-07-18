import { AnimatePresence, motion } from "framer-motion";
import { Hand } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  emModoToten,
  limparIdentificacaoCliente,
} from "../lib/modoCardapio";
import { limparTipoConsumo } from "../lib/disponibilidadeProduto";
import { useCartStore } from "../store/useCartStore";

const SEGUNDOS_INATIVIDADE = 60;
const SEGUNDOS_AVISO = 20;

const EVENTOS_INTERACAO = [
  "pointerdown",
  "keydown",
  "wheel",
  "touchstart",
] as const;

/**
 * No totem, após 60s sem interação mostra "Ainda está aí?" com contagem de
 * 20s. Sem resposta, limpa carrinho e dados do cliente e volta à tela
 * inicial do totem para o próximo cliente.
 */
export function InatividadeToten() {
  const navigate = useNavigate();
  const limparCarrinho = useCartStore((state) => state.limparCarrinho);

  const ativo = emModoToten();

  const [avisoAberto, setAvisoAberto] = useState(false);
  const [segundosRestantes, setSegundosRestantes] = useState(SEGUNDOS_AVISO);
  const timerInatividade = useRef<number | null>(null);

  const reiniciarTimerInatividade = useCallback(() => {
    if (timerInatividade.current !== null) {
      window.clearTimeout(timerInatividade.current);
    }
    timerInatividade.current = window.setTimeout(() => {
      setSegundosRestantes(SEGUNDOS_AVISO);
      setAvisoAberto(true);
    }, SEGUNDOS_INATIVIDADE * 1000);
  }, []);

  const continuarSessao = useCallback(() => {
    setAvisoAberto(false);
    reiniciarTimerInatividade();
  }, [reiniciarTimerInatividade]);

  const encerrarSessao = useCallback(() => {
    setAvisoAberto(false);
    limparCarrinho();
    limparIdentificacaoCliente();
    limparTipoConsumo();
    navigate("/", { replace: true });
  }, [limparCarrinho, navigate]);

  // Reinicia a contagem de inatividade a cada interação (fora do aviso)
  useEffect(() => {
    if (!ativo || avisoAberto) return;

    reiniciarTimerInatividade();
    const aoInteragir = () => reiniciarTimerInatividade();

    for (const evento of EVENTOS_INTERACAO) {
      window.addEventListener(evento, aoInteragir, { passive: true });
    }

    return () => {
      if (timerInatividade.current !== null) {
        window.clearTimeout(timerInatividade.current);
      }
      for (const evento of EVENTOS_INTERACAO) {
        window.removeEventListener(evento, aoInteragir);
      }
    };
  }, [ativo, avisoAberto, reiniciarTimerInatividade]);

  // Contagem regressiva do aviso
  useEffect(() => {
    if (!avisoAberto) return;

    const intervalo = window.setInterval(() => {
      setSegundosRestantes((atual) => atual - 1);
    }, 1000);

    return () => window.clearInterval(intervalo);
  }, [avisoAberto]);

  useEffect(() => {
    if (avisoAberto && segundosRestantes <= 0) {
      encerrarSessao();
    }
  }, [avisoAberto, segundosRestantes, encerrarSessao]);

  if (!ativo) return null;

  return (
    <AnimatePresence>
      {avisoAberto && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onPointerDown={continuarSessao}
          className="fixed inset-0 z-100 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.95 }}
            transition={{ type: "spring", damping: 22, stiffness: 260 }}
            className="w-full max-w-md bg-white dark:bg-[#181a1b] rounded-[2rem] p-8 shadow-2xl border border-gray-200 dark:border-[#2a2c30] text-center"
          >
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#ff5722]/10">
              <Hand size={32} className="text-[#ff5722]" />
            </div>

            <h2 className="text-2xl font-black text-gray-950 dark:text-white mb-2">
              Ainda está aí?
            </h2>

            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              Sem resposta, o pedido será limpo e a tela voltará ao início em{" "}
              <span className="font-black text-[#ff5722] text-base">
                {Math.max(segundosRestantes, 0)}s
              </span>
              .
            </p>

            <button
              type="button"
              onClick={continuarSessao}
              className="w-full bg-[#ff5722] hover:bg-[#e64a19] text-white font-bold py-4 px-6 rounded-2xl active:scale-[0.98] transition-all shadow-lg shadow-[#ff5722]/25"
            >
              Sim, continuar pedido
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
