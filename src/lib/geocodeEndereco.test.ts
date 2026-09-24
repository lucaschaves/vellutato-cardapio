import { describe, expect, it } from "vitest";
import {
  coordsCepConfiaveisParaBairro,
  formatarCepComHifen,
  nominatimHitAceitavel,
  pontoProximoDoBairro,
} from "./geocodeEndereco";

describe("formatarCepComHifen", () => {
  it("formata 8 dígitos", () => {
    expect(formatarCepComHifen("88040520")).toBe("88040-520");
  });

  it("ignora máscara já presente", () => {
    expect(formatarCepComHifen("88040-520")).toBe("88040-520");
  });
});

describe("nominatimHitAceitavel", () => {
  it("rejeita centroide de cidade (bug 88040520)", () => {
    expect(
      nominatimHitAceitavel({
        lat: "-27.5973002",
        lon: "-48.5496098",
        addresstype: "city",
        class: "boundary",
        type: "administrative",
        place_rank: 16,
        display_name: "Florianópolis, Santa Catarina, Brazil",
      }),
    ).toBe(false);
  });

  it("aceita postcode na Carvoeira", () => {
    expect(
      nominatimHitAceitavel({
        lat: "-27.6061582",
        lon: "-48.5267208",
        addresstype: "postcode",
        class: "place",
        type: "postcode",
        place_rank: 21,
        display_name: "88040-520, Carvoeira, Florianópolis",
      }),
    ).toBe(true);
  });

  it("aceita suburb", () => {
    expect(
      nominatimHitAceitavel({
        lat: "-27.6035661",
        lon: "-48.5280992",
        addresstype: "suburb",
        class: "boundary",
        type: "administrative",
        place_rank: 20,
      }),
    ).toBe(true);
  });

  it("rejeita boundary administrativo de cidade sem addresstype", () => {
    expect(
      nominatimHitAceitavel({
        lat: "-27.5973002",
        lon: "-48.5496098",
        class: "boundary",
        type: "administrative",
        place_rank: 14,
      }),
    ).toBe(false);
  });
});

/** Polígono aproximado do Cacupé (Norte da Ilha). */
const CACUPE_GEOM = {
  type: "Polygon",
  coordinates: [
    [
      [-48.535, -27.545],
      [-48.515, -27.545],
      [-48.515, -27.520],
      [-48.535, -27.520],
      [-48.535, -27.545],
    ],
  ],
};

const FEATURES_CACUPE = [
  {
    properties: { nome: "Cacupé" },
    geometry: CACUPE_GEOM,
  },
];

describe("coordsCepConfiaveisParaBairro (bug 88050 / frete Cacupé)", () => {
  it("rejeita âncora BrasilAPI no Centro quando bairro é Cacupé", () => {
    // Coordenadas que a BrasilAPI devolve para 88050-xxx
    expect(
      coordsCepConfiaveisParaBairro(
        -27.59667,
        -48.54917,
        "Cacupé",
        FEATURES_CACUPE,
      ),
    ).toBe(false);
  });

  it("aceita ponto dentro do Cacupé", () => {
    expect(
      coordsCepConfiaveisParaBairro(
        -27.5309,
        -48.5244,
        "Cacupé",
        FEATURES_CACUPE,
      ),
    ).toBe(true);
  });

  it("aceita se não há feature do bairro (não invalida)", () => {
    expect(
      coordsCepConfiaveisParaBairro(-27.59667, -48.54917, "Cacupé", []),
    ).toBe(true);
  });
});

describe("pontoProximoDoBairro", () => {
  it("Centro não está próximo do Cacupé", () => {
    expect(pontoProximoDoBairro(-27.59667, -48.54917, CACUPE_GEOM)).toBe(
      false,
    );
  });

  it("ponto no Cacupé está próximo", () => {
    expect(pontoProximoDoBairro(-27.5309, -48.5244, CACUPE_GEOM)).toBe(true);
  });
});
