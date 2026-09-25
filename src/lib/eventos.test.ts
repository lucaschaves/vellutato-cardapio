import { describe, expect, it } from "vitest";
import {
  dataMinimaRetirada,
  descontoCaixasEvento,
  faixaDescontoEvento,
  saboresValidos,
} from "./eventos";

const faixas = [
  { qtd_min_caixas: 3, tipo: "percentual" as const, valor: 10 },
  { qtd_min_caixas: 6, tipo: "fixo" as const, valor: 40 },
];

describe("desconto de caixas de evento", () => {
  it("não aplica abaixo da primeira faixa", () => {
    expect(descontoCaixasEvento(50, 2, faixas)).toBe(0);
  });

  it("aplica percentual na faixa vigente", () => {
    expect(descontoCaixasEvento(50, 3, faixas)).toBe(15);
  });

  it("usa a faixa de maior quantidade", () => {
    expect(faixaDescontoEvento(6, faixas)?.tipo).toBe("fixo");
    expect(descontoCaixasEvento(50, 6, faixas)).toBe(40);
  });
});

describe("sabores da caixa", () => {
  it("exige min e max", () => {
    expect(saboresValidos(["A"], 2, 3, ["A", "B", "C"])).toMatch(/pelo menos/);
    expect(saboresValidos(["A", "B", "C", "A"], 1, 2, ["A", "B", "C"])).toMatch(
      /máximo/,
    );
    expect(saboresValidos(["A", "B"], 1, 2, ["A", "B", "C"])).toBeNull();
  });
});

describe("data mínima", () => {
  it("soma os dias de antecedência no calendário da loja", () => {
    const agora = new Date("2026-09-25T15:00:00.000Z");
    expect(dataMinimaRetirada(2, agora)).toBe("2026-09-27");
  });
});
