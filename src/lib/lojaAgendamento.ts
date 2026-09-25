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

export type DiaAgendavel = {
  /** YYYY-MM-DD no calendário SP */
  dataKey: string;
  ano: number;
  mes: number;
  dia: number;
  dow: number;
  ehHoje: boolean;
  rotulo: string;
  /** Primeiro horário válido do dia (ISO), se houver. */
  primeiroSlot: string | null;
  /** Limites HH:MM para o input. */
  horaMin: string | null;
  horaMax: string | null;
};

export type OpcoesDiasAgendamento = {
  naoAntesDe?: string | null;
  /** Quantos dias abertos listar (default 7). */
  maxDias?: number;
};

function dataKeySp(ano: number, mes: number, dia: number): string {
  return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function adicionarDiasSp(
  ano: number,
  mes: number,
  dia: number,
  delta: number,
): { ano: number; mes: number; dia: number; dow: number } {
  // Meio-dia UTC-3 evita edge de DST ao andar dias
  const base = new Date(`${dataKeySp(ano, mes, dia)}T12:00:00-03:00`);
  base.setTime(base.getTime() + delta * 24 * 60 * 60 * 1000);
  const p = partesAgoraSp(base);
  return { ano: p.ano, mes: p.mes, dia: p.dia, dow: p.dow };
}

function minutosParaHhmm(m: number): string {
  const h = Math.floor(m / 60) % 24;
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/**
 * Limites de horário (minutos do dia) para um dia da semana.
 * Retorna null se a loja não abre.
 */
function limitesMinutosDia(opts: {
  horario: LojaHorario | null | undefined;
  atrasoAbertura: number;
  preparo: number;
  ref: Date;
  ano: number;
  mes: number;
  dia: number;
  naoAntesMs: number | null;
}): { minInicio: number; fechaMin: number; atravessa: boolean } | null {
  const { horario, atrasoAbertura, preparo, ref, ano, mes, dia, naoAntesMs } =
    opts;
  if (!horario || !horario.aberto) return null;

  const abre = parseHora(horario.abre);
  const fecha = parseHora(horario.fecha);
  const fechaMin = fecha.h * 60 + fecha.m;
  const atravessa = abre.h * 60 + abre.m >= fechaMin;
  let minInicio = abre.h * 60 + abre.m + atrasoAbertura;

  const pHoje = partesAgoraSp(ref);
  const mesmoDia =
    ano === pHoje.ano && mes === pHoje.mes && dia === pHoje.dia;
  if (mesmoDia) {
    minInicio = Math.max(minInicio, pHoje.hora * 60 + pHoje.minuto + preparo);
  }
  if (naoAntesMs != null && Number.isFinite(naoAntesMs)) {
    const lim = partesAgoraSp(new Date(naoAntesMs));
    if (lim.ano === ano && lim.mes === mes && lim.dia === dia) {
      minInicio = Math.max(minInicio, lim.hora * 60 + lim.minuto);
    }
  }
  minInicio = arredondarProximo15(minInicio);
  return { minInicio, fechaMin, atravessa };
}

/** Lista até N dias com loja aberta a partir de hoje (ou do mínimo). */
export async function listarDiasAgendamento(
  ref = new Date(),
  opts: OpcoesDiasAgendamento = {},
): Promise<{
  status: StatusLoja | null;
  dias: DiaAgendavel[];
  motivoSemDias: string | null;
}> {
  const [status, horarios] = await Promise.all([
    buscarStatusLoja(),
    buscarHorariosLoja(),
  ]);
  const preparo = Math.max(0, status?.tempo_preparo_min ?? 0);
  const atrasoAbertura = Math.max(
    0,
    status?.atraso_primeiro_agendamento_min ?? 15,
  );
  const maxDias = Math.max(1, Math.min(opts.maxDias ?? 7, 14));
  const naoAntesMs = opts.naoAntesDe
    ? new Date(opts.naoAntesDe).getTime()
    : null;

  const pHoje = partesAgoraSp(ref);
  const inicio =
    naoAntesMs != null && Number.isFinite(naoAntesMs) && naoAntesMs > ref.getTime()
      ? partesAgoraSp(new Date(naoAntesMs))
      : pHoje;

  const dias: DiaAgendavel[] = [];
  for (let i = 0; i < 21 && dias.length < maxDias; i++) {
    const start = adicionarDiasSp(inicio.ano, inicio.mes, inicio.dia, i);
    const horario = horarios.find((h) => h.dia_semana === start.dow) ?? null;
    const lim = limitesMinutosDia({
      horario,
      atrasoAbertura,
      preparo,
      ref,
      ano: start.ano,
      mes: start.mes,
      dia: start.dia,
      naoAntesMs,
    });
    if (!lim) continue;
    if (!lim.atravessa && lim.minInicio >= lim.fechaMin) continue;

    const primeiro = lim.atravessa || lim.minInicio < lim.fechaMin
      ? isoSlotSp(
          start.ano,
          start.mes,
          start.dia,
          Math.floor(lim.minInicio / 60),
          lim.minInicio % 60,
        )
      : null;
    if (!primeiro) continue;

    const ehHoje =
      start.ano === pHoje.ano &&
      start.mes === pHoje.mes &&
      start.dia === pHoje.dia;
    const rotuloData = new Intl.DateTimeFormat("pt-BR", {
      timeZone: TZ,
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
    }).format(new Date(primeiro));

    const horaMaxMin = lim.atravessa
      ? 23 * 60 + 45
      : Math.max(lim.fechaMin - 15, lim.minInicio);

    dias.push({
      dataKey: dataKeySp(start.ano, start.mes, start.dia),
      ano: start.ano,
      mes: start.mes,
      dia: start.dia,
      dow: start.dow,
      ehHoje,
      rotulo: ehHoje ? `Hoje · ${rotuloData}` : rotuloData,
      primeiroSlot: primeiro,
      horaMin: minutosParaHhmm(lim.minInicio),
      horaMax: minutosParaHhmm(horaMaxMin),
    });
  }

  return {
    status,
    dias,
    motivoSemDias:
      dias.length === 0 ? "Não há dias disponíveis para agendar." : null,
  };
}

/** Horários de 15 min de um dia, dentro do funcionamento cadastrado. */
export async function horariosRetiradaNoDia(
  dataKey: string,
): Promise<{ opcoes: string[]; aviso: string | null }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataKey)) {
    return { opcoes: [], aviso: "Informe a data da retirada." };
  }

  const [status, horarios] = await Promise.all([
    buscarStatusLoja(),
    buscarHorariosLoja(),
  ]);
  const p = partesAgoraSp(new Date(`${dataKey}T12:00:00-03:00`));
  const horario = horarios.find((h) => h.dia_semana === p.dow) ?? null;
  if (!horario?.aberto) {
    return { opcoes: [], aviso: "A loja não abre neste dia." };
  }

  const lim = limitesMinutosDia({
    horario,
    atrasoAbertura: Math.max(0, status?.atraso_primeiro_agendamento_min ?? 15),
    preparo: Math.max(0, status?.tempo_preparo_min ?? 0),
    ref: new Date(),
    ano: p.ano,
    mes: p.mes,
    dia: p.dia,
    naoAntesMs: null,
  });
  if (!lim || (!lim.atravessa && lim.minInicio >= lim.fechaMin)) {
    return { opcoes: [], aviso: "Não há horários disponíveis neste dia." };
  }

  const slots = gerarSlotsNoDia({
    ano: p.ano,
    mes: p.mes,
    dia: p.dia,
    dow: p.dow,
    minInicioDia: lim.minInicio,
    fechaMin: lim.fechaMin,
    atravessaMeiaNoite: lim.atravessa,
  });
  const abre = horario.abre.slice(0, 5);
  const fecha = horario.fecha.slice(0, 5);
  return {
    opcoes: slots.map((iso) => hhmmDeIso(iso)).filter(Boolean),
    aviso:
      slots.length === 0
        ? `A loja funciona das ${abre} às ${fecha}, mas não há horário livre neste dia.`
        : `Funcionamento: ${abre} às ${fecha}`,
  };
}

/** Monta ISO a partir de dataKey (YYYY-MM-DD) + HH:MM, arredondando p/ 15 min. */
export function montarIsoAgendamento(
  dataKey: string,
  horaHhmm: string,
): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataKey);
  const t = /^(\d{1,2}):(\d{2})$/.exec(horaHhmm.trim());
  if (!m || !t) return null;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  let hora = Number(t[1]);
  let minuto = Number(t[2]);
  if (!Number.isFinite(hora) || !Number.isFinite(minuto)) return null;
  minuto = Math.round(minuto / 15) * 15;
  if (minuto === 60) {
    minuto = 0;
    hora += 1;
  }
  if (hora > 23) return null;
  return isoSlotSp(ano, mes, dia, hora, minuto);
}

export function hhmmDeIso(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const p = partesAgoraSp(new Date(iso));
    return `${String(p.hora).padStart(2, "0")}:${String(p.minuto).padStart(2, "0")}`;
  } catch {
    return "";
  }
}

export function dataKeyDeIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    const p = partesAgoraSp(new Date(iso));
    return dataKeySp(p.ano, p.mes, p.dia);
  } catch {
    return null;
  }
}
