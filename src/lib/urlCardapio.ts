/** Monta URL do cardápio preservando a query string. */
export function urlCardapio(subcaminho = "", search = ""): string {
  const caminho = subcaminho.startsWith("/")
    ? subcaminho
    : subcaminho
      ? `/${subcaminho}`
      : "";
  // O modo totem é configuração do dispositivo (localStorage), não da URL
  return `/cardapio${caminho}${search}`;
}

export function urlItemProduto(produtoId: string, search = ""): string {
  return urlCardapio(`/item/${produtoId}`, search);
}
