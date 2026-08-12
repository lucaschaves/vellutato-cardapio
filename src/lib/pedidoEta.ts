import { rotuloSlot } from "./lojaAgendamento";

/** Texto de previsão amigável para o cliente no acompanhamento. */
export function textoPrevisaoPedido(opts: {
  status: string;
  agendadoPara?: string | null;
  criadoEm: string;
  tempoEstimadoMin?: number | null;
  modalidade?: string | null;
}): string | null {
  const {
    status,
    agendadoPara,
    criadoEm,
    tempoEstimadoMin,
    modalidade,
  } = opts;

  if (status === "cancelado" || status === "entregue") return null;

  const verbo =
    (modalidade || "").toLowerCase() === "retirada" ? "retirada" : "entrega";

  if (agendadoPara) {
    return `Previsão de ${verbo}: ${rotuloSlot(agendadoPara)}`;
  }

  if (
    status === "aguardando_pagamento" ||
    status === "pago"
  ) {
    return null;
  }

  const min = Math.max(5, Number(tempoEstimadoMin || 45));
  const base = new Date(criadoEm).getTime();
  if (!Number.isFinite(base)) return null;

  const eta = new Date(base + min * 60_000);
  const agora = Date.now();

  if (status === "pronto") {
    return modalidade === "retirada"
      ? "Pronto para retirada"
      : "Saiu / pronto para entrega";
  }

  if (eta.getTime() <= agora) {
    return `Previsão de ${verbo}: a qualquer momento`;
  }

  const hora = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(eta);

  if (status === "em_producao") {
    return `Em preparo · previsão ~${hora}`;
  }

  return `Previsão de ${verbo} ~${hora} (~${min} min)`;
}
