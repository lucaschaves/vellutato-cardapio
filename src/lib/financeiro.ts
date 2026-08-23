import { supabase } from "./supabase";

export type TipoLancamento = "despesa" | "receita";
export type StatusLancamento = "prevista" | "atrasada" | "paga" | "cancelada";
export type TipoCategoria = "despesa" | "receita" | "ambos";

export type FinanceiroCategoria = {
  id: string;
  nome: string;
  tipo: TipoCategoria;
  ordem: number;
  ativo: boolean;
};

export type FinanceiroRecorrencia = {
  id: string;
  categoria_id: string;
  descricao: string;
  valor: number;
  dia_vencimento: number;
  forma_pagamento: string | null;
  observacao: string | null;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
  financeiro_categorias?: { nome: string } | null;
};

export type FinanceiroLancamento = {
  id: string;
  tipo: TipoLancamento;
  categoria_id: string;
  descricao: string;
  valor: number;
  competencia: string;
  vencimento: string;
  data_pagamento: string | null;
  status: StatusLancamento;
  forma_pagamento: string | null;
  observacao: string | null;
  recorrencia_id: string | null;
  parcelamento_id: string | null;
  parcela_numero: number | null;
  parcela_total: number | null;
  criado_em: string;
  atualizado_em: string;
  financeiro_categorias?: { nome: string } | null;
};

export const STATUS_LANCAMENTO_LABEL: Record<StatusLancamento, string> = {
  prevista: "Prevista",
  atrasada: "Atrasada",
  paga: "Paga",
  cancelada: "Cancelada",
};

export const FORMAS_PAGAMENTO = [
  "pix",
  "boleto",
  "cartao",
  "dinheiro",
  "transferencia",
  "outro",
] as const;

export type FormaPagamento = (typeof FORMAS_PAGAMENTO)[number];

export const FORMA_PAGAMENTO_LABEL: Record<FormaPagamento, string> = {
  pix: "PIX",
  boleto: "Boleto",
  cartao: "Cartão",
  dinheiro: "Dinheiro",
  transferencia: "Transferência",
  outro: "Outro",
};

/** YYYY-MM-DD do 1º dia do mês (competência). */
export function competenciaDoMes(ano: number, mes1a12: number): string {
  return `${ano}-${String(mes1a12).padStart(2, "0")}-01`;
}

export function competenciaDeData(dataIso: string | Date): string {
  const d = typeof dataIso === "string" ? new Date(dataIso) : dataIso;
  return competenciaDoMes(d.getFullYear(), d.getMonth() + 1);
}

export function competenciaHoje(): string {
  return competenciaDeData(new Date());
}

export function rotuloCompetencia(comp: string): string {
  const [y, m] = comp.slice(0, 10).split("-");
  const meses = [
    "jan",
    "fev",
    "mar",
    "abr",
    "mai",
    "jun",
    "jul",
    "ago",
    "set",
    "out",
    "nov",
    "dez",
  ];
  const mi = Number(m) - 1;
  return `${meses[mi] ?? m}/${y}`;
}

export function hojeLocalISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function statusEfetivo(
  status: StatusLancamento,
  vencimento: string,
): StatusLancamento {
  if (status === "paga" || status === "cancelada") return status;
  const ven = vencimento.slice(0, 10);
  if (ven < hojeLocalISO()) return "atrasada";
  return "prevista";
}

/** Divide total em N parcelas; sobra de centavos na última. */
export function calcularParcelas(
  valorTotal: number,
  nParcelas: number,
): number[] {
  if (nParcelas < 2) throw new Error("Parcelamento exige ao menos 2 parcelas.");
  const centavos = Math.round(Number(valorTotal) * 100);
  if (centavos <= 0) throw new Error("Valor inválido.");
  const base = Math.floor(centavos / nParcelas);
  const resto = centavos - base * nParcelas;
  const valores: number[] = [];
  for (let i = 0; i < nParcelas; i++) {
    const c = i === nParcelas - 1 ? base + resto : base;
    valores.push(c / 100);
  }
  return valores;
}

function dataVencimentoNoMes(
  competenciaYYYYMMDD: string,
  dia: number,
): string {
  const [y, m] = competenciaYYYYMMDD.slice(0, 10).split("-").map(Number);
  const diaOk = Math.min(Math.max(1, dia), 28);
  return `${y}-${String(m).padStart(2, "0")}-${String(diaOk).padStart(2, "0")}`;
}

