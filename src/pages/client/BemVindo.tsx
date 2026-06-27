import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  FastForward,
  Maximize,
  Minimize,
  Play,
  ShoppingBag,
  Store,
  UserCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BotaoInstalarPwa } from "../../components/BotaoInstalarPwa";
import { useTelaCheia } from "../../hooks/useTelaCheia";
import { supabase } from "../../lib/supabase";
import {
  aoTeclaTelefone,
  criarHandlerTelefone,
  fecharTeclado,
  lerCelularLocalStorage,
  salvarCelularLocalStorage,
} from "../../lib/telefone";
import { prepararNavegacaoComTelaCheia } from "../../lib/telaCheia";
const VIDEO_ENV = import.meta.env.VITE_VIDEO_DIVULGACAO as string | undefined;

export function BemVindo() {
  const navigate = useNavigate();
  const location = useLocation();

  const [etapa, setEtapa] = useState(0);
  const [videoDivulgacao, setVideoDivulgacao] = useState<string | null>(
    VIDEO_ENV || null,
  );

  const [nome, setNome] = useState(
    () => localStorage.getItem("cliente_nome") || "",
  );
  const [celular, setCelular] = useState(() => lerCelularLocalStorage());
  const { telaCheia, alternarTelaCheia } = useTelaCheia();

  useEffect(() => {
    const mesa = new URLSearchParams(location.search).get("mesa");
    if (mesa) {
      localStorage.setItem("tipo_consumo", "loja");
      navigate(`/cardapio${location.search}`, { replace: true });
    }
  }, [location.search, navigate]);

  useEffect(() => {
    if (VIDEO_ENV) return;

    async function carregarVideoDivulgacao() {
      try {
        const { data, error } = await supabase
          .from("produtos")
          .select("video_url")
          .eq("ativo", true)
          .not("video_url", "is", null)
          .order("em_promocao", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) throw error;
        if (data?.video_url) setVideoDivulgacao(data.video_url);
      } catch (erro: unknown) {
        const mensagem = erro instanceof Error ? erro.message : String(erro);
        console.error(
          "[ERRO - TELA INICIAL] Falha ao carregar vídeo de divulgação:",
          mensagem,
        );
      }
    }

    carregarVideoDivulgacao();
  }, []);

  const handlePhoneChange = criarHandlerTelefone(setCelular);

  const selecionarConsumo = (tipo: "loja" | "viagem") => {
    localStorage.setItem("tipo_consumo", tipo);
    setEtapa(2);
  };

  const prosseguir = async (pular: boolean = false) => {
    if (!pular) {
      localStorage.setItem("cliente_nome", nome);
      salvarCelularLocalStorage(celular);
    } else {
      localStorage.removeItem("cliente_nome");
      localStorage.removeItem("cliente_celular");
    }

    fecharTeclado();
    await prepararNavegacaoComTelaCheia();
    navigate(`/cardapio${location.search}`);
  };

  return (
    <div className="relative min-h-screen overflow-hidden selection:bg-[#ff5722]/30">
      {videoDivulgacao ? (
        <video
          key={videoDivulgacao}
          src={videoDivulgacao}
          autoPlay
          loop
          muted
          playsInline
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

      <div className="absolute top-5 left-5 z-20">
        <BotaoInstalarPwa className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-md text-white text-sm font-medium active:scale-95 transition-all border border-white/10 disabled:opacity-60" tipo="cardapio" />
      </div>

      <button
        onClick={alternarTelaCheia}
        className="absolute top-5 right-5 z-20 p-2.5 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-md text-white active:scale-95 transition-all border border-white/10"
        aria-label={telaCheia ? "Sair da tela cheia" : "Ativar tela cheia"}
        title={telaCheia ? "Sair da tela cheia" : "Tela cheia"}
      >
        {telaCheia ? <Minimize size={20} /> : <Maximize size={20} />}
      </button>

      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-6">
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
                <Play
                  size={40}
                  className="ml-1 fill-white"
                  strokeWidth={0}
                />
              </button>

              <span className="mt-6 text-sm font-bold uppercase tracking-[0.2em] text-white/90">
                Iniciar Pedido
              </span>
            </motion.div>
          )}

          {etapa === 1 && (
            <motion.div
              key="etapa-1"
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="w-full max-w-md bg-white/95 dark:bg-[#181a1b]/95 backdrop-blur-md rounded-[2rem] p-8 shadow-2xl border border-white/20 dark:border-[#2a2c30]"
            >
              <div className="text-center mb-8">
                <h1 className="text-3xl font-black font-serif italic tracking-tight bg-gradient-to-r from-[#ff5722] to-orange-400 bg-clip-text text-transparent mb-2">
                  Vellutato
                </h1>
                <p className="text-gray-500 dark:text-gray-400 text-base">
                  Como podemos te atender hoje?
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <button
                  onClick={() => selecionarConsumo("loja")}
                  className="flex items-center p-5 rounded-2xl border-2 border-gray-100 dark:border-[#2a2c30] bg-transparent text-gray-700 dark:text-gray-300 hover:border-[#ff5722] hover:bg-[#ff5722]/5 transition-all active:scale-95 group"
                >
                  <div className="bg-gray-100 dark:bg-[#242629] p-3 rounded-xl group-hover:bg-[#ff5722]/10 group-hover:text-[#ff5722] transition-colors">
                    <Store size={28} />
                  </div>
                  <div className="ml-4 text-left">
                    <span className="block font-bold text-lg">
                      Comer na Loja
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Servido em pratos/bandejas
                    </span>
                  </div>
                </button>

                <button
                  onClick={() => selecionarConsumo("viagem")}
                  className="flex items-center p-5 rounded-2xl border-2 border-gray-100 dark:border-[#2a2c30] bg-transparent text-gray-700 dark:text-gray-300 hover:border-[#ff5722] hover:bg-[#ff5722]/5 transition-all active:scale-95 group"
                >
                  <div className="bg-gray-100 dark:bg-[#242629] p-3 rounded-xl group-hover:bg-[#ff5722]/10 group-hover:text-[#ff5722] transition-colors">
                    <ShoppingBag size={28} />
                  </div>
                  <div className="ml-4 text-left">
                    <span className="block font-bold text-lg">Para Levar</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Embalado para viagem
                    </span>
                  </div>
                </button>
              </div>

              <button
                onClick={() => setEtapa(0)}
                className="w-full mt-6 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              >
                Voltar ao vídeo
              </button>
            </motion.div>
          )}

          {etapa === 2 && (
            <motion.div
              key="etapa-2"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 50 }}
              className="w-full max-w-md bg-white/95 dark:bg-[#181a1b]/95 backdrop-blur-md rounded-[2rem] p-6 md:p-8 shadow-2xl border border-white/20 dark:border-[#2a2c30] mt-[-10vh]"
            >
              <div className="flex items-center gap-3 mb-6">
                <button
                  onClick={() => setEtapa(1)}
                  className="p-2 bg-gray-100 dark:bg-[#242629] rounded-full text-gray-500 hover:text-gray-900 dark:hover:text-white"
                >
                  <ArrowRight size={20} className="rotate-180" />
                </button>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <UserCircle className="text-[#ff5722]" /> Quem é você?
                </h2>
              </div>

              <div className="space-y-4 mb-8">
                <div>
                  <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                    Seu Nome *
                  </label>
                  <input
                    type="text"
                    placeholder="Como devemos te chamar?"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    className="w-full px-4 py-3.5 text-base rounded-xl border border-gray-200 dark:border-[#323438] bg-gray-50 dark:bg-[#121212] text-gray-900 dark:text-white focus:ring-2 focus:ring-[#ff5722] focus:border-transparent transition-all outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                    Celular / WhatsApp{" "}
                    <span className="opacity-50 font-normal text-[0.625rem]">
                      (Opcional)
                    </span>
                  </label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    enterKeyHint="done"
                    maxLength={15}
                    placeholder="(00) 00000-0000"
                    value={celular}
                    onChange={handlePhoneChange}
                    onKeyDown={aoTeclaTelefone}
                    className="w-full px-4 py-3.5 text-base rounded-xl border border-gray-200 dark:border-[#323438] bg-gray-50 dark:bg-[#121212] text-gray-900 dark:text-white focus:ring-2 focus:ring-[#ff5722] focus:border-transparent transition-all outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <button
                  onClick={() => prosseguir(false)}
                  disabled={!nome}
                  className="w-full bg-[#ff5722] hover:bg-[#e64a19] disabled:bg-gray-300 dark:disabled:bg-[#2a2c30] disabled:text-gray-500 text-white font-bold py-4 px-6 rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-lg shadow-[#ff5722]/20"
                >
                  <span>Ver Cardápio</span>
                  <ArrowRight size={20} />
                </button>

                <button
                  onClick={() => prosseguir(true)}
                  className="w-full py-3 text-sm font-bold text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center justify-center gap-2 transition-colors"
                >
                  <span>Pular identificação por enquanto</span>
                  <FastForward size={16} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
