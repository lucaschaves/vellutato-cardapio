import {
  intervaloDistanciaLojaBairro,
  nomesBairroCompativeis,
  pontoEmGeometria,
} from "./deliveryBairroGeo";
import { distanciaKm } from "./deliveryFrete";

/**
 * Geocodificação de endereços BR para frete delivery.
 * Preferência: Nominatim (rua/número/bairro) → CEP confiável.
 * BrasilAPI às vezes devolve centroide da cidade (ex.: 88050 → Centro
 * em vez de Cacupé/Santo Antônio) — essas coords são descartadas.
 */

/** Nominatim longe demais do CEP = pulou para outro bairro (ex.: Centro). */
export const DIST_MAX_NOMINATIM_VS_CEP_KM = 1.2;

/**
 * Âncora do CEP longe demais do polígono do bairro = coords ruins
 * (BrasilAPI “Centro” para CEP do Norte da Ilha).
 */
export const DIST_MAX_ANCORA_VS_BAIRRO_KM = 3;

export type Coords = { latitude: number; longitude: number };

export type EnderecoParaGeocode = {
  rua: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
};

type NominatimHit = {
  lat: string;
  lon: string;
  addresstype?: string;
  class?: string;
  type?: string;
  place_rank?: number;
  display_name?: string;
};

type GeomBairro = { type: string; coordinates: unknown };

type FeatureBairro = {
  properties?: { nome?: string } | null;
  geometry: GeomBairro;
};

const NOMINATIM_HEADERS = {
  Accept: "application/json",
  "User-Agent": "VellutatoCardapioDigital/1.0 (delivery)",
};

/** Tipos grosseiros demais para frete (ex.: centro de Florianópolis). */
const ADDRESSTYPE_REJEITADO = new Set([
  "country",
  "state",
  "region",
  "county",
  "municipality",
  "city",
  "town",
]);

/** place_rank ≤ 16 ≈ cidade ou maior no Nominatim. */
const PLACE_RANK_CIDADE_MAX = 16;

