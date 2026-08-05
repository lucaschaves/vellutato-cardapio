import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  FastForward,
  Maximize,
  Minimize,
  ShoppingBag,
  Store,
  Tag,
  UserCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { BotaoInstalarPwa } from "../../components/BotaoInstalarPwa";
import { InputTelaCheia } from "../../components/InputTelaCheia";
import { useTelaCheia } from "../../hooks/useTelaCheia";
import { buscarClientePorCelular } from "../../lib/clientes";
import {
  salvarTipoConsumo,
  type ModoConsumoItem,
} from "../../lib/disponibilidadeProduto";
import {
  emModoToten,
  limparIdentificacaoCliente,
  marcarModoToten,
} from "../../lib/modoCardapio";
import { prepararNavegacaoComTelaCheia } from "../../lib/telaCheia";
import { urlCardapio } from "../../lib/urlCardapio";
import {
  lerCelularLocalStorage,
  salvarCelularLocalStorage,
  telefoneDigitosCompleto,
} from "../../lib/telefone";
import { useCartStore } from "../../store/useCartStore";

const VIDEOS_DIVULGACAO_PADRAO = [
  "/primeiro.mp4",
  "/segundo.mp4",
  "/terceiro.mp4",
  "/quarto.mp4",
] as const;

const VIDEO_ENV = import.meta.env.VITE_VIDEO_DIVULGACAO as string | undefined;

function playlistDivulgacao(): readonly string[] {
  const bruto = VIDEO_ENV?.trim();
  if (!bruto) return VIDEOS_DIVULGACAO_PADRAO;
  if (bruto.includes(",")) {
    const lista = bruto
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return lista.length > 0 ? lista : VIDEOS_DIVULGACAO_PADRAO;
  }
  return [bruto];
}

const PLAYLIST_DIVULGACAO = playlistDivulgacao();

