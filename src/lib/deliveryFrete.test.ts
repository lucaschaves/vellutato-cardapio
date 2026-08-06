import { describe, expect, it } from "vitest";
import {
  DELIVERY_CONFIG_PADRAO,
  avaliarEntrega,
  calcularFreteBairroHibrido,
  normalizarModoFrete,
  selecionarDescontoBairro,
  taxaMinimaBairros,
  taxaMinimaConfig,
  type BairroFreteResolvido,
  type DeliveryConfig,
} from "./deliveryFrete";

function cfg(parcial: Partial<DeliveryConfig> = {}): DeliveryConfig {
  return {
    ...DELIVERY_CONFIG_PADRAO,
    clima_frete: { ...DELIVERY_CONFIG_PADRAO.clima_frete },
    ativo: true,
    loja_latitude: -27.595,
    loja_longitude: -48.548,
    pedido_minimo: 10,
    raio_km: 10,
    faixas_frete: [
      { ate_km: 2, taxa: 5 },
      { ate_km: 5, taxa: 12 },
      { ate_km: 10, taxa: 20 },
    ],
    regras_frete: [],
    ...parcial,
  };
}

function bairroPantanal(
  parcial: Partial<BairroFreteResolvido> = {},
): BairroFreteResolvido {
  return {
    id: "pantanal",
    slug: "pantanal",
    nome: "Pantanal",
    regiao: "Central",
    distrito: "Trindade",
    taxa: 7,
    raio_km: 5,
    faixas: [
      { ate_km: 2, taxa: 7 },
      { ate_km: 4, taxa: 7 },
      { ate_km: 5, taxa: 12 },
    ],
    descontos: [
      {
        id: "d1",
        pedido_minimo: 30,
        ate_km: 2,
        tipo: "gratis",
        valor: 0,
      },
      {
        id: "d2",
        pedido_minimo: 30,
        ate_km: 4,
        tipo: "fixo",
        valor: 5,
      },
    ],
    ...parcial,
  };
}

describe("normalizarModoFrete", () => {
  it("aceita bairro e faz fallback para distancia", () => {
    expect(normalizarModoFrete("bairro")).toBe("bairro");
    expect(normalizarModoFrete(undefined)).toBe("distancia");
  });
});

describe("taxaMinimaConfig / taxaMinimaBairros", () => {
  it("usa faixas por km no modo distancia", () => {
    expect(taxaMinimaConfig(cfg())).toBe(5);
  });

  it("usa menor faixa dos bairros no modo bairro", () => {
    const c = cfg({ modo_frete: "bairro" });
    expect(
      taxaMinimaConfig(c, [
        { faixas: [{ ate_km: 2, taxa: 12 }] },
        { faixas: [{ ate_km: 3, taxa: 8 }, { ate_km: 5, taxa: 15 }] },
      ]),
    ).toBe(8);
    expect(taxaMinimaBairros([{ taxa: null }, { taxa: 18 }])).toBe(18);
  });
});

describe("calcularFreteBairroHibrido (faixa → chuva → desconto)", () => {
  it("frete grátis até 2 km com carrinho R$ 30", () => {
    const r = calcularFreteBairroHibrido(bairroPantanal(), 1.5, 30, 0);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.taxa_faixa).toBe(7);
      expect(r.desconto_carrinho).toBe(7);
      expect(r.taxa).toBe(0);
    }
  });

  it("desconto fixo a 4 km: paga 2 com chuva 0", () => {
    const r = calcularFreteBairroHibrido(bairroPantanal(), 3.8, 30, 0);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.taxa_faixa).toBe(7);
      expect(r.desconto_carrinho).toBe(5);
      expect(r.taxa).toBe(2);
    }
  });

  it("chuva entra antes do desconto", () => {
    // 7 + 3 chuva = 10; desconto fixo 5 → 5
    const r = calcularFreteBairroHibrido(bairroPantanal(), 3.8, 30, 3);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.taxa_com_clima).toBe(10);
      expect(r.desconto_carrinho).toBe(5);
      expect(r.taxa).toBe(5);
    }
  });

  it("entre linhas que batem, escolhe o maior desconto (grátis > −R$5)", () => {
    const escolhido = selecionarDescontoBairro(
      bairroPantanal().descontos,
      30,
      1.2,
      10,
    );
    expect(escolhido?.linha.tipo).toBe("gratis");
    expect(escolhido?.desconto).toBe(10);
  });

  it("bloqueia além do raio do bairro", () => {
    const r = calcularFreteBairroHibrido(bairroPantanal(), 6, 50, 0);
    expect(r.ok).toBe(false);
  });
});

describe("avaliarEntrega modo distancia", () => {
  it("calcula faixa por km", async () => {
    const r = await avaliarEntrega(cfg(), -27.595, -48.538, 50, {
      chuva: false,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.modo).toBe("distancia");
      expect(r.desconto_carrinho).toBe(0);
    }
  });
});

describe("avaliarEntrega modo bairro híbrido", () => {
  it("aplica faixa + chuva + desconto", async () => {
    const r = await avaliarEntrega(
      cfg({
        modo_frete: "bairro",
        clima_frete: {
          ativo: true,
          acrescimo_tipo: "fixo",
          acrescimo_valor: 3,
        },
      }),
      -27.595,
      -48.538, // ~1.1 km
      35,
      {
        chuva: true,
        bairro: bairroPantanal(),
      },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      // faixa 7 + chuva 3 = 10; grátis até 2km → 0
      expect(r.taxa_base).toBe(7);
      expect(r.acrescimo_clima).toBe(3);
      expect(r.desconto_carrinho).toBe(10);
      expect(r.taxa).toBe(0);
      expect(r.bairro_nome).toBe("Pantanal");
    }
  });

  it("exige coords da loja no modo bairro", async () => {
    const r = await avaliarEntrega(
      cfg({
        modo_frete: "bairro",
        loja_latitude: null,
        loja_longitude: null,
      }),
      -27.6,
      -48.55,
      50,
      { chuva: false, bairro: bairroPantanal() },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toMatch(/coordenadas/i);
  });

  it("bloqueia bairro sem faixas", async () => {
    const r = await avaliarEntrega(
      cfg({ modo_frete: "bairro" }),
      -27.595,
      -48.538,
      50,
      {
        chuva: false,
        bairro: bairroPantanal({ faixas: [], taxa: null, descontos: [] }),
      },
    );
    expect(r.ok).toBe(false);
  });
});
