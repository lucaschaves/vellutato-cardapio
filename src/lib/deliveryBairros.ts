import { supabase } from "./supabase";
import {
  intervaloDistanciaLojaBairro,
  nomesBairroCompativeis,
  pontoEmGeometria,
} from "./deliveryBairroGeo";
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

/** Se o CEP nomeia um bairro oficial, aceita mesmo com geocode um pouco fora do polígono. */
export const DIST_MAX_HINT_KM = 4;

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

function featureParaBairro(
  f: BairrosFreteGeoJson["features"][number],
): BairroFreteResolvido | null {
  return mapearBairro(f.properties);
}

/**
 * Resolve o bairro oficial.
 * 1) Nome do CEP (Carvoeira) se o ponto está no polígono ou até DIST_MAX_HINT_KM.
 * 2) Entre os que cobrem o ponto, o de menor área (evita Centro/distrito por cima).
 */
export function escolherBairroNoGeojson(
  fc: BairrosFreteGeoJson,
  lat: number,
  lng: number,
  bairroHint?: string | null,
): BairroFreteResolvido | null {
  const hint = (bairroHint || "").trim();
  if (hint) {
    const porNome = fc.features.filter((f) =>
      nomesBairroCompativeis(f.properties?.nome || "", hint),
    );
    if (porNome.length === 1) {
      const feat = porNome[0];
      if (pontoEmGeometria(lat, lng, feat.geometry)) {
        return featureParaBairro(feat);
      }
      const dist = intervaloDistanciaLojaBairro(lat, lng, feat.geometry);
      if (dist && dist.dist_min_km <= DIST_MAX_HINT_KM) {
        return featureParaBairro(feat);
      }
    } else if (porNome.length > 1) {
      const cobrindoHint = porNome.find((f) =>
        pontoEmGeometria(lat, lng, f.geometry),
      );
      if (cobrindoHint) return featureParaBairro(cobrindoHint);
    }
  }

  const cobrindo = fc.features.filter((f) =>
    pontoEmGeometria(lat, lng, f.geometry),
  );
  if (!cobrindo.length) return null;

  // Menor bbox ≈ menor bairro (evita distrito/Centro grande por cima da Carvoeira)
  let melhor: (typeof cobrindo)[number] | null = null;
  let melhorArea = Infinity;
  for (const f of cobrindo) {
    const aneis =
      f.geometry.type === "Polygon"
        ? [(f.geometry.coordinates as number[][][])[0]]
        : (f.geometry.coordinates as number[][][][]).map((p) => p[0]);
    let minLng = Infinity,
      maxLng = -Infinity,
      minLat = Infinity,
      maxLat = -Infinity;
    for (const anel of aneis) {
      if (!anel) continue;
      for (const pt of anel) {
        const [x, y] = pt;
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        if (x < minLng) minLng = x;
        if (x > maxLng) maxLng = x;
        if (y < minLat) minLat = y;
        if (y > maxLat) maxLat = y;
      }
    }
    const area = (maxLng - minLng) * (maxLat - minLat);
    if (area < melhorArea) {
      melhorArea = area;
      melhor = f;
    }
  }
  return melhor ? featureParaBairro(melhor) : null;
}

export async function listarBairrosFreteGeojson(): Promise<BairrosFreteGeoJson> {
  const { data, error } = await supabase.rpc("listar_bairros_frete_geojson");
  if (error) throw new Error(error.message);
  const fc = data as BairrosFreteGeoJson | null;
  if (!fc || fc.type !== "FeatureCollection" || !Array.isArray(fc.features)) {
    return { type: "FeatureCollection", features: [] };
  }
  return {
    type: "FeatureCollection",
    features: fc.features.map((f) => {
      const mapped = mapearBairro(f.properties);
      if (!mapped) return f;
      return {
        ...f,
        properties: {
          ...f.properties,
          id: mapped.id,
          slug: mapped.slug,
          nome: mapped.nome,
          regiao: mapped.regiao,
          distrito: mapped.distrito,
          taxa: mapped.taxa,
          raio_km: mapped.raio_km,
          faixas: mapped.faixas,
          descontos: mapped.descontos,
        },
      };
    }),
  };
}

export async function localizarBairroFrete(
  lat: number,
  lng: number,
  bairroHint?: string | null,
): Promise<BairroFreteResolvido | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  // Com hint do CEP (ex.: Carvoeira), resolve no GeoJSON para não cair em
  // polígono grande sobreposto (ex.: Centro antigo / distrito).
  const hint = (bairroHint || "").trim();
  if (hint) {
    try {
      const fc = await listarBairrosFreteGeojson();
      const escolhido = escolherBairroNoGeojson(fc, lat, lng, hint);
      if (escolhido) return escolhido;
    } catch (e) {
      console.warn("[BAIRROS] geojson hint falhou, RPC:", e);
    }
  }

  const { data, error } = await supabase.rpc("localizar_bairro_frete", {
    p_lat: lat,
    p_lng: lng,
  });
  if (error) {
    console.error("[BAIRROS] localizar:", error.message);
    return null;
  }
  const viaRpc = mapearBairro(data);
  if (!viaRpc || !hint) return viaRpc;

  // RPC divergiu do CEP: tenta geojson mesmo sem match prévio
  try {
    const fc = await listarBairrosFreteGeojson();
    const escolhido = escolherBairroNoGeojson(fc, lat, lng, hint);
    if (escolhido) return escolhido;
  } catch {
    /* mantém RPC */
  }
  return viaRpc;
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

export type OpcoesAvaliacaoFreteDelivery = OpcoesAvaliacaoFrete & {
  /** Bairro do CEP/formulário — desempata polígonos sobrepostos. */
  bairroHint?: string | null;
};

/**
 * Avalia frete respeitando o modo da loja.
 * No modo bairro, resolve o polígono pelas coordenadas (+ hint do CEP).
 */
export async function avaliarEntregaDelivery(
  config: DeliveryConfig,
  destLat: number,
  destLng: number,
  subtotalItens: number,
  opts?: OpcoesAvaliacaoFreteDelivery,
): Promise<ResultadoFrete> {
  const modo = normalizarModoFrete(config.modo_frete);
  if (modo === "bairro") {
    const bairro =
      opts && "bairro" in opts && opts.bairro !== undefined
        ? opts.bairro
        : await localizarBairroFrete(destLat, destLng, opts?.bairroHint);
    return avaliarEntrega(config, destLat, destLng, subtotalItens, {
      ...opts,
      bairro,
    });
  }
  return avaliarEntrega(config, destLat, destLng, subtotalItens, opts);
}
