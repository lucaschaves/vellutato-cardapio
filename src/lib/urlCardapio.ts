/** Monta URL do cardápio preservando query string (ex.: ?mesa=1). */
export function urlCardapio(subcaminho = "", search = ""): string {
  const caminho = subcaminho.startsWith("/")
    ? subcaminho
    : subcaminho
      ? `/${subcaminho}`
      : "";
  return `/cardapio${caminho}${search}`;
}

export function urlItemProduto(produtoId: string, search = ""): string {
  return urlCardapio(`/item/${produtoId}`, search);
}
