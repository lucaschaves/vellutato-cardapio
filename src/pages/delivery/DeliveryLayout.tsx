import { ArrowLeft, Bike, ClipboardList, MessageCircle, ShoppingBag, User } from "lucide-react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useCartStore } from "../../store/useCartStore";

export function DeliveryLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const qtd = useCartStore((s) => s.obterQuantidadeTotal());
  const naHome =
    location.pathname === "/delivery" || location.pathname === "/delivery/";
  const esconderSacola =
    location.pathname.includes("/checkout") ||
    location.pathname.includes("/auth") ||
    location.pathname.includes("/item/") ||
    location.pathname.includes("/endereco");

  const voltar = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/delivery");
    }
  };

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
              onClick={() => navigate("/delivery")}
              className="flex items-center gap-2 font-black tracking-tight text-lg min-w-0"
            >
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-600 text-white">
                <Bike size={18} />
              </span>
              <span className="truncate">Vellutato</span>
            </button>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <Link
              to="/delivery/chat"
              className="p-2 rounded-full hover:bg-zinc-100"
              aria-label="Chat"
            >
              <MessageCircle size={20} />
            </Link>
            <Link
              to="/delivery/pedidos"
              className="p-2 rounded-full hover:bg-zinc-100"
              aria-label="Pedidos"
            >
              <ClipboardList size={20} />
            </Link>
            <Link
              to="/delivery/conta"
              className="p-2 rounded-full hover:bg-zinc-100"
              aria-label="Conta"
            >
              <User size={20} />
            </Link>
          </div>
        </div>
      </header>

      <main
        className={`flex-1 max-w-3xl w-full mx-auto px-4 pt-4 ${
          esconderSacola ? "pb-4" : "pb-24"
        }`}
      >
        <Outlet />
      </main>

      {!esconderSacola && qtd > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-40 p-4 pointer-events-none">
          <div className="max-w-3xl mx-auto pointer-events-auto">
            <button
              type="button"
              onClick={() => navigate("/delivery/checkout")}
              className="w-full h-14 rounded-2xl bg-red-600 text-white font-bold flex items-center justify-between px-5 shadow-lg shadow-red-600/25"
            >
              <span className="flex items-center gap-2">
                <ShoppingBag size={18} />
                Ver sacola
              </span>
              <span className="bg-white/20 rounded-full px-3 py-1 text-sm">
                {qtd}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