function addMesesCompetencia(comp: string, delta: number): string {
  const [y, m] = comp.slice(0, 10).split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return competenciaDoMes(d.getFullYear(), d.getMonth() + 1);
}

async function sincronizarAtrasadas(): Promise<void> {
  const hoje = hojeLocalISO();
  await supabase
    .from("financeiro_lancamentos")
    .update({ status: "atrasada", atualizado_em: new Date().toISOString() })
    .eq("status", "prevista")
    .lt("vencimento", hoje);

  await supabase
    .from("financeiro_lancamentos")
    .update({ status: "prevista", atualizado_em: new Date().toISOString() })
    .eq("status", "atrasada")
    .gte("vencimento", hoje);
}

export async function listarCategoriasFinanceiro(
  tipo?: TipoLancamento,
): Promise<FinanceiroCategoria[]> {
  let q = supabase
    .from("financeiro_categorias")
    .select("id, nome, tipo, ordem, ativo")
    .eq("ativo", true)
    .order("ordem")
    .order("nome");

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as FinanceiroCategoria[];
  if (!tipo) return rows;
  return rows.filter((c) => c.tipo === tipo || c.tipo === "ambos");
}

export async function listarLancamentos(filtros: {
  competencia?: string;
  tipo?: TipoLancamento | "todos";
  status?: StatusLancamento | "todos";
}): Promise<FinanceiroLancamento[]> {
  await sincronizarAtrasadas();

  let q = supabase
    .from("financeiro_lancamentos")
    .select(
      `
      *,
      financeiro_categorias ( nome )
    `,
    )
    .order("vencimento", { ascending: true })
    .order("criado_em", { ascending: false });

  if (filtros.competencia) {
    q = q.eq("competencia", filtros.competencia.slice(0, 10));
  }
  if (filtros.tipo && filtros.tipo !== "todos") {
    q = q.eq("tipo", filtros.tipo);
  }
  if (filtros.status && filtros.status !== "todos") {
    q = q.eq("status", filtros.status);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as FinanceiroLancamento[];
}

export type InputLancamentoAvulso = {
  tipo: TipoLancamento;
  categoria_id: string;
  descricao: string;
  valor: number;
  competencia: string;
  vencimento: string;
  status?: StatusLancamento;
  data_pagamento?: string | null;
  forma_pagamento?: string | null;
  observacao?: string | null;
};

export async function criarLancamentoAvulso(
  input: InputLancamentoAvulso,
): Promise<void> {
  const status =
    input.status ??
    (input.data_pagamento
      ? "paga"
      : statusEfetivo("prevista", input.vencimento));

  const { error } = await supabase.from("financeiro_lancamentos").insert({
    tipo: input.tipo,
    categoria_id: input.categoria_id,
    descricao: input.descricao.trim(),
    valor: Number(input.valor),
    competencia: input.competencia.slice(0, 10),
    vencimento: input.vencimento.slice(0, 10),
    data_pagamento: input.data_pagamento?.slice(0, 10) ?? null,
    status,
    forma_pagamento: input.forma_pagamento || null,
    observacao: input.observacao?.trim() || null,
  });
  if (error) throw new Error(error.message);
}

export async function atualizarLancamento(
  id: string,
  patch: Partial<InputLancamentoAvulso> & {
    status?: StatusLancamento;
  },
): Promise<void> {
  const payload: Record<string, unknown> = {
    atualizado_em: new Date().toISOString(),
  };
  if (patch.categoria_id != null) payload.categoria_id = patch.categoria_id;
  if (patch.descricao != null) payload.descricao = patch.descricao.trim();
  if (patch.valor != null) payload.valor = Number(patch.valor);
  if (patch.competencia != null)
    payload.competencia = patch.competencia.slice(0, 10);
  if (patch.vencimento != null)
    payload.vencimento = patch.vencimento.slice(0, 10);
  if (patch.data_pagamento !== undefined) {
    payload.data_pagamento = patch.data_pagamento
      ? patch.data_pagamento.slice(0, 10)
      : null;
  }
  if (patch.forma_pagamento !== undefined) {
    payload.forma_pagamento = patch.forma_pagamento || null;
  }
  if (patch.observacao !== undefined) {
    payload.observacao = patch.observacao?.trim() || null;
  }
  if (patch.status != null) {
    let st = patch.status;
    if (st === "paga" || st === "cancelada") {
      payload.status = st;
    } else if (patch.vencimento || patch.status) {
      const ven =
        (patch.vencimento as string | undefined) ??
        (payload.vencimento as string | undefined);
      if (ven) st = statusEfetivo("prevista", ven);
      payload.status = st;
    } else {
      payload.status = st;
    }
  }

  const { error } = await supabase
    .from("financeiro_lancamentos")
    .update(payload)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function marcarLancamentoPago(
  id: string,
  dataPagamento?: string,
): Promise<void> {
  const data = (dataPagamento ?? hojeLocalISO()).slice(0, 10);
  const { error } = await supabase
    .from("financeiro_lancamentos")
    .update({
      status: "paga",
      data_pagamento: data,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function cancelarLancamento(id: string): Promise<void> {
  const { error } = await supabase
    .from("financeiro_lancamentos")
    .update({
      status: "cancelada",
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function excluirLancamento(id: string): Promise<void> {
  const { error } = await supabase
    .from("financeiro_lancamentos")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export type InputParcelamento = {
  categoria_id: string;
  descricao: string;
  valor_total: number;
  n_parcelas: number;
  competencia_primeira: string;
  dia_vencimento: number;
  forma_pagamento?: string | null;
  observacao?: string | null;
};

export async function criarDespesaParcelada(
  input: InputParcelamento,
): Promise<void> {
  const valores = calcularParcelas(input.valor_total, input.n_parcelas);
  const { data: grupo, error: errGrupo } = await supabase
    .from("financeiro_parcelamentos")
    .insert({
      categoria_id: input.categoria_id,
      descricao: input.descricao.trim(),
      valor_total: Number(input.valor_total),
      n_parcelas: input.n_parcelas,
      forma_pagamento: input.forma_pagamento || null,
      observacao: input.observacao?.trim() || null,
    })
    .select("id")
    .single();
  if (errGrupo) throw new Error(errGrupo.message);

  const rows = valores.map((valor, i) => {
    const comp = addMesesCompetencia(input.competencia_primeira, i);
    const venc = dataVencimentoNoMes(comp, input.dia_vencimento);
    return {
      tipo: "despesa" as const,
      categoria_id: input.categoria_id,
      descricao: `${input.descricao.trim()} (${i + 1}/${input.n_parcelas})`,
      valor,
      competencia: comp,
      vencimento: venc,
      status: statusEfetivo("prevista", venc),
      forma_pagamento: input.forma_pagamento || null,
      observacao: input.observacao?.trim() || null,
      parcelamento_id: grupo.id,
      parcela_numero: i + 1,
      parcela_total: input.n_parcelas,
    };
  });

  const { error } = await supabase.from("financeiro_lancamentos").insert(rows);
  if (error) throw new Error(error.message);
}

export async function listarRecorrencias(): Promise<FinanceiroRecorrencia[]> {
  const { data, error } = await supabase
    .from("financeiro_recorrencias")
    .select(
      `
      *,
      financeiro_categorias ( nome )
    `,
    )
    .order("ativo", { ascending: false })
    .order("descricao");
  if (error) throw new Error(error.message);
  return (data ?? []) as FinanceiroRecorrencia[];
}

export type InputRecorrencia = {
  categoria_id: string;
  descricao: string;
  valor: number;
  dia_vencimento: number;
  forma_pagamento?: string | null;
  observacao?: string | null;
  ativo?: boolean;
};

export async function criarRecorrencia(input: InputRecorrencia): Promise<void> {
  const { error } = await supabase.from("financeiro_recorrencias").insert({
    categoria_id: input.categoria_id,
    descricao: input.descricao.trim(),
    valor: Number(input.valor),
    dia_vencimento: input.dia_vencimento,
    forma_pagamento: input.forma_pagamento || null,
    observacao: input.observacao?.trim() || null,
    ativo: input.ativo ?? true,
  });
  if (error) throw new Error(error.message);
}

export async function atualizarRecorrencia(
  id: string,
  input: Partial<InputRecorrencia>,
): Promise<void> {
  const payload: Record<string, unknown> = {
    atualizado_em: new Date().toISOString(),
  };
  if (input.categoria_id != null) payload.categoria_id = input.categoria_id;
  if (input.descricao != null) payload.descricao = input.descricao.trim();
  if (input.valor != null) payload.valor = Number(input.valor);
  if (input.dia_vencimento != null)
    payload.dia_vencimento = input.dia_vencimento;
  if (input.forma_pagamento !== undefined)
    payload.forma_pagamento = input.forma_pagamento || null;
  if (input.observacao !== undefined)
    payload.observacao = input.observacao?.trim() || null;
  if (input.ativo != null) payload.ativo = input.ativo;

  const { error } = await supabase
    .from("financeiro_recorrencias")
    .update(payload)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Gera lançamentos do mês para todas as recorrências ativas (pula se já existir). */
export async function gerarRecorrenciasDoMes(
  competencia: string,
): Promise<{ criados: number; jaExistiam: number }> {
  const comp = competencia.slice(0, 10);
  const { data: regras, error } = await supabase
    .from("financeiro_recorrencias")
    .select("*")
    .eq("ativo", true);
  if (error) throw new Error(error.message);

  let criados = 0;
  let jaExistiam = 0;

  for (const r of regras ?? []) {
    const venc = dataVencimentoNoMes(comp, r.dia_vencimento);
    const { error: errIns } = await supabase
      .from("financeiro_lancamentos")
      .insert({
        tipo: "despesa",
        categoria_id: r.categoria_id,
        descricao: r.descricao,
        valor: Number(r.valor),
        competencia: comp,
        vencimento: venc,
        status: statusEfetivo("prevista", venc),
        forma_pagamento: r.forma_pagamento,
        observacao: r.observacao,
        recorrencia_id: r.id,
      });

    if (errIns) {
      if (errIns.code === "23505") {
        jaExistiam += 1;
        continue;
      }
      throw new Error(errIns.message);
    }
    criados += 1;
  }

  return { criados, jaExistiam };
}

export type ResumoFinanceiroPeriodo = {
  despesas: number;
  receitasAvulsas: number;
  cmv: number;
};

/** Soma despesas/receitas por competência no intervalo [inicioISO, fimISO]. */
export async function buscarResumoFinanceiroPeriodo(
  inicioISO: string | null,
  fimISO?: string | null,
): Promise<ResumoFinanceiroPeriodo> {
  await sincronizarAtrasadas();

  let qLanc = supabase
    .from("financeiro_lancamentos")
    .select("tipo, valor, status, competencia")
    .neq("status", "cancelada");

  if (inicioISO) {
    qLanc = qLanc.gte("competencia", competenciaDeData(inicioISO));
  }
  if (fimISO) {
    qLanc = qLanc.lte("competencia", competenciaDeData(fimISO));
  }

  const { data: lancs, error: errL } = await qLanc;
  if (errL) throw new Error(errL.message);

  let despesas = 0;
  let receitasAvulsas = 0;
  for (const l of lancs ?? []) {
    const v = Number(l.valor) || 0;
    if (l.tipo === "despesa") despesas += v;
    else receitasAvulsas += v;
  }

  let qListas = supabase
    .from("lista_compras")
    .select(
      `
      id, finalizada_em, status,
      lista_compras_itens ( quantidade_comprada, preco_unitario, comprado )
    `,
    )
    .eq("status", "finalizada");

  if (inicioISO) qListas = qListas.gte("finalizada_em", inicioISO);
  if (fimISO) qListas = qListas.lte("finalizada_em", fimISO);

  const { data: listas, error: errC } = await qListas;
  if (errC) throw new Error(errC.message);

  let cmv = 0;
  for (const lista of listas ?? []) {
    const itens = (lista.lista_compras_itens ?? []) as {
      quantidade_comprada: number | null;
      preco_unitario: number | null;
      comprado: boolean;
    }[];
    for (const it of itens) {
      if (!it.comprado) continue;
      const qtd = Number(it.quantidade_comprada) || 0;
      const preco = Number(it.preco_unitario) || 0;
      cmv += qtd * preco;
    }
  }

  return { despesas, receitasAvulsas, cmv };
}
