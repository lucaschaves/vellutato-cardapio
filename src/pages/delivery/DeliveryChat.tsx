import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ChatThread } from "../../components/chat/ChatThread";
import { IdentificarTelefoneDelivery } from "../../components/IdentificarTelefoneDelivery";
import { Avatar, AvatarFallback } from "../../components/ui/avatar";
import { useChatCliente } from "../../context/ChatClienteContext";
import { useClienteDeliverySessao } from "../../hooks/useClienteDeliverySessao";
import {
  enviarMensagem,
  listarMensagens,
  obterOuCriarConversa,
  type MensagemChat,
} from "../../lib/deliveryChat";
import { supabase } from "../../lib/supabase";

export function DeliveryChat() {
  const { cliente, carregando, precisaIdentificar, identificarPorTelefone } =
    useClienteDeliverySessao();
  const { marcarLida } = useChatCliente();
  const [params] = useSearchParams();
  const pedidoId = params.get("pedido");
  const [conversaId, setConversaId] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<MensagemChat[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!cliente?.id) return;
    void (async () => {
      try {
        const id = await obterOuCriarConversa({
          clienteId: cliente.id,
          pedidoId,
        });
        setConversaId(id);
        setMensagens(await listarMensagens(id));
        await marcarLida(id);
      } catch (e) {
        console.error(e);
        toast.error("Falha ao abrir chat");
      }
    })();
  }, [cliente?.id, pedidoId, marcarLida]);

  useEffect(() => {
    if (!conversaId) return;
    const canal = supabase
      .channel(`chat_${conversaId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "mensagens",
          filter: `conversa_id=eq.${conversaId}`,
        },
        (payload) => {
          const msg = payload.new as MensagemChat;
          setMensagens((prev) =>
            prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
          );
          if (msg.autor === "admin") {
            void marcarLida(conversaId);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [conversaId, marcarLida]);

  if (carregando) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-cookie-primary border-t-transparent" />
      </div>
    );
  }

  if (precisaIdentificar) {
    return (
      <IdentificarTelefoneDelivery
        titulo="Chat"
        descricao="Informe seu celular com DDD (11 dígitos) para conversar conosco."
        onIdentificar={(tel) =>
          identificarPorTelefone(tel, { criarSeAusente: true })
        }
      />
    );
  }

  const enviar = async () => {
    if (!conversaId || !texto.trim()) return;
    try {
      setEnviando(true);
      await enviarMensagem({
        conversaId,
        autor: "cliente",
        corpo: texto,
      });
      setTexto("");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao enviar");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex h-[calc(100dvh-8rem)] flex-col overflow-hidden rounded-2xl border bg-background">
      <header className="flex shrink-0 items-center gap-3 border-b bg-muted/40 px-4 py-3">
        <Avatar size="lg">
          <AvatarFallback className="bg-cookie-primary text-sm font-semibold text-white">
            V
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold leading-tight">
            Vellutato
          </p>
          <p className="truncate text-xs text-muted-foreground">
            Atendimento delivery
            {pedidoId ? ` · Pedido ${pedidoId.slice(0, 8)}` : ""}
          </p>
        </div>
      </header>

      <ChatThread
        mensagens={mensagens}
        perspectiva="cliente"
        nomeCliente={cliente?.nome || "Você"}
        nomeLoja="Vellutato"
        texto={texto}
        onTextoChange={setTexto}
        onEnviar={() => void enviar()}
        enviando={enviando}
        placeholder="Digite sua mensagem…"
        vazio="Envie uma mensagem — respondemos por aqui."
      />
    </div>
  );
}
