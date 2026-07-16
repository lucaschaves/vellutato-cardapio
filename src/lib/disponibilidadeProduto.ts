export type DisponibilidadeProduto = "loja" | "levar" | "ambos";
export type ModoConsumoItem = "loja" | "levar";

export function normalizarDisponibilidade(
  valor: string | null | undefined,
): DisponibilidadeProduto {
  if (valor === "loja" || valor === "levar" || valor === "ambos") return valor;
  return "ambos";
}

export function modoConsumoPadrao(
  disponibilidade: DisponibilidadeProduto,
): ModoConsumoItem {
  if (disponibilidade === "levar") return "levar";
  return "loja";
}

export function modoConsumoPermitido(
  disponibilidade: DisponibilidadeProduto,
  modo: ModoConsumoItem,
): boolean {
  if (disponibilidade === "ambos") return true;
  return disponibilidade === modo;
}

export function rotuloDisponibilidade(
  disponibilidade: DisponibilidadeProduto,
): string | null {
  if (disponibilidade === "loja") return "Só para comer aqui";
  if (disponibilidade === "levar") return "Só para levar";
  return null;
}

export function rotuloModoConsumo(modo: ModoConsumoItem): string {
  return modo === "levar" ? "Para levar" : "Comer na loja";
}

export function itensComConflitoConsumo<
  T extends {
    disponibilidade?: DisponibilidadeProduto;
    modoConsumo?: ModoConsumoItem;
    nome: string;
  },
>(itens: T[]): T[] {
  return itens.filter((item) => {
    const disp = normalizarDisponibilidade(item.disponibilidade);
    const modo = item.modoConsumo || modoConsumoPadrao(disp);
    return !modoConsumoPermitido(disp, modo);
  });
}

/** Monta origem/identificador do pedido a partir da mesa e dos modos dos itens. */
export function montarOrigemIdentificadorPedido(opts: {
  mesa: string | null;
  modos: ModoConsumoItem[];
}): { origem: "mesa" | "balcao"; identificador: string } {
  const mesa = opts.mesa?.trim() || null;
  const base = mesa
    ? mesa.toLowerCase().startsWith("mesa")
      ? mesa
      : `Mesa ${mesa}`
    : "Balcão";

  const temLoja = opts.modos.some((m) => m === "loja");
  const temLevar = opts.modos.some((m) => m === "levar");

  if (temLoja && temLevar) {
    return {
      origem: "balcao",
      identificador: `${base} (MISTO)`,
    };
  }

  if (temLevar) {
    return {
      origem: "balcao",
      identificador: `${base} (PARA VIAGEM)`,
    };
  }

  return {
    origem: mesa ? "mesa" : "mesa",
    identificador: base,
  };
}
