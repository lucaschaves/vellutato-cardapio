/** Helpers de pedidos agendados no KDS / impressão. */

const MS_MIN = 60_000;

/**
 * Pedido agendado: vai para "Preparando" + impressão
 * N minutos antes de `agendado_para`.
 */
export const ANTECEDENCIA_PREPARO_AGENDADO_MIN = 30;

/** Pedido imediato em "Novos": se ninguém clicar Preparar, sobe sozinho após N ms. */
export const AUTO_PREPARAR_IMEDIATO_MS = 60_000;

/** Alerta visual no KDS: a partir da janela de preparo do agendado. */
export const ALERTA_KDS_ANTES_MIN = ANTECEDENCIA_PREPARO_AGENDADO_MIN;

/** @deprecated use ANTECEDENCIA_PREPARO_AGENDADO_MIN */
export const ATRASO_IMPRESSAO_AGENDADO_MIN = ANTECEDENCIA_PREPARO_AGENDADO_MIN;

/** Instante em que o agendado deve ir para preparando (e imprimir). */
export function instantePreparoAgendado(
  agendadoPara: string | null | undefined,
): number | null {
  if (!agendadoPara) return null;
  const t = new Date(agendadoPara).getTime();
  if (!Number.isFinite(t)) return null;
  return t - ANTECEDENCIA_PREPARO_AGENDADO_MIN * MS_MIN;
}

/** Alias compatível com impressão automática. */
export function instanteImpressaoAgendada(
  agendadoPara: string | null | undefined,
): number | null {
  return instantePreparoAgendado(agendadoPara);
}

/** Já entrou na janela de preparo do agendado (30 min antes ou depois). */
export function podePrepararPedidoAgendadoAgora(
  agendadoPara: string | null | undefined,
  agora = Date.now(),
): boolean {
  const alvo = instantePreparoAgendado(agendadoPara);
  if (alvo == null) return true;
  return agora >= alvo;
}

/** @deprecated use podePrepararPedidoAgendadoAgora */
export function podeImprimirPedidoAgora(
  agendadoPara: string | null | undefined,
  agora = Date.now(),
): boolean {
  return podePrepararPedidoAgendadoAgora(agendadoPara, agora);
}

/**
 * Pedido imediato (sem agendamento) já esperou 1 min em "Novos"
 * sem alguém clicar em Preparar.
 */
export function podeAutoPrepararImediatoAgora(
  criadoEm: string | null | undefined,
  agora = Date.now(),
): boolean {
  if (!criadoEm) return false;
  const t = new Date(criadoEm).getTime();
  if (!Number.isFinite(t)) return false;
  return agora >= t + AUTO_PREPARAR_IMEDIATO_MS;
}

/** Minutos até agendado_para (negativo = atrasado). */
export function minutosAteAgendado(
  agendadoPara: string | null | undefined,
  agora = Date.now(),
): number | null {
  if (!agendadoPara) return null;
  const t = new Date(agendadoPara).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.round((t - agora) / MS_MIN);
}

export function pedidoAgendadoEmAlerta(
  agendadoPara: string | null | undefined,
  agora = Date.now(),
): boolean {
  const min = minutosAteAgendado(agendadoPara, agora);
  if (min == null) return false;
  return min <= ALERTA_KDS_ANTES_MIN;
}

/** Agendados primeiro (por horário), depois os demais (mais recentes). */
export function compararPedidosKds<
  T extends { agendado_para?: string | null; criado_em: string },
>(a: T, b: T): number {
  const aAg = a.agendado_para ? new Date(a.agendado_para).getTime() : null;
  const bAg = b.agendado_para ? new Date(b.agendado_para).getTime() : null;
  const aOk = aAg != null && Number.isFinite(aAg);
  const bOk = bAg != null && Number.isFinite(bAg);

  if (aOk && bOk) return aAg! - bAg!;
  if (aOk && !bOk) return -1;
  if (!aOk && bOk) return 1;

  return new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime();
}

export function rotuloHoraAgendada(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));
}
