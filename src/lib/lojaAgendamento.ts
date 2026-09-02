import {
  buscarHorariosLoja,
  buscarStatusLoja,
  type LojaHorario,
  type StatusLoja,
} from "./lojaStatus";

const TZ = "America/Sao_Paulo";

/** Partes de data/hora no fuso de São Paulo. */
function partesAgoraSp(ref = new Date()): {
  ano: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  dow: number;
  ms: number;
} {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(ref).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const mapDow: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const ano = Number(parts.year);
  const mes = Number(parts.month);
  const dia = Number(parts.day);
  const hora = Number(parts.hour);
  const minuto = Number(parts.minute);
  return {
    ano,
    mes,
    dia,
    hora,
    minuto,
    dow: mapDow[parts.weekday] ?? 0,
    ms: Date.UTC(ano, mes - 1, dia, hora, minuto, 0),
  };
}

function parseHora(hhmmss: string): { h: number; m: number } {
  const [h, m] = hhmmss.split(":").map((x) => Number(x));
  return { h: h || 0, m: m || 0 };
}

/** ISO timestamptz para um horário no fuso de São Paulo. */
export function isoSlotSp(
  ano: number,
  mes: number,
  dia: number,
  hora: number,
  minuto: number,
): string {
  const y = String(ano).padStart(4, "0");
  const mo = String(mes).padStart(2, "0");
  const d = String(dia).padStart(2, "0");
  const hh = String(hora).padStart(2, "0");
  const mm = String(minuto).padStart(2, "0");
  return `${y}-${mo}-${d}T${hh}:${mm}:00-03:00`;
}

/** ISO timestamptz para um slot de hoje (SP). */
export function isoSlotHojeSp(hora: number, minuto: number, ref = new Date()): string {
  const p = partesAgoraSp(ref);
  return isoSlotSp(p.ano, p.mes, p.dia, hora, minuto);
}

