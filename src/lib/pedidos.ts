import { supabase } from "./supabase";

export async function processarPedidoPosCriacao(
  pedidoId: string,
  cupomId?: string | null,
) {
  const { error } = await supabase.rpc("processar_pedido_pos_criacao", {
    p_pedido_id: pedidoId,
    p_cupom_id: cupomId || null,
  });

  if (error) throw new Error(error.message);
}

export async function reverterPedidoFalho(pedidoId: string) {
  const { error } = await supabase.from("pedidos").delete().eq("id", pedidoId);
  if (error) console.error("[CHECKOUT] Falha ao reverter pedido:", error.message);
}
