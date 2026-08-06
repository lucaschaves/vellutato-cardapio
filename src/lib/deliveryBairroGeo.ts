import { distanciaKm, type FaixaFrete } from "./deliveryFrete";

type Pos = { lat: number; lng: number };

/** Extrai todos os anéis [lng, lat][] de um Polygon/MultiPolygon. */
export function extrairAneisGeometria(geometry: {
  type: string;
  coordinates: unknown;
}): number[][][] {
  if (!geometry?.coordinates) return [];
  if (geometry.type === "Polygon") {
    return geometry.coordinates as number[][][];
  }
  if (geometry.type === "MultiPolygon") {
    const multi = geometry.coordinates as number[][][][];
    return multi.flatMap((poly) => poly);
  }
  return [];
}

function pontoEmAnel(lat: number, lng: number, anel: number[][]): boolean {
  // Ray casting (lng/lat como x/y)
  let inside = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const xi = anel[i][0];
    const yi = anel[i][1];
    const xj = anel[j][0];
    const yj = anel[j][1];
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function distPontoSegmentoKm(
  p: Pos,
  aLng: number,
  aLat: number,
  bLng: number,
  bLat: number,
): number {
  // Aproxima em km locais (bom para Floripa ~ lat -27)
  const kmPorGrauLat = 111.32;
  const kmPorGrauLng = 111.32 * Math.cos((p.lat * Math.PI) / 180);
  const px = 0;
  const py = 0;
  const ax = (aLng - p.lng) * kmPorGrauLng;
  const ay = (aLat - p.lat) * kmPorGrauLat;
  const bx = (bLng - p.lng) * kmPorGrauLng;
  const by = (bLat - p.lat) * kmPorGrauLat;
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const ab2 = abx * abx + aby * aby;
  if (ab2 < 1e-12) {
    return Math.hypot(ax, ay);
  }
  let t = (apx * abx + apy * aby) / ab2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * abx;
  const cy = ay + t * aby;
  return Math.hypot(cx, cy);
}

export type IntervaloDistanciaBairro = {
  dist_min_km: number;
  dist_max_km: number;
  /** Loja está dentro do polígono. */
  loja_dentro: boolean;
};

/**
 * Distância mínima e máxima (km) da loja ao polígono do bairro.
 * min = 0 se a loja estiver dentro; senão distância à borda.
 * max = maior distância até um vértice (boa aproximação do “fim” do bairro).
 */
export function intervaloDistanciaLojaBairro(
  lojaLat: number,
  lojaLng: number,
  geometry: { type: string; coordinates: unknown },
): IntervaloDistanciaBairro | null {
  const aneis = extrairAneisGeometria(geometry);
  if (!aneis.length) return null;

  const exterior = aneis[0];
  if (!exterior?.length) return null;

  const lojaDentro = pontoEmAnel(lojaLat, lojaLng, exterior);

  let distMax = 0;
  let distMin = Infinity;

  for (const anel of aneis) {
    for (let i = 0; i < anel.length; i++) {
      const [lng, lat] = anel[i];
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const d = distanciaKm(lojaLat, lojaLng, lat, lng);
      if (d > distMax) distMax = d;

      const j = (i + 1) % anel.length;
      const [lng2, lat2] = anel[j];
      if (!Number.isFinite(lat2) || !Number.isFinite(lng2)) continue;
      const dSeg = distPontoSegmentoKm(
        { lat: lojaLat, lng: lojaLng },
        lng,
        lat,
        lng2,
        lat2,
      );
      if (dSeg < distMin) distMin = dSeg;
    }
  }

  if (!Number.isFinite(distMax) || distMax <= 0) return null;

  return {
    dist_min_km: lojaDentro ? 0 : Number(distMin.toFixed(3)),
    dist_max_km: Number(distMax.toFixed(3)),
    loja_dentro: lojaDentro,
  };
}

export type OpcoesSugestaoFaixas = {
  /** Passo entre faixas (km). Default 2. */
  passo_km?: number;
  /** Taxa da primeira faixa. Default 8. */
  taxa_base?: number;
  /** Quanto sobe a taxa a cada faixa. Default 3. */
  incremento_taxa?: number;
};

/**
 * Gera faixas "até X km" cobrindo [dist_min, dist_max] a cada 1 ou 2 km.
 * A 1ª faixa é o menor múltiplo do passo ≥ dist_min (cobre o início do bairro).
 */
export function sugerirFaixasPorIntervalo(
  distMinKm: number,
  distMaxKm: number,
  opts?: OpcoesSugestaoFaixas,
): { faixas: FaixaFrete[]; raio_km: number } {
  const passo = opts?.passo_km === 1 ? 1 : 2;
  const taxaBase = opts?.taxa_base ?? 8;
  const incremento = opts?.incremento_taxa ?? 3;

  const min = Math.max(0, distMinKm);
  const max = Math.max(min + 0.01, distMaxKm);

  let inicio = Math.ceil(min / passo) * passo;
  if (inicio <= 0) inicio = passo;

  let fim = Math.ceil(max / passo) * passo;
  if (fim < inicio) fim = inicio;

  const marcas: number[] = [];
  for (let k = inicio; k <= fim + 1e-9; k += passo) {
    marcas.push(Number(k.toFixed(2)));
  }

  const faixas: FaixaFrete[] = marcas.map((ate_km, i) => ({
    ate_km,
    taxa: Number((taxaBase + i * incremento).toFixed(2)),
  }));

  return {
    faixas,
    raio_km: marcas[marcas.length - 1] ?? Number(max.toFixed(2)),
  };
}