export function rotuloSlot(iso: string): string {
  try {
    const agora = partesAgoraSp();
    const slot = partesAgoraSp(new Date(iso));
    const hora = new Intl.DateTimeFormat("pt-BR", {
      timeZone: TZ,
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
    if (
      slot.ano !== agora.ano ||
      slot.mes !== agora.mes ||
      slot.dia !== agora.dia
    ) {
      const dia = new Intl.DateTimeFormat("pt-BR", {
        timeZone: TZ,
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
      }).format(new Date(iso));
      return `${dia} ${hora}`;
    }
    return hora;
  } catch {
    return iso;
  }
}

export type SlotsAgendamento = {
  status: StatusLoja | null;
  horarioHoje: LojaHorario | null;
  abreHoje: boolean;
  slots: string[]; // ISO
  motivoSemSlots: string | null;
};

export type OpcoesSlotsAgendamento = {
  /** Não oferecer horários antes deste instante (ex.: mínima da encomenda). */
  naoAntesDe?: string | null;
};

function arredondarProximo15(minutosDoDia: number): number {
  return Math.ceil(minutosDoDia / 15) * 15;
}

function gerarSlotsNoDia(opts: {
  ano: number;
  mes: number;
  dia: number;
  dow: number;
  minInicioDia: number;
  fechaMin: number;
  atravessaMeiaNoite: boolean;
}): string[] {
  const { ano, mes, dia, minInicioDia, fechaMin, atravessaMeiaNoite } = opts;
  const primeiro = arredondarProximo15(minInicioDia);
  const slots: string[] = [];
  if (!atravessaMeiaNoite) {
    for (let m = primeiro; m < fechaMin; m += 15) {
      const h = Math.floor(m / 60);
      const min = m % 60;
      if (h > 23) break;
      slots.push(isoSlotSp(ano, mes, dia, h, min));
    }
  } else {
    for (let m = primeiro; m < 24 * 60; m += 15) {
      const h = Math.floor(m / 60);
      const min = m % 60;
      slots.push(isoSlotSp(ano, mes, dia, h, min));
    }
  }
  return slots;
}

/** Slots de 15 min do instante atual até 23:45 (SP) — abertura temporária fora da grade. */
function gerarSlotsRestanteDoDia(
  ref: Date,
  preparoMin: number,
  naoAntesMs: number | null,
): string[] {
  const p = partesAgoraSp(ref);
  const agoraMin = p.hora * 60 + p.minuto;
  let minInicio = Math.ceil((agoraMin + Math.max(0, preparoMin)) / 15) * 15;
  if (naoAntesMs != null) {
    const limite = partesAgoraSp(new Date(naoAntesMs));
    if (
      limite.ano === p.ano &&
      limite.mes === p.mes &&
      limite.dia === p.dia
    ) {
      minInicio = Math.max(minInicio, arredondarProximo15(limite.hora * 60 + limite.minuto));
    } else if (naoAntesMs > ref.getTime()) {
      // Mínimo é outro dia — este fallback só cobre o dia atual.
      return [];
    }
  }
  const slots: string[] = [];
  for (let m = minInicio; m < 24 * 60; m += 15) {
    slots.push(isoSlotSp(p.ano, p.mes, p.dia, Math.floor(m / 60), m % 60));
  }
  return slots;
}

/**
 * Gera slots de 15 min a partir de hoje (ou do dia do mínimo da encomenda).
 * `naoAntesDe` = horário mínimo (retirada da encomenda): só slots >= esse instante.
 */
export async function listarSlotsAgendamentoHoje(
  ref = new Date(),
  opts: OpcoesSlotsAgendamento = {},
): Promise<SlotsAgendamento> {
  const [status, horarios] = await Promise.all([
    buscarStatusLoja(),
    buscarHorariosLoja(),
  ]);
  const preparo = Math.max(0, status?.tempo_preparo_min ?? 0);
  const atrasoAbertura = Math.max(
    0,
    status?.atraso_primeiro_agendamento_min ?? 15,
  );
  const lojaAbertaAgora = Boolean(status?.aberta);

  const naoAntesMs = opts.naoAntesDe
    ? new Date(opts.naoAntesDe).getTime()
    : null;
  const refEfetiva =
    naoAntesMs != null && Number.isFinite(naoAntesMs) && naoAntesMs > ref.getTime()
      ? new Date(naoAntesMs)
      : ref;

  const p = partesAgoraSp(refEfetiva);
  const pHoje = partesAgoraSp(ref);
  const horarioDia = horarios.find((h) => h.dia_semana === p.dow) ?? null;
  const mesmoDiaQueHoje =
    p.ano === pHoje.ano && p.mes === pHoje.mes && p.dia === pHoje.dia;

  if (!horarioDia || !horarioDia.aberto) {
    if (lojaAbertaAgora && mesmoDiaQueHoje) {
      const slots = gerarSlotsRestanteDoDia(ref, preparo, naoAntesMs);
      return {
        status,
        horarioHoje: horarioDia,
        abreHoje: true,
        slots,
        motivoSemSlots:
          slots.length === 0 ? "Sem horários restantes hoje." : null,
      };
    }
    return {
      status,
      horarioHoje: horarioDia,
      abreHoje: false,
      slots: [],
      motivoSemSlots: mesmoDiaQueHoje
        ? "A loja não abre hoje — não é possível agendar."
        : "A loja não abre no dia mínimo da encomenda.",
    };
  }

  const abre = parseHora(horarioDia.abre);
  const fecha = parseHora(horarioDia.fecha);
  const fechaMin = fecha.h * 60 + fecha.m;
  const atravessaMeiaNoite = abre.h * 60 + abre.m >= fechaMin;
  const abreMin = abre.h * 60 + abre.m + atrasoAbertura;

  let minInicio = abreMin;
  if (mesmoDiaQueHoje) {
    const agoraMin = pHoje.hora * 60 + pHoje.minuto;
    minInicio = Math.max(minInicio, agoraMin + preparo);
  }
  if (naoAntesMs != null && Number.isFinite(naoAntesMs)) {
    const lim = partesAgoraSp(new Date(naoAntesMs));
    if (lim.ano === p.ano && lim.mes === p.mes && lim.dia === p.dia) {
      minInicio = Math.max(minInicio, lim.hora * 60 + lim.minuto);
    }
  }

  let slots = gerarSlotsNoDia({
    ano: p.ano,
    mes: p.mes,
    dia: p.dia,
    dow: p.dow,
    minInicioDia: minInicio,
    fechaMin,
    atravessaMeiaNoite,
  });

  if (slots.length === 0 && lojaAbertaAgora && mesmoDiaQueHoje) {
    slots = gerarSlotsRestanteDoDia(ref, preparo, naoAntesMs);
  }

  return {
    status,
    horarioHoje: horarioDia,
    abreHoje: true,
    slots,
    motivoSemSlots:
      slots.length === 0
        ? lojaAbertaAgora && mesmoDiaQueHoje
          ? "Não há horários disponíveis hoje."
          : "Não há horários a partir do mínimo da encomenda."
        : null,
  };
}
