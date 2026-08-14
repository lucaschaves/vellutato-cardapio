import {
  estoqueBaseParaCompra,
  type Insumo,
} from "./insumos";
import {
  explodeFicha,
  perfilEmbalagemItem,
  PROJECAO_ALERTA_DIAS,
  PROJECAO_COBERTURA_DIAS,
  sacolasPedido,
  type FichaTecnica,
  type FichaTecnicaItem,
} from "./fichasTecnicas";

export type JanelaProjecao = 7 | 14 | 30;

export type ProdutoComposicao = {
  id: string;
  tipo: string;
  ficha_produto_id: string | null;
  ficha_embalagem_viagem_id: string | null;
  ficha_embalagem_delivery_id: string | null;
  ficha_embalagem_levar_rapido_id: string | null;
};

export type PedidoProjecao = {
  id: string;
  origem: string;
  modalidade: string | null;
};

export type ItemProjecao = {
  id: string;
  pedido_id: string;
  produto_id: string;
  quantidade: number;
  modo_consumo: string;
};

export type LinhaProjecaoInsumo = {
  insumo_id: string;
  nome: string;
  consumoDia: number;
  estoque: number;
  minimo: number;
  diasRestantes: number | null;
  qtdSugeridaBase: number;
  qtdSugeridaEmbalagens: number | null;
  alertaDias: boolean;
  abaixoMinimo: boolean;
};

function somar(
  acc: Map<string, number>,
  consumo: Array<{ insumo_id: string; quantidade_base: number }>,
) {
  for (const c of consumo) {
    acc.set(c.insumo_id, (acc.get(c.insumo_id) ?? 0) + c.quantidade_base);
  }
}

function fichaEmb(
  produto: ProdutoComposicao,
  perfil: ReturnType<typeof perfilEmbalagemItem>,
): string | null {
  if (perfil === "viagem") return produto.ficha_embalagem_viagem_id;
  if (perfil === "delivery") return produto.ficha_embalagem_delivery_id;
  if (perfil === "levar_rapido") return produto.ficha_embalagem_levar_rapido_id;
  return null;
}

export function projetarConsumoInsumos(args: {
  janelaDias: JanelaProjecao;
  pedidos: PedidoProjecao[];
  itens: ItemProjecao[];
  adicionaisPorItem: Map<string, string[]>;
  escolhasComboPorItem: Map<string, string[]>;
  produtosPorId: Map<string, ProdutoComposicao>;
  adicionaisFichaPorId: Map<string, string | null>;
  fichasPorId: Map<string, FichaTecnica>;
  itensPorFicha: Map<string, FichaTecnicaItem[]>;
  insumos: Array<
    Pick<
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
    >
  >;
  fichaEmbPedidoDeliveryId: string | null;
  fichaEmbPedidoRetiradaId: string | null;
  capacidadeDelivery: number;
  capacidadeRetirada: number;
  coberturaDias?: number;
}): LinhaProjecaoInsumo[] {
  const {
    janelaDias,
    pedidos,
    itens,
    adicionaisPorItem,
    escolhasComboPorItem,
    produtosPorId,
    adicionaisFichaPorId,
    fichasPorId,
    itensPorFicha,
    insumos,
    fichaEmbPedidoDeliveryId,
    fichaEmbPedidoRetiradaId,
    capacidadeDelivery,
    capacidadeRetirada,
    coberturaDias = PROJECAO_COBERTURA_DIAS,
  } = args;

  const insumosPorId = new Map(insumos.map((i) => [i.id, i]));
  const opts = { fichasPorId, itensPorFicha, insumosPorId };
  const acc = new Map<string, number>();
  const pedidosPorId = new Map(pedidos.map((p) => [p.id, p]));
  const embalaveisPorPedido = new Map<string, number>();

  const explodeId = (fichaId: string | null, porcoes: number) => {
    if (!fichaId) return;
    const ficha = fichasPorId.get(fichaId);
    if (!ficha || ficha.status !== "ativa") return;
    somar(acc, explodeFicha(ficha, itensPorFicha.get(fichaId) ?? [], porcoes, opts));
  };

  for (const item of itens) {
    const pedido = pedidosPorId.get(item.pedido_id);
    if (!pedido) continue;
    const produto = produtosPorId.get(item.produto_id);
    if (!produto) continue;
    const perfil = perfilEmbalagemItem({
      origem: pedido.origem,
      modalidade: pedido.modalidade,
      modoConsumo: item.modo_consumo,
    });
    if (perfil) {
      embalaveisPorPedido.set(
        pedido.id,
        (embalaveisPorPedido.get(pedido.id) ?? 0) + item.quantidade,
      );
    }

    if (produto.tipo !== "combo") {
      explodeId(produto.ficha_produto_id, item.quantidade);
      explodeId(fichaEmb(produto, perfil), item.quantidade);
    } else {
      for (const escolhidoId of escolhasComboPorItem.get(item.id) ?? []) {
        const escolhido = produtosPorId.get(escolhidoId);
        if (!escolhido) continue;
        explodeId(escolhido.ficha_produto_id, item.quantidade);
        explodeId(fichaEmb(escolhido, perfil), item.quantidade);
      }
    }

    for (const adicionalId of adicionaisPorItem.get(item.id) ?? []) {
      explodeId(adicionaisFichaPorId.get(adicionalId) ?? null, item.quantidade);
    }
  }

  for (const pedido of pedidos) {
    const qtd = embalaveisPorPedido.get(pedido.id) ?? 0;
    if (qtd <= 0) continue;
    if (pedido.origem !== "delivery") continue;
    const entrega = pedido.modalidade === "entrega";
    const n = entrega ? capacidadeDelivery : capacidadeRetirada;
    const fichaId = entrega ? fichaEmbPedidoDeliveryId : fichaEmbPedidoRetiradaId;
    explodeId(fichaId, sacolasPedido(qtd, n));
  }

  return insumos
    .map((insumo) => {
      const total = acc.get(insumo.id) ?? 0;
      const consumoDia = total / janelaDias;
      const estoque = Number(insumo.quantidade_atual) || 0;
      const minimo = Number(insumo.estoque_minimo) || 0;
      const diasRestantes =
        consumoDia > 0.0000001 ? estoque / consumoDia : null;
      const alvo = Math.max(minimo, consumoDia * coberturaDias);
      const qtdSugeridaBase = Math.max(0, Math.round((alvo - estoque) * 10000) / 10000);
      const emb = estoqueBaseParaCompra(qtdSugeridaBase, insumo);
      return {
        insumo_id: insumo.id,
        nome: insumo.nome,
        consumoDia,
        estoque,
        minimo,
        diasRestantes,
        qtdSugeridaBase,
        qtdSugeridaEmbalagens:
          emb == null ? null : Math.ceil(emb * 1000) / 1000,
        alertaDias:
          diasRestantes != null &&
          diasRestantes <= PROJECAO_ALERTA_DIAS,
        abaixoMinimo: estoque <= minimo,
      };
    })
    .filter(
      (l) =>
        l.consumoDia > 0 ||
        l.abaixoMinimo ||
        l.qtdSugeridaBase > 0,
    )
    .sort((a, b) => {
      const da = a.diasRestantes ?? 9999;
      const db = b.diasRestantes ?? 9999;
      return da - db;
    });
}
