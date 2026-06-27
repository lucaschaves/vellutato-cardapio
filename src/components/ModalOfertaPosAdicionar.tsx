import { AnimatePresence, motion } from "framer-motion";
import { Gift, Sparkles, X } from "lucide-react";
import { produtoEstaEsgotado } from "../lib/estoque";
import {
  calcularPrecoComDescontoVendaCruzada,
  type OfertaVendaCruzada,
} from "../lib/vendasCruzadas";

interface ModalOfertaPosAdicionarProps {
  aberto: boolean;
  ofertas: OfertaVendaCruzada[];
  aoAdicionar: (oferta: OfertaVendaCruzada) => void;
  aoFechar: () => void;
}

export function ModalOfertaPosAdicionar({
  aberto,
  ofertas,
  aoAdicionar,
  aoFechar,
}: ModalOfertaPosAdicionarProps) {
  const ofertasDisponiveis = ofertas.filter(
    (o) => !produtoEstaEsgotado(o.produto_alvo),
  );

  return (
    <AnimatePresence>
      {aberto && ofertasDisponiveis.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4"
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            className="w-full max-w-md bg-white dark:bg-[#181a1b] rounded-2xl shadow-2xl border border-gray-200 dark:border-[#2a2c30] overflow-hidden"
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-[#2a2c30]">
              <div className="flex items-center gap-2">
                <Sparkles size={20} className="text-[#ff5722]" />
                <h2 className="font-bold text-gray-900 dark:text-white">
                  Aproveite também
                </h2>
              </div>
              <button
                type="button"
                onClick={aoFechar}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-[#2a2c30] text-gray-500"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
              {ofertasDisponiveis.map((oferta) => {
                const alvo = oferta.produto_alvo;
                const precoBase =
                  alvo.em_promocao && alvo.preco_promocional
                    ? alvo.preco_promocional
                    : alvo.preco;
                const precoOferta = calcularPrecoComDescontoVendaCruzada(
                  precoBase,
                  oferta.tipo,
                  oferta.valor_desconto,
                );

                return (
                  <div
                    key={oferta.id}
                    className="flex gap-3 p-3 rounded-xl bg-[#ff5722]/5 border border-[#ff5722]/20"
                  >
                    <div className="w-14 h-14 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                      <img
                        src={alvo.imagem_url || "/placeholder.jpg"}
                        alt={alvo.nome}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-gray-900 dark:text-white truncate">
                        {alvo.nome}
                      </p>
                      <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">
                        {oferta.mensagem_oferta ||
                          "Combina com o que você escolheu!"}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        {oferta.tipo === "brinde" ? (
                          <span className="inline-flex items-center gap-1 text-xs font-black text-green-600 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
                            <Gift size={12} /> Brinde
                          </span>
                        ) : (
                          <span className="text-sm font-black text-[#ff5722]">
                            R$ {precoOferta.toFixed(2)}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => aoAdicionar(oferta)}
                          className="ml-auto text-xs font-bold bg-[#ff5722] text-white px-3 py-1.5 rounded-lg active:scale-95"
                        >
                          Adicionar
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-4 border-t border-gray-100 dark:border-[#2a2c30]">
              <button
                type="button"
                onClick={aoFechar}
                className="w-full py-3 text-sm font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#2a2c30] rounded-xl transition-colors"
              >
                Continuar sem adicionar
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
