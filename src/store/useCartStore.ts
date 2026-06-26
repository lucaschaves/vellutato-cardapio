import { create } from "zustand";

// Tipagens do Carrinho
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
}

interface CartStore {
  itens: ItemCarrinho[];
  adicionarItem: (item: Omit<ItemCarrinho, "idUnico">) => void;
  removerItem: (idUnico: string) => void;
  alterarQuantidade: (idUnico: string, novaQuantidade: number) => void;
  limparCarrinho: () => void;
  obterTotal: () => number;
  obterQuantidadeTotal: () => number;
}

export const useCartStore = create<CartStore>((set, get) => ({
  itens: [],

  adicionarItem: (novoItem) => {
    try {
      // Cria um ID único combinando o ID do produto e o timestamp para permitir o mesmo produto com configurações diferentes
      const idUnico = `${novoItem.produtoId}-${Date.now()}`;

      set((state) => ({
        itens: [...state.itens, { ...novoItem, idUnico }],
      }));

      console.info(`[CARRINHO] Produto adicionado: ${novoItem.nome}`);
    } catch (erro: any) {
      console.error(
        "[ERRO - CARRINHO] Falha ao adicionar item:",
        erro.message || erro,
      );
    }
  },

  removerItem: (idUnico) => {
    set((state) => ({
      itens: state.itens.filter((item) => item.idUnico !== idUnico),
    }));
    console.info(`[CARRINHO] Item removido (ID: ${idUnico})`);
  },

  alterarQuantidade: (idUnico, novaQuantidade) => {
    if (novaQuantidade <= 0) {
      console.warn(
        "[CARRINHO] Tentativa de alterar quantidade para zero ou menor. Use a função removerItem em vez disso.",
      );
      return;
    }

    set((state) => ({
      itens: state.itens.map((item) =>
        item.idUnico === idUnico
          ? { ...item, quantidade: novaQuantidade }
          : item,
      ),
    }));
  },

  limparCarrinho: () => {
    set({ itens: [] });
    console.info("[CARRINHO] O carrinho foi totalmente esvaziado.");
  },

  obterTotal: () => {
    const { itens } = get();
    return itens.reduce((total, item) => {
      const custoAdicionais = item.adicionais.reduce(
        (soma, adc) => soma + adc.preco,
        0,
      );
      const custoItem = (item.precoBase + custoAdicionais) * item.quantidade;
      return total + custoItem;
    }, 0);
  },

  obterQuantidadeTotal: () => {
    const { itens } = get();
    return itens.reduce((total, item) => total + item.quantidade, 0);
  },
}));
