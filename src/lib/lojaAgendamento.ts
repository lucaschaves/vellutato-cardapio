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

/** ISO timestamptz para um slot de hoje (SP), em horário local SP. */
export function isoSlotHojeSp(hora: number, minuto: number, ref = new Date()): string {
  const p = partesAgoraSp(ref);
  // Constrói um instante que, em SP, é hoje HH:MM.
  // Usa formato sem Z + offset aproximado via Date com toLocale — preferimos
  // montar string com offset -03:00 (padrão SP sem DST desde 2019).
  const y = String(p.ano).padStart(4, "0");
  const mo = String(p.mes).padStart(2, "0");
  const d = String(p.dia).padStart(2, "0");
  const hh = String(hora).padStart(2, "0");
  const mm = String(minuto).padStart(2, "0");
  return `${y}-${mo}-${d}T${hh}:${mm}:00-03:00`;
}

export function rotuloSlot(iso: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: TZ,
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
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

/**
 * Gera slots de 15 min para hoje, dentro do horário da loja,
 * a partir de agora + tempo_preparo_min.
 */
export async function listarSlotsAgendamentoHoje(
  ref = new Date(),
): Promise<SlotsAgendamento> {
  const [status, horarios] = await Promise.all([
    buscarStatusLoja(),
    buscarHorariosLoja(),
  ]);
  const p = partesAgoraSp(ref);
  const horarioHoje = horarios.find((h) => h.dia_semana === p.dow) ?? null;
  const preparo = Math.max(0, status?.tempo_preparo_min ?? 0);

  if (!horarioHoje || !horarioHoje.aberto) {
    return {
      status,
      horarioHoje,
      abreHoje: false,
      slots: [],
      motivoSemSlots: "A loja não abre hoje — não é possível agendar.",
    };
  }

  const abre = parseHora(horarioHoje.abre);
  const fecha = parseHora(horarioHoje.fecha);
  const agoraMin = p.hora * 60 + p.minuto;
  const minInicio = Math.max(agoraMin + preparo, abre.h * 60 + abre.m);
  // Arredonda para o próximo múltiplo de 15.
  const primeiro = Math.ceil(minInicio / 15) * 15;
  const fechaMin = fecha.h * 60 + fecha.m;
  const atravessaMeiaNoite = abre.h * 60 + abre.m >= fechaMin;

  const slots: string[] = [];
  if (!atravessaMeiaNoite) {
    for (let m = primeiro; m < fechaMin; m += 15) {
      const h = Math.floor(m / 60);
      const min = m % 60;
      if (h > 23) break;
      slots.push(isoSlotHojeSp(h, min, ref));
    }
  } else {
    // Ex.: 18:00 → 02:00 — só slots de hoje até 23:45 (mesmo dia).
    for (let m = primeiro; m < 24 * 60; m += 15) {
      const h = Math.floor(m / 60);
      const min = m % 60;
      slots.push(isoSlotHojeSp(h, min, ref));
    }
  }

  return {
    status,
    horarioHoje,
    abreHoje: true,
    slots,
    motivoSemSlots:
      slots.length === 0
        ? status?.aberta
          ? "Não há horários disponíveis hoje."
          : (status?.motivo ?? "Não há horários disponíveis hoje.")
        : null,
  };
}
