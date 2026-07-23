/** Configuração e cálculo de frete / cobertura do canal /delivery. */

export interface FaixaFrete {
  ate_km: number;
  taxa: number;
}

export interface DeliveryConfig {
  ativo: boolean;
  pedido_minimo: number;
  loja_latitude: number | null;
  loja_longitude: number | null;
  raio_km: number;
  tempo_estimado_min: number;
  faixas_frete: FaixaFrete[];
  pontos_por_real: number;
  resgate_pontos: number;
  resgate_valor_reais: number;
  /** Dígitos com DDI, ex: 5511999999999 */
  whatsapp_numero: string | null;
}

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
  return faixas
    .map((f) => ({
      ate_km: Number((f as FaixaFrete).ate_km),
      taxa: Number((f as FaixaFrete).taxa),
    }))
    .filter((f) => Number.isFinite(f.ate_km) && Number.isFinite(f.taxa))
    .sort((a, b) => a.ate_km - b.ate_km);
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

export type ResultadoFrete =
  | {
      ok: true;
      distancia_km: number;
      taxa: number;
    }
  | {
      ok: false;
      erro: string;
      distancia_km?: number;
    };

export function avaliarEntrega(
  config: DeliveryConfig,
  destLat: number,
  destLng: number,
  subtotalItens: number,
): ResultadoFrete {
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

  const taxa = calcularTaxaFrete(distancia, config.faixas_frete);
  if (taxa == null) {
    return {
      ok: false,
      erro: "Não há faixa de frete para esta distância.",
      distancia_km: Number(distancia.toFixed(3)),
    };
  }

  return {
    ok: true,
    distancia_km: Number(distancia.toFixed(3)),
    taxa,
  };
}
