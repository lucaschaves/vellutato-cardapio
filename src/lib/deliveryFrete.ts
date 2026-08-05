import { consultarChuvaNaLoja } from "./climaFrete";

/** Configuração e cálculo de frete / cobertura do canal delivery (raiz `/`). */

export interface FaixaFrete {
  ate_km: number;
  taxa: number;
}

/** 0=domingo … 6=sábado (igual Date.getDay no fuso da loja). */
export type DiaSemana = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface RegraFrete {
  id: string;
  /** Dias em que a regra vale. Vazio = nenhum dia. */
  dias: DiaSemana[];
  /** HH:mm (inclusive) */
  inicio: string;
  /** HH:mm (exclusive, exceto 23:59 / 24:00 tratado como fim do dia) */
  fim: string;
  faixas: FaixaFrete[];
  /** Acréscimo de chuva desta faixa de dia/horário (independente das outras). */
  clima: ClimaFreteConfig;
  rotulo?: string;
}

export interface ClimaFreteConfig {
  ativo: boolean;
  /** "fixo" = +R$; "percentual" = +% sobre a taxa base */
  acrescimo_tipo: "fixo" | "percentual";
  acrescimo_valor: number;
}

/** Endereço salvo para calibrar faixas de frete em apps externos. */
export interface EnderecoReferenciaFrete {
  id: string;
  /** Ex.: "Faixa 1 km", "Até 2 km" */
  rotulo: string;
  /** Distância de referência em km (qual faixa representa). */
  ate_km: number;
  /** Texto completo do endereço para colar na plataforma. */
  endereco: string;
  observacao?: string;
}

export interface DeliveryConfig {
  ativo: boolean;
  pedido_minimo: number;
  loja_latitude: number | null;
  loja_longitude: number | null;
  raio_km: number;
  tempo_estimado_min: number;
  /** Faixas padrão (fallback quando nenhuma regra de horário bate). */
  faixas_frete: FaixaFrete[];
  /** Regras por dia da semana + horário (cada uma com seu clima). */
  regras_frete: RegraFrete[];
  /**
   * Clima só para as faixas padrão (fallback), quando nenhuma regra de horário bate.
   * Preferir configurar chuva em cada regra.
   */
  clima_frete: ClimaFreteConfig;
  /**
   * Endereços de referência para calibrar frete com plataformas externas
   * (copiar endereço → consultar preço real → atualizar faixas).
   */
  enderecos_referencia: EnderecoReferenciaFrete[];
  pontos_por_real: number;
  resgate_pontos: number;
  resgate_valor_reais: number;
  /** Dígitos com DDI, ex: 5511999999999 */
  whatsapp_numero: string | null;
}

export const FUSO_LOJA = "America/Sao_Paulo";

export const DIAS_SEMANA_LABEL: Record<DiaSemana, string> = {
  0: "Dom",
  1: "Seg",
  2: "Ter",
  3: "Qua",
  4: "Qui",
  5: "Sex",
  6: "Sáb",
};

export const CLIMA_FRETE_PADRAO: ClimaFreteConfig = {
  ativo: false,
  acrescimo_tipo: "fixo",
  acrescimo_valor: 3,
};

export const DELIVERY_CONFIG_PADRAO: DeliveryConfig = {
  ativo: false,
  pedido_minimo: 30,
  loja_latitude: null,
  loja_longitude: null,
  raio_km: 5,
  tempo_estimado_min: 45,
  faixas_frete: [
    { ate_km: 2, taxa: 5 },
    { ate_km: 5, taxa: 10 },
  ],
  regras_frete: [],
  clima_frete: { ...CLIMA_FRETE_PADRAO },
  enderecos_referencia: [],
  pontos_por_real: 1,
  resgate_pontos: 100,
  resgate_valor_reais: 5,
  whatsapp_numero: null,
};

/** Distância em km entre dois pontos (Haversine). */
export function distanciaKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function normalizarFaixas(faixas: unknown): FaixaFrete[] {
  if (!Array.isArray(faixas)) return DELIVERY_CONFIG_PADRAO.faixas_frete;
  const normalizadas = faixas
    .map((f) => ({
      ate_km: Number((f as FaixaFrete).ate_km),
      taxa: Number((f as FaixaFrete).taxa),
    }))
    .filter((f) => Number.isFinite(f.ate_km) && Number.isFinite(f.taxa))
    .sort((a, b) => a.ate_km - b.ate_km);
  return normalizadas.length > 0
    ? normalizadas
    : DELIVERY_CONFIG_PADRAO.faixas_frete;
}

