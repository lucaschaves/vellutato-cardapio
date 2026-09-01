import { listarRecorrencias } from "./financeiro";
import { margemSobrePreco } from "./fichasTecnicas";
import { supabase } from "./supabase";

export type ContribuicaoModo = "pct_faturamento" | "custo_por_unidade";

export type CanalPrecificacao = "loja" | "delivery" | "ifood";

export type FaixaDescontoVolume = {
  qtd_min: number;
  desconto_pct: number;
};

export type PrecificacaoConfig = {
  id: number;
  /** @deprecated prefer margem por canal */
  margem_lucro_pct: number;
  margem_lucro_loja_pct: number;
  margem_lucro_delivery_pct: number;
  margem_lucro_ifood_pct: number;
  contribuicao_modo: ContribuicaoModo;
  contribuicao_pct: number;
  contribuicao_rs_unidade: number;
  faturamento_esperado_mensal: number;
  qtd_itens_esperada_mensal: number;
  taxa_cartao_pct: number;
  taxa_ifood_pct: number;
  taxa_delivery_pct: number;
  descontos_volume: FaixaDescontoVolume[];
  atualizado_em: string;
};

export type ProdutoComPrecosCanal = {
  preco: number;
  preco_delivery?: number | null;
  preco_ifood?: number | null;
  preco_promocional?: number | null;
  em_promocao?: boolean | null;
};

export const CANAL_PRECIFICACAO_LABEL: Record<CanalPrecificacao, string> = {
  loja: "Loja",
  delivery: "Delivery",
  ifood: "iFood",
};

export const CONFIG_PRECIFICACAO_PADRAO: Omit<
  PrecificacaoConfig,
  "id" | "atualizado_em"
> = {
  margem_lucro_pct: 40,
  margem_lucro_loja_pct: 40,
  margem_lucro_delivery_pct: 40,
  margem_lucro_ifood_pct: 25,
  contribuicao_modo: "pct_faturamento",
  contribuicao_pct: 0,
  contribuicao_rs_unidade: 0,
  faturamento_esperado_mensal: 0,
  qtd_itens_esperada_mensal: 0,
  taxa_cartao_pct: 0,
  taxa_ifood_pct: 0,
  taxa_delivery_pct: 0,
  descontos_volume: [],
};

function arred2(n: number): number {
  return Math.round(n * 100) / 100;
}

function arred4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function pctParaFracao(pct: number): number {
  return Number(pct || 0) / 100;
}

export function normalizarFaixasVolume(raw: unknown): FaixaDescontoVolume[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const row = item as Record<string, unknown>;
      return {
        qtd_min: Number(row.qtd_min ?? 0),
        desconto_pct: Number(row.desconto_pct ?? 0),
      };
    })
    .filter((f) => f.qtd_min > 0 && f.desconto_pct >= 0)
    .sort((a, b) => a.qtd_min - b.qtd_min);
}

export function mapPrecificacaoConfig(
  row: Record<string, unknown> | null | undefined,
): PrecificacaoConfig {
  if (!row) {
    return {
      id: 1,
      ...CONFIG_PRECIFICACAO_PADRAO,
      atualizado_em: new Date().toISOString(),
    };
  }
  const modo = String(row.contribuicao_modo ?? "pct_faturamento");
  const legado = Number(row.margem_lucro_pct ?? 40);
  const margemLoja = Number(row.margem_lucro_loja_pct ?? legado);
  const margemDelivery = Number(row.margem_lucro_delivery_pct ?? legado);
  const margemIfood = Number(row.margem_lucro_ifood_pct ?? legado);
  return {
    id: Number(row.id ?? 1),
    margem_lucro_pct: margemLoja,
    margem_lucro_loja_pct: margemLoja,
    margem_lucro_delivery_pct: margemDelivery,
    margem_lucro_ifood_pct: margemIfood,
    contribuicao_modo:
      modo === "custo_por_unidade" ? "custo_por_unidade" : "pct_faturamento",
    contribuicao_pct: Number(row.contribuicao_pct ?? 0),
    contribuicao_rs_unidade: Number(row.contribuicao_rs_unidade ?? 0),
    faturamento_esperado_mensal: Number(row.faturamento_esperado_mensal ?? 0),
    qtd_itens_esperada_mensal: Number(row.qtd_itens_esperada_mensal ?? 0),
    taxa_cartao_pct: Number(row.taxa_cartao_pct ?? 0),
    taxa_ifood_pct: Number(row.taxa_ifood_pct ?? 0),
    taxa_delivery_pct: Number(row.taxa_delivery_pct ?? 0),
    descontos_volume: normalizarFaixasVolume(row.descontos_volume),
    atualizado_em: String(row.atualizado_em ?? new Date().toISOString()),
  };
}

export async function buscarPrecificacaoConfig(): Promise<PrecificacaoConfig> {
  const { data, error } = await supabase
    .from("precificacao_config")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return mapPrecificacaoConfig(data as Record<string, unknown> | null);
}

