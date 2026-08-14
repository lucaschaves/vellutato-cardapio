import {
  formatarPrecoMoeda,
  formatarQtd,
  formatarQtdEstoqueBase,
  type Insumo,
  type TipoInsumo,
} from "./insumos";

export const TIPOS_FICHA = ["produto", "adicional", "embalagem"] as const;
export type TipoFicha = (typeof TIPOS_FICHA)[number];

export const STATUS_FICHA = ["rascunho", "teste", "ativa", "arquivada"] as const;
export type StatusFicha = (typeof STATUS_FICHA)[number];

export const ESCOPOS_EMBALAGEM = ["item", "pedido"] as const;
export type EscopoEmbalagem = (typeof ESCOPOS_EMBALAGEM)[number];

export const UNIDADES_FICHA = ["g", "kg", "ml", "L", "un"] as const;
export type UnidadeFicha = (typeof UNIDADES_FICHA)[number];

export const PERFIS_EMBALAGEM_ITEM = [
  "viagem",
  "delivery",
  "levar_rapido",
] as const;
export type PerfilEmbalagemItem = (typeof PERFIS_EMBALAGEM_ITEM)[number];

export type FichaTecnica = {
  id: string;
  nome: string;
  descricao: string | null;
  observacao: string | null;
  tipo: TipoFicha;
  status: StatusFicha;
  rendimento: number;
  escopo: EscopoEmbalagem | null;
  custo_calculado: number | null;
  custo_atualizado_em: string | null;
  criado_em: string;
  atualizado_em: string;
};

export type FichaTecnicaItem = {
  id: string;
  ficha_id: string;
  insumo_id: string | null;
  ficha_filha_id: string | null;
  quantidade: number;
  unidade: UnidadeFicha | null;
  observacao: string | null;
};

export type ConsumoInsumo = {
  insumo_id: string;
  quantidade_base: number;
};

export function rotuloTipoFicha(tipo: TipoFicha): string {
  if (tipo === "produto") return "Produto";
  if (tipo === "adicional") return "Adicional";
  return "Embalagem";
}

export function rotuloStatusFicha(status: StatusFicha): string {
  if (status === "rascunho") return "Rascunho";
  if (status === "teste") return "Teste";
  if (status === "ativa") return "Ativa";
  return "Arquivada";
}

export function rotuloEscopo(escopo: EscopoEmbalagem | null): string {
  if (escopo === "pedido") return "Pedido (sacola/caixa)";
  if (escopo === "item") return "Item";
  return "—";
}

export function rotuloPerfilEmbalagem(perfil: PerfilEmbalagemItem): string {
  if (perfil === "viagem") return "Viagem";
  if (perfil === "delivery") return "Delivery";
  return "Levar (comer logo)";
}

export function unidadesParaTipoInsumo(tipo: TipoInsumo): UnidadeFicha[] {
  if (tipo === "peso") return ["g", "kg"];
  if (tipo === "volume") return ["ml", "L"];
  return ["un"];
}

export function fichaQtdParaBase(
  quantidade: number,
  unidade: UnidadeFicha,
  tipo: TipoInsumo,
): number {
  if (tipo === "contagem") return quantidade;
  if (tipo === "peso") {
    if (unidade === "g") return quantidade / 1000;
    if (unidade === "kg") return quantidade;
  }
  if (tipo === "volume") {
    if (unidade === "ml") return quantidade / 1000;
    if (unidade === "L") return quantidade;
  }
  throw new Error(`Unidade ${unidade} incompatível com tipo ${tipo}`);
}

export function explodeFicha(
  ficha: FichaTecnica,
  itens: FichaTecnicaItem[],
  porcoes: number,
  opts: {
    fichasPorId: Map<string, FichaTecnica>;
    itensPorFicha: Map<string, FichaTecnicaItem[]>;
    insumosPorId: Map<string, Pick<Insumo, "id" | "tipo" | "preco_atual" | "nome">>;
  },
): ConsumoInsumo[] {
  if (!Number.isFinite(porcoes) || porcoes <= 0) return [];
  const rendimento = Number(ficha.rendimento) || 0;
  if (rendimento <= 0) return [];
  const fator = porcoes / rendimento;
  const acc = new Map<string, number>();

  const somar = (insumoId: string, qtd: number) => {
    acc.set(insumoId, (acc.get(insumoId) ?? 0) + qtd);
  };

  for (const item of itens) {
    if (item.insumo_id && item.unidade) {
      const insumo = opts.insumosPorId.get(item.insumo_id);
      if (!insumo) continue;
      somar(
        item.insumo_id,
        fichaQtdParaBase(item.quantidade, item.unidade, insumo.tipo) * fator,
      );
      continue;
    }
    if (!item.ficha_filha_id) continue;
    const filha = opts.fichasPorId.get(item.ficha_filha_id);
    const itensFilha = opts.itensPorFicha.get(item.ficha_filha_id) ?? [];
    if (!filha) continue;
    const rendFilha = Number(filha.rendimento) || 0;
    if (rendFilha <= 0) continue;
    const fatorFilha = (item.quantidade * fator) / rendFilha;
    for (const fi of itensFilha) {
      if (!fi.insumo_id || !fi.unidade) continue;
      const insumo = opts.insumosPorId.get(fi.insumo_id);
      if (!insumo) continue;
      somar(
        fi.insumo_id,
        fichaQtdParaBase(fi.quantidade, fi.unidade, insumo.tipo) * fatorFilha,
      );
    }
  }

  return [...acc.entries()].map(([insumo_id, quantidade_base]) => ({
    insumo_id,
    quantidade_base: Math.round(quantidade_base * 1e6) / 1e6,
  }));
}

