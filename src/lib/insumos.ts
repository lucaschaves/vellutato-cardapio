/** Unidades de compra/controle de insumos (inteiros, sem grama). */
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

export type Insumo = {
  id: string;
  nome: string;
  unidade: UnidadeInsumo;
  quantidade_atual: number;
  estoque_minimo: number;
  imagem_url: string | null;
  preco_atual: number | null;
  preco_atualizado_em: string | null;
  observacao: string | null;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
};

export function rotuloUnidade(unidade: string, qtd = 1): string {
  const u = unidade || "unidade";
  if (qtd === 1) return u;
  // plural simples pt-BR
  if (u === "unidade") return "unidades";
  if (u.endsWith("a")) return `${u}s`;
  return `${u}s`;
}

export function formatarPrecoInsumo(valor: number | null | undefined): string {
  if (valor == null || Number.isNaN(Number(valor))) return "—";
  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function insumoAbaixoDoMinimo(insumo: {
  quantidade_atual: number;
  estoque_minimo: number;
}): boolean {
  return insumo.quantidade_atual <= insumo.estoque_minimo;
}
