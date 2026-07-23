import { supabase } from "./supabase";

/** Textos e helpers compartilhados de notificação de status do pedido. */

export const FRASE_STATUS_PEDIDO: Record<string, string> = {
  pendente: "Recebemos o seu pedido e já vamos preparar! 🍪",
  em_producao: "Seu pedido está em preparo! 👨‍🍳",
  pronto: "Seu pedido está pronto! 🎉",
  entregue: "Pedido entregue. Obrigado pela preferência! ❤️",
  cancelado: "Seu pedido foi cancelado.",
  aguardando_pagamento: "Aguardando confirmação do pagamento.",
  pago: "Pagamento confirmado! Pedido na fila.",
};

export const LABEL_STATUS_CURTO: Record<string, string> = {
  pendente: "Recebido",
  em_producao: "Em preparo",
  pronto: "Pronto",
  entregue: "Entregue",
  cancelado: "Cancelado",
  aguardando_pagamento: "Aguardando pagamento",
  pago: "Pago",
};

export function fraseStatusPedido(status: string): string {
  return FRASE_STATUS_PEDIDO[status] || `Status atualizado: ${status}`;
}

export function labelStatusPedido(status: string): string {
  return LABEL_STATUS_CURTO[status] || status;
}

/** Texto que o cliente envia ao abrir o WhatsApp da loja (wa.me). */
export function textoInicioWhatsappAcompanhamento(
  sequencia: number | null | undefined,
  pedidoId: string,
): string {
  const num = sequencia != null ? `#${sequencia}` : "";
  return (
    `Olá! Gostaria de acompanhar o pedido ${num}`.trim() +
    `\n(Ref: ${pedidoId.slice(0, 8)})`
  );
}

export function montarLinkWhatsappLoja(
  numeroLojaDigitos: string | null | undefined,
  mensagem: string,
): string | null {
  const digitos = (numeroLojaDigitos || "").replace(/\D/g, "");
  if (digitos.length < 12) return null;
  return `https://wa.me/${digitos}?text=${encodeURIComponent(mensagem)}`;
}

/** Dispara push + WhatsApp (janela 24h) via Edge Function. */
export async function dispararNotificacaoStatusPedido(
  pedidoId: string,
  status: string,
): Promise<void> {
  const { error } = await supabase.functions.invoke("notificar-status-pedido", {
    body: { pedido_id: pedidoId, status },
  });
  if (error) {
    console.error("[NOTIFICAR] invoke:", error.message);
  }
}
