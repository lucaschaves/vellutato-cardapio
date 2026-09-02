import type { DisponibilidadeEncomenda } from "./encomendaProgramada";

export interface ProdutoComEstoque {
  controlar_estoque?: boolean | null;
  quantidade_estoque?: number | null;
  encomenda_programada?: boolean | null;
}

function ehProdutoEncomenda(
  produto: ProdutoComEstoque,
  disp?: DisponibilidadeEncomenda,
): boolean {
  return (
    Boolean(produto.encomenda_programada) ||
    Boolean(disp?.encomenda_programada)
  );
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

/**
 * Produto de encomenda programada NÃO usa quantidade_estoque.
 * Só fica esgotado se a RPC disser modo "indisponivel".
 * Sem disponibilidade carregada, libera (não bloqueia pelo estoque clássico).
 */
export function produtoEstaEsgotado(
  produto: ProdutoComEstoque,
  disp?: DisponibilidadeEncomenda,
): boolean {
  if (ehProdutoEncomenda(produto, disp)) {
    if (!disp) return false;
    return disp.modo === "indisponivel";
  }
  return (
    Boolean(produto.controlar_estoque) &&
    Number(produto.quantidade_estoque ?? 0) <= 0
  );
}

/**
 * Limite de quantidade ao adicionar.
 * Encomenda: pronto → estoque do dia; encomenda → vagas do dia; nunca quantidade_estoque.
 */
export function obterQuantidadeMaxima(
  produto: ProdutoComEstoque,
  disp?: DisponibilidadeEncomenda,
): number | null {
  if (ehProdutoEncomenda(produto, disp)) {
    if (!disp) return null;
    if (disp.modo === "indisponivel") return 0;
    if (disp.modo === "pronto") {
      return Math.max(Number(disp.estoque_pronto ?? 0), 0);
    }
    if (disp.modo === "encomenda") {
      if (disp.encomendas_restantes == null) return null;
      return Math.max(Number(disp.encomendas_restantes) || 0, 0);
    }
    return null;
  }
  if (!produto.controlar_estoque) return null;
  return Math.max(Number(produto.quantidade_estoque ?? 0), 0);
}