export async function salvarPrecificacaoConfig(
  patch: Partial<Omit<PrecificacaoConfig, "id" | "atualizado_em">>,
): Promise<PrecificacaoConfig> {
  const atual = await buscarPrecificacaoConfig();
  const margemLoja =
    patch.margem_lucro_loja_pct ?? atual.margem_lucro_loja_pct;
  const margemDelivery =
    patch.margem_lucro_delivery_pct ?? atual.margem_lucro_delivery_pct;
  const margemIfood =
    patch.margem_lucro_ifood_pct ?? atual.margem_lucro_ifood_pct;
  const payload = {
    id: 1,
    margem_lucro_pct: margemLoja,
    margem_lucro_loja_pct: margemLoja,
    margem_lucro_delivery_pct: margemDelivery,
    margem_lucro_ifood_pct: margemIfood,
    contribuicao_modo: patch.contribuicao_modo ?? atual.contribuicao_modo,
    contribuicao_pct: patch.contribuicao_pct ?? atual.contribuicao_pct,
    contribuicao_rs_unidade:
      patch.contribuicao_rs_unidade ?? atual.contribuicao_rs_unidade,
    faturamento_esperado_mensal:
      patch.faturamento_esperado_mensal ?? atual.faturamento_esperado_mensal,
    qtd_itens_esperada_mensal:
      patch.qtd_itens_esperada_mensal ?? atual.qtd_itens_esperada_mensal,
    taxa_cartao_pct: patch.taxa_cartao_pct ?? atual.taxa_cartao_pct,
    taxa_ifood_pct: patch.taxa_ifood_pct ?? atual.taxa_ifood_pct,
    taxa_delivery_pct: patch.taxa_delivery_pct ?? atual.taxa_delivery_pct,
    descontos_volume: patch.descontos_volume ?? atual.descontos_volume,
    atualizado_em: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("precificacao_config")
    .upsert(payload, { onConflict: "id" })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return mapPrecificacaoConfig(data as Record<string, unknown>);
}

export async function somarDespesasFixasMensais(): Promise<number> {
  const recorrencias = await listarRecorrencias();
  return arred2(
    recorrencias
      .filter((r) => r.ativo)
      .reduce((acc, r) => acc + Number(r.valor || 0), 0),
  );
}

export function recalcularContribuicao(args: {
  despesasFixas: number;
  faturamentoEsperado: number;
  qtdItensEsperada: number;
}): { pct: number; rsUnidade: number } {
  const despesas = Math.max(0, Number(args.despesasFixas) || 0);
  const fat = Math.max(0, Number(args.faturamentoEsperado) || 0);
  const qtd = Math.max(0, Number(args.qtdItensEsperada) || 0);
  return {
    pct: fat > 0 ? arred4((despesas / fat) * 100) : 0,
    rsUnidade: qtd > 0 ? arred4(despesas / qtd) : 0,
  };
}

/** Taxas % do canal somadas (sobre o preço de venda). */
export function taxasCanalPct(
  canal: CanalPrecificacao,
  config: Pick<
    PrecificacaoConfig,
    "taxa_cartao_pct" | "taxa_delivery_pct" | "taxa_ifood_pct"
  >,
): number {
  if (canal === "loja") return Number(config.taxa_cartao_pct || 0);
  if (canal === "delivery") {
    return (
      Number(config.taxa_delivery_pct || 0) + Number(config.taxa_cartao_pct || 0)
    );
  }
  // iFood: comissão all-in (não soma cartão — já vem na taxa_ifood).
  return Number(config.taxa_ifood_pct || 0);
}

/** Lucro alvo (%) configurado para o canal. */
export function margemLucroCanal(
  canal: CanalPrecificacao,
  config: Pick<
    PrecificacaoConfig,
    | "margem_lucro_loja_pct"
    | "margem_lucro_delivery_pct"
    | "margem_lucro_ifood_pct"
    | "margem_lucro_pct"
  >,
): number {
  if (canal === "delivery") {
    return Number(
      config.margem_lucro_delivery_pct ?? config.margem_lucro_pct ?? 0,
    );
  }
  if (canal === "ifood") {
    return Number(
      config.margem_lucro_ifood_pct ?? config.margem_lucro_pct ?? 0,
    );
  }
  return Number(config.margem_lucro_loja_pct ?? config.margem_lucro_pct ?? 0);
}

export type ResultadoPrecoMinimo = {
  precoMinimo: number | null;
  denominador: number;
  custoTotal: number;
  erro: string | null;
};

export function precoMinimoCanal(args: {
  custo: number;
  embalagem?: number;
  margemPct: number;
  contribuicaoModo: ContribuicaoModo;
  contribuicaoPct: number;
  contribuicaoRsUnidade: number;
  taxasCanalPct: number;
}): ResultadoPrecoMinimo {
  const custo = Math.max(0, Number(args.custo) || 0);
  const embalagem = Math.max(0, Number(args.embalagem) || 0);
  const margem = pctParaFracao(args.margemPct);
  const taxas = pctParaFracao(args.taxasCanalPct);

  let custoTotal = custo + embalagem;
  let denominador = 1 - margem - taxas;

  if (args.contribuicaoModo === "pct_faturamento") {
    denominador -= pctParaFracao(args.contribuicaoPct);
  } else {
    custoTotal += Math.max(0, Number(args.contribuicaoRsUnidade) || 0);
  }

  if (denominador <= 0.001) {
    return {
      precoMinimo: null,
      denominador,
      custoTotal: arred4(custoTotal),
      erro:
        "Soma de lucro + contribuição + taxas ≥ 100%. Reduza algum percentual.",
    };
  }

  return {
    precoMinimo: arred2(custoTotal / denominador),
    denominador: arred4(denominador),
    custoTotal: arred4(custoTotal),
    erro: null,
  };
}

/** Margem líquida após taxas e contribuição % (sobre o preço). */
export function margemLiquidaAposTaxas(args: {
  precoVenda: number;
  custoTotal: number;
  taxasCanalPct: number;
  contribuicaoModo: ContribuicaoModo;
  contribuicaoPct: number;
  contribuicaoRsUnidade: number;
}): number | null {
  const preco = Number(args.precoVenda);
  if (!Number.isFinite(preco) || preco <= 0) return null;

  let custo = Math.max(0, Number(args.custoTotal) || 0);
  if (args.contribuicaoModo === "custo_por_unidade") {
    custo += Math.max(0, Number(args.contribuicaoRsUnidade) || 0);
  }

  const taxas = preco * pctParaFracao(args.taxasCanalPct);
  const contribPct =
    args.contribuicaoModo === "pct_faturamento"
      ? preco * pctParaFracao(args.contribuicaoPct)
      : 0;

  const liquido = preco - custo - taxas - contribPct;
  return arred4((liquido / preco) * 100);
}

export function precoAbaixoDoMinimo(
  precoAtual: number | null | undefined,
  precoMinimo: number | null,
): boolean {
  if (precoMinimo == null || precoAtual == null) return false;
  return Number(precoAtual) + 0.009 < precoMinimo;
}

export function simularDescontoVolume(args: {
  preco: number;
  custoTotal: number;
  faixas: FaixaDescontoVolume[];
  taxasCanalPct: number;
  contribuicaoModo: ContribuicaoModo;
  contribuicaoPct: number;
  contribuicaoRsUnidade: number;
  precoMinimo: number | null;
}): Array<{
  qtd_min: number;
  desconto_pct: number;
  precoLiquido: number;
  margemLiquidaPct: number | null;
  abaixoDoMinimo: boolean;
}> {
  const preco = Number(args.preco);
  if (!Number.isFinite(preco) || preco <= 0) return [];

  return args.faixas.map((faixa) => {
    const precoLiquido = arred2(preco * (1 - pctParaFracao(faixa.desconto_pct)));
    const margemLiquidaPct = margemLiquidaAposTaxas({
      precoVenda: precoLiquido,
      custoTotal: args.custoTotal,
      taxasCanalPct: args.taxasCanalPct,
      contribuicaoModo: args.contribuicaoModo,
      contribuicaoPct: args.contribuicaoPct,
      contribuicaoRsUnidade: args.contribuicaoRsUnidade,
    });
    return {
      qtd_min: faixa.qtd_min,
      desconto_pct: faixa.desconto_pct,
      precoLiquido,
      margemLiquidaPct,
      abaixoDoMinimo: precoAbaixoDoMinimo(precoLiquido, args.precoMinimo),
    };
  });
}

export function precoCanalBase(
  produto: ProdutoComPrecosCanal,
  canal: CanalPrecificacao,
): number {
  if (canal === "delivery") {
    const v = produto.preco_delivery;
    return v != null && Number.isFinite(Number(v))
      ? Number(v)
      : Number(produto.preco);
  }
  if (canal === "ifood") {
    const v = produto.preco_ifood;
    return v != null && Number.isFinite(Number(v))
      ? Number(v)
      : Number(produto.preco);
  }
  return Number(produto.preco);
}

/**
 * Preço efetivo exibido/cobrado no canal.
 * Loja aplica promoção; delivery/iFood usam preço do canal (sem promo nesta fase).
 */
export function precoEfetivoCanal(
  produto: ProdutoComPrecosCanal,
  canal: CanalPrecificacao,
): number {
  if (canal === "loja") {
    if (
      produto.em_promocao &&
      produto.preco_promocional != null &&
      Number(produto.preco_promocional) > 0
    ) {
      return Number(produto.preco_promocional);
    }
    return Number(produto.preco);
  }
  return precoCanalBase(produto, canal);
}

export function colunaPrecoCanal(
  canal: CanalPrecificacao,
): "preco" | "preco_delivery" | "preco_ifood" {
  if (canal === "delivery") return "preco_delivery";
  if (canal === "ifood") return "preco_ifood";
  return "preco";
}

export async function aplicarPrecoCanal(args: {
  produtoId: string;
  canal: CanalPrecificacao;
  preco: number;
}): Promise<void> {
  const coluna = colunaPrecoCanal(args.canal);
  const valor = arred2(args.preco);
  const { error } = await supabase
    .from("produtos")
    .update({ [coluna]: valor })
    .eq("id", args.produtoId);
  if (error) throw new Error(error.message);
}

export { margemSobrePreco };
