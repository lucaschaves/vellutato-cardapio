import { describe, expect, it } from "vitest";
import type { Insumo } from "./insumos";
import {
  alertaMargemBaixa,
  custoExplosao,
  explodeFicha,
  fichaCustoDesatualizado,
  fichaQtdParaBase,
  insumoPrecoDesatualizado,
  margemSobrePreco,
  perfilEmbalagemItem,
  sacolasPedido,
  type FichaTecnica,
  type FichaTecnicaItem,
} from "./fichasTecnicas";

function ficha(parcial: Partial<FichaTecnica> & Pick<FichaTecnica, "id">): FichaTecnica {
  return {
    nome: "X",
    descricao: null,
    observacao: null,
    tipo: "produto",
    status: "ativa",
    rendimento: 1,
    escopo: null,
    custo_calculado: null,
    custo_atualizado_em: null,
    criado_em: "",
    atualizado_em: "",
    ...parcial,
  };
}

const manteiga: Pick<Insumo, "id" | "tipo" | "preco_atual" | "nome"> = {
  id: "ins-m",
  tipo: "peso",
  preco_atual: 40,
  nome: "Manteiga",
};
const tomate: Pick<Insumo, "id" | "tipo" | "preco_atual" | "nome"> = {
  id: "ins-t",
  tipo: "volume",
  preco_atual: 8,
  nome: "Molho tomate",
};

describe("fichaQtdParaBase", () => {
  it("converte g e ml para kg/L", () => {
    expect(fichaQtdParaBase(200, "g", "peso")).toBeCloseTo(0.2);
    expect(fichaQtdParaBase(500, "ml", "volume")).toBeCloseTo(0.5);
    expect(fichaQtdParaBase(2, "un", "contagem")).toBe(2);
  });
});

describe("explodeFicha", () => {
  it("divide o lote pelo rendimento", () => {
    const f = ficha({ id: "f1", rendimento: 8 });
    const itens: FichaTecnicaItem[] = [
      {
        id: "i1",
        ficha_id: "f1",
        insumo_id: "ins-m",
        ficha_filha_id: null,
        quantidade: 200,
        unidade: "g",
        observacao: null,
      },
    ];
    const consumo = explodeFicha(f, itens, 1, {
      fichasPorId: new Map(),
      itensPorFicha: new Map(),
      insumosPorId: new Map([["ins-m", manteiga]]),
    });
    expect(consumo[0]?.quantidade_base).toBeCloseTo(0.2 / 8);
  });

  it("explode sub-ficha em porções", () => {
    const pai = ficha({ id: "pai", rendimento: 8 });
    const molho = ficha({ id: "molho", rendimento: 10, nome: "Molho" });
    const itensPai: FichaTecnicaItem[] = [
      {
        id: "p1",
        ficha_id: "pai",
        insumo_id: null,
        ficha_filha_id: "molho",
        quantidade: 2,
        unidade: null,
        observacao: null,
      },
    ];
    const itensMolho: FichaTecnicaItem[] = [
      {
        id: "m1",
        ficha_id: "molho",
        insumo_id: "ins-t",
        ficha_filha_id: null,
        quantidade: 1000,
        unidade: "ml",
        observacao: null,
      },
    ];
    const consumo = explodeFicha(pai, itensPai, 1, {
      fichasPorId: new Map([["molho", molho]]),
      itensPorFicha: new Map([["molho", itensMolho]]),
      insumosPorId: new Map([["ins-t", tomate]]),
    });
    // 2 porções no lote de 8 → 0,25 porção; molho 1 L / 10 = 0,025 L
    expect(consumo[0]?.quantidade_base).toBeCloseTo(0.025);
  });
});

describe("custoExplosao / margem", () => {
  it("calcula custo e marca incompleto sem preço", () => {
    const r = custoExplosao(
      [{ insumo_id: "ins-m", quantidade_base: 0.1 }],
      new Map([["ins-m", manteiga]]),
    );
    expect(r.custo).toBeCloseTo(4);
    expect(r.incompleto).toBe(false);
    expect(margemSobrePreco(10, 4)).toBe(60);
  });
});

describe("perfilEmbalagemItem / sacolas", () => {
  it("mesa loja não embala", () => {
    expect(
      perfilEmbalagemItem({ origem: "mesa", modoConsumo: "loja" }),
    ).toBeNull();
  });
  it("delivery entrega vs retirada", () => {
    expect(
      perfilEmbalagemItem({
        origem: "delivery",
        modalidade: "entrega",
        modoConsumo: "levar",
      }),
    ).toBe("delivery");
    expect(
      perfilEmbalagemItem({
        origem: "delivery",
        modalidade: "retirada",
        modoConsumo: "levar",
      }),
    ).toBe("levar_rapido");
  });
  it("ceil de sacolas", () => {
    expect(sacolasPedido(9, 4)).toBe(3);
    expect(sacolasPedido(0, 4)).toBe(0);
  });
});

describe("alertas", () => {
  it("margem baixa abaixo de 30%", () => {
    expect(alertaMargemBaixa(10, 8)).toBe(true);
    expect(alertaMargemBaixa(10, 4)).toBe(false);
  });
  it("preço de insumo velho ou ausente", () => {
    expect(
      insumoPrecoDesatualizado({ preco_atual: null, preco_atualizado_em: null }),
    ).toBe(true);
    const recente = new Date().toISOString();
    expect(
      insumoPrecoDesatualizado({
        preco_atual: 10,
        preco_atualizado_em: recente,
      }),
    ).toBe(false);
    const velho = new Date(Date.now() - 40 * 86400000).toISOString();
    expect(
      insumoPrecoDesatualizado({
        preco_atual: 10,
        preco_atualizado_em: velho,
      }),
    ).toBe(true);
  });
  it("custo da ficha diverge do vivo", () => {
    expect(
      fichaCustoDesatualizado(
        { custo_calculado: 2, custo_atualizado_em: null },
        2.5,
        false,
      ),
    ).toBe(true);
    expect(
      fichaCustoDesatualizado(
        { custo_calculado: 2.5, custo_atualizado_em: null },
        2.5,
        false,
      ),
    ).toBe(false);
  });
});