function parseHhMm(valor: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(valor || "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 24 || min < 0 || min > 59) return null;
  if (h === 24 && min !== 0) return null;
  return h * 60 + min;
}

export function normalizarClimaFrete(raw: unknown): ClimaFreteConfig {
  if (!raw || typeof raw !== "object") return { ...CLIMA_FRETE_PADRAO };
  const o = raw as Record<string, unknown>;
  const tipo =
    o.acrescimo_tipo === "percentual" ? "percentual" : "fixo";
  const valor = Number(o.acrescimo_valor);
  return {
    ativo: Boolean(o.ativo),
    acrescimo_tipo: tipo,
    acrescimo_valor: Number.isFinite(valor) ? Math.max(0, valor) : 0,
  };
}

export function normalizarEnderecosReferencia(
  raw: unknown,
): EnderecoReferenciaFrete[] {
  if (!Array.isArray(raw)) return [];
  const lista: EnderecoReferenciaFrete[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const endereco = String(o.endereco || "").trim();
    if (!endereco) continue;
    const ate = Number(o.ate_km);
    lista.push({
      id: String(o.id || cryptoRandomId()),
      rotulo: String(o.rotulo || "").trim() || `Faixa ${ate || "?"} km`,
      ate_km: Number.isFinite(ate) && ate > 0 ? ate : 1,
      endereco,
      observacao: o.observacao ? String(o.observacao).trim() : undefined,
    });
  }
  return lista.sort((a, b) => a.ate_km - b.ate_km);
}

export function novoEnderecoReferencia(
  parcial?: Partial<EnderecoReferenciaFrete>,
): EnderecoReferenciaFrete {
  const ate = parcial?.ate_km ?? 1;
  return {
    id: cryptoRandomId(),
    rotulo: parcial?.rotulo?.trim() || `Faixa ${ate} km`,
    ate_km: ate,
    endereco: parcial?.endereco?.trim() || "",
    observacao: parcial?.observacao?.trim() || undefined,
  };
}

export function normalizarRegrasFrete(
  raw: unknown,
  climaFallback?: ClimaFreteConfig,
): RegraFrete[] {
  if (!Array.isArray(raw)) return [];
  const regras: RegraFrete[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const diasRaw = Array.isArray(o.dias) ? o.dias : [];
    const dias = diasRaw
      .map((d) => Number(d))
      .filter((d): d is DiaSemana => d >= 0 && d <= 6 && Number.isInteger(d));
    const inicio = String(o.inicio || "00:00");
    const fim = String(o.fim || "23:59");
    if (parseHhMm(inicio) == null || parseHhMm(fim) == null) continue;
    const faixas = normalizarFaixas(o.faixas);
    const clima =
      o.clima != null
        ? normalizarClimaFrete(o.clima)
        : climaFallback
          ? { ...climaFallback }
          : { ...CLIMA_FRETE_PADRAO };
    regras.push({
      id: String(o.id || cryptoRandomId()),
      dias,
      inicio,
      fim,
      faixas,
      clima,
      rotulo: o.rotulo ? String(o.rotulo) : undefined,
    });
  }
  return regras;
}

function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `regra-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function novaRegraFrete(
  parcial?: Partial<RegraFrete>,
  faixasBase?: FaixaFrete[],
): RegraFrete {
  return {
    id: cryptoRandomId(),
    dias: parcial?.dias ?? [1, 2, 3, 4, 5],
    inicio: parcial?.inicio ?? "00:00",
    fim: parcial?.fim ?? "23:59",
    faixas: normalizarFaixas(
      parcial?.faixas ?? faixasBase ?? DELIVERY_CONFIG_PADRAO.faixas_frete,
    ),
    clima: normalizarClimaFrete(parcial?.clima ?? CLIMA_FRETE_PADRAO),
    rotulo: parcial?.rotulo,
  };
}

/** Minutos desde 00:00 e dia da semana no fuso da loja. */
export function agoraNaLoja(agora = new Date()): {
  dia: DiaSemana;
  minutos: number;
} {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: FUSO_LOJA,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(agora).map((p) => [p.type, p.value]),
  );
  const weekdayMap: Record<string, DiaSemana> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const dia = weekdayMap[parts.weekday || ""] ?? (agora.getDay() as DiaSemana);
  const h = Number(parts.hour ?? 0);
  const m = Number(parts.minute ?? 0);
  return { dia, minutos: h * 60 + m };
}

function horarioNaJanela(
  minutos: number,
  inicio: string,
  fim: string,
): boolean {
  const a = parseHhMm(inicio);
  let b = parseHhMm(fim);
  if (a == null || b == null) return false;
  // 23:59 e 24:00 = até o fim do dia
  if (fim === "23:59" || fim === "24:00") b = 24 * 60;
  if (a === b) return true; // janela cheia do dia (mesmo horário)
  if (a < b) return minutos >= a && minutos < b;
  // cruza meia-noite
  return minutos >= a || minutos < b;
}

export function selecionarRegraFrete(
  regras: RegraFrete[],
  agora = new Date(),
): RegraFrete | null {
  if (!regras.length) return null;
  const { dia, minutos } = agoraNaLoja(agora);
  return (
    regras.find(
      (r) =>
        r.dias.includes(dia) && horarioNaJanela(minutos, r.inicio, r.fim),
    ) || null
  );
}

export function calcularTaxaFrete(
  distancia: number,
  faixas: FaixaFrete[],
): number | null {
  const ordenadas = [...faixas].sort((a, b) => a.ate_km - b.ate_km);
  for (const faixa of ordenadas) {
    if (distancia <= faixa.ate_km) return faixa.taxa;
  }
  return null;
}

export function aplicarAcrescimoClima(
  taxaBase: number,
  clima: ClimaFreteConfig,
  chuva: boolean,
): { taxa: number; acrescimo: number } {
  if (!clima.ativo || !chuva || clima.acrescimo_valor <= 0) {
    return { taxa: taxaBase, acrescimo: 0 };
  }
  const acrescimo =
    clima.acrescimo_tipo === "percentual"
      ? Number(((taxaBase * clima.acrescimo_valor) / 100).toFixed(2))
      : Number(clima.acrescimo_valor.toFixed(2));
  return {
    taxa: Number((taxaBase + acrescimo).toFixed(2)),
    acrescimo,
  };
}

/** Menor taxa possível (para estimativa antes do endereço). */
export function taxaMinimaConfig(config: DeliveryConfig): number {
  const listas = [
    config.faixas_frete,
    ...config.regras_frete.map((r) => r.faixas),
  ];
  let min = Infinity;
  for (const faixas of listas) {
    for (const f of faixas) {
      if (f.taxa < min) min = f.taxa;
    }
  }
  return Number.isFinite(min) ? min : 0;
}

/** Distância amigável para UI: metros se abaixo de 500 m; senão 1 casa em km. */
export function formatarDistanciaEntrega(km: number): string {
  if (!Number.isFinite(km) || km < 0) return "";
  if (km < 0.5) {
    const metros = Math.max(1, Math.round(km * 1000));
    return `${metros} m`;
  }
  const arredondado = Math.round(km * 10) / 10;
  return `${arredondado.toFixed(1).replace(".", ",")} km`;
}

export type ResultadoFrete =
  | {
      ok: true;
      distancia_km: number;
      taxa: number;
      taxa_base: number;
      acrescimo_clima: number;
      chuva: boolean;
      regra_id: string | null;
    }
  | {
      ok: false;
      erro: string;
      distancia_km?: number;
    };

export type OpcoesAvaliacaoFrete = {
  agora?: Date;
  /** Se omitido e a regra/fallback tiver clima.ativo, consulta Open-Meteo. */
  chuva?: boolean;
};

export async function avaliarEntrega(
  config: DeliveryConfig,
  destLat: number,
  destLng: number,
  subtotalItens: number,
  opts?: OpcoesAvaliacaoFrete,
): Promise<ResultadoFrete> {
  if (!config.ativo) {
    return { ok: false, erro: "Delivery temporariamente indisponível." };
  }
  if (config.loja_latitude == null || config.loja_longitude == null) {
    return { ok: false, erro: "Loja sem coordenadas configuradas." };
  }
  if (subtotalItens < config.pedido_minimo) {
    return {
      ok: false,
      erro: `Pedido mínimo de R$ ${config.pedido_minimo.toFixed(2)} (itens).`,
    };
  }

  const distancia = distanciaKm(
    config.loja_latitude,
    config.loja_longitude,
    destLat,
    destLng,
  );

  if (distancia > config.raio_km) {
    return {
      ok: false,
      erro: `Fora da área de entrega (máx. ${config.raio_km} km).`,
      distancia_km: Number(distancia.toFixed(3)),
    };
  }

  const agora = opts?.agora ?? new Date();
  const regra = selecionarRegraFrete(config.regras_frete, agora);
  const faixas = regra?.faixas?.length ? regra.faixas : config.faixas_frete;
  const climaAplicavel = regra?.clima ?? config.clima_frete;
  const taxaBase = calcularTaxaFrete(distancia, faixas);
  if (taxaBase == null) {
    return {
      ok: false,
      erro: "Não há faixa de frete para esta distância no horário atual.",
      distancia_km: Number(distancia.toFixed(3)),
    };
  }

  let chuva = Boolean(opts?.chuva);
  if (opts?.chuva === undefined && climaAplicavel.ativo) {
    chuva = await consultarChuvaNaLoja(
      config.loja_latitude,
      config.loja_longitude,
    );
  }

  const { taxa, acrescimo } = aplicarAcrescimoClima(
    taxaBase,
    climaAplicavel,
    chuva,
  );

  return {
    ok: true,
    distancia_km: Number(distancia.toFixed(3)),
    taxa,
    taxa_base: taxaBase,
    acrescimo_clima: acrescimo,
    chuva,
    regra_id: regra?.id ?? null,
  };
}
