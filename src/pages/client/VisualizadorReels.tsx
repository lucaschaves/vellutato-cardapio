import { AnimatePresence, motion } from "framer-motion";
import { Minus, Plus, ShoppingBag, Tag, X } from "lucide-react";
import { useEffect, useRef, useState, memo } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";
import { urlCardapio } from "../../lib/urlCardapio";
import { useCartStore } from "../../store/useCartStore";

interface ProdutoDetalhe {
  id: string;
  nome: string;
  descricao: string;
  preco: number;
  preco_promocional?: number;
  em_promocao: boolean;
  imagem_url: string;
  video_url?: string;
  ativo: boolean;
}

interface Adicional {
  id: string;
  nome: string;
  preco: number;
  disponivel: boolean;
}

function MidiaProduto({
  imagemUrl,
  videoUrl,
  nome,
}: {
  imagemUrl: string;
  videoUrl?: string;
  nome: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [imagemCarregada, setImagemCarregada] = useState(false);
  const [videoPronto, setVideoPronto] = useState(false);
  const [erroVideo, setErroVideo] = useState(false);

  const mostrarVideo = Boolean(videoUrl && videoPronto && !erroVideo);

  useEffect(() => {
    if (!mostrarVideo || !videoRef.current) return;

    void videoRef.current.play().catch(() => setErroVideo(true));
  }, [mostrarVideo]);

  return (
    <div className="relative w-full h-full">
      {!imagemCarregada && (
        <div
          className="absolute inset-0 bg-gray-300 dark:bg-gray-800 animate-pulse"
          aria-hidden
        />
      )}

      <img
        src={imagemUrl || "/placeholder.jpg"}
        alt={nome}
        onLoad={() => setImagemCarregada(true)}
        onError={() => setImagemCarregada(true)}
        className={`w-full h-full object-cover transition-opacity duration-500 ${
          mostrarVideo
            ? "opacity-0"
            : imagemCarregada
              ? "opacity-100"
              : "opacity-0"
        }`}
      />

      {videoUrl && (
        <video
          ref={videoRef}
          src={videoUrl}
          loop
          muted
          playsInline
          preload="auto"
          onCanPlayThrough={() => setVideoPronto(true)}
          onError={() => setErroVideo(true)}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${
            mostrarVideo ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
    </div>
  );
}

const MidiaProdutoMemo = memo(MidiaProduto);

const ColunaMidiaProduto = memo(function ColunaMidiaProduto({
  produto,
}: {
  produto: ProdutoDetalhe;
}) {
  const [transicaoEntradaConcluida, setTransicaoEntradaConcluida] =
    useState(false);

  useEffect(() => {
    const fallback = window.setTimeout(
      () => setTransicaoEntradaConcluida(true),
      900,
    );

    return () => window.clearTimeout(fallback);
  }, []);

  const classesMidia =
    "w-full h-full md:rounded-[2rem] md:border border-gray-200 dark:border-[#2a2c30] overflow-hidden relative md:shadow-2xl bg-gray-200 dark:bg-black";

  const conteudo = (
    <>
      {produto.em_promocao && (
        <div className="absolute top-4 right-4 z-20 bg-red-600 text-white text-xs font-black uppercase tracking-wider px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-lg">
          <Tag size={12} strokeWidth={3} />
          Promoção
        </div>
      )}

      <MidiaProdutoMemo
        imagemUrl={produto.imagem_url}
        videoUrl={produto.video_url}
        nome={produto.nome}
      />

      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-gray-50 dark:from-[#181a1b] to-transparent md:hidden pointer-events-none" />
    </>
  );

  return (
    <div className="relative w-full h-[45vh] md:h-full md:w-1/2 md:p-8 lg:p-12 bg-gray-200 md:bg-gray-100 dark:bg-black dark:md:bg-[#121415] shrink-0 flex items-center justify-center">
      {transicaoEntradaConcluida ? (
        <div className={classesMidia}>{conteudo}</div>
      ) : (
        <motion.div
          layoutId={`produto-midia-${produto.id}`}
          onLayoutAnimationComplete={() => setTransicaoEntradaConcluida(true)}
          className={classesMidia}
        >
          {conteudo}
        </motion.div>
      )}
    </div>
  );
});

export function VisualizadorReels() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const adicionarAoCarrinho = useCartStore((state) => state.adicionarItem);

  const [produto, setProduto] = useState<ProdutoDetalhe | null>(null);
  const [adicionaisDisponiveis, setAdicionaisDisponiveis] = useState<
    Adicional[]
  >([]);
  const [adicionaisSelecionados, setAdicionaisSelecionados] = useState<
    Adicional[]
  >([]);
  const [quantidade, setQuantidade] = useState(1);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    async function carregarDetalhes() {
      try {
        if (!id) return;
        setCarregando(true);

        const { data: prod, error: errProd } = await supabase
          .from("produtos")
          .select("*")
          .eq("id", id)
          .single();

        if (errProd) throw errProd;
        setProduto(prod);

        const { data: adcs, error: errAdc } = await supabase
          .from("adicionais")
          .select("*")
          .eq("disponivel", true);

        if (errAdc) throw errAdc;
        if (adcs) setAdicionaisDisponiveis(adcs);
      } catch (erro: any) {
        console.error(
          "[ERRO DO SISTEMA - DETALHES DO PRODUTO]",
          erro.message || erro,
        );
        toast.error("Não foi possível carregar as informações deste item.");
        navigate(urlCardapio("", location.search));
        // fechar();
      } finally {
        setCarregando(false);
      }
    }
    carregarDetalhes();
  }, [id]);

  const fechar = () => navigate(urlCardapio("", location.search));

  const alternarAdicional = (adc: Adicional) => {
    setAdicionaisSelecionados((prev) =>
      prev.some((item) => item.id === adc.id)
        ? prev.filter((item) => item.id !== adc.id)
        : [...prev, adc],
    );
  };

  const precoAtivo = produto
    ? produto.em_promocao &&
      produto.preco_promocional &&
      produto.preco_promocional > 0
      ? produto.preco_promocional
      : produto.preco
    : 0;

  const valorTotal =
    (precoAtivo +
      adicionaisSelecionados.reduce((acc, curr) => acc + curr.preco, 0)) *
    quantidade;

  const confirmarPedido = () => {
    if (!produto) return;
    adicionarAoCarrinho({
      produtoId: produto.id,
      nome: produto.nome,
      precoBase: precoAtivo, // O valor final (promocional ou não)
      originalPrice: produto.preco, // O valor cheio (para exibir no carrinho)
      quantidade,
      imagem: produto.imagem_url,
      adicionais: adicionaisSelecionados,
    });
    toast.success("Produto adicionado ao seu pedido!");
    fechar();
  };

  if (carregando || !produto) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 50 }}
        className="fixed inset-0 z-50 bg-gray-50 dark:bg-[#181a1b] flex flex-col md:flex-row overflow-hidden transition-colors duration-300"
      >
        <button
          onClick={fechar}
          aria-label="Fechar detalhes do produto"
          className="absolute top-4 left-4 md:top-8 md:left-8 z-50 flex items-center gap-2 bg-gray-900/90 dark:bg-white/95 backdrop-blur-md text-white dark:text-gray-900 font-bold text-sm pl-3 pr-4 py-3 rounded-full shadow-xl shadow-black/30 ring-2 ring-white/25 dark:ring-black/10 hover:bg-gray-900 dark:hover:bg-white hover:scale-105 active:scale-95 transition-all"
        >
          <X size={22} strokeWidth={2.5} />
          <span className="hidden sm:inline tracking-wide">Fechar</span>
        </button>

        <ColunaMidiaProduto key={produto.id} produto={produto} />

        {/* LADO DIREITO (Detalhes) */}
        <div className="relative w-full h-[55vh] md:h-full md:w-1/2 flex flex-col bg-gray-50 dark:bg-[#181a1b] -mt-8 md:mt-0 rounded-t-[2.5rem] md:rounded-none z-10 transition-colors duration-300">
          <div className="flex-1 overflow-y-auto px-6 pt-10 pb-32 hide-scrollbar">
            <div className="mb-4">
              <h1 className="text-2xl md:text-4xl font-bold text-gray-900 dark:text-white mb-2 leading-tight transition-colors">
                {produto.nome}
              </h1>

              <div className="flex items-end gap-3">
                <span className="text-3xl font-black text-[#ff5722]">
                  R$ {precoAtivo.toFixed(2)}
                </span>
                {produto.em_promocao && (
                  <span className="text-lg font-medium text-gray-500 dark:text-gray-500 line-through mb-1">
                    R$ {produto.preco.toFixed(2)}
                  </span>
                )}
              </div>
            </div>

            <p className="text-gray-600 dark:text-gray-400 text-sm md:text-base leading-relaxed mb-8 transition-colors">
              {produto.descricao}
            </p>

            {adicionaisDisponiveis.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="text-sm font-bold text-gray-500 dark:text-gray-300 uppercase tracking-widest transition-colors">
                    Turbine o seu pedido
                  </h2>
                  <div className="h-[1px] flex-1 bg-gray-200 dark:bg-[#2a2c30] transition-colors"></div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {adicionaisDisponiveis.map((adc) => {
                    const selecionado = adicionaisSelecionados.some(
                      (item) => item.id === adc.id,
                    );
                    return (
                      <button
                        key={adc.id}
                        onClick={() => alternarAdicional(adc)}
                        className={`flex justify-between items-center p-4 rounded-2xl border-2 transition-all active:scale-[0.98] ${
                          selecionado
                            ? "bg-[#ff5722]/10 border-[#ff5722] text-gray-900 dark:text-white"
                            : "bg-white dark:bg-[#242629] border-transparent text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#2a2c30] shadow-sm dark:shadow-none"
                        }`}
                      >
                        <span className="font-semibold">{adc.nome}</span>
                        <span
                          className={`text-sm font-bold ${selecionado ? "text-[#ff5722]" : "text-gray-500 dark:text-gray-400"}`}
                        >
                          + R$ {adc.preco.toFixed(2)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Rodapé Fixo */}
          <div className="absolute bottom-0 left-0 right-0 bg-white/90 dark:bg-[#1a1c1e]/90 backdrop-blur-xl border-t border-gray-200 dark:border-[#2a2c30] p-4 px-6 pb-6 transition-colors duration-300">
            <div className="flex items-center gap-3 md:gap-4">
              <div className="flex items-center bg-gray-50 dark:bg-[#242629] rounded-2xl p-2 gap-3 md:gap-4 border border-gray-200 dark:border-[#323438] transition-colors">
                <button
                  onClick={() => setQuantidade((q) => Math.max(1, q - 1))}
                  className="p-2.5 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white active:scale-95 bg-white dark:bg-[#181a1b] rounded-xl shadow-sm dark:shadow-none transition-colors"
                >
                  <Minus size={18} />
                </button>
                <span className="font-bold text-gray-900 dark:text-white text-lg w-4 text-center transition-colors">
                  {quantidade}
                </span>
                <button
                  onClick={() => setQuantidade((q) => q + 1)}
                  className="p-2.5 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white active:scale-95 bg-white dark:bg-[#181a1b] rounded-xl shadow-sm dark:shadow-none transition-colors"
                >
                  <Plus size={18} />
                </button>
              </div>

              <button
                onClick={confirmarPedido}
                className="flex-1 bg-[#ff5722] hover:bg-[#e64a19] text-white font-bold py-4 px-5 md:px-6 rounded-2xl flex items-center justify-between active:scale-[0.98] transition-all shadow-lg shadow-[#ff5722]/20"
              >
                <span className="flex items-center gap-2 text-sm md:text-base">
                  <ShoppingBag size={20} />{" "}
                  <span className="hidden md:inline">Adicionar</span>
                </span>
                <span className="text-lg md:text-xl tracking-tight">
                  R$ {valorTotal.toFixed(2)}
                </span>
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
