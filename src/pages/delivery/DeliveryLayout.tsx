import { ArrowLeft, ClipboardList, MessageCircle, PartyPopper, User, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { DeliverySacolaBar } from "../../components/DeliverySacolaBar";
import { LogoMarca } from "../../components/LogoMarca";
import { ChatClienteProvider, useChatCliente } from "../../context/ChatClienteContext";
import { usePedidosDeliveryAtivosCount } from "../../hooks/usePedidosDeliveryAtivosCount";
import { supabase } from "../../lib/supabase";
import { urlDelivery } from "../../lib/urlDelivery";
import { useCartStore } from "../../store/useCartStore";

function DeliveryHeaderChatLink() {
  const { naoLidas } = useChatCliente();
  return (
    <Link
      to={urlDelivery("/chat")}
      className="relative p-2 rounded-full hover:bg-zinc-100"
      aria-label={
        naoLidas > 0
          ? `Chat (${naoLidas} resposta${naoLidas === 1 ? "" : "s"} nova${naoLidas === 1 ? "" : "s"})`
          : "Chat"
      }
    >
      <MessageCircle size={20} />
      {naoLidas > 0 && (
        <span className="absolute top-0.5 right-0.5 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-cookie-primary text-white text-[10px] font-bold leading-[1.1rem] text-center">
          {naoLidas > 9 ? "9+" : naoLidas}
        </span>
      )}
    </Link>
  );
}

const AVISO_EVENTOS_KEY = "vellutato.aviso-eventos";
const AVISO_EVENTOS_MS = 24 * 60 * 60 * 1000;

function avisoEventosVisivel(): boolean {
  try {
    const salvo = localStorage.getItem(AVISO_EVENTOS_KEY);
    if (!salvo) return true;
    const em = Number(salvo);
    if (!Number.isFinite(em) || Date.now() - em >= AVISO_EVENTOS_MS) {
      localStorage.removeItem(AVISO_EVENTOS_KEY);
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

function AvisoEventos() {
  const [aberto, setAberto] = useState(false);
  const [capa, setCapa] = useState<{ nome: string; imagem: string | null } | null>(
    null,
  );

  useEffect(() => {
    if (!avisoEventosVisivel()) return;
    setAberto(true);
    void supabase
      .from("produtos")
      .select("nome, imagem_url")
      .eq("ativo", true)
      .eq("canal_evento", true)
      .order("ordem")
      .limit(1)
      .then(({ data }) => {
        const row = data?.[0];
        if (!row) return;
        setCapa({
          nome: row.nome,
          imagem: row.imagem_url,
        });
      });
  }, []);

  if (!aberto) return null;

  const fechar = () => {
    try {
      localStorage.setItem(AVISO_EVENTOS_KEY, String(Date.now()));
    } catch {
      /* storage indisponível */
    }
    setAberto(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/45">
      <div
        role="dialog"
        aria-labelledby="aviso-eventos-titulo"
        className="w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl"
      >
        <div className="relative h-52 bg-gradient-to-br from-amber-100 to-rose-50">
          {capa?.imagem && (
            <img
              src={capa.imagem}
              alt={capa.nome}
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          <button
            type="button"
            onClick={fechar}
            className="absolute top-3 right-3 p-1.5 rounded-full bg-white/90 text-zinc-700 shadow"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
          <p className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-800">
            <PartyPopper size={13} /> Eventos
          </p>
        </div>
        <div className="p-5 space-y-3">
          <h2 id="aviso-eventos-titulo" className="text-xl font-black leading-tight">
            Também fazemos encomendas para eventos
          </h2>
          <p className="text-sm text-zinc-600">
            Caixas fechadas, só para retirada, com antecedência. Monte os sabores
            e escolha o dia.
          </p>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={fechar}
              className="flex-1 h-11 rounded-xl border border-zinc-200 text-sm font-semibold"
            >
              Agora não
            </button>
            <Link
              to={urlDelivery("/eventos")}
              onClick={fechar}
              className="flex-1 h-11 rounded-xl bg-amber-500 text-white text-sm font-bold inline-flex items-center justify-center"
            >
              Ver eventos
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function DeliveryLayoutInner() {
  const navigate = useNavigate();
  const location = useLocation();
  const qtd = useCartStore((s) => s.obterQuantidadeTotal());
  const pedidosAtivos = usePedidosDeliveryAtivosCount();
  const naHome = location.pathname === "/";
  const esconderSacola =
    location.pathname.includes("/checkout") ||
    location.pathname.includes("/eventos") ||
    location.pathname.includes("/auth") ||
    location.pathname.includes("/item/") ||
    location.pathname.includes("/endereco");

  // QR antigo de mesa apontava para /?mesa=N — redireciona ao cardápio loja
  useEffect(() => {
    if (location.pathname !== "/") return;
    const params = new URLSearchParams(location.search);
    const mesa = params.get("mesa")?.trim();
    if (mesa) {
      navigate(`/inicio?mesa=${encodeURIComponent(mesa)}`, { replace: true });
    }
  }, [location.pathname, location.search, navigate]);

  const voltar = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate(urlDelivery());
    }
  };

  const paddingBottom =
    esconderSacola || qtd <= 0
      ? "pb-4"
      : "pb-44"; /* sacola + mínimo + upsell */

  return (
    <div className="min-h-dvh bg-[#f4f4f5] text-zinc-900 flex flex-col">
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-zinc-200">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1 min-w-0">
            {!naHome && (
              <button
                type="button"
                onClick={voltar}
                className="p-2 -ml-2 rounded-full hover:bg-zinc-100 shrink-0"
                aria-label="Voltar"
              >
                <ArrowLeft size={22} />
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate(urlDelivery())}
              className="flex items-center min-w-0"
              aria-label="Vellutato — início"
            >
              <LogoMarca size={40} />
            </button>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <Link
              to={urlDelivery("/eventos")}
              className={`inline-flex items-center gap-1.5 mr-1 h-9 px-2.5 rounded-full text-sm font-bold border ${
                location.pathname.includes("/eventos")
                  ? "text-amber-900 bg-amber-100 border-amber-300"
                  : "text-amber-800 bg-amber-50 border-amber-200 hover:bg-amber-100"
              }`}
              aria-label="Eventos"
            >
              <PartyPopper size={16} />
              Eventos
            </Link>
            <DeliveryHeaderChatLink />
            <Link
              to={urlDelivery("/pedidos")}
              className="relative p-2 rounded-full hover:bg-zinc-100"
              aria-label={
                pedidosAtivos > 0
                  ? `Pedidos (${pedidosAtivos} em andamento)`
                  : "Pedidos"
              }
            >
              <ClipboardList size={20} />
              {pedidosAtivos > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-cookie-primary text-white text-[10px] font-bold leading-[1.1rem] text-center">
                  {pedidosAtivos > 9 ? "9+" : pedidosAtivos}
                </span>
              )}
            </Link>
            <Link
              to={urlDelivery("/conta")}
              className="p-2 rounded-full hover:bg-zinc-100"
              aria-label="Conta"
            >
              <User size={20} />
            </Link>
          </div>
        </div>
      </header>

      <main
        className={`flex-1 max-w-3xl w-full mx-auto px-4 pt-4 ${paddingBottom}`}
      >
        <Outlet />
      </main>

      {!esconderSacola && <DeliverySacolaBar />}
      {naHome && <AvisoEventos />}
    </div>
  );
}

export function DeliveryLayout() {
  return (
    <ChatClienteProvider>
      <DeliveryLayoutInner />
    </ChatClienteProvider>
  );
}
