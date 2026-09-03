import { describe, expect, it } from "vitest";
import {
  intervaloDistanciaLojaBairro,
  nomesBairroCompativeis,
  pontoEmGeometria,
  sugerirFaixasPorIntervalo,
} from "./deliveryBairroGeo";
import {
  escolherBairroNoGeojson,
  type BairrosFreteGeoJson,
} from "./deliveryBairros";

/** Quadrado ~1°×1° centrado perto de Floripa (só para testes geométricos). */
const QUADRADO = {
  type: "Polygon",
  coordinates: [
    [
      [-48.55, -27.60],
      [-48.54, -27.60],
      [-48.54, -27.59],
      [-48.55, -27.59],
      [-48.55, -27.60],
    ],
  ],
};

describe("sugerirFaixasPorIntervalo", () => {
  it("gera faixas a cada 2 km cobrindo o intervalo", () => {
    const { faixas, raio_km } = sugerirFaixasPorIntervalo(4.2, 7.8, {
      passo_km: 2,
      taxa_base: 8,
      incremento_taxa: 3,
    });
    expect(faixas.map((f) => f.ate_km)).toEqual([6, 8]);
    expect(faixas.map((f) => f.taxa)).toEqual([8, 11]);
    expect(raio_km).toBe(8);
  });

  it("com loja no bairro começa no passo e cobre o max", () => {
    const { faixas } = sugerirFaixasPorIntervalo(0, 3.5, { passo_km: 2 });
    expect(faixas.map((f) => f.ate_km)).toEqual([2, 4]);
  });

  it("passo 1 km gera marcas densas", () => {
    const { faixas } = sugerirFaixasPorIntervalo(2.1, 4.4, { passo_km: 1 });
    expect(faixas.map((f) => f.ate_km)).toEqual([3, 4, 5]);
  });
});

describe("intervaloDistanciaLojaBairro", () => {
  it("loja dentro → dist_min 0", () => {
    const r = intervaloDistanciaLojaBairro(-27.595, -48.545, QUADRADO);
    expect(r?.loja_dentro).toBe(true);
    expect(r?.dist_min_km).toBe(0);
  });
});

describe("nomesBairroCompativeis", () => {
  it("casa Carvoeira ignorando acento/case", () => {
    expect(nomesBairroCompativeis("Carvoeira", "carvoeira")).toBe(true);
  });
});

describe("escolherBairroNoGeojson", () => {
  const grande = {
    type: "Polygon",
    coordinates: [
      [
        [-48.55, -27.62],
        [-48.50, -27.62],
        [-48.50, -27.59],
        [-48.55, -27.59],
        [-48.55, -27.62],
      ],
    ],
  };
  const carvoeira = {
    type: "Polygon",
    coordinates: [
      [
        [-48.53, -27.61],
        [-48.52, -27.61],
        [-48.52, -27.60],
        [-48.53, -27.60],
        [-48.53, -27.61],
      ],
    ],
  };

  const fc: BairrosFreteGeoJson = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          id: "1",
          slug: "centro",
          nome: "Centro",
          regiao: "Central",
          distrito: "Sede",
          taxa: 10,
          raio_km: 5,
          faixas: [{ ate_km: 5, taxa: 10 }],
          descontos: [],
        },
        geometry: grande,
      },
      {
        type: "Feature",
        properties: {
          id: "2",
          slug: "carvoeira",
          nome: "Carvoeira",
          regiao: "Central",
          distrito: "Trindade",
          taxa: 8,
          raio_km: 4,
          faixas: [{ ate_km: 4, taxa: 8 }],
          descontos: [],
        },
        geometry: carvoeira,
      },
    ],
  };

  it("com hint Carvoeira escolhe Carvoeira mesmo com Centro maior cobrindo", () => {
    expect(pontoEmGeometria(-27.605, -48.525, carvoeira)).toBe(true);
    expect(pontoEmGeometria(-27.605, -48.525, grande)).toBe(true);
    const r = escolherBairroNoGeojson(fc, -27.605, -48.525, "Carvoeira");
    expect(r?.nome).toBe("Carvoeira");
  });

  it("hint Carvoeira vence mesmo se o ponto cair no Centro", () => {
    const r = escolherBairroNoGeojson(fc, -27.605, -48.545, "Carvoeira");
    expect(r?.nome).toBe("Carvoeira");
  });

  it("sem hint escolhe o menor polígono", () => {
    const r = escolherBairroNoGeojson(fc, -27.605, -48.525, null);
    expect(r?.nome).toBe("Carvoeira");
  });
});
