import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ClipboardList,
  Home,
  Maximize,
  Minimize,
  Moon,
  Plus,
  Settings,
  ShoppingBag,
  Sun,
  Tag,
  Type,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { CarrinhoLateral } from "../../components/CarrinhoLateral";
import { ModalConfirmacao } from "../../components/ModalConfirmacao";
import { useTelaCheia } from "../../hooks/useTelaCheia";
import { obterQuantidadeErros } from "../../lib/errorLogger";
import { produtoEstaEsgotado } from "../../lib/estoque";
import {
  lerEscalaFonte,
  lerTemaEscuro,
  salvarEscalaFonte,
  salvarTemaEscuro,
  type EscalaFonte,
} from "../../lib/preferenciasExibicao";
import { supabase } from "../../lib/supabase";
import { urlCardapio, urlItemProduto } from "../../lib/urlCardapio";
import { useCartStore } from "../../store/useCartStore";

interface Categoria {
  id: string;
  nome: string;
  icone?: string | null;
  quantidade_produtos?: number;
}

interface Produto {
  id: string;
  nome: string;
  descricao?: string;
  imagem_url: string;
  categoria_id: string;
  ativo: boolean;
  em_promocao: boolean;
  controlar_estoque?: boolean;
  quantidade_estoque?: number;
}

function ImagemProdutoCard({ src, alt }: { src: string; alt: string }) {
  const [carregada, setCarregada] = useState(false);

  return (
    <>
      {!carregada && (
        <div
          className="absolute inset-0 bg-gray-300 dark:bg-gray-700 animate-pulse"
          aria-hidden
        />
      )}

      <img
        src={src || "/placeholder.jpg"}
        alt={alt}
        loading="lazy"
        onLoad={() => setCarregada(true)}
        onError={() => setCarregada(true)}
        className={`object-cover w-full h-full group-hover:scale-105 transition-all duration-500 ${
          carregada ? "opacity-100" : "opacity-0"
        }`}
      />
    </>
  );
}

function SkeletonCategorias() {
  return (
    <div className="flex gap-2 px-4 pb-1 overflow-hidden">
      {Array.from({ length: 5 }).map((_, indice) => (
        <div
          key={indice}
          className="h-9 w-24 rounded-full bg-gray-200 dark:bg-[#2a2c30] animate-pulse shrink-0"
        />
      ))}
    </div>
  );
}

function SkeletonGridProdutos() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {Array.from({ length: 10 }).map((_, indice) => (
        <div
          key={indice}
          className="bg-white dark:bg-[#242629] border border-gray-200 dark:border-[#3a3c40] rounded-[1.5rem] p-3"
        >
          <div className="aspect-square rounded-[1rem] bg-gray-300 dark:bg-gray-700 animate-pulse mb-3" />
          <div className="h-4 bg-gray-300 dark:bg-gray-700 animate-pulse rounded mb-2 mx-1" />
          <div className="h-3 bg-gray-200 dark:bg-gray-800 animate-pulse rounded w-2/3 mx-1" />
        </div>
      ))}
    </div>
  );
}

