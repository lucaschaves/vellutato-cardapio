import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ItemCaixaEvento = {
  idUnico: string;
  produtoId: string;
  nome: string;
  precoCaixa: number;
  unidadesCaixa: number;
  sabores: string[];
  observacao: string;
  imagem?: string | null;
};

type Estado = {
  itens: ItemCaixaEvento[];
  adicionar: (item: Omit<ItemCaixaEvento, "idUnico">) => void;
  remover: (idUnico: string) => void;
  limpar: () => void;
};

export const useEventosCartStore = create<Estado>()(
  persist(
    (set) => ({
      itens: [],
      adicionar: (item) =>
        set((s) => ({
          itens: [
            ...s.itens,
            { ...item, idUnico: crypto.randomUUID() },
          ],
        })),
      remover: (idUnico) =>
        set((s) => ({ itens: s.itens.filter((i) => i.idUnico !== idUnico) })),
      limpar: () => set({ itens: [] }),
    }),
    { name: "vellutato-eventos-carrinho" },
  ),
);

export function agruparCaixasPorProduto(itens: ItemCaixaEvento[]): Map<
  string,
  { qtd: number; preco: number; nome: string }
> {
  const map = new Map<string, { qtd: number; preco: number; nome: string }>();
  for (const item of itens) {
    const atual = map.get(item.produtoId) ?? {
      qtd: 0,
      preco: item.precoCaixa,
      nome: item.nome,
    };
    atual.qtd += 1;
    map.set(item.produtoId, atual);
  }
  return map;
}
