import { describe, expect, it } from "vitest";
import {
  margemLiquidaAposTaxas,
  margemLucroCanal,
  precoAbaixoDoMinimo,
  precoEfetivoCanal,
  precoMinimoCanal,
  recalcularContribuicao,
  simularDescontoVolume,
  taxasCanalPct,
} from "./precificacao";

describe("precificacao", () => {
  it("calcula contribuição dual", () => {
    const r = recalcularContribuicao({
      despesasFixas: 10000,
      faturamentoEsperado: 50000,
      qtdItensEsperada: 2000,
    });
    expect(r.pct).toBe(20);
    expect(r.rsUnidade).toBe(5);
  });

  it("preço mínimo no modo %", () => {
    // custo 10, emb 1, lucro 40%, contrib 10%, taxa 27% → den = 0.23
    const r = precoMinimoCanal({
      custo: 10,
      embalagem: 1,
      margemPct: 40,
      contribuicaoModo: "pct_faturamento",
      contribuicaoPct: 10,
      contribuicaoRsUnidade: 0,
      taxasCanalPct: 27,
    });
    expect(r.erro).toBeNull();
    expect(r.precoMinimo).toBeCloseTo(11 / 0.23, 1);
  });

  it("preço mínimo no modo R$/un", () => {
    const r = precoMinimoCanal({
      custo: 10,
      embalagem: 0,
      margemPct: 40,
      contribuicaoModo: "custo_por_unidade",
      contribuicaoPct: 0,
      contribuicaoRsUnidade: 2,
      taxasCanalPct: 10,
    });
    expect(r.erro).toBeNull();
    expect(r.precoMinimo).toBeCloseTo(12 / 0.5, 1);
  });

  it("bloqueia denominador inválido", () => {
    const r = precoMinimoCanal({
      custo: 10,
      margemPct: 50,
      contribuicaoModo: "pct_faturamento",
      contribuicaoPct: 40,
      contribuicaoRsUnidade: 0,
      taxasCanalPct: 20,
    });
    expect(r.precoMinimo).toBeNull();
    expect(r.erro).toBeTruthy();
  });

  it("taxas por canal (iFood all-in, sem cartão)", () => {
    const cfg = {
      taxa_cartao_pct: 2,
      taxa_delivery_pct: 1,
      taxa_ifood_pct: 27,
    };
    expect(taxasCanalPct("loja", cfg)).toBe(2);
    expect(taxasCanalPct("delivery", cfg)).toBe(3);
    expect(taxasCanalPct("ifood", cfg)).toBe(27);
  });

  it("margemLucroCanal usa margem do canal", () => {
    const cfg = {
      margem_lucro_loja_pct: 40,
      margem_lucro_delivery_pct: 35,
      margem_lucro_ifood_pct: 20,
      margem_lucro_pct: 40,
    };
    expect(margemLucroCanal("loja", cfg)).toBe(40);
    expect(margemLucroCanal("delivery", cfg)).toBe(35);
    expect(margemLucroCanal("ifood", cfg)).toBe(20);
  });

  it("precoEfetivoCanal usa preço do canal", () => {
    const p = {
      preco: 10,
      preco_delivery: 12,
      preco_ifood: 15,
      em_promocao: true,
      preco_promocional: 8,
    };
    expect(precoEfetivoCanal(p, "loja")).toBe(8);
    expect(precoEfetivoCanal(p, "delivery")).toBe(12);
    expect(precoEfetivoCanal(p, "ifood")).toBe(15);
  });

  it("simula desconto volume", () => {
    const rows = simularDescontoVolume({
      preco: 100,
      custoTotal: 40,
      faixas: [{ qtd_min: 5, desconto_pct: 10 }],
      taxasCanalPct: 0,
      contribuicaoModo: "pct_faturamento",
      contribuicaoPct: 0,
      contribuicaoRsUnidade: 0,
      precoMinimo: 50,
    });
    expect(rows[0]?.precoLiquido).toBe(90);
    expect(precoAbaixoDoMinimo(40, 50)).toBe(true);
    expect(margemLiquidaAposTaxas({
      precoVenda: 100,
      custoTotal: 40,
      taxasCanalPct: 10,
      contribuicaoModo: "pct_faturamento",
      contribuicaoPct: 10,
      contribuicaoRsUnidade: 0,
    })).toBe(40);
  });
});