export function FeedProdutos() {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [categoriaAtiva, setCategoriaAtiva] = useState<string>("all");
  const [carregando, setCarregando] = useState(true);

  const [carrinhoAberto, setCarrinhoAberto] = useState(false);
  const [modalOpcoesAberto, setModalOpcoesAberto] = useState(false);
  const [modalVoltarHomeAberto, setModalVoltarHomeAberto] = useState(false);

  const { telaCheia, alternarTelaCheia } = useTelaCheia();
  const [temaEscuro, setTemaEscuro] = useState(() => lerTemaEscuro());
  const [escalaFonte, setEscalaFonte] = useState<EscalaFonte>(() =>
    lerEscalaFonte(),
  );

  const navigate = useNavigate();
  const location = useLocation();
  const mesaParam = new URLSearchParams(location.search).get("mesa");
  const quantidadeTotalCarrinho = useCartStore((state) =>
    state.obterQuantidadeTotal(),
  );
  const limparCarrinho = useCartStore((state) => state.limparCarrinho);
  const [quantidadeErros, setQuantidadeErros] = useState(() =>
    obterQuantidadeErros(),
  );

  useEffect(() => {
    salvarTemaEscuro(temaEscuro);
  }, [temaEscuro]);

  useEffect(() => {
    salvarEscalaFonte(escalaFonte);
  }, [escalaFonte]);

  useEffect(() => {
    if (modalOpcoesAberto) {
      setQuantidadeErros(obterQuantidadeErros());
    }
  }, [modalOpcoesAberto]);

  useEffect(() => {
    async function carregarCardapio() {
      try {
        setCarregando(true);

        const { data: dataCat, error: errCat } = await supabase
          .from("categorias")
          .select("*")
          .order("ordem");
        if (errCat) throw new Error(errCat.message);

        const { data: dataProd, error: errProd } = await supabase
          .from("produtos")
          .select("*")
          .eq("ativo", true);
        if (errProd) throw new Error(errProd.message);

        const produtosDoBanco = (dataProd || []).filter(
          (p) => !produtoEstaEsgotado(p),
        );

        const categoriasComItens = (dataCat || [])
          .map((cat) => ({
            ...cat,
            quantidade_produtos: produtosDoBanco.filter(
              (p) => p.categoria_id === cat.id,
            ).length,
          }))
          .filter((cat) => cat.quantidade_produtos > 0);

        setProdutos(produtosDoBanco);
        setCategorias(categoriasComItens);
      } catch (erro: any) {
        console.error(
          "[ERRO DO SISTEMA - CARREGAMENTO DE PRODUTOS]",
          erro.message || erro,
        );
      } finally {
        setCarregando(false);
      }
    }
    carregarCardapio();
  }, []);

  const confirmarVoltarHome = () => {
    limparCarrinho();
    localStorage.removeItem("cliente_nome");
    localStorage.removeItem("cliente_celular");
    localStorage.removeItem("tipo_consumo");
    setCarrinhoAberto(false);
    setModalVoltarHomeAberto(false);
    navigate("/");
  };

  const renderCardProduto = (produto: Produto) => {
    const esgotado = produtoEstaEsgotado(produto);

    return (
    <motion.article
      key={produto.id}
      onClick={() => navigate(urlItemProduto(produto.id, location.search))}
      className={`bg-white dark:bg-[#242629] border border-gray-200 dark:border-[#3a3c40] shadow-sm rounded-[1.5rem] p-3 flex flex-col h-full cursor-pointer active:scale-[0.98] transition-all group ${esgotado ? "opacity-75" : ""}`}
    >
      <motion.div
        layoutId={`produto-midia-${produto.id}`}
        className="w-full aspect-square mb-3 mt-1 rounded-[1rem] overflow-hidden bg-gray-100 dark:bg-[#181a1b] relative"
      >
        {produto.em_promocao && !esgotado && (
          <div className="absolute top-2 left-2 z-20 bg-[#ff5722] text-white text-[0.6875rem] font-black uppercase tracking-wider px-2.5 py-1 rounded-md flex items-center gap-1 shadow-md">
            <Tag size={10} strokeWidth={3} />
            PROMO
          </div>
        )}

        {esgotado && (
          <div className="absolute inset-0 z-30 bg-black/50 flex items-center justify-center">
            <span className="bg-gray-900 text-white text-xs font-black uppercase tracking-wider px-3 py-1.5 rounded-lg">
              Esgotado
            </span>
          </div>
        )}

        {!esgotado && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigate(urlItemProduto(produto.id, location.search));
          }}
          className="absolute top-2 right-2 z-20 bg-[#ff5722] p-2 rounded-full text-white shadow-md hover:bg-[#e64a19] active:scale-90 transition-all"
          aria-label="Adicionar item"
        >
          <Plus size={18} strokeWidth={3} />
        </button>
        )}

        <ImagemProdutoCard
          src={produto.imagem_url}
          alt={produto.nome}
        />
      </motion.div>

      <div className="flex-1 flex flex-col px-1.5 pb-1.5">
        <h3 className="text-sm md:text-base font-extrabold text-gray-950 dark:text-white mb-1.5 line-clamp-2 leading-snug">
          {produto.nome}
        </h3>

        <p className="text-xs md:text-sm text-gray-700 dark:text-gray-200 line-clamp-2 leading-snug font-medium">
          {esgotado
            ? "Indisponível no momento."
            : produto.descricao || "Toque para personalizar e ver detalhes."}
        </p>
      </div>
    </motion.article>
    );
  };

  const produtosPorCategoria = categorias
    .map((categoria) => ({
      categoria,
      produtos: produtos.filter((p) => p.categoria_id === categoria.id),
    }))
    .filter((grupo) => grupo.produtos.length > 0);

  const produtosExibidos =
    categoriaAtiva === "all"
      ? produtos
      : produtos.filter((p) => p.categoria_id === categoriaAtiva);

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-[#121212] text-gray-950 dark:text-gray-100 pb-32 font-sans transition-colors duration-300 selection:bg-[#ff5722]/30">
      {/* Header Fixo */}
      <header className="sticky top-0 z-30 bg-white dark:bg-[#181a1b] border-b border-gray-200 dark:border-[#2a2c30] shadow-sm pb-4 pt-4 transition-colors duration-300">
        <div className="px-5 flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(urlCardapio("meus-pedidos", location.search))}
              className="p-2.5 bg-gray-100 dark:bg-[#2a2c30] rounded-full text-gray-600 dark:text-gray-300 hover:text-black dark:hover:text-white active:scale-95 transition-transform"
              aria-label="Meus pedidos"
            >
              <ClipboardList size={20} />
            </button>

            <button
              onClick={() => setModalOpcoesAberto(true)}
              className="p-2.5 bg-gray-100 dark:bg-[#2a2c30] rounded-full text-gray-600 dark:text-gray-300 hover:text-black dark:hover:text-white active:scale-95 transition-transform"
              aria-label="Abrir opções de exibição"
            >
              <Settings size={20} />
            </button>

            {!mesaParam && (
              <button
                onClick={() => setModalVoltarHomeAberto(true)}
                className="p-2.5 bg-gray-100 dark:bg-[#2a2c30] rounded-full text-gray-600 dark:text-gray-300 hover:text-[#ff5722] active:scale-95 transition-transform"
                aria-label="Limpar tudo e voltar ao início"
                title="Voltar ao início"
              >
                <Home size={20} />
              </button>
            )}
          </div>

          <h1 className="text-xl md:text-2xl font-extrabold tracking-wide text-gray-950 dark:text-white flex-1 text-center">
            Cardápio
          </h1>

          <button
            onClick={() => setCarrinhoAberto(true)}
            className={`relative rounded-full active:scale-95 transition-all duration-300 ${
              quantidadeTotalCarrinho > 0
                ? "p-4 bg-[#ff5722] text-white shadow-lg shadow-[#ff5722]/35 scale-110"
                : "p-3 bg-gray-100 dark:bg-[#2a2c30] text-gray-900 dark:text-white"
            }`}
            aria-label={
              quantidadeTotalCarrinho > 0
                ? `Abrir carrinho com ${quantidadeTotalCarrinho} itens`
                : "Abrir carrinho"
            }
          >
            {quantidadeTotalCarrinho > 0 && (
              <span className="absolute inset-0 rounded-full bg-[#ff5722] animate-ping opacity-25" />
            )}
            <ShoppingBag
              size={quantidadeTotalCarrinho > 0 ? 28 : 24}
              className="relative z-10"
            />
            {quantidadeTotalCarrinho > 0 && (
              <span className="absolute -top-1.5 -right-1.5 z-20 bg-white text-[#ff5722] text-xs font-black min-w-6 h-6 px-1 flex items-center justify-center rounded-full shadow-md border-2 border-[#ff5722]">
                {quantidadeTotalCarrinho > 99 ? "99+" : quantidadeTotalCarrinho}
              </span>
            )}
          </button>
        </div>

        {/* Abas de Navegação */}
        <nav className="flex overflow-x-auto hide-scrollbar gap-2 px-4 pb-1 max-w-full snap-x snap-mandatory">
          {carregando ? (
            <SkeletonCategorias />
          ) : (
            <>
              <button
            onClick={() => setCategoriaAtiva("all")}
            className={`shrink-0 snap-start inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-bold whitespace-nowrap transition-colors md:hidden ${
              categoriaAtiva === "all"
                ? "bg-gray-950 border-gray-950 text-white dark:bg-[#323438] dark:border-[#5a5c60]"
                : "bg-white border-gray-300 text-gray-900 dark:bg-[#222426] dark:border-[#3a3c40] dark:text-gray-100"
            }`}
          >
            Todos
            <span
              className={`rounded-full px-1.5 py-0.5 text-[0.625rem] font-black ${
                categoriaAtiva === "all"
                  ? "bg-white/20 text-white"
                  : "bg-gray-100 dark:bg-[#2a2c30] text-gray-700 dark:text-gray-200"
              }`}
            >
              {produtos.length}
            </span>
          </button>

          {categorias.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategoriaAtiva(cat.id)}
              className={`shrink-0 snap-start inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-bold whitespace-nowrap transition-colors md:hidden ${
                categoriaAtiva === cat.id
                  ? "bg-gray-950 border-gray-950 text-white dark:bg-[#323438] dark:border-[#5a5c60]"
                  : "bg-white border-gray-300 text-gray-900 dark:bg-[#222426] dark:border-[#3a3c40] dark:text-gray-100"
              }`}
            >
              {cat.icone && <span>{cat.icone}</span>}
              {cat.nome}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[0.625rem] font-black ${
                  categoriaAtiva === cat.id
                    ? "bg-white/20 text-white"
                    : "bg-gray-100 dark:bg-[#2a2c30] text-gray-700 dark:text-gray-200"
                }`}
              >
                {cat.quantidade_produtos}
              </span>
            </button>
          ))}

          <button
            onClick={() => setCategoriaAtiva("all")}
            className={`hidden md:flex shrink-0 snap-start flex-col items-start px-5 py-2.5 rounded-2xl min-w-[6.25rem] transition-colors border ${
              categoriaAtiva === "all"
                ? "bg-gray-950 border-gray-950 text-white dark:bg-[#323438] dark:border-[#5a5c60]"
                : "bg-white border-gray-300 text-gray-900 dark:bg-[#222426] dark:border-[#3a3c40] dark:text-gray-100 hover:border-[#ff5722]/40"
            }`}
          >
            <span className="text-sm font-bold">Todos</span>
            <span
              className={`text-xs font-semibold ${categoriaAtiva === "all" ? "text-gray-200" : "text-gray-600 dark:text-gray-300"}`}
            >
              {produtos.length} Itens
            </span>
          </button>

          {categorias.map((cat) => (
            <button
              key={`desktop-${cat.id}`}
              onClick={() => setCategoriaAtiva(cat.id)}
              className={`hidden md:flex shrink-0 snap-start flex-col items-start px-5 py-2.5 rounded-2xl min-w-[7.5rem] transition-colors border ${
                categoriaAtiva === cat.id
                  ? "bg-gray-950 border-gray-950 text-white dark:bg-[#323438] dark:border-[#5a5c60]"
                  : "bg-white border-gray-300 text-gray-900 dark:bg-[#222426] dark:border-[#3a3c40] dark:text-gray-100 hover:border-[#ff5722]/40"
              }`}
            >
              <span className="text-sm font-bold whitespace-nowrap">
                {cat.icone && `${cat.icone} `}
                {cat.nome}
              </span>
              <span
                className={`text-xs font-semibold ${categoriaAtiva === cat.id ? "text-gray-200" : "text-gray-600 dark:text-gray-300"}`}
              >
                {cat.quantidade_produtos} Itens
              </span>
            </button>
          ))}
            </>
          )}
        </nav>
      </header>

      {/* Grid de Produtos */}
      <main className="max-w-6xl mx-auto mt-6 px-5">
        {carregando ? (
          <SkeletonGridProdutos />
        ) : categoriaAtiva === "all" ? (
          <div className="space-y-10">
            {produtosPorCategoria.map(({ categoria, produtos: itens }, indice) => (
              <section
                key={categoria.id}
                id={`categoria-${categoria.id}`}
                className={`scroll-mt-36 ${indice > 0 ? "pt-2 border-t-2 border-gray-200 dark:border-[#2f3135]" : ""}`}
              >
                <div className="flex items-center justify-between gap-4 mb-5 px-1">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-1.5 h-8 rounded-full bg-[#ff5722] shrink-0" />
                    <h2 className="text-lg md:text-xl font-black text-gray-950 dark:text-white truncate">
                      {categoria.nome}
                    </h2>
                  </div>
                  <span className="shrink-0 text-xs md:text-sm font-bold text-gray-700 dark:text-gray-200 bg-white dark:bg-[#242629] border border-gray-200 dark:border-[#3a3c40] px-3 py-1.5 rounded-full">
                    {itens.length} {itens.length === 1 ? "item" : "itens"}
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {itens.map((produto) => renderCardProduto(produto))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {produtosExibidos.map((produto) => renderCardProduto(produto))}
          </div>
        )}
      </main>

      {/* Modal de Opções */}
      <AnimatePresence>
        {modalOpcoesAberto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-[#242629] w-full max-w-sm rounded-[2rem] p-6 shadow-2xl border border-gray-200 dark:border-[#323438]"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  Opções
                </h2>
                <button
                  onClick={() => setModalOpcoesAberto(false)}
                  className="p-2 bg-gray-100 dark:bg-[#181a1b] rounded-full text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
                    {temaEscuro ? <Moon size={20} /> : <Sun size={20} />}
                    <span className="font-medium">Tema Visual</span>
                  </div>
                  <button
                    onClick={() => setTemaEscuro(!temaEscuro)}
                    className="px-4 py-2 bg-gray-100 dark:bg-[#181a1b] rounded-xl text-sm font-bold text-gray-900 dark:text-white active:scale-95 transition-transform"
                  >
                    {temaEscuro ? "Escuro" : "Claro"}
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
                    {telaCheia ? (
                      <Minimize size={20} />
                    ) : (
                      <Maximize size={20} />
                    )}
                    <span className="font-medium">Tela Cheia</span>
                  </div>
                  <button
                    onClick={alternarTelaCheia}
                    className="px-4 py-2 bg-gray-100 dark:bg-[#181a1b] rounded-xl text-sm font-bold text-gray-900 dark:text-white active:scale-95 transition-transform"
                  >
                    {telaCheia ? "Sair" : "Ativar"}
                  </button>
                </div>

                <div className="pt-2 border-t border-gray-100 dark:border-[#323438]">
                  <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300 mb-4">
                    <Type size={20} />
                    <span className="font-medium">Tamanho da Fonte</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEscalaFonte(100)}
                      className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors border ${escalaFonte === 100 ? "bg-[#ff5722] text-white border-[#ff5722]" : "bg-gray-100 dark:bg-[#181a1b] text-gray-600 dark:text-gray-400 border-transparent"}`}
                    >
                      Padrão
                    </button>
                    <button
                      onClick={() => setEscalaFonte(110)}
                      className={`flex-1 py-2 rounded-xl text-base font-bold transition-colors border ${escalaFonte === 110 ? "bg-[#ff5722] text-white border-[#ff5722]" : "bg-gray-100 dark:bg-[#181a1b] text-gray-600 dark:text-gray-400 border-transparent"}`}
                    >
                      Média
                    </button>
                    <button
                      onClick={() => setEscalaFonte(120)}
                      className={`flex-1 py-2 rounded-xl text-lg font-bold transition-colors border ${escalaFonte === 120 ? "bg-[#ff5722] text-white border-[#ff5722]" : "bg-gray-100 dark:bg-[#181a1b] text-gray-600 dark:text-gray-400 border-transparent"}`}
                    >
                      Grande
                    </button>
                  </div>
                </div>

                <div className="pt-2 border-t border-gray-100 dark:border-[#323438]">
                  <button
                    type="button"
                    onClick={() => {
                      setModalOpcoesAberto(false);
                      navigate(urlCardapio("meus-pedidos", location.search));
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-[#181a1b] hover:bg-gray-100 dark:hover:bg-[#2a2c30] transition-colors mb-2"
                  >
                    <ClipboardList size={20} className="text-[#ff5722]" />
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      Meus pedidos
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setModalOpcoesAberto(false);
                      navigate(urlCardapio("/erros", location.search));
                    }}
                    className="w-full flex items-center justify-between gap-3 p-3 rounded-xl bg-gray-50 dark:bg-[#181a1b] hover:bg-gray-100 dark:hover:bg-[#2a2c30] transition-colors"
                  >
                    <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
                      <AlertTriangle size={20} className="text-amber-500" />
                      <span className="font-medium">Registro de Erros</span>
                    </div>
                    {quantidadeErros > 0 && (
                      <span className="bg-amber-500 text-white text-xs font-bold min-w-6 h-6 px-1.5 flex items-center justify-center rounded-full">
                        {quantidadeErros > 99 ? "99+" : quantidadeErros}
                      </span>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Outlet />

      <CarrinhoLateral
        aberto={carrinhoAberto}
        aoFechar={() => setCarrinhoAberto(false)}
        identificadorMesa={
          new URLSearchParams(window.location.search).get("mesa") || "Balcão"
        }
      />

      <ModalConfirmacao
        aberto={modalVoltarHomeAberto}
        titulo="Voltar ao início?"
        mensagem="O carrinho e os dados do cliente serão limpos. Deseja encerrar este pedido e voltar para a tela inicial?"
        textoConfirmar="Sim, limpar e voltar"
        textoCancelar="Continuar pedido"
        aoConfirmar={confirmarVoltarHome}
        aoCancelar={() => setModalVoltarHomeAberto(false)}
      />
    </div>
  );
}
