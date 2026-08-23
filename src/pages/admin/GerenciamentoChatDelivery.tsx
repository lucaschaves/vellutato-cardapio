import { PanelLeftClose, PanelLeft, Search, UserRound, MailOpen, MessageCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
import { montarLinkWhatsapp } from "../../lib/mensagensWhatsapp";
import { formatarTelefoneDeSalvo } from "../../lib/telefone";
import { cn } from "../../lib/utils";
import { supabase } from "../../lib/supabase";

const LS_CHAT_LISTA_RECOLHIDA = "admin-chat-lista-recolhida";

function lerListaRecolhida(): boolean {
  try {
    return localStorage.getItem(LS_CHAT_LISTA_RECOLHIDA) === "1";
  } catch {
    return false;
  }
}

/** Não lidas do cliente primeiro; depois por última mensagem. */
function ordenarConversasInbox(a: Conversa, b: Conversa): number {
  const score = (c: Conversa) => {
    const naoLidas = Number(c.nao_lidas_admin_count ?? 0);
    if (c.nao_lida_admin || naoLidas > 0) return 2;
    if (c.ultima_mensagem_autor === "cliente") return 1;
    return 0;
  };
  const diff = score(b) - score(a);
  if (diff !== 0) return diff;
  const ta = a.ultimo_mensagem_em
    ? new Date(a.ultimo_mensagem_em).getTime()
    : 0;
  const tb = b.ultimo_mensagem_em
    ? new Date(b.ultimo_mensagem_em).getTime()
    : 0;
  return tb - ta;
}

export function GerenciamentoChatDelivery() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { marcarLida, marcarNaoLida, recarregarNaoLidas } = useChatAdmin();
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [ativa, setAtiva] = useState<string | null>(
    () => searchParams.get("conversa"),
  );
  const [mensagens, setMensagens] = useState<MensagemChat[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [busca, setBusca] = useState("");
  const [listaRecolhida, setListaRecolhida] = useState(lerListaRecolhida);
  /** Evita remarcar como lida logo após "Não lida" (corrida com URL/?conversa). */
  const pularAutoLidaRef = useRef<Set<string>>(new Set());

  const conversasOrdenadas = useMemo(
    () => [...conversas].sort(ordenarConversasInbox),
    [conversas],
  );

  const conversasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return conversasOrdenadas;
    return conversasOrdenadas.filter((c) => {
      const nome = (c.clientes?.nome || "").toLowerCase();
      const celular = (c.clientes?.celular || "").replace(/\D/g, "");
      const termoDigits = termo.replace(/\D/g, "");
      return (
        nome.includes(termo) ||
        (termoDigits.length >= 3 && celular.includes(termoDigits))
      );
    });
  }, [conversasOrdenadas, busca]);

  const conversaAtiva = useMemo(
    () => conversas.find((c) => c.id === ativa) ?? null,
    [conversas, ativa],
  );

  const nomeCliente = conversaAtiva?.clientes?.nome || "Cliente";
  const celularCliente = conversaAtiva?.clientes?.celular;
  const linkWhatsapp = useMemo(() => {
    if (!celularCliente) return null;
    const primeiro = nomeCliente.trim().split(/\s+/)[0] || "cliente";
    return montarLinkWhatsapp(
      celularCliente,
      `Olá, ${primeiro}! Aqui é da Vellutato.`,
    );
  }, [celularCliente, nomeCliente]);

  const carregarConversas = async () => {
    try {
      setConversas(await listarConversasAdmin());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    try {
      localStorage.setItem(
        LS_CHAT_LISTA_RECOLHIDA,
        listaRecolhida ? "1" : "0",
      );
    } catch {
      /* ignore */
    }
  }, [listaRecolhida]);

  useEffect(() => {
    const conversaUrl = searchParams.get("conversa");
    if (conversaUrl) {
      if (conversaUrl !== ativa) setAtiva(conversaUrl);
      return;
    }
    if (ativa) setAtiva(null);
  }, [searchParams, ativa]);

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

  const selecionarConversa = (id: string) => {
    pularAutoLidaRef.current.delete(id);
    setAtiva(id);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("conversa", id);
        return next;
      },
      { replace: true },
    );
  };

  useEffect(() => {
    if (!ativa) {
      setMensagens([]);
      return;
    }
    const conversaId = ativa;
    let cancelado = false;

    void (async () => {
      const msgs = await listarMensagens(conversaId);
      if (cancelado) return;
      setMensagens(msgs);

      if (pularAutoLidaRef.current.has(conversaId)) {
        return;
      }
      await marcarLida(conversaId);
      if (!cancelado) await carregarConversas();
    })();

    const canal = supabase
      .channel(`admin_thread_${conversaId}`)
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
          if (
            msg.autor === "cliente" &&
            !pularAutoLidaRef.current.has(conversaId)
          ) {
            void marcarLida(conversaId).then(() => carregarConversas());
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "mensagens",
          filter: `conversa_id=eq.${conversaId}`,
        },
        (payload) => {
          const msg = payload.new as MensagemChat;
          setMensagens((prev) =>
            prev.map((m) => (m.id === msg.id ? { ...m, ...msg } : m)),
          );
        },
      )
      .subscribe();
    return () => {
      cancelado = true;
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

  const marcarComoNaoLida = async () => {
    if (!ativa) return;
    const conversaId = ativa;
    try {
      // Antes de fechar: impede o efeito de remarcar como lida.
      pularAutoLidaRef.current.add(conversaId);
      await marcarNaoLida(conversaId);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("conversa");
          return next;
        },
        { replace: true },
      );
      setAtiva(null);
      setMensagens([]);
      await carregarConversas();
      toast.success("Conversa marcada como não lida.");
    } catch (err: unknown) {
      pularAutoLidaRef.current.delete(conversaId);
      toast.error(
        err instanceof Error ? err.message : "Falha ao marcar como não lida.",
      );
    }
  };

  const abrirWhatsapp = () => {
    if (!linkWhatsapp) {
      toast.error("Este cliente não tem um celular válido para WhatsApp.");
      return;
    }
    window.open(linkWhatsapp, "_blank", "noopener,noreferrer");
  };

  return (
    <AdminPageShell
      title="Chat delivery"
      description="Conversas dos clientes do canal delivery"
      scroll={false}
      contentClassName="min-h-0"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 md:flex-row">
        {/* Lista de conversas */}
        <div
          className={cn(
            "flex min-h-0 flex-col overflow-hidden rounded-xl border bg-background transition-[width] duration-200",
            listaRecolhida
              ? "md:w-16 md:shrink-0"
              : "md:w-80 md:shrink-0 lg:w-96",
            "max-md:max-h-[40vh]",
          )}
        >
          <div
            className={cn(
              "flex shrink-0 items-center gap-2 border-b p-2",
              listaRecolhida && "md:flex-col md:px-1.5",
            )}
          >
            {!listaRecolhida && (
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar cliente…"
                  className="h-9 w-full rounded-lg border bg-muted/40 pl-8 pr-3 text-sm outline-none ring-cookie-primary/30 placeholder:text-muted-foreground focus:border-cookie-primary focus:ring-2"
                />
              </div>
            )}
            <button
              type="button"
              onClick={() => setListaRecolhida((v) => !v)}
              className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted md:inline-flex"
              aria-label={
                listaRecolhida ? "Expandir lista de chats" : "Recolher lista"
              }
              title={listaRecolhida ? "Expandir lista" : "Recolher lista"}
            >
              {listaRecolhida ? (
                <PanelLeft size={18} />
              ) : (
                <PanelLeftClose size={18} />
              )}
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {conversasFiltradas.length === 0 && (
              <p
                className={cn(
                  "p-4 text-sm text-muted-foreground",
                  listaRecolhida && "md:px-1 md:text-center md:text-[10px]",
                )}
              >
                {conversas.length === 0
                  ? "Nenhuma conversa ainda."
                  : "Nenhum cliente encontrado."}
              </p>
            )}
            {conversasFiltradas.map((c) => {
              const nome = c.clientes?.nome || "Cliente";
              const naoLidas = Number(c.nao_lidas_admin_count ?? 0);
              const temNaoLida =
                (c.nao_lida_admin || naoLidas > 0) && ativa !== c.id;
              const prefixoAutor =
                c.ultima_mensagem_autor === "admin" ? "Você: " : "";
              const preview = previewMensagemInbox(c.ultima_mensagem_corpo);

              if (listaRecolhida) {
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => selecionarConversa(c.id)}
                    title={nome}
                    className={cn(
                      "relative flex w-full items-center justify-center border-b p-2 transition-colors hover:bg-muted/50",
                      ativa === c.id && "bg-muted",
                      temNaoLida && "bg-amber-50/80 dark:bg-amber-950/20",
                    )}
                  >
                    <Avatar size="default">
                      <AvatarFallback
                        className={cn(
                          "text-xs font-bold",
                          temNaoLida
                            ? "bg-cookie-primary text-white"
                            : "bg-secondary text-secondary-foreground",
                        )}
                      >
                        {iniciaisNome(nome)}
                      </AvatarFallback>
                    </Avatar>
                    {temNaoLida && (
                      <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-cookie-primary" />
                    )}
                  </button>
                );
              }

              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selecionarConversa(c.id)}
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
        </div>

        {/* Thread */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border bg-background">
          {!ativa ? (
            <p className="m-auto text-sm text-muted-foreground">
              Selecione uma conversa
            </p>
          ) : (
            <>
              <header className="flex shrink-0 items-center gap-3 border-b bg-muted/40 px-4 py-3">
                <Avatar size="lg">
                  <AvatarFallback className="bg-secondary text-sm font-semibold text-secondary-foreground">
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
                      : conversaAtiva
                        ? "Sem telefone"
                        : "Carregando…"}
                    {conversaAtiva?.pedido_id
                      ? ` · Pedido ${conversaAtiva.pedido_id.slice(0, 8)}`
                      : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void marcarComoNaoLida()}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Marcar como não lida"
                  >
                    <MailOpen size={16} />
                    <span className="hidden sm:inline">Não lida</span>
                  </button>
                  {conversaAtiva?.cliente_id && (
                    <Link
                      to={`/admin/clientes/${conversaAtiva.cliente_id}`}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
                      title="Ver cliente (pedidos e detalhes)"
                    >
                      <UserRound size={16} />
                      <span className="hidden sm:inline">Cliente</span>
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={abrirWhatsapp}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-[#25D366] hover:bg-[#25D366]/10"
                    title="Abrir WhatsApp"
                  >
                    <MessageCircle size={16} />
                    <span className="hidden sm:inline">WhatsApp</span>
                  </button>
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
