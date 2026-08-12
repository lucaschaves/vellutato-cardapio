import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  contarMensagensNaoLidasCliente,
  marcarConversaLidaCliente,
} from "../lib/deliveryChat";
import { supabase } from "../lib/supabase";
import { useClienteDeliverySessao } from "../hooks/useClienteDeliverySessao";
import { urlDelivery } from "../lib/urlDelivery";

interface ChatClienteContextValue {
  naoLidas: number;
  marcarLida: (conversaId: string) => Promise<void>;
  recarregarNaoLidas: () => Promise<void>;
}

const ChatClienteContext = createContext<ChatClienteContextValue | null>(null);

/**
 * Escuta respostas da loja no delivery: badge no header + toast.
 */
export function ChatClienteProvider({ children }: { children: ReactNode }) {
  const { cliente } = useClienteDeliverySessao();
  const navigate = useNavigate();
  const location = useLocation();
  const [naoLidas, setNaoLidas] = useState(0);
  const vistosRef = useRef<Set<string>>(new Set());
  const conversasClienteRef = useRef<Set<string>>(new Set());
  const noChatRef = useRef(false);
  noChatRef.current =
    location.pathname === "/chat" || location.pathname.endsWith("/chat");

  const recarregarNaoLidas = useCallback(async () => {
    if (!cliente?.id) {
      setNaoLidas(0);
      conversasClienteRef.current = new Set();
      return;
    }
    const [{ data: convs }, n] = await Promise.all([
      supabase.from("conversas").select("id").eq("cliente_id", cliente.id),
      contarMensagensNaoLidasCliente(cliente.id),
    ]);
    conversasClienteRef.current = new Set((convs ?? []).map((c) => c.id));
    setNaoLidas(n);
  }, [cliente?.id]);

  useEffect(() => {
    void recarregarNaoLidas();
  }, [recarregarNaoLidas]);

  const marcarLida = useCallback(
    async (conversaId: string) => {
      await marcarConversaLidaCliente(conversaId);
      await recarregarNaoLidas();
    },
    [recarregarNaoLidas],
  );

  useEffect(() => {
    if (!cliente?.id) return;

    const canal = supabase
      .channel(`cliente_chat_alertas_${cliente.id}`)
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
          if (!msg.id || msg.autor !== "admin" || !msg.conversa_id) return;
          if (vistosRef.current.has(msg.id)) return;

          // Garante que a conversa é do cliente (ou recarrega mapa).
          const processar = async () => {
            if (!conversasClienteRef.current.has(msg.conversa_id!)) {
              const { data } = await supabase
                .from("conversas")
                .select("id, cliente_id")
                .eq("id", msg.conversa_id!)
                .maybeSingle();
              if (!data || data.cliente_id !== cliente.id) return;
              conversasClienteRef.current.add(data.id);
            }

            vistosRef.current.add(msg.id!);

            if (noChatRef.current) {
              // Já está no chat: marca lida e só atualiza contagem.
              await marcarConversaLidaCliente(msg.conversa_id!);
              await recarregarNaoLidas();
              return;
            }

            setNaoLidas((n) => n + 1);

            const preview = (msg.corpo || "").trim().slice(0, 80);
            toast.message("Nova resposta no chat", {
              id: `chat-cliente-${msg.id}`,
              description: preview || "A loja respondeu sua mensagem",
              action: {
                label: "Abrir",
                onClick: () => navigate(urlDelivery("/chat")),
              },
              duration: 10000,
            });
          };

          void processar();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversas",
          filter: `cliente_id=eq.${cliente.id}`,
        },
        () => {
          void recarregarNaoLidas();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [cliente?.id, navigate, recarregarNaoLidas]);

  return (
    <ChatClienteContext.Provider
      value={{ naoLidas, marcarLida, recarregarNaoLidas }}
    >
      {children}
    </ChatClienteContext.Provider>
  );
}

export function useChatCliente() {
  const ctx = useContext(ChatClienteContext);
  if (!ctx) {
    throw new Error(
      "useChatCliente deve ser usado dentro de ChatClienteProvider",
    );
  }
  return ctx;
}
