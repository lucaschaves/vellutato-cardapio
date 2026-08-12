/** Helpers de pedidos agendados no KDS / impressão. */

const MS_MIN = 60_000;

/** Impressão automática: agendado_para + 10 minutos. */
export const ATRASO_IMPRESSAO_AGENDADO_MIN = 10;

/** Alerta visual no KDS: a partir de N minutos antes do horário. */
export const ALERTA_KDS_ANTES_MIN = 15;

export function instanteImpressaoAgendada(
  agendadoPara: string | null | undefined,
): number | null {
  if (!agendadoPara) return null;
  const t = new Date(agendadoPara).getTime();
  if (!Number.isFinite(t)) return null;
  return t + ATRASO_IMPRESSAO_AGENDADO_MIN * MS_MIN;
}

export function podeImprimirPedidoAgora(
  agendadoPara: string | null | undefined,
  agora = Date.now(),
): boolean {
  const alvo = instanteImpressaoAgendada(agendadoPara);
  if (alvo == null) return true;
  return agora >= alvo;
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
