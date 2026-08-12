/** Unidades de compra (embalagem no mercado). */
export const UNIDADES_INSUMO = [
  "pacote",
  "lata",
  "unidade",
  "caixa",
  "garrafa",
  "saco",
  "bandeja",
] as const;

export type UnidadeInsumo = (typeof UNIDADES_INSUMO)[number];

export const TIPOS_INSUMO = ["peso", "volume", "contagem"] as const;
export type TipoInsumo = (typeof TIPOS_INSUMO)[number];

export const UNIDADES_CONTEUDO_PESO = ["g", "kg"] as const;
export const UNIDADES_CONTEUDO_VOLUME = ["ml", "L"] as const;
export type UnidadeConteudo =
  | (typeof UNIDADES_CONTEUDO_PESO)[number]
  | (typeof UNIDADES_CONTEUDO_VOLUME)[number];

export type Insumo = {
  id: string;
  nome: string;
  unidade: UnidadeInsumo;
  tipo: TipoInsumo;
  conteudo_valor: number | null;
  conteudo_unidade: UnidadeConteudo | null;
  marcas: string[];
  quantidade_atual: number;
  estoque_minimo: number;
  imagem_url: string | null;
  /** Preço por unidade base: R$/kg, R$/L ou R$/un. */
  preco_atual: number | null;
  preco_atualizado_em: string | null;
  observacao: string | null;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
};

export type InsumoConversao = Pick<
  Insumo,
  "tipo" | "conteudo_valor" | "conteudo_unidade" | "unidade"
>;

export function rotuloUnidade(unidade: string, qtd = 1): string {
  const u = unidade || "unidade";
  if (Math.abs(qtd) === 1) return u;
  if (u === "unidade") return "unidades";
  if (u.endsWith("a")) return `${u}s`;
  return `${u}s`;
}

export function rotuloTipoInsumo(tipo: TipoInsumo): string {
  if (tipo === "peso") return "Peso";
  if (tipo === "volume") return "Volume";
  return "Contagem";
}

export function unidadePrecoBase(tipo: TipoInsumo): "kg" | "L" | "un" {
  if (tipo === "peso") return "kg";
  if (tipo === "volume") return "L";
  return "un";
}

