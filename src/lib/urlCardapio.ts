import { emModoToten } from "./modoCardapio";

/** Monta URL do cardápio preservando modo totem e query string. */
export function urlCardapio(subcaminho = "", search = ""): string {
  const caminho = subcaminho.startsWith("/")
    ? subcaminho
    : subcaminho
      ? `/${subcaminho}`
      : "";
  const base = emModoToten() ? "/cardapio-toten/cardapio" : "/cardapio";
  return `${base}${caminho}${search}`;
}

export function urlItemProduto(produtoId: string, search = ""): string {
  return urlCardapio(`/item/${produtoId}`, search);
}
