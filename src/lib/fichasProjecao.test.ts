import { describe, expect, it } from "vitest";
import type { Insumo } from "./insumos";
import { projetarConsumoInsumos } from "./fichasProjecao";
import type { FichaTecnica, FichaTecnicaItem } from "./fichasTecnicas";

const farinha: Pick<
  Insumo,
  | "id"
  | "nome"
  | "tipo"
  | "preco_atual"
  | "quantidade_atual"
  | "estoque_minimo"
  | "conteudo_valor"
  | "conteudo_unidade"
  | "unidade"
> = {
  id: "far",
  nome: "Farinha",
  tipo: "peso",
  preco_atual: 5,
  quantidade_atual: 1,
  estoque_minimo: 0.2,
  conteudo_valor: 1,
  conteudo_unidade: "kg",
  unidade: "saco",
};

const ficha: FichaTecnica = {
  id: "fp",
  nome: "Pão",
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
};

const itemFicha: FichaTecnicaItem = {
  id: "i",
  ficha_id: "fp",
  insumo_id: "far",
  ficha_filha_id: null,
  quantidade: 100,
  unidade: "g",
  observacao: null,
};

describe("projetarConsumoInsumos", () => {
  it("média diária e sugestão de compra", () => {
    const linhas = projetarConsumoInsumos({
      janelaDias: 7,
      pedidos: [{ id: "p1", origem: "balcao", modalidade: null }],
      itens: [
        {
          id: "it1",
          pedido_id: "p1",
          produto_id: "prod",
          quantidade: 14,
          modo_consumo: "loja",
        },
      ],
      adicionaisPorItem: new Map(),
      escolhasComboPorItem: new Map(),
      produtosPorId: new Map([
        [
          "prod",
          {
            id: "prod",
            tipo: "simples",
            ficha_produto_id: "fp",
            ficha_embalagem_viagem_id: null,
            ficha_embalagem_delivery_id: null,
            ficha_embalagem_levar_rapido_id: null,
          },
        ],
      ]),
      adicionaisFichaPorId: new Map(),
      fichasPorId: new Map([["fp", ficha]]),
      itensPorFicha: new Map([["fp", [itemFicha]]]),
      insumos: [farinha],
      fichaEmbPedidoDeliveryId: null,
      fichaEmbPedidoRetiradaId: null,
      capacidadeDelivery: 4,
      capacidadeRetirada: 4,
      coberturaDias: 7,
    });
    // 14 pães × 0,1 kg / 7 dias = 0,2 kg/dia; estoque 1 kg → 5 dias
    expect(linhas[0]?.consumoDia).toBeCloseTo(0.2);
    expect(linhas[0]?.diasRestantes).toBeCloseTo(5);
    expect(linhas[0]?.qtdSugeridaBase).toBeCloseTo(0.4);
  });
});