export function BemVindo() {
  const navigate = useNavigate();
  const location = useLocation();

  // Modo totem é configuração do dispositivo; a rota /totem
  // (e o legado /cardapio-toten) apenas ativa a configuração de forma persistente.
  const modoToten = emModoToten();

  const [etapa, setEtapa] = useState(modoToten ? 0 : 1);
  const [indiceVideo, setIndiceVideo] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [nome, setNome] = useState(
    () => localStorage.getItem("cliente_nome") || "",
  );
  const [celular, setCelular] = useState(() => lerCelularLocalStorage());
  const [buscandoCliente, setBuscandoCliente] = useState(false);
  const [clienteReconhecido, setClienteReconhecido] = useState(false);
  const ultimoCelularBuscado = useRef("");
  const { telaCheia, alternarTelaCheia } = useTelaCheia();

  useEffect(() => {
    if (
      location.pathname.startsWith("/totem") ||
      location.pathname.startsWith("/cardapio-toten")
    ) {
      marcarModoToten(true);
    }
  }, [location.pathname]);

  const indiceAtual = indiceVideo % PLAYLIST_DIVULGACAO.length;
  const srcVideoAtual = PLAYLIST_DIVULGACAO[indiceAtual];
  const srcProximoVideo =
    PLAYLIST_DIVULGACAO[(indiceAtual + 1) % PLAYLIST_DIVULGACAO.length];
  const playlistEmSequencia = PLAYLIST_DIVULGACAO.length > 1;

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.load();
    void el.play().catch(() => {});
  }, [srcVideoAtual]);

  useEffect(() => {
    if (!modoToten || !playlistEmSequencia || srcProximoVideo === srcVideoAtual)
      return;
    const link = document.createElement("link");
    link.rel = "prefetch";
    link.as = "video";
    link.href = srcProximoVideo;
    document.head.appendChild(link);
    return () => {
      link.remove();
    };
  }, [modoToten, playlistEmSequencia, srcProximoVideo, srcVideoAtual]);

  const aoTerminarVideo = () => {
    setIndiceVideo((i) => (i + 1) % PLAYLIST_DIVULGACAO.length);
  };

  const reconhecerClientePorTelefone = async (celularFormatado: string) => {
    if (!telefoneDigitosCompleto(celularFormatado)) {
      setClienteReconhecido(false);
      return;
    }
    if (ultimoCelularBuscado.current === celularFormatado) return;
    ultimoCelularBuscado.current = celularFormatado;

    try {
      setBuscandoCliente(true);
      const cliente = await buscarClientePorCelular(celularFormatado);
      if (cliente) {
        setNome(cliente.nome);
        setClienteReconhecido(true);
        const primeiroNome = cliente.nome.split(" ")[0];
        toast.success(`Bem-vindo(a) de volta, ${primeiroNome}!`);
      } else {
        setClienteReconhecido(false);
      }
    } catch {
      setClienteReconhecido(false);
    } finally {
      setBuscandoCliente(false);
    }
  };

  // Fora do totem, o celular salvo identifica o cliente: ao abrir o site,
  // rebusca nome (e demais dados) no sistema, que podem ter mudado.
  useEffect(() => {
    if (modoToten) return;
    const salvo = lerCelularLocalStorage();
    if (telefoneDigitosCompleto(salvo)) {
      void reconhecerClientePorTelefone(salvo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modoToten]);

  const handleCelularChange = (valor: string) => {
    setCelular(valor);
    if (!telefoneDigitosCompleto(valor)) {
      setClienteReconhecido(false);
      ultimoCelularBuscado.current = "";
      return;
    }
    void reconhecerClientePorTelefone(valor);
  };

  const podeContinuar =
    nome.trim().length > 0 && telefoneDigitosCompleto(celular);

  const limparCarrinho = useCartStore((s) => s.limparCarrinho);

  /** Após identificação, vai para a escolha comer/levar. */
  const irParaConsumo = (pular: boolean = false) => {
    if (!pular) {
      if (!podeContinuar) {
        toast.error("Informe celular e nome para continuar.");
        return;
      }
      localStorage.setItem("cliente_nome", nome.trim());
      salvarCelularLocalStorage(celular);
    } else {
      limparIdentificacaoCliente();
    }
    setEtapa(2);
  };

  const selecionarConsumo = async (modo: ModoConsumoItem) => {
    salvarTipoConsumo(modo);
    // Trocar de modo no meio de um pedido antigo não faz sentido
    limparCarrinho();
    await prepararNavegacaoComTelaCheia();
    navigate(urlCardapio("", location.search));
  };

  return (
    <div className="relative min-h-screen overflow-hidden selection:bg-cookie-primary/30">
      {modoToten ? (
        <video
          ref={videoRef}
          key={srcVideoAtual}
          src={srcVideoAtual}
          autoPlay
          loop={!playlistEmSequencia}
          muted
          playsInline
          preload="auto"
          onEnded={playlistEmSequencia ? aoTerminarVideo : undefined}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-linear-to-br from-[#1a1a1a] via-[#2d1810] to-cookie-primary/40" />
      )}

      <div
        className={`absolute inset-0 transition-all duration-500 ${
          etapa === 0
            ? "bg-linear-to-t from-black/85 via-black/20 to-black/45"
            : "bg-black/60 backdrop-blur-sm"
        }`}
      />

      {modoToten && (
        <>
          <div className="absolute top-5 left-5 z-20">
            <BotaoInstalarPwa
              className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-md text-white text-sm font-medium active:scale-95 transition-all border border-white/10 disabled:opacity-60"
              tipo="totem"
            />
          </div>

          <button
            type="button"
            onClick={() => void alternarTelaCheia()}
            className="absolute top-5 right-5 z-20 p-2.5 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-md text-white active:scale-95 transition-all border border-white/10"
            aria-label={telaCheia ? "Sair da tela cheia" : "Ativar tela cheia"}
            title={telaCheia ? "Sair da tela cheia" : "Tela cheia"}
          >
            {telaCheia ? <Minimize size={20} /> : <Maximize size={20} />}
          </button>
        </>
      )}

      <div
        className={`relative z-10 min-h-screen flex flex-col items-center justify-center ${
          modoToten ? "p-6" : "p-0"
        }`}
      >
        <AnimatePresence mode="wait">
          {etapa === 0 && (
            <motion.button
              key="etapa-0"
              type="button"
              onClick={() => setEtapa(1)}
              aria-label="Iniciar pedido"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="group absolute inset-0 flex flex-col items-center justify-end gap-12 px-6 pb-[14vh] text-center"
            >
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.7 }}
                className="flex flex-col items-center"
              >
                <span className="font-marca-cursiva text-6xl leading-none text-white drop-shadow-[0_6px_28px_rgba(0,0,0,0.65)] md:text-8xl">
                  Vellutato
                </span>
                <span className="mt-5 flex items-center gap-4 text-white/85">
                  <span className="h-px w-10 bg-white/45" />
                  <span className="font-marca text-xs uppercase tracking-[0.4em] md:text-sm">
                    Cookies &amp; Brownies
                  </span>
                  <span className="h-px w-10 bg-white/45" />
                </span>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35, duration: 0.7 }}
                className="flex flex-col items-center gap-5"
              >
                <span className="relative inline-flex">
                  <span className="absolute inset-0 rounded-full bg-white/25 motion-safe:animate-ping" />
                  <span className="relative inline-flex items-center gap-3 rounded-full bg-cookie-primary px-12 py-6 text-xl font-bold text-white shadow-2xl shadow-black/50 ring-1 ring-white/30 transition-transform group-active:scale-95 md:text-2xl">
                    <ShoppingBag size={26} className="shrink-0" />
                    Iniciar pedido
                    <ArrowRight size={26} className="shrink-0" />
                  </span>
                </span>
                <span className="text-sm tracking-wide text-white/70">
                  Toque em qualquer lugar da tela para começar
                </span>
              </motion.div>
            </motion.button>
          )}

          {etapa === 1 && (
            <motion.div
              key="etapa-1"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 50 }}
              className={
                modoToten
                  ? "w-full max-w-md bg-white/95 dark:bg-[#181a1b]/95 backdrop-blur-md rounded-[2rem] p-6 md:p-8 shadow-2xl border border-white/20 dark:border-[#2a2c30]"
                  : "w-full min-h-screen bg-white dark:bg-[#181a1b] p-6 md:p-8 flex flex-col justify-start *:w-full *:max-w-md *:mx-auto"
              }
            >
              <div className="flex items-start gap-3 mb-2">
                {modoToten && (
                  <button
                    type="button"
                    onClick={() => setEtapa(0)}
                    className="p-2 bg-gray-100 dark:bg-[#242629] rounded-full text-gray-500 hover:text-gray-900 dark:hover:text-white shrink-0 mt-0.5"
                  >
                    <ArrowRight size={20} className="rotate-180" />
                  </button>
                )}
                <div className="min-w-0">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <UserCircle className="text-cookie-primary shrink-0" /> Quem é
                    você?
                  </h2>
                  <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400 leading-snug flex items-start gap-1.5">
                    <Tag
                      size={14}
                      className="text-cookie-primary shrink-0 mt-0.5"
                    />
                    <span>
                      Identifique-se para desbloquear cupons e descontos
                      exclusivos. Opcional.
                    </span>
                  </p>
                </div>
              </div>

              <div className="space-y-4 mb-8 mt-5">
                <div>
                  <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                    Celular / WhatsApp *
                  </label>
                  <InputTelaCheia
                    modo="tel"
                    autoComplete="tel"
                    maxLength={15}
                    placeholder="(00) 00000-0000"
                    value={celular}
                    onValorChange={handleCelularChange}
                    className="w-full px-4 py-3.5 text-base rounded-xl border border-gray-200 dark:border-[#323438] bg-gray-50 dark:bg-[#121212] text-gray-900 dark:text-white focus:ring-2 focus:ring-cookie-primary focus:border-transparent transition-all outline-none"
                  />
                  {buscandoCliente && (
                    <p className="text-xs text-gray-500 mt-1.5">
                      Buscando seu cadastro...
                    </p>
                  )}
                  {clienteReconhecido && nome && !buscandoCliente && (
                    <p className="text-sm font-semibold text-green-700 dark:text-green-400 mt-2">
                      Bem-vindo(a) de volta, {nome.split(" ")[0]}!
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                    Seu Nome *
                  </label>
                  <InputTelaCheia
                    modo="texto"
                    placeholder="Como devemos te chamar?"
                    value={nome}
                    onValorChange={setNome}
                    className="w-full px-4 py-3.5 text-base rounded-xl border border-gray-200 dark:border-[#323438] bg-gray-50 dark:bg-[#121212] text-gray-900 dark:text-white focus:ring-2 focus:ring-cookie-primary focus:border-transparent transition-all outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => irParaConsumo(false)}
                  disabled={!podeContinuar}
                  className="w-full bg-cookie-primary hover:bg-cookie-primary-hover disabled:bg-gray-300 dark:disabled:bg-[#2a2c30] disabled:text-gray-500 text-white font-bold py-4 px-6 rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-lg shadow-cookie-primary/20"
                >
                  <span>Continuar</span>
                  <ArrowRight size={20} />
                </button>

                <button
                  type="button"
                  onClick={() => irParaConsumo(true)}
                  className="w-full py-4 px-6 rounded-2xl border-2 border-gray-200 dark:border-[#323438] bg-gray-50 dark:bg-[#242629] text-gray-800 dark:text-gray-100 font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all hover:border-cookie-primary/40 hover:bg-cookie-primary/5 dark:hover:bg-cookie-primary/10"
                >
                  <span>Continuar sem informar</span>
                  <FastForward size={20} />
                </button>

                <p className="text-center text-xs text-gray-500 dark:text-gray-400 px-2">
                  Sem identificação, cupons e descontos exclusivos podem ficar
                  indisponíveis.
                </p>
              </div>
            </motion.div>
          )}

          {etapa === 2 && (
            <motion.div
              key="etapa-2"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 50 }}
              className={
                modoToten
                  ? "w-full max-w-md bg-white/95 dark:bg-[#181a1b]/95 backdrop-blur-md rounded-[2rem] p-6 md:p-8 shadow-2xl border border-white/20 dark:border-[#2a2c30]"
                  : "w-full min-h-screen bg-white dark:bg-[#181a1b] p-6 md:p-8 flex flex-col justify-start *:w-full *:max-w-md *:mx-auto"
              }
            >
              <div className="flex items-start gap-3 mb-6">
                <button
                  type="button"
                  onClick={() => setEtapa(1)}
                  className="p-2 bg-gray-100 dark:bg-[#242629] rounded-full text-gray-500 hover:text-gray-900 dark:hover:text-white shrink-0 mt-0.5"
                  aria-label="Voltar"
                >
                  <ArrowRight size={20} className="rotate-180" />
                </button>
                <div className="min-w-0">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    Como vai aproveitar?
                  </h2>
                  <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400 leading-snug">
                    O cardápio mostra só os produtos disponíveis para o modo
                    escolhido.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => void selecionarConsumo("loja")}
                  className="w-full flex items-center gap-4 p-5 rounded-2xl border-2 border-gray-200 dark:border-[#323438] bg-gray-50 dark:bg-[#242629] hover:border-cookie-primary hover:bg-cookie-primary/5 dark:hover:bg-cookie-primary/10 active:scale-[0.98] transition-all text-left"
                >
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cookie-primary/15 text-cookie-primary shrink-0">
                    <Store size={28} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-lg font-bold text-gray-900 dark:text-white">
                      Comer na loja
                    </span>
                    <span className="block text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                      Produtos para consumo no local
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => void selecionarConsumo("levar")}
                  className="w-full flex items-center gap-4 p-5 rounded-2xl border-2 border-gray-200 dark:border-[#323438] bg-gray-50 dark:bg-[#242629] hover:border-cookie-primary hover:bg-cookie-primary/5 dark:hover:bg-cookie-primary/10 active:scale-[0.98] transition-all text-left"
                >
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cookie-primary/15 text-cookie-primary shrink-0">
                    <ShoppingBag size={28} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-lg font-bold text-gray-900 dark:text-white">
                      Para levar
                    </span>
                    <span className="block text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                      Produtos para viagem / retirada
                    </span>
                  </span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
