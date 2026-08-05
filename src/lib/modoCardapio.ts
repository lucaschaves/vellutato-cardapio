/** Contexto do cardápio via query string (?mesa=…). */

const CHAVE_MODO_TOTEN = "modo_toten";

/**
 * Ativa/desativa o modo totem no dispositivo (configuração persistente,
 * feita nas opções de exibição do cardápio). Independe da URL.
 */
export function marcarModoToten(ativo: boolean) {
  if (ativo) {
    localStorage.setItem(CHAVE_MODO_TOTEN, "1");
  } else {
    localStorage.removeItem(CHAVE_MODO_TOTEN);
  }
}

export function emModoToten(): boolean {
  if (typeof window === "undefined") return false;
  // Rotas /totem (e legado /cardapio-toten) ativam o modo totem
  const path = window.location.pathname;
  if (path.startsWith("/totem") || path.startsWith("/cardapio-toten")) {
    return true;
  }
  return localStorage.getItem(CHAVE_MODO_TOTEN) === "1";
}

/**
 * Limpa a identificação do cliente ao encerrar a sessão de pedido.
 * Fora do totem mantém o celular salvo — é o identificador durável do
 * cliente; nome/cupons são sempre rebuscados no sistema ao abrir o site.
 */
export function limparIdentificacaoCliente() {
  localStorage.removeItem("cliente_nome");
  if (emModoToten()) {
    localStorage.removeItem("cliente_celular");
  }
}

/** Tela inicial do cardápio (vídeo / identificação). Totem usa /totem. */
export function urlBoasVindasCardapio(): string {
  return emModoToten() ? "/totem" : "/inicio";
}

/** Encerra a sessão local do cliente (sair / trocar conta), inclusive o celular. */
export function encerrarSessaoCliente() {
  localStorage.removeItem("cliente_nome");
  localStorage.removeItem("cliente_celular");
}

export type TipoContextoCardapio = "mesa" | "padrao";

export interface ContextoCardapio {
  tipo: TipoContextoCardapio;
  /** Número/código da mesa (só identificação na cozinha) */
  mesa: string | null;
  /** Prefixo do identificador do pedido */
  identificador: string;
  /** Texto curto na UI */
  rotuloDestino: string;
  /** Após pedido, permanece no cardápio */
  sessaoPersistente: boolean;
}

export function lerContextoCardapio(search: string): ContextoCardapio {
  const params = new URLSearchParams(search);
  const mesa = params.get("mesa")?.trim();

  if (mesa) {
    return {
      tipo: "mesa",
      mesa,
      identificador: mesa,
      rotuloDestino: mesa.toLowerCase().startsWith("mesa")
        ? mesa
        : `Mesa ${mesa}`,
      sessaoPersistente: true,
    };
  }

  return {
    tipo: "padrao",
    mesa: null,
    identificador: "Balcão",
    rotuloDestino: "Balcão",
    sessaoPersistente: false,
  };
}
