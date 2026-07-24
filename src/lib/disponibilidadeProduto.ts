export type DisponibilidadeProduto = "loja" | "levar" | "ambos";
export type ModoConsumoItem = "loja" | "levar";

const CHAVE_TIPO_CONSUMO = "tipo_consumo";

export function normalizarDisponibilidade(
  valor: string | null | undefined,
): DisponibilidadeProduto {
  if (valor === "loja" || valor === "levar" || valor === "ambos") return valor;
  return "ambos";
}

export function lerTipoConsumo(): ModoConsumoItem | null {
  const salvo = localStorage.getItem(CHAVE_TIPO_CONSUMO);
  if (salvo === "loja" || salvo === "levar") return salvo;
  // Compatibilidade com valor antigo "viagem"
  if (salvo === "viagem") return "levar";
  return null;
}

export function salvarTipoConsumo(modo: ModoConsumoItem) {
  localStorage.setItem(CHAVE_TIPO_CONSUMO, modo);
}

export function limparTipoConsumo() {
  localStorage.removeItem(CHAVE_TIPO_CONSUMO);
}

/** Produto aparece no cardápio filtrado pelo modo escolhido no onboarding. */
export function produtoCompativelComModo(
  disponibilidade: string | null | undefined,
  modo: ModoConsumoItem,
): boolean {
  const disp = normalizarDisponibilidade(disponibilidade);
  return modoConsumoPermitido(disp, modo);
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

export function rotuloDisponibilidadeCurto(
  disponibilidade: DisponibilidadeProduto,
): string {
  if (disponibilidade === "loja") return "Só loja";
  if (disponibilidade === "levar") return "Só levar";
  return "Loja e levar";
}

/** Adicional aparece conforme o modo escolhido pelo cliente (loja / levar). */
export function adicionalCompativelComModo(
  disponibilidade: string | null | undefined,
  modo: ModoConsumoItem,
): boolean {
  return produtoCompativelComModo(disponibilidade, modo);
}

export function rotuloModoConsumo(modo: ModoConsumoItem): string {
  return modo === "levar" ? "Para levar" : "Comer na loja";
}

/** Monta origem/identificador do pedido a partir da mesa e do modo da sessão. */
export function montarOrigemIdentificadorPedido(opts: {
  mesa: string | null;
  modo: ModoConsumoItem;
}): { origem: "mesa" | "balcao"; identificador: string } {
  const mesa = opts.mesa?.trim() || null;
  const base = mesa
    ? mesa.toLowerCase().startsWith("mesa")
      ? mesa
      : `Mesa ${mesa}`
    : "Balcão";

  if (opts.modo === "levar") {
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
