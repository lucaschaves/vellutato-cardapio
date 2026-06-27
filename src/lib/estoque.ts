export interface ProdutoComEstoque {
  controlar_estoque?: boolean | null;
  quantidade_estoque?: number | null;
}

export function produtoEstaEsgotado(produto: ProdutoComEstoque): boolean {
  return (
    Boolean(produto.controlar_estoque) &&
    Number(produto.quantidade_estoque ?? 0) <= 0
  );
}

export function obterQuantidadeMaxima(produto: ProdutoComEstoque): number | null {
  if (!produto.controlar_estoque) return null;
  return Math.max(Number(produto.quantidade_estoque ?? 0), 0);
}
