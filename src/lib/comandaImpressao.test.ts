import { describe, expect, it } from "vitest";
import {
  montarComandaImpressao,
  rotuloModalidadeComanda,
  rotuloOrigemComanda,
  rotuloPagamentoComanda,
} from "./comandaImpressao";

describe("rótulos da comanda", () => {
  it("origem e modalidade delivery/retirada", () => {
    expect(rotuloOrigemComanda("delivery")).toBe("DELIVERY");
    expect(rotuloModalidadeComanda("delivery", "retirada")).toBe(
      "RETIRADA NA LOJA",
    );
    expect(rotuloModalidadeComanda("delivery", "entrega")).toBe("ENTREGA");
    expect(rotuloModalidadeComanda("mesa", "retirada")).toBeNull();
  });

  it("pagamento pago vs na_loja vs caixa", () => {
    expect(rotuloPagamentoComanda("pago").destaque).toContain("JA PAGO");
    expect(rotuloPagamentoComanda("na_loja").destaque).toContain(
      "PAGAR NA LOJA",
    );
    expect(rotuloPagamentoComanda("nao_aplicavel").destaque).toContain(
      "PAGAR NO CAIXA",
    );
  });
});

describe("montarComandaImpressao — destaques", () => {
  it("evidencia origem, retirada e JA PAGO no texto", () => {
    const comanda = montarComandaImpressao({
      id: "p1",
      sequencia_pedido: 42,
      origem: "delivery",
      modalidade: "retirada",
      status_pagamento: "pago",
      identificador: "Retirada",
      cliente_nome: "Ana",
      cliente_celular: "48999999999",
      criado_em: "2026-08-07T15:00:00.000Z",
      total: 50,
      desconto_aplicado: 0,
      pedido_itens: [
        {
          quantidade: 1,
          preco_unitario: 50,
          modo_consumo: "levar",
          produtos: { nome: "Gelato" },
          pedido_item_adicionais: [],
          pedido_item_combo_escolhas: [],
        },
      ],
    });

    const texto = comanda.texto_comanda;
    expect(texto).toContain("ORIGEM: DELIVERY");
    expect(texto).toContain("RETIRADA NA LOJA");
    expect(texto).toContain("JA PAGO");
    expect(comanda.pagamento_rotulo).toBe("JA PAGO");
    expect(comanda.modalidade_rotulo).toBe("RETIRADA NA LOJA");
    expect(comanda.versao).toBe(4);
  });

  it("mesa sem modalidade mostra PAGAR NO CAIXA", () => {
    const comanda = montarComandaImpressao({
      id: "p2",
      sequencia_pedido: 7,
      origem: "mesa",
      status_pagamento: "nao_aplicavel",
      identificador: "Mesa 3",
      cliente_nome: "João",
      total: 20,
      pedido_itens: [
        {
          quantidade: 1,
          preco_unitario: 20,
          modo_consumo: "loja",
          produtos: { nome: "Cafe" },
        },
      ],
    });

    expect(comanda.texto_comanda).toContain("ORIGEM: MESA");
    expect(comanda.texto_comanda).toContain("PAGAR NO CAIXA");
    expect(comanda.texto_comanda).not.toContain("RETIRADA");
  });
});
