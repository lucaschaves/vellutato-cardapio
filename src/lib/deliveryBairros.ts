import { supabase } from "./supabase";
import {
  avaliarEntrega,
  bairroTemEntrega,
  normalizarDescontosBairro,
  normalizarFaixasOpcionais,
  normalizarModoFrete,
  type BairroFreteResolvido,
  type DeliveryConfig,
  type DescontoFreteBairro,
  type FaixaFrete,
  type OpcoesAvaliacaoFrete,
  type ResultadoFrete,
} from "./deliveryFrete";

export type BairroFreteFeatureProperties = {
  id: string;
  slug: string;
  nome: string;
  regiao: string;
  distrito: string;
  /** Menor taxa das faixas (atalho para UI). */
  taxa: number | null;
  raio_km: number | null;
  faixas: FaixaFrete[];
  descontos: DescontoFreteBairro[];
  ativo?: boolean;
};

export type BairrosFreteGeoJson = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    id?: string;
    properties: BairroFreteFeatureProperties;
    geometry: {
      type: string;
      coordinates: unknown;
    };
  }>;
};

function mapearBairro(raw: unknown): BairroFreteResolvido | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = String(o.id || "").trim();
  const nome = String(o.nome || "").trim();
  if (!id || !nome) return null;

  const faixasFinais = Array.isArray(o.faixas)
    ? normalizarFaixasOpcionais(o.faixas)
    : o.taxa != null && Number.isFinite(Number(o.taxa))
      ? [
          {
            ate_km: Number(o.raio_km) > 0 ? Number(o.raio_km) : 50,
            taxa: Number(Number(o.taxa).toFixed(2)),
          },
        ]
      : [];

  const taxaRaw = o.taxa;
  const taxaMinFaixa = faixasFinais.length
    ? Math.min(...faixasFinais.map((f) => f.taxa))
    : null;
  const taxa =
    taxaMinFaixa != null
      ? taxaMinFaixa
      : taxaRaw == null || taxaRaw === ""
        ? null
        : Number.isFinite(Number(taxaRaw))
          ? Number(Number(taxaRaw).toFixed(2))
          : null;

  const raio =
    o.raio_km == null || o.raio_km === ""
      ? null
      : Number.isFinite(Number(o.raio_km))
        ? Number(o.raio_km)
        : null;

  return {
    id,
    slug: String(o.slug || "").trim(),
    nome,
    regiao: String(o.regiao || "").trim(),
    distrito: String(o.distrito || "").trim(),
    taxa,
    raio_km: raio,
    faixas: faixasFinais,
    descontos: normalizarDescontosBairro(o.descontos),
  };
}

export async function listarBairrosFreteGeojson(): Promise<BairrosFreteGeoJson> {
  const { data, error } = await supabase.rpc("listar_bairros_frete_geojson");
  if (error) throw new Error(error.message);
  const fc = data as BairrosFreteGeoJson | null;
  if (!fc || fc.type !== "FeatureCollection" || !Array.isArray(fc.features)) {
    return { type: "FeatureCollection", features: [] };
  }
  return {
    ...fc,
    features: fc.features.map((f) => {
      const mapped = mapearBairro(f.properties);
      if (!mapped) return f;
      return {
        ...f,
        properties: {
          id: mapped.id,
          slug: mapped.slug,
          nome: mapped.nome,
          regiao: mapped.regiao,
          distrito: mapped.distrito,
          taxa: mapped.taxa,
          raio_km: mapped.raio_km,
          faixas: mapped.faixas,
          descontos: mapped.descontos,
          ativo: bairroTemEntrega(mapped),
        },
      };
    }),
  };
}

export async function localizarBairroFrete(
  lat: number,
  lng: number,
): Promise<BairroFreteResolvido | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const { data, error } = await supabase.rpc("localizar_bairro_frete", {
    p_lat: lat,
    p_lng: lng,
  });
  if (error) {
    console.error("[BAIRROS] localizar:", error.message);
    return null;
  }
  return mapearBairro(data);
}

export async function atualizarConfigBairroFrete(
  id: string,
  config: {
    raio_km: number | null;
    faixas: FaixaFrete[];
    descontos: DescontoFreteBairro[];
  },
): Promise<BairroFreteResolvido> {
  const faixasEnvio = normalizarFaixasOpcionais(config.faixas);
  const descontos = normalizarDescontosBairro(config.descontos);

  const { data, error } = await supabase.rpc("atualizar_config_bairro_frete", {
    p_id: id,
    p_raio_km: config.raio_km,
    p_faixas: faixasEnvio,
    p_descontos: descontos,
  });
  if (error) throw new Error(error.message);
  const mapped = mapearBairro(data);
  if (!mapped) throw new Error("Resposta inválida ao salvar config do bairro.");
  return mapped;
}

/** @deprecated use atualizarConfigBairroFrete */
export async function atualizarTaxaBairroFrete(
  id: string,
  taxa: number | null,
): Promise<BairroFreteResolvido> {
  const { data, error } = await supabase.rpc("atualizar_taxa_bairro_frete", {
    p_id: id,
    p_taxa: taxa,
  });
  if (error) throw new Error(error.message);
  const mapped = mapearBairro(data);
  if (!mapped) throw new Error("Resposta inválida ao atualizar taxa do bairro.");
  return mapped;
}

/** Extrai lista leve para estimativa mínima (menor faixa de cada bairro). */
export function taxasDosBairrosGeojson(
  fc: BairrosFreteGeoJson | null | undefined,
): Array<{ taxa: number | null; faixas?: FaixaFrete[] }> {
  if (!fc?.features?.length) return [];
  return fc.features.map((f) => ({
    taxa: f.properties?.taxa == null ? null : Number(f.properties.taxa),
    faixas: f.properties?.faixas ?? [],
  }));
}

export function contarBairrosComTaxa(
  fc: BairrosFreteGeoJson | null | undefined,
): { ativos: number; total: number } {
  const features = fc?.features ?? [];
  const ativos = features.filter((f) =>
    bairroTemEntrega({
      faixas: f.properties?.faixas,
      taxa: f.properties?.taxa,
    }),
  ).length;
  return { ativos, total: features.length };
}

/**
 * Avalia frete respeitando o modo da loja.
 * No modo bairro, resolve o polígono pelas coordenadas (não pelo texto do CEP).
 */
export async function avaliarEntregaDelivery(
  config: DeliveryConfig,
  destLat: number,
  destLng: number,
  subtotalItens: number,
  opts?: OpcoesAvaliacaoFrete,
): Promise<ResultadoFrete> {
  const modo = normalizarModoFrete(config.modo_frete);
  if (modo === "bairro") {
    const bairro =
      opts && "bairro" in opts
        ? opts.bairro
        : await localizarBairroFrete(destLat, destLng);
    return avaliarEntrega(config, destLat, destLng, subtotalItens, {
      ...opts,
      bairro,
    });
  }
  return avaliarEntrega(config, destLat, destLng, subtotalItens, opts);
}
