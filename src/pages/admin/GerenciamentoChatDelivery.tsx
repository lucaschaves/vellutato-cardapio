import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import {
  enviarMensagem,
  listarConversasAdmin,
  listarMensagens,
  type Conversa,
  type MensagemChat,
} from "../../lib/deliveryChat";
import { supabase } from "../../lib/supabase";

export function GerenciamentoChatDelivery() {
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [ativa, setAtiva] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<MensagemChat[]>([]);
  const [texto, setTexto] = useState("");
  const fimRef = useRef<HTMLDivElement>(null);

  const carregarConversas = async () => {
    try {
      setConversas(await listarConversasAdmin());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    void carregarConversas();
    const canal = supabase
      .channel("admin_chat_inbox")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversas" },
        () => void carregarConversas(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mensagens" },
        () => void carregarConversas(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, []);

  useEffect(() => {
    if (!ativa) return;
    void listarMensagens(ativa).then(setMensagens);
    const canal = supabase
      .channel(`admin_thread_${ativa}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "mensagens",
          filter: `conversa_id=eq.${ativa}`,
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
  }, [ativa]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

  return (
    <div className="h-[calc(100dvh-6rem)] flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-black">Chat delivery</h1>
        <p className="text-sm text-muted-foreground">
          Conversas dos clientes do canal /delivery
        </p>
      </div>
      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3 min-h-0">
        <div className="border rounded-xl overflow-y-auto bg-white dark:bg-surface-dark">
          {conversas.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">
              Nenhuma conversa ainda.
            </p>
          )}
          {conversas.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setAtiva(c.id)}
              className={`w-full text-left px-4 py-3 border-b ${
                ativa === c.id ? "bg-red-50 dark:bg-red-950/30" : ""
              }`}
            >
              <p className="font-semibold text-sm">
                {c.clientes?.nome || "Cliente"}
              </p>
              <p className="text-xs text-muted-foreground">
                {c.ultimo_mensagem_em
                  ? new Date(c.ultimo_mensagem_em).toLocaleString("pt-BR")
                  : "Sem mensagens"}
              </p>
            </button>
          ))}
        </div>
        <div className="md:col-span-2 border rounded-xl flex flex-col bg-white dark:bg-surface-dark min-h-0">
          {!ativa ? (
            <p className="m-auto text-sm text-muted-foreground">
              Selecione uma conversa
            </p>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {mensagens.map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                      m.autor === "admin"
                        ? "ml-auto bg-zinc-900 text-white"
                        : "mr-auto bg-zinc-100 dark:bg-zinc-800"
                    }`}
                  >
                    {m.corpo}
                  </div>
                ))}
                <div ref={fimRef} />
              </div>
              <div className="p-3 border-t flex gap-2">
                <input
                  className="flex-1 h-10 rounded-lg border px-3 text-sm"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder="Responder…"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      void (async () => {
                        try {
                          await enviarMensagem({
                            conversaId: ativa,
                            autor: "admin",
                            corpo: texto,
                          });
                          setTexto("");
                        } catch (err: unknown) {
                          toast.error(
                            err instanceof Error ? err.message : "Erro",
                          );
                        }
                      })();
                    }
                  }}
                />
                <Button
                  onClick={() =>
                    void (async () => {
                      try {
                        await enviarMensagem({
                          conversaId: ativa,
                          autor: "admin",
                          corpo: texto,
                        });
                        setTexto("");
                      } catch (err: unknown) {
                        toast.error(
                          err instanceof Error ? err.message : "Erro",
                        );
                      }
                    })()
                  }
                >
                  Enviar
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
