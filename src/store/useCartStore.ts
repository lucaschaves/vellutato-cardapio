import { create } from "zustand";
import type { CupomValidado } from "../lib/cupons";

export interface AdicionalSelecionado {
  id: string;
  nome: string;
  preco: number;
}

export interface ItemCarrinho {
  idUnico: string;
  produtoId: string;
  nome: string;
  precoBase: number;
  originalPrice: number;
  quantidade: number;
  adicionais: AdicionalSelecionado[];
  observacoes?: string;
  imagem?: string;
  ehBrinde?: boolean;
}

function calcularSubtotalItens(itens: ItemCarrinho[]): number {
  return itens.reduce((total, item) => {
    const custoAdicionais = item.adicionais.reduce(
      (soma, adc) => soma + adc.preco,
      0,
    );
    return total + (item.precoBase + custoAdicionais) * item.quantidade;
  }, 0);
}

interface CartStore {
  itens: ItemCarrinho[];
  cupomAplicado: CupomValidado | null;
  adicionarItem: (item: Omit<ItemCarrinho, "idUnico">) => void;
  removerItem: (idUnico: string) => void;
  alterarQuantidade: (idUnico: string, novaQuantidade: number) => void;
  alterarObservacoes: (idUnico: string, observacoes: string) => void;
  limparCarrinho: () => void;
  aplicarCupom: (cupom: CupomValidado) => void;
  removerCupom: () => void;
  obterSubtotal: () => number;
  obterDescontoCupom: () => number;
  obterTotal: () => number;
  obterQuantidadeTotal: () => number;
}

export const useCartStore = create<CartStore>((set, get) => ({
  itens: [],
  cupomAplicado: null,

  adicionarItem: (novoItem) => {
    const idUnico = `${novoItem.produtoId}-${Date.now()}`;
    set((state) => ({
      itens: [...state.itens, { ...novoItem, idUnico }],
    }));
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
