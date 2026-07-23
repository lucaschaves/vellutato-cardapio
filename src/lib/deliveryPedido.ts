import { ErroNegocioCheckout } from "./pedidos";
import { supabase } from "./supabase";
import type { ItemPedidoCompleto } from "./pedidos";

export type ModalidadeDelivery = "entrega" | "retirada";
export type StatusPagamentoDelivery = "aguardando" | "pago" | "na_loja";

export interface EnderecoSnapshot {
  cep: string;
  rua: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
  complemento?: string | null;
  referencia?: string | null;
  latitude: number;
  longitude: number;
}

export interface NovoPedidoDelivery {
  cliente_nome: string;
  cliente_celular: string | null;
  cliente_id: string | null;
  cupom_id: string | null;
  desconto: number;
  identificador: string;
  total: number;
  valor_total: number;
  itens: ItemPedidoCompleto[];
  modalidade: ModalidadeDelivery;
  status_pagamento: StatusPagamentoDelivery;
  taxa_entrega: number;
  subtotal_itens: number;
  cpf_nota: string | null;
  endereco: EnderecoSnapshot | null;
  distancia_km: number | null;
}

export async function criarPedidoDelivery(
  pedido: NovoPedidoDelivery,
): Promise<{ pedido_id: string; sequencia_pedido: number }> {
  const { data, error } = await supabase.rpc("criar_pedido_delivery", {
    p_cliente_nome: pedido.cliente_nome,
    p_cliente_celular: pedido.cliente_celular,
    p_cliente_id: pedido.cliente_id,
    p_cupom_id: pedido.cupom_id,
    p_desconto: pedido.desconto,
    p_identificador: pedido.identificador,
    p_total: pedido.total,
    p_valor_total: pedido.valor_total,
    p_itens: pedido.itens,
    p_modalidade: pedido.modalidade,
    p_status_pagamento: pedido.status_pagamento,
    p_taxa_entrega: pedido.taxa_entrega,
    p_subtotal_itens: pedido.subtotal_itens,
    p_cpf_nota: pedido.cpf_nota,
    p_endereco_json: pedido.endereco,
    p_distancia_km: pedido.distancia_km,
  });

  if (error) {
    const ehNegocio =
      /^(LOJA_FECHADA|LOJA_CHEIA):/.test(error.message) ||
      error.message.includes("Estoque insuficiente");
    const mensagem = error.message.replace(/^(LOJA_FECHADA|LOJA_CHEIA):\s*/, "");
    if (ehNegocio) throw new ErroNegocioCheckout(mensagem);
    throw new Error(mensagem);
  }

  return data as { pedido_id: string; sequencia_pedido: number };
}

export async function cancelarPedidoDeliveryAguardando(
  pedidoId: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc(
    "cancelar_pedido_delivery_aguardando",
    { p_pedido_id: pedidoId },
  );
  if (error) {
    console.error("[DELIVERY] cancelar aguardando", error.message);
    return false;
  }
  return Boolean(data);
}

export async function cancelarPedidosDeliveryExpirados(
  minutos = 30,
): Promise<number> {
  const { data, error } = await supabase.rpc(
    "cancelar_pedidos_delivery_sem_pagamento",
    { p_minutos: minutos },
  );
  if (error) {
    console.error("[DELIVERY] expirar pedidos", error.message);
    return 0;
  }
  return Number(data ?? 0);
}

export async function iniciarCheckoutAsaas(
  pedidoId: string,
  opts?: { email?: string | null },
): Promise<{
  checkout_id: string;
  checkout_url: string;
}> {
  const { data, error } = await supabase.functions.invoke(
    "criar-checkout-asaas",
    {
      body: {
        pedido_id: pedidoId,
        site_url: window.location.origin,
        email: opts?.email || undefined,
      },
    },
  );

  if (error) throw new Error(error.message);
  if (data?.erro) throw new Error(String(data.erro));
  if (!data?.checkout_url) {
    throw new Error("Link de pagamento não retornado pelo Asaas");
  }
  return {
    checkout_id: data.checkout_id as string,
    checkout_url: data.checkout_url as string,
  };
}

/** Confirma no Asaas se o webhook ainda não marcou o pedido como pago. */
export async function confirmarPagamentoAsaas(pedidoId: string): Promise<{
  status_pagamento: string;
  sincronizado?: boolean;
}> {
  const { data, error } = await supabase.functions.invoke(
    "confirmar-pagamento-asaas",
    { body: { pedido_id: pedidoId } },
  );
  if (error) throw new Error(error.message);
  if (data?.erro) throw new Error(String(data.erro));
  return {
    status_pagamento: String(data?.status_pagamento || "aguardando"),
    sincronizado: Boolean(data?.sincronizado),
  };
}

export interface ItemPedidoDelivery {
  id: string;
  quantidade: number;
  preco_unitario: number;
  observacoes: string | null;
  produtos: { nome: string } | null;
  pedido_item_adicionais: Array<{
    preco_aplicado: number;
    adicionais: { nome: string } | null;
  }>;
  pedido_item_combo_escolhas: Array<{
    nome_grupo: string;
    nome_produto: string;
    delta_preco: number;
  }>;
}

export async function buscarPedidoDelivery(pedidoId: string) {
  const { data, error } = await supabase
    .from("pedidos")
    .select(
      `
      id, sequencia_pedido, status, origem, modalidade, status_pagamento,
      identificador, cliente_nome, total, valor_total, taxa_entrega,
      subtotal_itens, tracking_url, voa_order_id, criado_em, endereco_json,
      asaas_checkout_id, cpf_nota, cliente_id, desconto_aplicado,
      pedido_itens (
        id, quantidade, preco_unitario, observacoes,
        produtos ( nome ),
        pedido_item_adicionais (
          preco_aplicado,
          adicionais ( nome )
        ),
        pedido_item_combo_escolhas (
          nome_grupo, nome_produto, delta_preco
        )
      )
    `,
    )
    .eq("id", pedidoId)
    .single();

  if (error) throw new Error(error.message);
  return data as typeof data & {
    pedido_itens: ItemPedidoDelivery[];
  };
}
