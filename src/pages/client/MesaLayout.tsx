import { ArrowLeft, ClipboardList, MessageCircle, User } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { CarrinhoLateral } from "../../components/CarrinhoLateral";
import { LogoMarca } from "../../components/LogoMarca";
import { MesaSacolaBar } from "../../components/MesaSacolaBar";
import {
  ChatClienteProvider,
  useChatCliente,
} from "../../context/ChatClienteContext";
import {
  MesaCarrinhoProvider,
  useMesaCarrinho,
} from "../../context/MesaCarrinhoContext";
import { lerContextoCardapio } from "../../lib/modoCardapio";
import { urlCardapio } from "../../lib/urlCardapio";
import { urlDelivery } from "../../lib/urlDelivery";
import { useCartStore } from "../../store/useCartStore";

function MesaHeaderChatLink() {
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

function MesaLayoutInner({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const contexto = lerContextoCardapio(location.search);
  const { aberto, fechar } = useMesaCarrinho();
  const qtd = useCartStore((s) => s.obterQuantidadeTotal());
  const naHome = location.pathname === "/cardapio";
  const esconderSacola = location.pathname.includes("/item/");

  const voltar = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate(urlCardapio("", location.search));
    }
  };

  const paddingBottom =
    esconderSacola || qtd <= 0 ? "pb-4" : "pb-32";

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
              onClick={() => navigate(urlCardapio("", location.search))}
              className="flex items-center min-w-0"
              aria-label="Vellutato — cardápio"
            >
              <LogoMarca size={40} />
            </button>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <MesaHeaderChatLink />
            <Link
              to={urlCardapio("meus-pedidos", location.search)}
              className="p-2 rounded-full hover:bg-zinc-100"
              aria-label="Meus pedidos"
            >
              <ClipboardList size={20} />
            </Link>
            <Link
              to={urlCardapio("perfil", location.search)}
              className="p-2 rounded-full hover:bg-zinc-100"
              aria-label="Conta"
            >
              <User size={20} />
            </Link>
          </div>
        </div>
      </header>

      <main
        className={`flex-1 max-w-3xl w-full mx-auto ${naHome ? "px-0 pt-0" : "px-4 pt-4"} ${paddingBottom}`}
      >
        {children}
      </main>

      {!esconderSacola && <MesaSacolaBar />}

      <CarrinhoLateral
        aberto={aberto}
        aoFechar={fechar}
        mesa={contexto.mesa}
        rotuloDestino={contexto.rotuloDestino}
      />
    </div>
  );
}

export function MesaLayout({ children }: { children: ReactNode }) {
  return (
    <ChatClienteProvider>
      <MesaCarrinhoProvider>
        <MesaLayoutInner>{children}</MesaLayoutInner>
      </MesaCarrinhoProvider>
    </ChatClienteProvider>
  );
}
