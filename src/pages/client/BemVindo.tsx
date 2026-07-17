import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  FastForward,
  Maximize,
  Minimize,
  Play,
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

  // Modo totem é configuração do dispositivo; a rota /cardapio-toten
  // (legada) apenas ativa a configuração de forma persistente.
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
    if (location.pathname.startsWith("/cardapio-toten")) {
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

  const prosseguir = async (pular: boolean = false) => {
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

    localStorage.removeItem("tipo_consumo");
    await prepararNavegacaoComTelaCheia();
    navigate(urlCardapio("", location.search));
  };

  return (
    <div className="relative min-h-screen overflow-hidden selection:bg-[#ff5722]/30">
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
        <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1a] via-[#2d1810] to-[#ff5722]/40" />
      )}

      <div
        className={`absolute inset-0 transition-colors duration-500 ${
          etapa === 0 ? "bg-black/35" : "bg-black/60 backdrop-blur-sm"
        }`}
      />

      {modoToten && (
        <>
          <div className="absolute top-5 left-5 z-20">
            <BotaoInstalarPwa
              className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-md text-white text-sm font-medium active:scale-95 transition-all border border-white/10 disabled:opacity-60"
              tipo="cardapio"
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
            <motion.div
              key="etapa-0"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col items-center text-center"
            >
              <h1 className="text-5xl md:text-6xl font-black font-serif italic tracking-tight text-white mb-3 drop-shadow-lg">
                Vellutato
              </h1>
              <p className="text-white/80 text-lg md:text-xl mb-10 max-w-sm drop-shadow-md">
                Sabores que conquistam. Toque para fazer seu pedido.
              </p>

              <button
                onClick={() => setEtapa(1)}
                className="group relative flex items-center justify-center w-28 h-28 md:w-32 md:h-32 rounded-full bg-[#ff5722] hover:bg-[#e64a19] text-white shadow-2xl shadow-[#ff5722]/40 active:scale-95 transition-all"
                aria-label="Iniciar pedido"
              >
                <span className="absolute inset-0 rounded-full bg-[#ff5722] animate-ping opacity-20" />
                <Play size={40} className="ml-1 fill-white" strokeWidth={0} />
              </button>

              <span className="mt-6 text-sm font-bold uppercase tracking-[0.2em] text-white/90">
                Iniciar Pedido
              </span>
            </motion.div>
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
                    <UserCircle className="text-[#ff5722] shrink-0" /> Quem é
                    você?
                  </h2>
                  <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400 leading-snug flex items-start gap-1.5">
                    <Tag
                      size={14}
                      className="text-[#ff5722] shrink-0 mt-0.5"
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
                    className="w-full px-4 py-3.5 text-base rounded-xl border border-gray-200 dark:border-[#323438] bg-gray-50 dark:bg-[#121212] text-gray-900 dark:text-white focus:ring-2 focus:ring-[#ff5722] focus:border-transparent transition-all outline-none"
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
                    className="w-full px-4 py-3.5 text-base rounded-xl border border-gray-200 dark:border-[#323438] bg-gray-50 dark:bg-[#121212] text-gray-900 dark:text-white focus:ring-2 focus:ring-[#ff5722] focus:border-transparent transition-all outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => void prosseguir(false)}
                  disabled={!podeContinuar}
                  className="w-full bg-[#ff5722] hover:bg-[#e64a19] disabled:bg-gray-300 dark:disabled:bg-[#2a2c30] disabled:text-gray-500 text-white font-bold py-4 px-6 rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-lg shadow-[#ff5722]/20"
                >
                  <span>Ver Cardápio</span>
                  <ArrowRight size={20} />
                </button>

                <button
                  type="button"
                  onClick={() => void prosseguir(true)}
                  className="w-full py-4 px-6 rounded-2xl border-2 border-gray-200 dark:border-[#323438] bg-gray-50 dark:bg-[#242629] text-gray-800 dark:text-gray-100 font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all hover:border-[#ff5722]/40 hover:bg-[#ff5722]/5 dark:hover:bg-[#ff5722]/10"
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
        </AnimatePresence>
      </div>
    </div>
  );
}
