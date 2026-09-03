import { describe, expect, it } from "vitest";
import {
  formatarCepComHifen,
  nominatimHitAceitavel,
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
