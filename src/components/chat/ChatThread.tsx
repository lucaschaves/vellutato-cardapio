import { Send } from "lucide-react";
import { useMemo } from "react";
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

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <MessageScrollerProvider autoScroll defaultScrollPosition="end">
        <MessageScroller className="min-h-0 flex-1 bg-muted/30">
          <MessageScrollerViewport>
            <MessageScrollerContent className="gap-3 p-4">
              {itens.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  {vazio}
                </p>
              ) : (
                itens.map((m) => {
                  const propria = m.autor === perspectiva;
                  const nome =
                    m.autor === "cliente" ? nomeCliente : nomeLoja;
                  return (
                    <MessageScrollerItem
                      key={m.id}
                      messageId={m.id}
                      scrollAnchor={propria}
                    >
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
                          <MessageFooter>
                            {formatarHoraMensagem(m.criado_em)}
                          </MessageFooter>
                        </MessageContent>
                      </Message>
                    </MessageScrollerItem>
                  );
                })
              )}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton direction="end" />
        </MessageScroller>
      </MessageScrollerProvider>

      <div className="flex shrink-0 items-center gap-2 border-t bg-background p-3">
        <Input
          value={texto}
          onChange={(e) => onTextoChange(e.target.value)}
          placeholder={placeholder}
          disabled={enviando}
          className="flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onEnviar();
            }
          }}
        />
        <Button
          type="button"
          disabled={enviando || !texto.trim()}
          onClick={onEnviar}
          aria-label="Enviar"
        >
          <Send data-icon="inline-start" />
          Enviar
        </Button>
      </div>
    </div>
  );
}
