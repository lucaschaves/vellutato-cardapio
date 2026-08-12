import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  criarUrlSomNovaMensagem,
  tocarUrlAudio,
} from "../lib/alertaPedidoSom";
import {
  contarMensagensNaoLidasAdmin,
  marcarConversaLidaAdmin,
} from "../lib/deliveryChat";
import { supabase } from "../lib/supabase";
import { useAlertaNovoPedidoAdmin } from "./AlertaNovoPedidoContext";

interface ChatAdminContextValue {
  naoLidas: number;
  marcarLida: (conversaId: string) => Promise<void>;
  recarregarNaoLidas: () => Promise<void>;
}

const ChatAdminContext = createContext<ChatAdminContextValue | null>(null);

/**
 * Escuta mensagens do cliente em qualquer tela do admin:
 * atualiza contagem de não lidas, toca som e mostra toast.
 */
export function ChatAdminProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { ativo: somAtivo } = useAlertaNovoPedidoAdmin();
  const [naoLidas, setNaoLidas] = useState(0);
  const somUrlRef = useRef<string | null>(null);
  const vistosRef = useRef<Set<string>>(new Set());
  const somAtivoRef = useRef(somAtivo);
  somAtivoRef.current = somAtivo;

  useEffect(() => {
    somUrlRef.current = criarUrlSomNovaMensagem();
    return () => {
      if (somUrlRef.current) {
        URL.revokeObjectURL(somUrlRef.current);
        somUrlRef.current = null;
      }
    };
  }, []);

  const recarregarNaoLidas = useCallback(async () => {
    const n = await contarMensagensNaoLidasAdmin();
    setNaoLidas(n);
  }, []);

  useEffect(() => {
    void recarregarNaoLidas();
  }, [recarregarNaoLidas]);

  const marcarLida = useCallback(
    async (conversaId: string) => {
      await marcarConversaLidaAdmin(conversaId);
      await recarregarNaoLidas();
    },
    [recarregarNaoLidas],
  );

  useEffect(() => {
    const canal = supabase
      .channel("admin_chat_alertas")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mensagens" },
        (payload) => {
          const msg = payload.new as {
            id?: string;
            autor?: string;
            corpo?: string;
            conversa_id?: string;
          };
          if (!msg.id || msg.autor !== "cliente") return;
          if (vistosRef.current.has(msg.id)) return;
          vistosRef.current.add(msg.id);

          setNaoLidas((n) => n + 1);

          // Título da aba pisca — útil no KDS com várias abas abertas.
          try {
            const base = document.title.replace(/^\(\d+\)\s*/, "");
            document.title = `(●) Nova mensagem — ${base}`;
            window.setTimeout(() => {
              if (document.title.startsWith("(●)")) {
                document.title = base;
              }
            }, 8000);
          } catch {
            /* ignore */
          }

          // Toca se o som do admin já foi liberado (clique em "Som ativo").
          // Sem isso o Chrome bloqueia autoplay — o ícone no header ainda pisca.
          if (somUrlRef.current && somAtivoRef.current) {
            tocarUrlAudio(somUrlRef.current);
          }

          const preview = (msg.corpo || "").trim().slice(0, 80);
          toast.message("💬 Nova mensagem no chat", {
            id: `chat-msg-${msg.id}`,
            description: preview || "Cliente enviou uma mensagem",
            action: {
              label: "Abrir chat",
              onClick: () => navigate("/admin/chat"),
            },
            duration: 12000,
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversas" },
        () => {
          void recarregarNaoLidas();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [navigate, recarregarNaoLidas]);

  return (
    <ChatAdminContext.Provider
      value={{ naoLidas, marcarLida, recarregarNaoLidas }}
    >
      {children}
    </ChatAdminContext.Provider>
  );
}

export function useChatAdmin() {
  const ctx = useContext(ChatAdminContext);
  if (!ctx) {
    throw new Error("useChatAdmin deve ser usado dentro de ChatAdminProvider");
  }
  return ctx;
}
