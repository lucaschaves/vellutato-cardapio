import { create } from "zustand";
import type { CupomValidado } from "../lib/cupons";
import type { EscolhaCombo } from "../lib/combos";
import { somarDeltasCombo } from "../lib/combos";
import type {
  DisponibilidadeProduto,
  ModoConsumoItem,
} from "../lib/disponibilidadeProduto";
import {
  lerTipoConsumo,
  modoConsumoPadrao,
  normalizarDisponibilidade,
} from "../lib/disponibilidadeProduto";

export interface AdicionalSelecionado {
  id: string;
  nome: string;
  preco: number;
}

export interface ItemCarrinho {
  idUnico: string;
  produtoId: string;
  nome: string;
  descricao?: string;
  precoBase: number;
  originalPrice: number;
  quantidade: number;
  adicionais: AdicionalSelecionado[];
  escolhasCombo?: EscolhaCombo[];
  observacoes?: string;
  imagem?: string;
  ehBrinde?: boolean;
  disponibilidade: DisponibilidadeProduto;
  modoConsumo: ModoConsumoItem;
}

function custoExtrasItem(item: ItemCarrinho): number {
  const adicionais = item.adicionais.reduce((soma, adc) => soma + adc.preco, 0);
  const deltas = somarDeltasCombo(item.escolhasCombo || []);
  return adicionais + deltas;
}

function calcularSubtotalItens(itens: ItemCarrinho[]): number {
  return itens.reduce((total, item) => {
    return total + (item.precoBase + custoExtrasItem(item)) * item.quantidade;
  }, 0);
}

interface CartStore {
  itens: ItemCarrinho[];
  cupomAplicado: CupomValidado | null;
  adicionarItem: (
    item: Omit<ItemCarrinho, "idUnico" | "disponibilidade" | "modoConsumo"> & {
      disponibilidade?: DisponibilidadeProduto;
      modoConsumo?: ModoConsumoItem;
    },
  ) => void;
  removerItem: (idUnico: string) => void;
  alterarQuantidade: (idUnico: string, novaQuantidade: number) => void;
  alterarObservacoes: (idUnico: string, observacoes: string) => void;
  consolidarItensIguais: () => void;
  limparCarrinho: () => void;
  aplicarCupom: (cupom: CupomValidado) => void;
  removerCupom: () => void;
  obterSubtotal: () => number;
  obterDescontoCupom: () => number;
  obterTotal: () => number;
  obterQuantidadeTotal: () => number;
}

function chaveItemIgual(
  a: Pick<
    ItemCarrinho,
    | "produtoId"
    | "precoBase"
    | "adicionais"
    | "escolhasCombo"
    | "observacoes"
    | "ehBrinde"
    | "modoConsumo"
  >,
): string {
  const adicionais = [...(a.adicionais || [])]
    .map((x) => `${x.id}:${x.preco}`)
    .sort()
    .join(",");
  const combos = [...(a.escolhasCombo || [])]
    .map((x) => `${x.grupoId}:${x.produtoId}:${x.deltaPreco}`)
    .sort()
    .join(",");
  return [
    a.produtoId,
    a.precoBase,
    adicionais,
    combos,
    a.observacoes || "",
    a.ehBrinde ? "1" : "0",
    a.modoConsumo || "",
  ].join("|");
}

export const useCartStore = create<CartStore>((set, get) => ({
  itens: [],
  cupomAplicado: null,

  adicionarItem: (novoItem) => {
    const disponibilidade = normalizarDisponibilidade(novoItem.disponibilidade);
    const modoConsumo =
      novoItem.modoConsumo ||
      lerTipoConsumo() ||
      modoConsumoPadrao(disponibilidade);
    const itemCompleto = {
      ...novoItem,
      disponibilidade,
      modoConsumo,
    };
    const chaveNova = chaveItemIgual(itemCompleto);

    set((state) => {
      const indice = state.itens.findIndex(
        (item) => chaveItemIgual(item) === chaveNova,
      );
      if (indice >= 0) {
        const atualizados = state.itens.map((item, i) =>
          i === indice
            ? {
                ...item,
                quantidade: item.quantidade + (novoItem.quantidade || 1),
              }
            : item,
        );
        return { itens: atualizados };
      }
      const idUnico = `${novoItem.produtoId}-${Date.now()}`;
      return {
        itens: [
          ...state.itens,
          {
            ...itemCompleto,
            idUnico,
            quantidade: novoItem.quantidade || 1,
          },
        ],
      };
    });
    console.info(`[CARRINHO] Produto adicionado: ${novoItem.nome}`);
  },

  removerItem: (idUnico) => {
    set((state) => ({
      itens: state.itens.filter((item) => item.idUnico !== idUnico),
    }));
  },

  alterarQuantidade: (idUnico, novaQuantidade) => {
    if (novaQuantidade <= 0) return;

    set((state) => ({
      itens: state.itens.map((item) =>
        item.idUnico === idUnico
          ? { ...item, quantidade: novaQuantidade }
          : item,
      ),
    }));
  },

  alterarObservacoes: (idUnico, observacoes) => {
    set((state) => ({
      itens: state.itens.map((item) =>
        item.idUnico === idUnico ? { ...item, observacoes } : item,
      ),
    }));
  },

  consolidarItensIguais: () => {
    set((state) => {
      const agrupados = new Map<string, ItemCarrinho>();
      for (const item of state.itens) {
        const chave = chaveItemIgual(item);
        const existente = agrupados.get(chave);
        if (existente) {
          agrupados.set(chave, {
            ...existente,
            quantidade: existente.quantidade + item.quantidade,
          });
        } else {
          agrupados.set(chave, { ...item });
        }
      }
      return { itens: Array.from(agrupados.values()) };
    });
  },

  limparCarrinho: () => {
    set({ itens: [], cupomAplicado: null });
  },

  aplicarCupom: (cupom) => {
    set({ cupomAplicado: cupom });
  },

  removerCupom: () => {
    set({ cupomAplicado: null });
  },

  obterSubtotal: () => calcularSubtotalItens(get().itens),

  obterDescontoCupom: () => get().cupomAplicado?.desconto || 0,

  obterTotal: () => {
    const subtotal = calcularSubtotalItens(get().itens);
    const desconto = get().cupomAplicado?.desconto || 0;
    return Math.max(subtotal - desconto, 0);
  },

  obterQuantidadeTotal: () => {
    return get().itens.reduce((total, item) => total + item.quantidade, 0);
  },
}));
