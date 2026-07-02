import { AnimatePresence, motion } from "framer-motion";
import { Minus, Plus, ShoppingBag, Sparkles, Tag, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, memo } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";
import { ModalOfertaPosAdicionar } from "../../components/ModalOfertaPosAdicionar";
import {
  obterQuantidadeMaxima,
  produtoEstaEsgotado,
} from "../../lib/estoque";
import {
  buscarOfertasVendaCruzada,
  calcularPrecoComDescontoVendaCruzada,
  type OfertaVendaCruzada,
} from "../../lib/vendasCruzadas";
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
  controlar_estoque?: boolean;
  quantidade_estoque?: number;
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
  const itensCarrinho = useCartStore((state) => state.itens);

  const [produto, setProduto] = useState<ProdutoDetalhe | null>(null);
  const [adicionaisDisponiveis, setAdicionaisDisponiveis] = useState<
    Adicional[]
  >([]);
  const [adicionaisSelecionados, setAdicionaisSelecionados] = useState<
    Adicional[]
  >([]);
  const [quantidade, setQuantidade] = useState(1);
  const [carregando, setCarregando] = useState(true);
  const [ofertasCruzadas, setOfertasCruzadas] = useState<OfertaVendaCruzada[]>(
    [],
  );
  const [modalPosAdicionarAberto, setModalPosAdicionarAberto] = useState(false);

  const idsProdutosNoCarrinho = useMemo(
    () => new Set(itensCarrinho.map((item) => item.produtoId)),
    [itensCarrinho],
  );

  const ofertasPendentes = useMemo(
    () =>
      ofertasCruzadas.filter(
        (o) =>
          !produtoEstaEsgotado(o.produto_alvo) &&
          !idsProdutosNoCarrinho.has(o.produto_alvo.id),
      ),
    [ofertasCruzadas, idsProdutosNoCarrinho],
  );

  useEffect(() => {
    async function carregarDetalhes() {
      try {
        if (!id) return;
        setCarregando(true);
        setOfertasCruzadas([]);
        setAdicionaisDisponiveis([]);
        setAdicionaisSelecionados([]);

        const { data: prod, error: errProd } = await supabase
          .from("produtos")
          .select("*")
          .eq("id", id)
          .single();

        if (errProd) throw errProd;
        setProduto(prod);

        const { data: vinculos, error: errAdc } = await supabase
          .from("produto_adicionais")
          .select(
            `
            adicionais (
              id, nome, preco, disponivel
            )
          `,
          )
          .eq("produto_id", id);

        if (errAdc) throw errAdc;

        const adicionaisDoProduto = (vinculos || [])
          .flatMap((vinculo) => {
            const raw = vinculo.adicionais as Adicional | Adicional[] | null;
            if (!raw) return [];
            return Array.isArray(raw) ? raw : [raw];
          })
          .filter((adicional) => adicional.disponivel)
          .sort((a, b) => a.nome.localeCompare(b.nome));

        setAdicionaisDisponiveis(adicionaisDoProduto);

        try {
          const ofertas = await buscarOfertasVendaCruzada(id);
          setOfertasCruzadas(ofertas);
        } catch (erroOferta: unknown) {
          console.warn("[VENDA CRUZADA] Falha ao carregar ofertas:", erroOferta);
        }
      } catch (erro: unknown) {
        const mensagem = erro instanceof Error ? erro.message : String(erro);
        console.error("[ERRO DO SISTEMA - DETALHES DO PRODUTO]", mensagem);
        toast.error("Não foi possível carregar as informações deste item.");
        navigate(urlCardapio("", location.search));
      } finally {
        setCarregando(false);
      }
    }
    carregarDetalhes();
  }, [id, location.search, navigate]);

  const fechar = () => navigate(urlCardapio("", location.search));

  useEffect(() => {
    if (modalPosAdicionarAberto && ofertasPendentes.length === 0) {
      setModalPosAdicionarAberto(false);
      fechar();
    }
  }, [modalPosAdicionarAberto, ofertasPendentes.length, location.search, navigate]);

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

  const esgotado = produto ? produtoEstaEsgotado(produto) : false;
  const quantidadeMaxima = produto ? obterQuantidadeMaxima(produto) : null;

  const confirmarPedido = () => {
    if (!produto) return;
    if (esgotado) {
      toast.error("Este produto está esgotado no momento.");
      return;
    }
    adicionarAoCarrinho({
      produtoId: produto.id,
      nome: produto.nome,
      precoBase: precoAtivo,
      originalPrice: produto.preco,
      quantidade,
      imagem: produto.imagem_url,
      adicionais: adicionaisSelecionados,
    });
    toast.success("Produto adicionado ao seu pedido!");

    const idsNoCarrinho = new Set(
      useCartStore.getState().itens.map((item) => item.produtoId),
    );
    const ofertasPosAdd = ofertasCruzadas.filter(
      (o) =>
        !produtoEstaEsgotado(o.produto_alvo) &&
        !idsNoCarrinho.has(o.produto_alvo.id),
    );

    if (ofertasPosAdd.length > 0) {
      setModalPosAdicionarAberto(true);
    } else {
      fechar();
    }
  };

  const adicionarOfertaCruzada = (oferta: OfertaVendaCruzada) => {
    const alvo = oferta.produto_alvo;
    if (produtoEstaEsgotado(alvo)) {
      toast.error(`${alvo.nome} está esgotado no momento.`);
      return;
    }
    const precoCheio =
      alvo.em_promocao && alvo.preco_promocional
        ? alvo.preco_promocional
        : alvo.preco;
    const precoComDesconto = calcularPrecoComDescontoVendaCruzada(
      precoCheio,
      oferta.tipo,
      oferta.valor_desconto,
    );
    const ehBrinde = oferta.tipo === "brinde";

    adicionarAoCarrinho({
      produtoId: alvo.id,
      nome: alvo.nome,
      precoBase: precoComDesconto,
      originalPrice: alvo.preco,
      quantidade: 1,
      imagem: alvo.imagem_url || undefined,
      adicionais: [],
      ehBrinde,
    });
    toast.success(
      ehBrinde
        ? `${alvo.nome} adicionado como brinde!`
        : `${alvo.nome} adicionado com oferta especial!`,
    );
  };

  const fecharModalPosAdicionar = () => {
    setModalPosAdicionarAberto(false);
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

            {esgotado && (
              <div className="mb-6 p-4 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300 text-sm font-semibold">
                Produto esgotado no momento. Não é possível adicionar ao pedido.
              </div>
            )}

            {ofertasPendentes.length > 0 && (
              <div className="mb-8 space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles size={16} className="text-[#ff5722]" />
                  <h2 className="text-sm font-bold text-gray-500 dark:text-gray-300 uppercase tracking-widest">
                    Aproveite também
                  </h2>
                </div>
                {ofertasPendentes.map((oferta) => {
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
                      className="flex gap-3 p-3 rounded-2xl bg-[#ff5722]/5 border border-[#ff5722]/20"
                    >
                      <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-100 shrink-0">
                        <img
                          src={alvo.imagem_url || "/placeholder.jpg"}
                          alt={alvo.nome}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 dark:text-white truncate">
                          {alvo.nome}
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 line-clamp-2">
                          {oferta.mensagem_oferta ||
                            "Combina perfeito com seu pedido!"}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          {oferta.tipo === "brinde" ? (
                            <>
                              <span className="font-black text-green-600 dark:text-green-400 text-sm">
                                Brinde grátis
                              </span>
                              <span className="text-xs text-gray-400 line-through">
                                R$ {precoBase.toFixed(2)}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="font-black text-[#ff5722] text-sm">
                                R$ {precoOferta.toFixed(2)}
                              </span>
                              {precoOferta < precoBase && (
                                <span className="text-xs text-gray-400 line-through">
                                  R$ {precoBase.toFixed(2)}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => adicionarOfertaCruzada(oferta)}
                        className="self-center shrink-0 px-3 py-2 rounded-xl bg-[#ff5722] text-white text-xs font-bold active:scale-95"
                      >
                        + Add
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

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
                  onClick={() =>
                    setQuantidade((q) => {
                      const proxima = q + 1;
                      if (
                        quantidadeMaxima != null &&
                        proxima > quantidadeMaxima
                      ) {
                        toast.error(
                          quantidadeMaxima === 0
                            ? "Produto esgotado."
                            : `Máximo disponível: ${quantidadeMaxima}`,
                        );
                        return q;
                      }
                      return proxima;
                    })
                  }
                  disabled={esgotado}
                  className="p-2.5 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white active:scale-95 bg-white dark:bg-[#181a1b] rounded-xl shadow-sm dark:shadow-none transition-colors disabled:opacity-40"
                >
                  <Plus size={18} />
                </button>
              </div>

              <button
                onClick={confirmarPedido}
                disabled={esgotado}
                className="flex-1 bg-[#ff5722] hover:bg-[#e64a19] disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-bold py-4 px-5 md:px-6 rounded-2xl flex items-center justify-between active:scale-[0.98] transition-all shadow-lg shadow-[#ff5722]/20"
              >
                <span className="flex items-center gap-2 text-sm md:text-base">
                  <ShoppingBag size={20} />{" "}
                  <span className="hidden md:inline">
                    {esgotado ? "Esgotado" : "Adicionar"}
                  </span>
                </span>
                <span className="text-lg md:text-xl tracking-tight">
                  R$ {valorTotal.toFixed(2)}
                </span>
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      <ModalOfertaPosAdicionar
        aberto={modalPosAdicionarAberto}
        ofertas={ofertasPendentes}
        aoAdicionar={adicionarOfertaCruzada}
        aoFechar={fecharModalPosAdicionar}
      />
    </AnimatePresence>
  );
}
