import { AnimatePresence, motion } from "framer-motion";

interface ModalConfirmacaoProps {
  aberto: boolean;
  titulo: string;
  mensagem: string;
  textoConfirmar?: string;
  textoCancelar?: string;
  aoConfirmar: () => void;
  aoCancelar: () => void;
  carregando?: boolean;
}

export function ModalConfirmacao({
  aberto,
  titulo,
  mensagem,
  textoConfirmar = "Confirmar",
  textoCancelar = "Cancelar",
  aoConfirmar,
  aoCancelar,
  carregando = false,
}: ModalConfirmacaoProps) {
  return (
    <AnimatePresence>
      {aberto && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={aoCancelar}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 12 }}
            transition={{ type: "spring", damping: 26, stiffness: 320 }}
            className="w-full max-w-sm bg-white dark:bg-[#242629] rounded-[2rem] p-6 shadow-2xl border border-gray-200 dark:border-[#323438]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-confirmacao-titulo"
            aria-describedby="modal-confirmacao-mensagem"
          >
            <h2
              id="modal-confirmacao-titulo"
              className="text-xl font-bold text-gray-900 dark:text-white mb-2"
            >
              {titulo}
            </h2>
            <p
              id="modal-confirmacao-mensagem"
              className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-6"
            >
              {mensagem}
            </p>

            <div className="flex flex-col-reverse sm:flex-row gap-3">
              <button
                type="button"
                onClick={aoCancelar}
                disabled={carregando}
                className="flex-1 py-3.5 px-4 rounded-2xl font-bold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-[#181a1b] hover:bg-gray-200 dark:hover:bg-[#2a2c30] active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {textoCancelar}
              </button>
              <button
                type="button"
                onClick={aoConfirmar}
                disabled={carregando}
                className="flex-1 py-3.5 px-4 rounded-2xl font-bold text-white bg-[#ff5722] hover:bg-[#e64a19] active:scale-[0.98] transition-all shadow-lg shadow-[#ff5722]/20 disabled:opacity-50"
              >
                {textoConfirmar}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
