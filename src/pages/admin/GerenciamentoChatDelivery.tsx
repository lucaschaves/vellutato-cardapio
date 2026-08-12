import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AdminPageShell } from "../../components/AdminPageShell";
import { ChatThread, iniciaisNome } from "../../components/chat/ChatThread";
import { Avatar, AvatarFallback } from "../../components/ui/avatar";
import { useChatAdmin } from "../../context/ChatAdminContext";
import {
  enviarMensagem,
  formatarHoraInbox,
  listarConversasAdmin,
  listarMensagens,
  previewMensagemInbox,
  type Conversa,
  type MensagemChat,
} from "../../lib/deliveryChat";
import { formatarTelefoneDeSalvo } from "../../lib/telefone";
import { cn } from "../../lib/utils";
import { supabase } from "../../lib/supabase";

export function GerenciamentoChatDelivery() {
  const { marcarLida, recarregarNaoLidas } = useChatAdmin();
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [ativa, setAtiva] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<MensagemChat[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);

  const conversaAtiva = useMemo(
    () => conversas.find((c) => c.id === ativa) ?? null,
    [conversas, ativa],
  );

  const nomeCliente = conversaAtiva?.clientes?.nome || "Cliente";
  const celularCliente = conversaAtiva?.clientes?.celular;

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
    void (async () => {
      setMensagens(await listarMensagens(ativa));
      await marcarLida(ativa);
      await carregarConversas();
    })();

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
          if (msg.autor === "cliente") {
            void marcarLida(ativa).then(() => carregarConversas());
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [ativa, marcarLida]);

  useEffect(() => {
    return () => {
      void recarregarNaoLidas();
    };
  }, [recarregarNaoLidas]);

  const enviar = async () => {
    if (!ativa || !texto.trim()) return;
    try {
      setEnviando(true);
      await enviarMensagem({
        conversaId: ativa,
        autor: "admin",
        corpo: texto,
      });
      setTexto("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <AdminPageShell
      title="Chat delivery"
      description="Conversas dos clientes do canal delivery"
      scroll={false}
      contentClassName="min-h-0"
    >
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-3">
        <div className="overflow-y-auto rounded-xl border bg-background">
          {conversas.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">
              Nenhuma conversa ainda.
            </p>
          )}
          {conversas.map((c) => {
            const nome = c.clientes?.nome || "Cliente";
            const naoLidas = Number(c.nao_lidas_admin_count ?? 0);
            const temNaoLida =
              (c.nao_lida_admin || naoLidas > 0) && ativa !== c.id;
            const prefixoAutor =
              c.ultima_mensagem_autor === "admin" ? "Você: " : "";
            const preview = previewMensagemInbox(c.ultima_mensagem_corpo);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setAtiva(c.id)}
                className={cn(
                  "flex w-full items-center gap-3 border-b px-3 py-3 text-left transition-colors hover:bg-muted/50",
                  ativa === c.id && "bg-muted",
                  temNaoLida && "bg-amber-50/80 dark:bg-amber-950/20",
                )}
              >
                <Avatar size="default">
                  <AvatarFallback
                    className={cn(
                      temNaoLida
                        ? "bg-cookie-primary text-white"
                        : "bg-secondary text-secondary-foreground",
                    )}
                  >
                    {iniciaisNome(nome)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p
                      className={cn(
                        "truncate text-sm",
                        temNaoLida ? "font-bold" : "font-semibold",
                      )}
                    >
                      {nome}
                    </p>
                    <span
                      className={cn(
                        "shrink-0 text-[11px] tabular-nums",
                        temNaoLida
                          ? "font-semibold text-cookie-primary"
                          : "text-muted-foreground",
                      )}
                    >
                      {formatarHoraInbox(c.ultimo_mensagem_em)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <p
                      className={cn(
                        "min-w-0 flex-1 truncate text-xs",
                        temNaoLida
                          ? "font-medium text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {prefixoAutor}
                      {preview}
                    </p>
                    {temNaoLida && naoLidas > 0 && (
                      <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-cookie-primary px-1.5 text-[10px] font-bold text-white">
                        {naoLidas > 99 ? "99+" : naoLidas}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-background md:col-span-2">
          {!ativa || !conversaAtiva ? (
            <p className="m-auto text-sm text-muted-foreground">
              Selecione uma conversa
            </p>
          ) : (
            <>
              <header className="flex shrink-0 items-center gap-3 border-b bg-muted/40 px-4 py-3">
                <Avatar size="lg">
                  <AvatarFallback className="bg-secondary text-secondary-foreground text-sm font-semibold">
                    {iniciaisNome(nomeCliente)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold leading-tight">
                    {nomeCliente}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {celularCliente
                      ? formatarTelefoneDeSalvo(celularCliente)
                      : "Sem telefone"}
                    {conversaAtiva.pedido_id
                      ? ` · Pedido ${conversaAtiva.pedido_id.slice(0, 8)}`
                      : ""}
                  </p>
                </div>
              </header>

              <ChatThread
                mensagens={mensagens}
                perspectiva="admin"
                nomeCliente={nomeCliente}
                texto={texto}
                onTextoChange={setTexto}
                onEnviar={() => void enviar()}
                enviando={enviando}
                placeholder="Responder…"
                vazio="Nenhuma mensagem nesta conversa."
              />
            </>
          )}
        </div>
      </div>
    </AdminPageShell>
  );
}
