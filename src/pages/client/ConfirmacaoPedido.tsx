import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, ChefHat } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { urlCardapio } from "../../lib/urlCardapio";

const TEMPO_REDIRECIONAMENTO_SEG = 10;

export function ConfirmacaoPedido() {
  const navigate = useNavigate();
  const location = useLocation();
  const mesa = new URLSearchParams(location.search).get("mesa");
  const nomeCliente =
    (location.state as { nomeCliente?: string } | null)?.nomeCliente?.trim() ||
    "";

  const [segundosRestantes, setSegundosRestantes] = useState(
    TEMPO_REDIRECIONAMENTO_SEG,
  );
  const redirecionouRef = useRef(false);

  const irParaTelaInicial = useCallback(() => {
    if (redirecionouRef.current) return;
    redirecionouRef.current = true;

    if (!mesa) {
      localStorage.removeItem("cliente_nome");
      localStorage.removeItem("cliente_celular");
      localStorage.removeItem("tipo_consumo");
      navigate("/", { replace: true });
      return;
    }

    navigate(urlCardapio("", location.search), { replace: true });
  }, [location.search, mesa, navigate]);

  const voltarAoCardapio = () => {
    if (redirecionouRef.current) return;
    redirecionouRef.current = true;
    navigate(urlCardapio("", location.search), { replace: true });
  };

  useEffect(() => {
    const intervalo = window.setInterval(() => {
      setSegundosRestantes((atual) => {
        if (atual <= 1) {
          window.clearInterval(intervalo);
          return 0;
        }
        return atual - 1;
      });
    }, 1000);

    return () => window.clearInterval(intervalo);
  }, []);

  useEffect(() => {
    if (segundosRestantes === 0) {
      irParaTelaInicial();
    }
  }, [segundosRestantes, irParaTelaInicial]);

  const progresso =
    ((TEMPO_REDIRECIONAMENTO_SEG - segundosRestantes) /
      TEMPO_REDIRECIONAMENTO_SEG) *
    100;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-100/95 dark:bg-[#121212]/95 backdrop-blur-md p-6"
    >
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", damping: 22, stiffness: 260 }}
        className="w-full max-w-md bg-white dark:bg-[#181a1b] rounded-[2rem] p-8 md:p-10 shadow-2xl border border-gray-200 dark:border-[#2a2c30] text-center"
      >
        <div className="relative mx-auto mb-6 flex h-24 w-24 items-center justify-center">
          <svg
            className="absolute inset-0 h-24 w-24 -rotate-90"
            viewBox="0 0 100 100"
            aria-hidden
          >
            <circle
              cx="50"
              cy="50"
              r="44"
              fill="none"
              stroke="currentColor"
              strokeWidth="6"
              className="text-gray-200 dark:text-[#2a2c30]"
            />
            <circle
              cx="50"
              cy="50"
              r="44"
              fill="none"
              stroke="currentColor"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 44}`}
              strokeDashoffset={`${2 * Math.PI * 44 * (1 - progresso / 100)}`}
              className="text-[#ff5722] transition-[stroke-dashoffset] duration-1000 linear"
            />
          </svg>

          <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
            <CheckCircle2
              size={36}
              className="text-green-600 dark:text-green-400"
              strokeWidth={2.5}
            />
          </div>
        </div>

        <h1 className="text-2xl md:text-3xl font-black text-gray-950 dark:text-white mb-2">
          Pedido enviado!
        </h1>

        {nomeCliente && (
          <p className="text-base font-semibold text-[#ff5722] mb-3">
            Obrigado, {nomeCliente}!
          </p>
        )}

        <div className="flex items-center justify-center gap-2 text-gray-600 dark:text-gray-300 mb-4">
          <ChefHat size={18} className="text-[#ff5722] shrink-0" />
          <p className="text-sm md:text-base leading-relaxed">
            Já vamos preparar. Se quiser, veja outros produtos no cardápio.
          </p>
        </div>

        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-6">
          {mesa
            ? `Voltando ao cardápio em ${segundosRestantes}s…`
            : `Voltando à tela inicial em ${segundosRestantes}s…`}
        </p>

        <button
          type="button"
          onClick={voltarAoCardapio}
          className="w-full bg-[#ff5722] hover:bg-[#e64a19] text-white font-bold py-4 px-6 rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-lg shadow-[#ff5722]/25"
        >
          <span>Ver cardápio</span>
          <ArrowRight size={20} />
        </button>
      </motion.div>
    </motion.div>
  );
}
