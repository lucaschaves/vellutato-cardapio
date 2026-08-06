import { describe, expect, it } from "vitest";
import {
  intervaloDistanciaLojaBairro,
  sugerirFaixasPorIntervalo,
} from "./deliveryBairroGeo";

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
  it("marca loja dentro com dist_min 0", () => {
    const r = intervaloDistanciaLojaBairro(-27.595, -48.545, QUADRADO);
    expect(r).not.toBeNull();
    expect(r!.loja_dentro).toBe(true);
    expect(r!.dist_min_km).toBe(0);
    expect(r!.dist_max_km).toBeGreaterThan(0);
  });

  it("loja fora tem dist_min > 0 e max >= min", () => {
    const r = intervaloDistanciaLojaBairro(-27.58, -48.56, QUADRADO);
    expect(r).not.toBeNull();
    expect(r!.loja_dentro).toBe(false);
    expect(r!.dist_min_km).toBeGreaterThan(0);
    expect(r!.dist_max_km).toBeGreaterThanOrEqual(r!.dist_min_km);
  });
});
