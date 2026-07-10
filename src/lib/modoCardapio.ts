/** Contexto do cardápio via query string (?mesa=… | ?retirada=1). */

export type TipoContextoCardapio = "mesa" | "retirada" | "padrao";

export interface ContextoCardapio {
  tipo: TipoContextoCardapio;
  /** Número/código da mesa, se houver */
  mesa: string | null;
  /** Valor gravado em pedidos.identificador */
  identificador: string;
  /** Força tipo_consumo no localStorage ao entrar pelo link */
  tipoConsumoForcado: "loja" | "viagem" | null;
  /** Texto curto na UI (carrinho, header) */
  rotuloDestino: string;
  /** Após pedido, permanece no cardápio (não volta à home limpando sessão) */
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
      tipoConsumoForcado: "loja",
      rotuloDestino: mesa.toLowerCase().startsWith("mesa")
        ? mesa
        : `Mesa ${mesa}`,
      sessaoPersistente: true,
    };
  }

  const retiradaRaw = params.get("retirada");
  const retiradaAtiva =
    retiradaRaw !== null &&
    retiradaRaw !== "" &&
    retiradaRaw !== "0" &&
    retiradaRaw.toLowerCase() !== "false";

  if (retiradaAtiva) {
    return {
      tipo: "retirada",
      mesa: null,
      identificador: "Retirada",
      tipoConsumoForcado: "viagem",
      rotuloDestino: "Retirada na loja",
      sessaoPersistente: true,
    };
  }

  return {
    tipo: "padrao",
    mesa: null,
    identificador: "Balcão",
    tipoConsumoForcado: null,
    rotuloDestino: "Balcão",
    sessaoPersistente: false,
  };
}

/** Link absoluto para pedidos de retirada (enviar ao cliente). */
export function urlCardapioRetirada(origin = window.location.origin): string {
  return `${origin}/cardapio?retirada=1`;
}