export function parseDecimalBr(valor: string): number | null {
  const t = valor.trim().replace(/\s/g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function formatarQtd(valor: number, maxCasas = 3): string {
  if (!Number.isFinite(valor)) return "0";
  const arred = Math.round(valor * 10000) / 10000;
  return arred.toLocaleString("pt-BR", {
    maximumFractionDigits: maxCasas,
    minimumFractionDigits: 0,
  });
}

export function formatarQtdInput(valor: number): string {
  if (!Number.isFinite(valor)) return "0";
  const arred = Math.round(valor * 10000) / 10000;
  return String(arred).replace(".", ",");
}

/** Gramas ou ml em 1 unidade de compra. */
export function conteudoCanonicoPorUnidade(
  insumo: Pick<InsumoConversao, "tipo" | "conteudo_valor" | "conteudo_unidade">,
): number | null {
  if (insumo.tipo === "contagem") return null;
  const valor = Number(insumo.conteudo_valor);
  const un = insumo.conteudo_unidade;
  if (!Number.isFinite(valor) || valor <= 0 || !un) return null;
  if (un === "kg" || un === "L") return valor * 1000;
  return valor;
}

/** kg (peso) ou L (volume) em 1 unidade de compra. */
export function basePrecoPorUnidade(
  insumo: Pick<InsumoConversao, "tipo" | "conteudo_valor" | "conteudo_unidade">,
): number | null {
  const canon = conteudoCanonicoPorUnidade(insumo);
  if (canon == null || canon <= 0) return null;
  return canon / 1000;
}

export function compraParaBaseCanonico(
  qtdCompra: number,
  insumo: Pick<InsumoConversao, "tipo" | "conteudo_valor" | "conteudo_unidade">,
): number | null {
  const canon = conteudoCanonicoPorUnidade(insumo);
  if (canon == null) return null;
  return Math.round(qtdCompra * canon * 10000) / 10000;
}

export function baseCanonicoParaCompra(
  qtdCanon: number,
  insumo: Pick<InsumoConversao, "tipo" | "conteudo_valor" | "conteudo_unidade">,
): number | null {
  const canon = conteudoCanonicoPorUnidade(insumo);
  if (canon == null || canon <= 0) return null;
  return Math.round((qtdCanon / canon) * 10000) / 10000;
}

export function compraParaUnidadeConteudo(
  qtdCompra: number,
  insumo: Pick<InsumoConversao, "tipo" | "conteudo_valor" | "conteudo_unidade">,
): number | null {
  const canon = compraParaBaseCanonico(qtdCompra, insumo);
  if (canon == null || !insumo.conteudo_unidade) return null;
  if (insumo.conteudo_unidade === "kg" || insumo.conteudo_unidade === "L") {
    return Math.round((canon / 1000) * 10000) / 10000;
  }
  return canon;
}

export function unidadeConteudoParaCompra(
  qtdNaUnidadeConteudo: number,
  insumo: Pick<InsumoConversao, "tipo" | "conteudo_valor" | "conteudo_unidade">,
): number | null {
  if (!insumo.conteudo_unidade) return null;
  const canon =
    insumo.conteudo_unidade === "kg" || insumo.conteudo_unidade === "L"
      ? qtdNaUnidadeConteudo * 1000
      : qtdNaUnidadeConteudo;
  return baseCanonicoParaCompra(canon, insumo);
}

/** Ex.: 10 un → "2 kg" ou "900 ml". */
export function formatarEquivalenteBase(
  qtdCompra: number,
  insumo: Pick<InsumoConversao, "tipo" | "conteudo_valor" | "conteudo_unidade">,
): string | null {
  const canon = compraParaBaseCanonico(qtdCompra, insumo);
  if (canon == null) return null;
  if (insumo.tipo === "peso") {
    if (canon >= 1000) return `${formatarQtd(canon / 1000)} kg`;
    return `${formatarQtd(canon)} g`;
  }
  if (canon >= 1000) return `${formatarQtd(canon / 1000)} L`;
  return `${formatarQtd(canon)} ml`;
}

export function rotuloConteudoEmbalagem(
  insumo: Pick<
    InsumoConversao,
    "tipo" | "conteudo_valor" | "conteudo_unidade" | "unidade"
  >,
): string | null {
  if (insumo.tipo === "contagem") return null;
  const valor = Number(insumo.conteudo_valor);
  if (!Number.isFinite(valor) || valor <= 0 || !insumo.conteudo_unidade) {
    return null;
  }
  return `1 ${rotuloUnidade(insumo.unidade, 1)} = ${formatarQtd(valor)} ${insumo.conteudo_unidade}`;
}

export function precoEmbalagemParaBase(
  precoEmbalagem: number,
  insumo: Pick<InsumoConversao, "tipo" | "conteudo_valor" | "conteudo_unidade">,
): number | null {
  if (!Number.isFinite(precoEmbalagem) || precoEmbalagem < 0) return null;
  if (insumo.tipo === "contagem") {
    return Math.round(precoEmbalagem * 100) / 100;
  }
  const base = basePrecoPorUnidade(insumo);
  if (base == null || base <= 0) return null;
  return Math.round((precoEmbalagem / base) * 10000) / 10000;
}

export function precoBaseParaEmbalagem(
  precoBase: number,
  insumo: Pick<InsumoConversao, "tipo" | "conteudo_valor" | "conteudo_unidade">,
): number | null {
  if (!Number.isFinite(precoBase) || precoBase < 0) return null;
  if (insumo.tipo === "contagem") {
    return Math.round(precoBase * 100) / 100;
  }
  const base = basePrecoPorUnidade(insumo);
  if (base == null || base <= 0) return null;
  return Math.round(precoBase * base * 100) / 100;
}

export function formatarPrecoMoeda(valor: number | null | undefined): string {
  if (valor == null || Number.isNaN(Number(valor))) return "—";
  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/** @deprecated use formatarPrecoMoeda */
export const formatarPrecoInsumo = formatarPrecoMoeda;

export function formatarPrecoBaseInsumo(
  insumo: Pick<Insumo, "tipo" | "preco_atual">,
): string {
  if (insumo.preco_atual == null) return "—";
  return `${formatarPrecoMoeda(insumo.preco_atual)} / ${unidadePrecoBase(insumo.tipo)}`;
}

export function formatarEstoqueInsumo(
  insumo: Pick<
    Insumo,
    | "quantidade_atual"
    | "unidade"
    | "tipo"
    | "conteudo_valor"
    | "conteudo_unidade"
  >,
): string {
  const un = `${formatarQtd(insumo.quantidade_atual)} ${rotuloUnidade(
    insumo.unidade,
    insumo.quantidade_atual,
  )}`;
  const eq = formatarEquivalenteBase(insumo.quantidade_atual, insumo);
  return eq ? `${un} (${eq})` : un;
}

export function insumoAbaixoDoMinimo(insumo: {
  quantidade_atual: number;
  estoque_minimo: number;
}): boolean {
  return Number(insumo.quantidade_atual) <= Number(insumo.estoque_minimo);
}

export function normalizarMarcas(lista: string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of lista ?? []) {
    const nome = String(raw || "").trim();
    if (!nome) continue;
    const key = nome.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(nome);
  }
  return out;
}
