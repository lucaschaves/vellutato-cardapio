import { lancarErroRpcPedido } from "./errosCliente";
import { supabase } from "./supabase";

export { ErroNegocioCheckout } from "./errosCliente";

export interface ItemPedidoCompleto {
  produto_id: string;
  quantidade: number;
  preco_unitario: number;
  observacoes: string | null;
  modo_consumo: string;
  modo_encomenda?: "pronto" | "encomenda" | null;
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
  /** Retirada mínima quando há itens encomenda (mesa/balcão). */
  agendado_para?: string | null;
}

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
    p_agendado_para: pedido.agendado_para || null,
  });

  if (error) {
    lancarErroRpcPedido(error, "criar_pedido", {
      clienteId: pedido.cliente_id,
      props: { origem: pedido.origem },
    });
  }

  return data as { pedido_id: string; sequencia_pedido: number };
}