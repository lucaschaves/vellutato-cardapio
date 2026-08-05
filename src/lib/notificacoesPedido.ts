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

export type DadosWhatsappAcompanhamento = {
  sequencia: number | null | undefined;
  pedidoId: string;
  clienteNome?: string | null;
  clienteCelular?: string | null;
  modalidade?: string | null;
  statusRotulo?: string | null;
  total?: number | null;
  enderecoLinha?: string | null;
  itensResumo?: string[];
  passosTimeline?: { titulo: string; estado: string }[];
  urlAcompanhar?: string | null;
};

/** Texto que o cliente envia ao abrir o WhatsApp da loja (wa.me). */
export function textoInicioWhatsappAcompanhamento(
  sequencia: number | null | undefined,
  pedidoId: string,
): string {
  return textoWhatsappAcompanhamentoPedido({ sequencia, pedidoId });
}

/** Mensagem completa: cliente + pedido + passo a passo. */
export function textoWhatsappAcompanhamentoPedido(
  dados: DadosWhatsappAcompanhamento,
): string {
  const num = dados.sequencia != null ? `#${dados.sequencia}` : "";
  const linhas: string[] = [
    `Olá! Gostaria de acompanhar o pedido ${num}`.trim(),
    `(Ref: ${dados.pedidoId.slice(0, 8)})`,
    "",
  ];

  if (dados.clienteNome?.trim()) {
    linhas.push(`Cliente: ${dados.clienteNome.trim()}`);
  }
  if (dados.clienteCelular?.trim()) {
    linhas.push(`Telefone: ${dados.clienteCelular.trim()}`);
  }
  if (dados.modalidade?.trim()) {
    const mod =
      dados.modalidade.toLowerCase() === "retirada" ? "Retirada" : "Entrega";
    linhas.push(`Modalidade: ${mod}`);
  }
  if (dados.enderecoLinha?.trim()) {
    linhas.push(`Endereço: ${dados.enderecoLinha.trim()}`);
  }
  if (dados.statusRotulo?.trim()) {
    linhas.push(`Status atual: ${dados.statusRotulo.trim()}`);
  }
  if (dados.total != null && Number.isFinite(dados.total)) {
    linhas.push(
      `Total: R$ ${Number(dados.total).toFixed(2).replace(".", ",")}`,
    );
  }

  if (dados.itensResumo && dados.itensResumo.length > 0) {
    linhas.push("", "Itens:");
    for (const item of dados.itensResumo) {
      linhas.push(`• ${item}`);
    }
  }

  if (dados.passosTimeline && dados.passosTimeline.length > 0) {
    linhas.push("", "Passo a passo:");
    for (const passo of dados.passosTimeline) {
      const marca =
        passo.estado === "completed"
          ? "✅"
          : passo.estado === "current"
            ? "▶️"
            : passo.estado === "cancelled"
              ? "❌"
              : "○";
      linhas.push(`${marca} ${passo.titulo}`);
    }
  }

  if (dados.urlAcompanhar?.trim()) {
    linhas.push("", `Acompanhar online: ${dados.urlAcompanhar.trim()}`);
  }

  return linhas.join("\n");
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
