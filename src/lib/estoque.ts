import {
  modoEncomendaPorAgendamento,
  type DisponibilidadeEncomenda,
} from "./encomendaProgramada";

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
 * `forcarEncomenda`: cliente escolheu agendar mesmo com unidades prontas.
 */
export function obterQuantidadeMaxima(
  produto: ProdutoComEstoque,
  disp?: DisponibilidadeEncomenda,
  forcarEncomenda = false,
): number | null {
  if (ehProdutoEncomenda(produto, disp)) {
    if (!disp) return null;
    if (disp.modo === "indisponivel") return 0;
    if (!forcarEncomenda && disp.modo === "pronto") {
      return Math.max(Number(disp.estoque_pronto ?? 0), 0);
    }
    // Modo encomenda ou agendar com prontas disponíveis
    if (disp.encomendas_restantes == null && disp.modo === "encomenda") {
      return null;
    }
    if (forcarEncomenda || disp.modo === "encomenda" || disp.pode_agendar) {
      if (disp.encomendas_restantes == null) return null;
      return Math.max(Number(disp.encomendas_restantes) || 0, 0);
    }
    return null;
  }
  if (!produto.controlar_estoque) return null;
  return Math.max(Number(produto.quantidade_estoque ?? 0), 0);
}

/**
 * Máximo para um item da sacola.
 * - Quanto antes / hoje sem forçar agendar → unidades prontas
 * - Agendar (modo encomenda no item ou dia futuro) → vagas do dia
 */
export function obterQuantidadeMaximaCarrinho(
  produto: ProdutoComEstoque,
  disp: DisponibilidadeEncomenda | undefined,
  opts: {
    agendadoPara?: string | null;
    restantesNoDia?: number | null;
    /** Item entrou como “Agendar” ou o horário implica produção. */
    forcarEncomenda?: boolean;
  } = {},
): number | null {
  if (!ehProdutoEncomenda(produto, disp)) {
    return obterQuantidadeMaxima(produto, disp, false);
  }
  if (!disp) return null;

  const modo = opts.forcarEncomenda
    ? "encomenda"
    : modoEncomendaPorAgendamento(opts.agendadoPara ?? null, {
        estoquePronto: disp.estoque_pronto,
        quantidade: 1,
      });

  if (modo === "pronto") {
    return Math.max(Number(disp.estoque_pronto ?? 0), 0);
  }

  if (opts.restantesNoDia != null) {
    return Math.max(0, Number(opts.restantesNoDia) || 0);
  }

  return obterQuantidadeMaxima(produto, disp, true);
}

/** Soma quantidades do mesmo produto na sacola (opcionalmente excluindo uma linha). */
export function quantidadeProdutoNoCarrinho(
  itens: Array<{ produtoId: string; quantidade: number; idUnico?: string }>,
  produtoId: string,
  excluirIdUnico?: string,
): number {
  return itens.reduce((s, i) => {
    if (i.produtoId !== produtoId) return s;
    if (excluirIdUnico && i.idUnico === excluirIdUnico) return s;
    return s + Math.max(0, i.quantidade);
  }, 0);
}

