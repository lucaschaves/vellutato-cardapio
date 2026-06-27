import { supabase } from "./supabase";
import { normalizarTelefoneParaSalvar } from "./telefone";

export interface ItemMeuPedido {
  quantidade: number;
  nome: string;
  observacoes: string | null;
}

export interface MeuPedido {
  id: string;
  sequencia_pedido: number;
  status: string;
  total: number | null;
  identificador: string;
  criado_em: string;
  desconto_aplicado: number | null;
  itens: ItemMeuPedido[];
}

export async function buscarMeusPedidos(
  celular: string,
): Promise<MeuPedido[]> {
  const celularNormalizado = normalizarTelefoneParaSalvar(celular);
  if (celularNormalizado.length < 10) {
    return [];
  }

  const { data, error } = await supabase.rpc("buscar_meus_pedidos", {
    p_celular: celularNormalizado,
  });

  if (error) throw new Error(error.message);
  if (!data || !Array.isArray(data)) return [];

  return data as MeuPedido[];
}

export const STATUS_PEDIDO_CLIENTE: Record<string, string> = {
  pendente: "Aguardando cozinha",
  em_producao: "Em preparo",
  pronto: "Pronto para retirar",
  entregue: "Entregue",
  pago: "Finalizado",
  cancelado: "Cancelado",
};
