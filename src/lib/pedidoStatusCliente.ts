/** Status / timeline do pedido no canal delivery (visão do cliente). */

export const LABEL_STATUS_PEDIDO: Record<string, string> = {
  pendente: "Recebido",
  em_producao: "Em preparo",
  pronto: "Pronto",
  entregue: "Entregue",
  cancelado: "Cancelado",
  pago: "Aguardando",
  aguardando_pagamento: "Aguardando pagamento",
  em_rota: "Em rota",
};

export type PedidoStatusResumo = {
  status: string;
  status_pagamento?: string | null;
  tracking_url?: string | null;
  modalidade?: string | null;
};

/** Pedidos que ainda não foram finalizados (badge + seção "Em andamento"). */
export function pedidoEmAndamento(p: PedidoStatusResumo): boolean {
  const st = p.status;
  if (st === "entregue" || st === "cancelado") return false;
  return true;
}

export function pedidoEmRota(p: PedidoStatusResumo): boolean {
  if (!pedidoEmAndamento(p)) return false;
  if (!p.tracking_url) return false;
  const st = p.status;
  return st === "pronto" || st === "em_producao" || st === "pendente";
}

export function rotuloStatusCliente(p: PedidoStatusResumo): string {
  if (p.status === "cancelado") return LABEL_STATUS_PEDIDO.cancelado;
  if (p.status === "entregue") return LABEL_STATUS_PEDIDO.entregue;

  if (
    p.status === "aguardando_pagamento" ||
    p.status_pagamento === "aguardando"
  ) {
    return LABEL_STATUS_PEDIDO.aguardando_pagamento;
  }

  if (pedidoEmRota(p)) return LABEL_STATUS_PEDIDO.em_rota;
  return LABEL_STATUS_PEDIDO[p.status] || p.status;
}

export type PassoTimeline = {
  id: string;
  titulo: string;
  descricao?: string;
  /** completed | current | upcoming | cancelled */
  estado: "completed" | "current" | "upcoming" | "cancelled";
};

/**
 * Timeline fixa (sem histórico de horários).
 * Destaca o passo atual com base no status / tracking.
 */
export function montarTimelinePedido(p: PedidoStatusResumo): PassoTimeline[] {
  const entrega = (p.modalidade || "").toLowerCase() === "entrega";
  const cancelado = p.status === "cancelado";
  const entregue = p.status === "entregue";

  const pagamentoOk =
    p.status_pagamento === "pago" ||
    p.status_pagamento === "na_loja" ||
    (p.status !== "aguardando_pagamento" &&
      p.status_pagamento !== "aguardando");

  const ordemIds = [
    "pagamento",
    "recebido",
    "preparo",
    "pronto",
    ...(entrega ? (["rota"] as const) : []),
    "entregue",
  ];

  let atual = 0;
  if (cancelado) {
    // marca até onde chegou + cancelado no fim visual
  } else if (entregue) {
    atual = ordemIds.length - 1;
  } else if (pedidoEmRota(p)) {
    atual = ordemIds.indexOf("rota");
  } else if (p.status === "pronto") {
    atual = ordemIds.indexOf("pronto");
  } else if (p.status === "em_producao") {
    atual = ordemIds.indexOf("preparo");
  } else if (p.status === "pendente" || p.status === "pago") {
    atual = ordemIds.indexOf("recebido");
  } else if (!pagamentoOk) {
    atual = ordemIds.indexOf("pagamento");
  } else {
    atual = ordemIds.indexOf("recebido");
  }

  const meta: Record<string, { titulo: string; descricao?: string }> = {
    pagamento: {
      titulo: "Pagamento",
      descricao: pagamentoOk
        ? "Pagamento confirmado"
        : "Aguardando confirmação do pagamento",
    },
    recebido: {
      titulo: "Pedido recebido",
      descricao: "A loja recebeu seu pedido",
    },
    preparo: {
      titulo: "Em preparo",
      descricao: "A cozinha está preparando",
    },
    pronto: {
      titulo: entrega ? "Pronto para entrega" : "Pronto para retirada",
      descricao: entrega
        ? "Pedido embalado e pronto"
        : "Pode retirar na loja",
    },
    rota: {
      titulo: "Em rota",
      descricao: p.tracking_url
        ? "Entregador a caminho"
        : "Aguardando saída para entrega",
    },
    entregue: {
      titulo: entrega ? "Entregue" : "Retirado",
      descricao: "Pedido finalizado",
    },
  };

  if (cancelado) {
    return ordemIds.map((id, i): PassoTimeline => {
      const m = meta[id];
      const passou =
        id === "pagamento"
          ? pagamentoOk
          : id === "recebido"
            ? ["pendente", "em_producao", "pronto", "entregue"].includes(
                p.status,
              ) || pagamentoOk
            : id === "preparo"
              ? ["em_producao", "pronto", "entregue"].includes(p.status)
              : id === "pronto"
                ? ["pronto", "entregue"].includes(p.status)
                : id === "rota"
                  ? Boolean(p.tracking_url)
                  : false;
      return {
        id,
        titulo: m.titulo,
        descricao: m.descricao,
        estado: passou ? "completed" : i === 0 ? "cancelled" : "upcoming",
      };
    }).concat([
      {
        id: "cancelado",
        titulo: "Cancelado",
        descricao: "Este pedido foi cancelado",
        estado: "cancelled",
      },
    ]);
  }

  return ordemIds.map((id, i) => {
    const m = meta[id];
    let estado: PassoTimeline["estado"] = "upcoming";
    if (i < atual) estado = "completed";
    else if (i === atual) estado = "current";
    return {
      id,
      titulo: m.titulo,
      descricao: m.descricao,
      estado,
    };
  });
}
