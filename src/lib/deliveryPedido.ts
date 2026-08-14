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
  /** Desconto aplicado sobre o frete (já refletido em taxa_entrega). */
  desconto_frete?: number;
  /** Acréscimo de chuva no frete (já refletido em taxa_entrega). */
  acrescimo_clima?: number;
  subtotal_itens: number;
  cpf_nota: string | null;
  endereco: EnderecoSnapshot | null;
  distancia_km: number | null;
  /** Horário de entrega/retirada (mesmo dia). Null = o quanto antes. */
  agendado_para?: string | null;
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
    p_desconto_frete: pedido.desconto_frete ?? 0,
    p_acrescimo_clima: pedido.acrescimo_clima ?? 0,
    p_agendado_para: pedido.agendado_para || null,
  });

  if (error) {
    const prefixosNegocio =
      /^(LOJA_FECHADA|LOJA_CHEIA|FORA_AREA|DELIVERY_INDISPONIVEL|AGENDAMENTO_INVALIDO):\s*/;
    const ehNegocio =
      prefixosNegocio.test(error.message) ||
      error.message.includes("Estoque insuficiente");
    const mensagem = error.message.replace(prefixosNegocio, "");
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

/** Prazo padrão para abandonar checkout Asaas sem pagamento (minutos). */
/** Alinhado ao mínimo do Asaas (`minutesToExpire` ≥ 10). */
export const MINUTOS_EXPIRA_PAGAMENTO_DELIVERY = 10;

export async function cancelarPedidosDeliveryExpirados(): Promise<number> {
  const { data, error } = await supabase.rpc(
    "expirar_pedidos_delivery_padrao",
  );
  if (error) {
    console.error("[DELIVERY] expirar pedidos", error.message);
    return 0;
  }
  return Number(data ?? 0);
}

export async function iniciarCheckoutAsaas(
  pedidoId: string,
  opts?: {
    email?: string | null;
    cpf?: string | null;
    forcarNovo?: boolean;
    clienteId?: string | null;
  },
): Promise<{
  checkout_id: string;
  checkout_url: string;
}> {
  const { data, error } = await supabase.functions.invoke(
    "criar-checkout-asaas",
    {
      body: {
        pedido_id: pedidoId,
        cliente_id: opts?.clienteId || undefined,
        site_url: window.location.origin,
        email: opts?.email || undefined,
        cpf: opts?.cpf?.replace(/\D/g, "") || undefined,
        forcar_novo: Boolean(opts?.forcarNovo),
        callback_pedido: Boolean(opts?.forcarNovo),
      },
    },
  );

  if (data?.erro) throw new Error(String(data.erro));
  if (error) {
    // FunctionsHttpError guarda o JSON retornado pela Edge Function em context.
    // Sem isso o usuário só vê "Edge Function returned a non-2xx status code".
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      let mensagemContexto: string | null = null;
      try {
        const body = (await context.clone().json()) as {
          erro?: unknown;
          detalhes?: unknown;
        };
        if (body?.erro) mensagemContexto = String(body.erro);
      } catch {
        // Resposta sem JSON: usa a mensagem padrão do SDK abaixo.
      }
      if (mensagemContexto) throw new Error(mensagemContexto);
    }
    throw new Error(error.message || "Falha na comunicação com o Asaas.");
  }
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
  produto_id?: string;
  quantidade: number;
  preco_unitario: number;
  observacoes: string | null;
  modo_consumo?: string | null;
  produtos: {
    nome: string;
    imagem_url?: string | null;
    preco?: number;
    preco_promocional?: number | null;
    em_promocao?: boolean | null;
    disponibilidade?: string | null;
    controlar_estoque?: boolean | null;
    quantidade_estoque?: number | null;
  } | null;
  pedido_item_adicionais: Array<{
    adicional_id?: string | null;
    preco_aplicado: number;
    adicionais: { nome: string } | null;
  }>;
  pedido_item_combo_escolhas: Array<{
    grupo_id?: string | null;
    produto_escolhido_id?: string | null;
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
      identificador, cliente_nome, cliente_celular, total, valor_total, taxa_entrega,
      subtotal_itens, tracking_url, voa_order_id, criado_em, endereco_json,
      asaas_checkout_id, cpf_nota, cliente_id, desconto_aplicado, agendado_para,
      clientes ( email ),
      pedido_itens (
        id, produto_id, quantidade, preco_unitario, observacoes, modo_consumo,
        produtos (
          nome, imagem_url, preco, preco_promocional, em_promocao,
          disponibilidade, controlar_estoque, quantidade_estoque
        ),
        pedido_item_adicionais (
          adicional_id, preco_aplicado,
          adicionais ( nome )
        ),
        pedido_item_combo_escolhas (
          grupo_id, produto_escolhido_id, nome_grupo, nome_produto, delta_preco
        )
      )
    `,
    )
    .eq("id", pedidoId)
    .single();

  if (error) throw new Error(error.message);
  return data as typeof data & {
    pedido_itens: ItemPedidoDelivery[];
    agendado_para: string | null;
  };
}

/** Cupom de retorno gerado a partir deste pedido (se existir). */
export async function buscarCupomRetornoDoPedido(
  pedidoId: string,
): Promise<{ codigo: string; validade: string | null; ativo: boolean } | null> {
  const { data, error } = await supabase
    .from("cupons")
    .select("codigo, validade, ativo, usos, limite_uso")
    .eq("pedido_origem_id", pedidoId)
    .maybeSingle();
  if (error) {
    console.warn("[CUPOM] retorno:", error.message);
    return null;
  }
  if (!data) return null;
  const usos = Number(data.usos ?? 0);
  const limite = data.limite_uso;
  if (!data.ativo) return { ...data, ativo: false };
  if (limite != null && usos >= limite) return { ...data, ativo: false };
  if (data.validade && new Date(data.validade).getTime() < Date.now()) {
    return { ...data, ativo: false };
  }
  return {
    codigo: data.codigo,
    validade: data.validade,
    ativo: true,
  };
}
