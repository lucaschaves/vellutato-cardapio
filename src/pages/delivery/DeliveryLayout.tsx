import { ArrowLeft, ClipboardList, MessageCircle, User } from "lucide-react";
import { useEffect } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { DeliverySacolaBar } from "../../components/DeliverySacolaBar";
import { LogoMarca } from "../../components/LogoMarca";
import { ChatClienteProvider, useChatCliente } from "../../context/ChatClienteContext";
import { usePedidosDeliveryAtivosCount } from "../../hooks/usePedidosDeliveryAtivosCount";
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

function DeliveryLayoutInner() {
  const navigate = useNavigate();
  const location = useLocation();
  const qtd = useCartStore((s) => s.obterQuantidadeTotal());
  const pedidosAtivos = usePedidosDeliveryAtivosCount();
  const naHome = location.pathname === "/";
  const esconderSacola =
    location.pathname.includes("/checkout") ||
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
