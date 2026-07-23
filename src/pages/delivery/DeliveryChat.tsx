import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { IconeGoogle } from "../../components/IconeGoogle";
import { useDeliveryCliente } from "../../hooks/useDeliveryCliente";
import {
  enviarMensagem,
  listarMensagens,
  obterOuCriarConversa,
  type MensagemChat,
} from "../../lib/deliveryChat";
import { supabase } from "../../lib/supabase";

export function DeliveryChat() {
  const { logado, cliente, carregando, entrarComGoogle, cadastroCompleto } =
    useDeliveryCliente();
  const [params] = useSearchParams();
  const pedidoId = params.get("pedido");
  const [conversaId, setConversaId] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<MensagemChat[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!cliente?.id || !cadastroCompleto) return;
    void (async () => {
      try {
        const id = await obterOuCriarConversa({
          clienteId: cliente.id,
          pedidoId,
        });
        setConversaId(id);
        setMensagens(await listarMensagens(id));
      } catch (e) {
        console.error(e);
        toast.error("Falha ao abrir chat");
      }
    })();
  }, [cliente?.id, cadastroCompleto, pedidoId]);

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
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [conversaId]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

  if (carregando) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-red-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!logado || !cadastroCompleto) {
    return (
      <div className="text-center py-16 space-y-3">
        <p className="font-bold">Entre para conversar conosco</p>
        <Button
          className="bg-red-600 hover:bg-red-700"
          onClick={() =>
            void entrarComGoogle(
              `${window.location.origin}/delivery/auth/callback`,
            )
          }
        >
          <IconeGoogle className="h-5 w-5 mr-2" />
          Entrar com Google
        </Button>
      </div>
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
    <div className="flex flex-col h-[calc(100dvh-8rem)]">
      <h1 className="text-xl font-black mb-3">Chat</h1>
      <div className="flex-1 overflow-y-auto space-y-2 bg-white border rounded-2xl p-3">
        {mensagens.length === 0 && (
          <p className="text-sm text-zinc-500 text-center py-8">
            Envie uma mensagem — respondemos por aqui.
          </p>
        )}
        {mensagens.map((m) => (
          <div
            key={m.id}
            className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
              m.autor === "cliente"
                ? "ml-auto bg-red-600 text-white"
                : "mr-auto bg-zinc-100 text-zinc-900"
            }`}
          >
            {m.corpo}
          </div>
        ))}
        <div ref={fimRef} />
      </div>
      <div className="flex gap-2 mt-3">
        <input
          className="flex-1 h-11 rounded-xl border border-zinc-200 px-3 text-sm"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Digite sua mensagem…"
          onKeyDown={(e) => {
            if (e.key === "Enter") void enviar();
          }}
        />
        <Button
          className="bg-red-600 hover:bg-red-700"
          disabled={enviando}
          onClick={() => void enviar()}
        >
          Enviar
        </Button>
      </div>
    </div>
  );
}