export function custoExplosao(
  consumo: ConsumoInsumo[],
  insumosPorId: Map<string, Pick<Insumo, "id" | "preco_atual" | "nome" | "tipo">>,
): { custo: number | null; incompleto: boolean; linhas: string[] } {
  let custo = 0;
  let incompleto = consumo.length === 0;
  const linhas: string[] = [];
  for (const c of consumo) {
    const insumo = insumosPorId.get(c.insumo_id);
    if (!insumo) {
      incompleto = true;
      continue;
    }
    if (insumo.preco_atual == null) {
      incompleto = true;
      linhas.push(`${insumo.nome}: ${formatarQtdEstoqueBase(c.quantidade_base, insumo.tipo)} (sem preço)`);
      continue;
    }
    const parte = c.quantidade_base * Number(insumo.preco_atual);
    custo += parte;
    linhas.push(
      `${insumo.nome}: ${formatarQtdEstoqueBase(c.quantidade_base, insumo.tipo)} → ${formatarPrecoMoeda(parte)}`,
    );
  }
  if (consumo.length === 0) {
    return { custo: null, incompleto: true, linhas };
  }
  return {
    custo: Math.round(custo * 10000) / 10000,
    incompleto,
    linhas,
  };
}

export function margemSobrePreco(
  precoVenda: number,
  custo: number | null,
): number | null {
  if (custo == null || !Number.isFinite(precoVenda) || precoVenda <= 0) {
    return null;
  }
  return Math.round(((precoVenda - custo) / precoVenda) * 10000) / 100;
}

export function perfilEmbalagemItem(args: {
  origem: string;
  modalidade?: string | null;
  modoConsumo?: string | null;
}): PerfilEmbalagemItem | null {
  if (args.modoConsumo === "loja") return null;
  if (args.origem === "delivery" && args.modalidade === "entrega") {
    return "delivery";
  }
  if (args.origem === "delivery") return "levar_rapido";
  if (
    (args.origem === "balcao" || args.origem === "totem") &&
    args.modoConsumo === "levar"
  ) {
    return "viagem";
  }
  return null;
}

export function sacolasPedido(qtdItensEmbalaveis: number, capacidadeN: number): number {
  if (qtdItensEmbalaveis <= 0 || capacidadeN <= 0) return 0;
  return Math.ceil(qtdItensEmbalaveis / capacidadeN);
}

export function formatarCustoFicha(valor: number | null, incompleto?: boolean): string {
  if (valor == null) return "—";
  const txt = formatarPrecoMoeda(valor);
  return incompleto ? `${txt} (incompleto)` : txt;
}

/** Margem abaixo disso dispara alerta no admin. */
export const MARGEM_MINIMA_ALERTA_PCT = 30;
/** Insumo sem atualização de preço há mais que isso. */
export const PRECO_INSUMO_STALE_DIAS = 30;
/** Sugerir compra para cobrir estes dias. */
export const PROJECAO_COBERTURA_DIAS = 7;
/** Alertar se o estoque acaba em até estes dias. */
export const PROJECAO_ALERTA_DIAS = 3;

export function mapFichaRow(row: Record<string, unknown>): FichaTecnica {
  return {
    id: String(row.id),
    nome: String(row.nome ?? ""),
    descricao: row.descricao != null ? String(row.descricao) : null,
    observacao: row.observacao != null ? String(row.observacao) : null,
    tipo: row.tipo as TipoFicha,
    status: row.status as StatusFicha,
    rendimento: Number(row.rendimento ?? 1),
    escopo: (row.escopo as EscopoEmbalagem | null) ?? null,
    custo_calculado:
      row.custo_calculado == null ? null : Number(row.custo_calculado),
    custo_atualizado_em:
      row.custo_atualizado_em != null ? String(row.custo_atualizado_em) : null,
    criado_em: String(row.criado_em ?? ""),
    atualizado_em: String(row.atualizado_em ?? ""),
  };
}

export function mapFichaItemRow(row: Record<string, unknown>): FichaTecnicaItem {
  return {
    id: String(row.id),
    ficha_id: String(row.ficha_id),
    insumo_id: row.insumo_id ? String(row.insumo_id) : null,
    ficha_filha_id: row.ficha_filha_id ? String(row.ficha_filha_id) : null,
    quantidade: Number(row.quantidade),
    unidade: (row.unidade as UnidadeFicha | null) ?? null,
    observacao: row.observacao != null ? String(row.observacao) : null,
  };
}

export function diasDesde(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return (Date.now() - t) / (1000 * 60 * 60 * 24);
}

export function insumoPrecoDesatualizado(
  insumo: Pick<Insumo, "preco_atual" | "preco_atualizado_em">,
  agora = Date.now(),
): boolean {
  if (insumo.preco_atual == null) return true;
  if (!insumo.preco_atualizado_em) return true;
  const t = new Date(insumo.preco_atualizado_em).getTime();
  if (!Number.isFinite(t)) return true;
  return (agora - t) / (1000 * 60 * 60 * 24) > PRECO_INSUMO_STALE_DIAS;
}

export function fichaCustoDesatualizado(
  ficha: Pick<FichaTecnica, "custo_calculado" | "custo_atualizado_em">,
  custoVivo: number | null,
  incompleto: boolean,
): boolean {
  if (incompleto || custoVivo == null) return ficha.custo_calculado != null;
  if (ficha.custo_calculado == null) return true;
  return Math.abs(ficha.custo_calculado - custoVivo) > 0.009;
}

export function alertaMargemBaixa(
  precoVenda: number,
  custo: number | null,
): boolean {
  const m = margemSobrePreco(precoVenda, custo);
  if (m == null) return false;
  return m < MARGEM_MINIMA_ALERTA_PCT;
}

export { formatarQtd };
