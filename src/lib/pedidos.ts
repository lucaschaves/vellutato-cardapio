import { supabase } from "./supabase";

export interface ItemPedidoCompleto {
  produto_id: string;
  quantidade: number;
  preco_unitario: number;
  observacoes: string | null;
  modo_consumo: string;
  adicionais: Array<{ adicional_id: string; preco_aplicado: number }>;
  combo_escolhas: Array<{
    grupo_id: string;
    produto_escolhido_id: string;
    nome_grupo: string;
    nome_produto: string;
    delta_preco: number;
  }>;
}

export interface NovoPedidoCompleto {
  cliente_nome: string;
  cliente_celular: string | null;
  cliente_id: string | null;
  cupom_id: string | null;
  desconto: number;
  origem: string;
  identificador: string;
  total: number;
  valor_total: number;
  itens: ItemPedidoCompleto[];
}

/** Erro de negócio (loja fechada, estoque etc.): a mensagem é amigável e pode ir direto pro cliente. */
export class ErroNegocioCheckout extends Error {}

/**
 * Cria o pedido inteiro (pedido + itens + adicionais + combos + estoque +
 * cupom) numa única transação no banco. Falhou qualquer etapa, nada é gravado.
 */
export async function criarPedidoCompleto(
  pedido: NovoPedidoCompleto,
): Promise<{ pedido_id: string; sequencia_pedido: number }> {
  const { data, error } = await supabase.rpc("criar_pedido_completo", {
    p_cliente_nome: pedido.cliente_nome,
    p_cliente_celular: pedido.cliente_celular,
    p_cliente_id: pedido.cliente_id,
    p_cupom_id: pedido.cupom_id,
    p_desconto: pedido.desconto,
    p_origem: pedido.origem,
    p_identificador: pedido.identificador,
    p_total: pedido.total,
    p_valor_total: pedido.valor_total,
    p_itens: pedido.itens,
  });

  if (error) {
    // Prefixos usados pela função SQL para erros esperados de negócio
    const ehNegocio =
      /^(LOJA_FECHADA|LOJA_CHEIA):/.test(error.message) ||
      error.message.includes("Estoque insuficiente");
    const mensagem = error.message.replace(/^(LOJA_FECHADA|LOJA_CHEIA):\s*/, "");
    if (ehNegocio) throw new ErroNegocioCheckout(mensagem);
    throw new Error(mensagem);
  }

  return data as { pedido_id: string; sequencia_pedido: number };
}