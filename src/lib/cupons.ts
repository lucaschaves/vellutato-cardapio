import { supabase } from "./supabase";

export interface CupomValidado {
  id: string;
  codigo: string;
  tipo: string;
  valor: number;
  desconto: number;
  usos: number | null;
  /** Se false (padrão), não combina com outros no mesmo pedido. */
  acumulativo: boolean;
}

interface RespostaValidarCupom {
  ok: boolean;
  erro?: string;
  cupom?: {
    id: string;
    codigo: string;
    tipo: string;
    valor: number;
    desconto: number;
    usos: number | null;
    acumulativo?: boolean;
  };
}

/**
 * Valida cupom usando apenas o subtotal dos produtos (itens + adicionais + combos).
 * Frete e taxa de entrega não entram no mínimo nem na base do desconto.
 */
export async function validarCupom(
  codigo: string,
  subtotalItens: number,
  clienteId?: string | null,
): Promise<{ ok: true; cupom: CupomValidado } | { ok: false; erro: string }> {
  const codigoLimpo = codigo.trim().toUpperCase();
  if (!codigoLimpo) {
    return { ok: false, erro: "Informe um código de cupom." };
  }

  const { data, error } = await supabase.rpc("validar_cupom", {
    p_codigo: codigoLimpo,
    p_subtotal: subtotalItens,
    p_cliente_id: clienteId || null,
  });

  if (error) throw new Error(error.message);

  const resposta = data as RespostaValidarCupom;

  if (!resposta?.ok || !resposta.cupom) {
    return { ok: false, erro: resposta?.erro || "Cupom inválido." };
  }

  return {
    ok: true,
    cupom: {
      id: resposta.cupom.id,
      codigo: resposta.cupom.codigo,
      tipo: resposta.cupom.tipo,
      valor: Number(resposta.cupom.valor),
      desconto: Number(resposta.cupom.desconto),
      usos: resposta.cupom.usos,
      acumulativo: Boolean(resposta.cupom.acumulativo),
    },
  };
}

/** Resultado ao tentar aplicar cupom no carrinho (regras de acumulação). */
export type ResultadoAplicarCupomCarrinho =
  | { ok: true; modo: "unico" | "empilhado" | "substituido" }
  | { ok: false; erro: string };

export function tentarMontarCuponsAplicados(
  atuais: CupomValidado[],
  novo: CupomValidado,
): ResultadoAplicarCupomCarrinho & { cupons?: CupomValidado[] } {
  if (atuais.some((c) => c.id === novo.id)) {
    return { ok: false, erro: "Este cupom já está aplicado." };
  }

  if (atuais.length === 0) {
    return { ok: true, modo: "unico", cupons: [novo] };
  }

  const todosAcumulativos =
    novo.acumulativo && atuais.every((c) => c.acumulativo);

  if (todosAcumulativos) {
    return { ok: true, modo: "empilhado", cupons: [...atuais, novo] };
  }

  // Padrão: não acumula — substitui o(s) cupom(ns) atual(is).
  return { ok: true, modo: "substituido", cupons: [novo] };
}

export async function anexarCuponsPedido(
  pedidoId: string,
  cupons: CupomValidado[],
): Promise<void> {
  if (!pedidoId || cupons.length === 0) return;

  const { error } = await supabase.rpc("anexar_cupons_pedido", {
    p_pedido_id: pedidoId,
    p_cupons: cupons.map((c) => ({
      cupom_id: c.id,
      desconto: c.desconto,
    })),
  });

  if (error) {
    console.error("[CUPOM] anexar_cupons_pedido", error.message);
  }
}

/** Revalida cupons do carrinho contra o subtotal atual (somente itens, sem frete). */
export async function revalidarCuponsAplicados(
  cupons: CupomValidado[],
  subtotalItens: number,
  clienteId?: string | null,
): Promise<
  | { ok: true; cupons: CupomValidado[] }
  | { ok: false; erro: string; codigo?: string }
> {
  const atualizados: CupomValidado[] = [];

  for (const cupom of cupons) {
    const resultado = await validarCupom(cupom.codigo, subtotalItens, clienteId);
    if (!resultado.ok) {
      return { ok: false, erro: resultado.erro, codigo: cupom.codigo };
    }
    atualizados.push(resultado.cupom);
  }

  return { ok: true, cupons: atualizados };
}
