import { Check, CheckCheck, Send } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
} from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import type { MensagemChat } from "@/lib/deliveryChat";
import { cn } from "@/lib/utils";

export function iniciaisNome(nome: string | null | undefined): string {
  const partes = (nome || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (partes.length === 0) return "?";
  return partes.map((p) => p[0]?.toUpperCase() ?? "").join("");
}

function formatarHoraMensagem(iso: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

type Perspectiva = "cliente" | "admin";

type Props = {
  mensagens: MensagemChat[];
  /** Quem está vendo o chat: mensagens próprias vão para a direita. */
  perspectiva: Perspectiva;
  nomeCliente?: string | null;
  nomeLoja?: string;
  texto: string;
  onTextoChange: (v: string) => void;
  onEnviar: () => void;
  enviando?: boolean;
  placeholder?: string;
  className?: string;
  vazio?: string;
};

export function ChatThread({
  mensagens,
  perspectiva,
  nomeCliente = "Cliente",
  nomeLoja = "Vellutato",
  texto,
  onTextoChange,
  onEnviar,
  enviando = false,
  placeholder = "Digite sua mensagem…",
  className,
  vazio = "Nenhuma mensagem ainda.",
}: Props) {
  const itens = useMemo(() => mensagens, [mensagens]);
  const inputRef = useRef<HTMLInputElement>(null);
  const estavaEnviando = useRef(false);

  const focarInput = () => {
    inputRef.current?.focus();
  };

  const dispararEnvio = () => {
    if (enviando || !texto.trim()) return;
    onEnviar();
    // Clique no botão tira o foco; devolve na hora.
    queueMicrotask(focarInput);
  };

  // Quando o envio termina (enviando true → false), garante o foco de volta.
  useEffect(() => {
    if (estavaEnviando.current && !enviando) {
      focarInput();
    }
    estavaEnviando.current = enviando;
  }, [enviando]);

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <MessageScrollerProvider
        autoScroll
        defaultScrollPosition="end"
        scrollPreviousItemPeek={0}
      >
        <MessageScroller className="min-h-0 flex-1 bg-muted/30">
          <MessageScrollerViewport>
            <MessageScrollerContent
              className={cn(
                "gap-3 p-4",
                itens.length === 0 && "justify-center",
              )}
            >
              {itens.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  {vazio}
                </p>
              ) : (
                itens.map((m) => {
                  const propria = m.autor === perspectiva;
                  const nome =
                    m.autor === "cliente" ? nomeCliente : nomeLoja;
                  const visualizada =
                    perspectiva === "admin" &&
                    propria &&
                    m.lida_cliente === true;
                  const enviadaPropria =
                    perspectiva === "admin" && propria;
                  return (
                    <MessageScrollerItem key={m.id} messageId={m.id}>
                      <Message align={propria ? "end" : "start"}>
                        <MessageAvatar>
                          <Avatar size="sm">
                            <AvatarFallback
                              className={cn(
                                propria
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-secondary text-secondary-foreground",
                              )}
                            >
                              {iniciaisNome(nome)}
                            </AvatarFallback>
                          </Avatar>
                        </MessageAvatar>
                        <MessageContent>
                          <Bubble
                            variant={propria ? "default" : "secondary"}
                            align={propria ? "end" : "start"}
                          >
                            <BubbleContent className="whitespace-pre-wrap">
                              {m.corpo}
                            </BubbleContent>
                          </Bubble>
                          <MessageFooter
                            className={cn(
                              "gap-1",
                              propria && "justify-end",
                            )}
                          >
                            <span>{formatarHoraMensagem(m.criado_em)}</span>
                            {enviadaPropria && (
                              <span
                                className={cn(
                                  "inline-flex items-center",
                                  visualizada
                                    ? "text-sky-500"
                                    : "text-muted-foreground",
                                )}
                                title={
                                  visualizada
                                    ? "Visualizado pelo cliente"
                                    : "Enviado"
                                }
                              >
                                {visualizada ? (
                                  <CheckCheck size={14} aria-hidden />
                                ) : (
                                  <Check size={14} aria-hidden />
                                )}
                              </span>
                            )}
                          </MessageFooter>
                        </MessageContent>
                      </Message>
                    </MessageScrollerItem>
                  );
                })
              )}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          {itens.length > 0 && <MessageScrollerButton direction="end" />}
        </MessageScroller>
      </MessageScrollerProvider>

      <div className="flex shrink-0 items-center gap-2 border-t bg-background p-3">
        <Input
          ref={inputRef}
          value={texto}
          onChange={(e) => onTextoChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              dispararEnvio();
            }
          }}
        />
        <Button
          type="button"
          disabled={enviando || !texto.trim()}
          onClick={dispararEnvio}
          aria-label="Enviar"
        >
          <Send data-icon="inline-start" />
          Enviar
        </Button>
      </div>
    </div>
  );
}
