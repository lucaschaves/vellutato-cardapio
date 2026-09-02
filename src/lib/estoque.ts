import type { DisponibilidadeEncomenda } from "./encomendaProgramada";

export interface ProdutoComEstoque {
  controlar_estoque?: boolean | null;
  quantidade_estoque?: number | null;
  encomenda_programada?: boolean | null;
}

/** Estoque clássico ou unidades prontas hoje (encomenda). */
export function produtoControlaQuantidade(
  produto: ProdutoComEstoque,
): boolean {
  return (
    Boolean(produto.controlar_estoque) ||
    Boolean(produto.encomenda_programada)
  );
}

export function quantidadeEstoqueLista(
  produto: ProdutoComEstoque,
  estoqueProntoHoje = 0,
): number {
  if (produto.encomenda_programada) {
    return Math.max(0, estoqueProntoHoje);
  }
  return Math.max(0, Number(produto.quantidade_estoque ?? 0));
}

export function rotuloQuantidadeEstoque(produto: ProdutoComEstoque): string {
  return produto.encomenda_programada ? "prontas hoje" : "em estoque";
}

export function produtoEstaEsgotado(
  produto: ProdutoComEstoque,
  disp?: DisponibilidadeEncomenda,
): boolean {
  if (produto.encomenda_programada) {
    if (!disp) return false;
    return disp.modo === "indisponivel";
  }
  return (
    Boolean(produto.controlar_estoque) &&
    Number(produto.quantidade_estoque ?? 0) <= 0
  );
}

export function obterQuantidadeMaxima(
  produto: ProdutoComEstoque,
  disp?: DisponibilidadeEncomenda,
): number | null {
  if (produto.encomenda_programada) {
    if (!disp) return null;
    if (disp.modo === "pronto" && disp.estoque_pronto != null) {
      return Math.max(disp.estoque_pronto, 0);
    }
    if (disp.modo === "encomenda" && disp.encomendas_restantes != null) {
      return Math.max(disp.encomendas_restantes, 0);
    }
    if (disp.modo === "indisponivel") return 0;
    return null;
  }
  if (!produto.controlar_estoque) return null;
  return Math.max(Number(produto.quantidade_estoque ?? 0), 0);
}