export function formatarCepComHifen(cepDigitos: string): string {
  const d = cepDigitos.replace(/\D/g, "");
  if (d.length !== 8) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

/** True se o hit do Nominatim é usável para ponto de entrega. */
export function nominatimHitAceitavel(hit: NominatimHit): boolean {
  const tipo = (hit.addresstype || "").toLowerCase();
  if (ADDRESSTYPE_REJEITADO.has(tipo)) return false;

  const rank = Number(hit.place_rank);
  if (
    hit.class === "boundary" &&
    hit.type === "administrative" &&
    Number.isFinite(rank) &&
    rank <= PLACE_RANK_CIDADE_MAX
  ) {
    return false;
  }

  const lat = Number(hit.lat);
  const lon = Number(hit.lon);
  return Number.isFinite(lat) && Number.isFinite(lon);
}

function coordsDeHit(hit: NominatimHit): Coords | null {
  if (!nominatimHitAceitavel(hit)) return null;
  return {
    latitude: Number(hit.lat),
    longitude: Number(hit.lon),
  };
}

/** Ordem de preferência entre hits do mesmo response. */
function scoreHit(hit: NominatimHit): number {
  const t = (hit.addresstype || hit.type || "").toLowerCase();
  if (t === "house" || t === "building") return 100;
  if (t === "road" || t === "street") return 80;
  if (t === "postcode") return 70;
  if (t === "suburb" || t === "neighbourhood" || t === "neighborhood") return 60;
  if (t === "hamlet" || t === "quarter") return 50;
  return 40;
}

async function nominatimBusca(
  params: Record<string, string>,
): Promise<Coords | null> {
  const qs = new URLSearchParams({
    format: "json",
    limit: "5",
    addressdetails: "1",
    countrycodes: "br",
    ...params,
  });
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?${qs.toString()}`,
    { headers: NOMINATIM_HEADERS },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as NominatimHit[];
  if (!Array.isArray(data) || data.length === 0) return null;

  const aceitos = data
    .filter(nominatimHitAceitavel)
    .sort((a, b) => scoreHit(b) - scoreHit(a));
  const melhor = aceitos[0];
  return melhor ? coordsDeHit(melhor) : null;
}

/**
 * True se o ponto está no polígono do bairro ou a até `maxKm` da borda.
 * Detecta âncora BrasilAPI no Centro quando o CEP é Cacupé/Santo Antônio.
 */
export function pontoProximoDoBairro(
  lat: number,
  lng: number,
  geometry: GeomBairro,
  maxKm = DIST_MAX_ANCORA_VS_BAIRRO_KM,
): boolean {
  if (pontoEmGeometria(lat, lng, geometry)) return true;
  const dist = intervaloDistanciaLojaBairro(lat, lng, geometry);
  return dist != null && dist.dist_min_km <= maxKm;
}

export function acharGeometriaBairro(
  features: FeatureBairro[],
  bairro: string,
): GeomBairro | null {
  const hint = (bairro || "").trim();
  if (!hint || !features.length) return null;
  const feat = features.find((f) =>
    nomesBairroCompativeis(f.properties?.nome || "", hint),
  );
  return feat?.geometry ?? null;
}

/**
 * Valida lat/lng do CEP contra o bairro informado (texto ViaCEP/BrasilAPI).
 * Se o ponto não bate com o polígono, as coords são lixo (ex.: Centro).
 */
export function coordsCepConfiaveisParaBairro(
  lat: number,
  lng: number,
  bairro: string,
  features: FeatureBairro[],
): boolean {
  const geom = acharGeometriaBairro(features, bairro);
  if (!geom) return true; // sem mapa do bairro → não invalida
  return pontoProximoDoBairro(lat, lng, geom);
}

let cacheBairros: FeatureBairro[] | null = null;

/** GeoJSON estático dos bairros oficiais (Floripa). */
export async function carregarFeaturesBairrosFloripa(): Promise<
  FeatureBairro[]
> {
  if (cacheBairros) return cacheBairros;
  try {
    const res = await fetch("/geo/floripa-bairros.geojson");
    if (!res.ok) return [];
    const data = (await res.json()) as {
      features?: FeatureBairro[];
    };
    cacheBairros = Array.isArray(data.features) ? data.features : [];
    return cacheBairros;
  } catch {
    return [];
  }
}

/** Só para testes — limpa o cache do GeoJSON. */
export function _resetCacheBairrosFloripaParaTestes(): void {
  cacheBairros = null;
}

/**
 * BrasilAPI CEP v2 — costuma trazer lat/lng do trecho (melhor que Nominatim só-CEP).
 * Em várias faixas (ex.: 88050) devolve o centroide da cidade — use
 * `sanitizarCoordsCep` antes de gravar no endereço.
 */
export async function coordsPorCepBrasilApi(
  cep: string,
): Promise<
  (Coords & {
    rua?: string;
    bairro?: string;
    cidade?: string;
    uf?: string;
  }) | null
> {
  const limpo = cep.replace(/\D/g, "");
  if (limpo.length !== 8) return null;
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cep/v2/${limpo}`);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      street?: string;
      neighborhood?: string;
      city?: string;
      state?: string;
      location?: {
        coordinates?: { latitude?: string; longitude?: string };
      };
    };
    const lat = Number(data.location?.coordinates?.latitude);
    const lng = Number(data.location?.coordinates?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      latitude: lat,
      longitude: lng,
      rua: data.street || undefined,
      bairro: data.neighborhood || undefined,
      cidade: data.city || undefined,
      uf: data.state || undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Zera lat/lng do CEP se não bater com o bairro (evita frete “barato” no Centro).
 */
export async function sanitizarCoordsCep(opts: {
  latitude: number | null;
  longitude: number | null;
  bairro: string;
}): Promise<{ latitude: number | null; longitude: number | null }> {
  const { latitude, longitude, bairro } = opts;
  if (
    latitude == null ||
    longitude == null ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !bairro.trim()
  ) {
    return { latitude, longitude };
  }

  const features = await carregarFeaturesBairrosFloripa();
  if (!features.length) return { latitude, longitude };

  if (coordsCepConfiaveisParaBairro(latitude, longitude, bairro, features)) {
    return { latitude, longitude };
  }

  return { latitude: null, longitude: null };
}

function ruaSemApostrofo(rua: string): string {
  return rua.replace(/[''`´]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Geocodifica endereço no Brasil.
 * Com número: tenta ponto na rua; senão CEP (só se confiável vs bairro).
 */
export async function geocodificarEndereco(
  opts: EnderecoParaGeocode,
): Promise<Coords | null> {
  const rua = (opts.rua || "").trim();
  const numero = (opts.numero || "").trim();
  const bairro = (opts.bairro || "").trim();
  const cidade = (opts.cidade || "").trim();
  const uf = (opts.uf || "").trim().toUpperCase().slice(0, 2);
  const cep = (opts.cep || "").replace(/\D/g, "");
  const cepHifen = formatarCepComHifen(cep);

  if (!cidade && !cep) {
    throw new Error("Informe cidade ou CEP para localizar o endereço.");
  }
  if (!rua && !cep) {
    throw new Error("Informe a rua ou o CEP para localizar o endereço.");
  }

  const ruas = rua
    ? Array.from(new Set([rua, ruaSemApostrofo(rua)].filter(Boolean)))
    : [];

  const features = bairro ? await carregarFeaturesBairrosFloripa() : [];
  const geomBairro = bairro ? acharGeometriaBairro(features, bairro) : null;

  const brasilApi =
    cep.length === 8 ? await coordsPorCepBrasilApi(cep) : null;

  const ancoraConfiavel =
    brasilApi &&
    (!bairro ||
      !features.length ||
      coordsCepConfiaveisParaBairro(
        brasilApi.latitude,
        brasilApi.longitude,
        bairro,
        features,
      ))
      ? brasilApi
      : null;

  const hitAceito = (hit: Coords): boolean => {
    // Com polígono do bairro: só aceita ponto na região (evita Centro).
    if (geomBairro) {
      return pontoProximoDoBairro(
        hit.latitude,
        hit.longitude,
        geomBairro,
      );
    }
    // Com âncora CEP confiável: Nominatim precisa ficar perto dela.
    if (ancoraConfiavel) {
      return (
        distanciaKm(
          ancoraConfiavel.latitude,
          ancoraConfiavel.longitude,
          hit.latitude,
          hit.longitude,
        ) <= DIST_MAX_NOMINATIM_VS_CEP_KM
      );
    }
    // Sem mapa nem âncora: melhor Nominatim do que nada.
    return true;
  };

  // 1) Estruturado: rua + número
  if (numero && cidade) {
    for (const r of ruas) {
      const hit = await nominatimBusca({
        street: `${numero} ${r}`.trim(),
        city: cidade,
        ...(uf ? { state: uf } : {}),
        country: "Brazil",
      });
      if (hit && hitAceito(hit)) return hit;
    }
  }

  // 2) Texto livre com bairro (prioritário quando CEP veio no Centro)
  const tentativasQ: string[] = [];
  if (rua) {
    tentativasQ.push(
      [rua, numero, bairro, cidade, uf, cepHifen || cep, "Brasil"]
        .filter((p) => Boolean(p && String(p).trim()))
        .join(", "),
    );
    const ruaAlt = ruaSemApostrofo(rua);
    if (ruaAlt !== rua) {
      tentativasQ.push(
        [ruaAlt, numero, bairro, cidade, uf, cepHifen || cep, "Brasil"]
          .filter((p) => Boolean(p && String(p).trim()))
          .join(", "),
      );
    }
  }
  if (bairro && cidade) {
    tentativasQ.push(
      [bairro, cidade, uf, "Brasil"]
        .filter((p) => Boolean(p && String(p).trim()))
        .join(", "),
    );
  }
  for (const q of tentativasQ) {
    if (!q || q.split(",").length < 2) continue;
    const hit = await nominatimBusca({ q });
    if (hit && hitAceito(hit)) return hit;
  }

  // 3) Estruturado: só rua
  if (cidade) {
    for (const r of ruas) {
      const hit = await nominatimBusca({
        street: r,
        city: cidade,
        ...(uf ? { state: uf } : {}),
        country: "Brazil",
      });
      if (hit && hitAceito(hit)) return hit;
    }
  }

  // 4) BrasilAPI só se coords baterem com o bairro
  if (ancoraConfiavel) {
    return {
      latitude: ancoraConfiavel.latitude,
      longitude: ancoraConfiavel.longitude,
    };
  }

  // 5) Nominatim postcode com hífen (sem city — city+CEP dígitos = centro da cidade)
  if (cep.length === 8) {
    const hitHifen = await nominatimBusca({
      postalcode: cepHifen,
      country: "Brazil",
    });
    if (hitHifen && hitAceito(hitHifen)) return hitHifen;

    const hitQ = await nominatimBusca({
      q: `${cepHifen}, Brasil`,
    });
    if (hitQ && hitAceito(hitQ)) return hitQ;
  }

  return null;
}
