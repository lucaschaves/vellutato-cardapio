import { supabase } from "./supabase";

export type ModoDisponibilidadeEncomenda = "pronto" | "encomenda" | "indisponivel";

export interface DisponibilidadeEncomenda {
  modo: ModoDisponibilidadeEncomenda;
  encomenda_programada: boolean;
  estoque_pronto: number | null;
  /** Pode agendar produção (mesmo com unidades prontas). */
  pode_agendar: boolean;
  retirada_em: string | null;
  encomendas_restantes: number | null;
  mensagem: string;
}

export type ModoEncomendaItem = "pronto" | "encomenda";

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

export function rotuloDiaSemana(dow: number): string {
  return DIAS[dow] ?? String(dow);
}

export function parseDisponibilidadeEncomenda(
  raw: unknown,
): DisponibilidadeEncomenda {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const modo = String(o.modo ?? "indisponivel") as ModoDisponibilidadeEncomenda;
  const modoOk = modo === "pronto" || modo === "encomenda" ? modo : "indisponivel";
  const podeAgendar =
    o.pode_agendar == null
      ? modoOk === "encomenda"
      : Boolean(o.pode_agendar);
  return {
    modo: modoOk,
    encomenda_programada: Boolean(o.encomenda_programada),
    estoque_pronto:
      o.estoque_pronto == null ? null : Number(o.estoque_pronto),
    pode_agendar: podeAgendar,
    retirada_em: o.retirada_em ? String(o.retirada_em) : null,
    encomendas_restantes:
      o.encomendas_restantes == null ? null : Number(o.encomendas_restantes),
    mensagem: String(o.mensagem ?? ""),
  };
}

export async function buscarDisponibilidadeEncomenda(
  produtoId: string,
): Promise<DisponibilidadeEncomenda> {
  const { data, error } = await supabase.rpc("calcular_disponibilidade_encomenda", {
    p_produto_id: produtoId,
  });
  if (error) throw new Error(error.message);
  return parseDisponibilidadeEncomenda(data);
}

export async function buscarDisponibilidadeEncomendaLote(
  produtoIds: string[],
): Promise<Record<string, DisponibilidadeEncomenda>> {
  if (produtoIds.length === 0) return {};
  const { data, error } = await supabase.rpc(
    "calcular_disponibilidade_encomenda_lote",
    { p_produto_ids: produtoIds },
  );
  if (error) throw new Error(error.message);
  const map: Record<string, DisponibilidadeEncomenda> = {};
  const obj = (data ?? {}) as Record<string, unknown>;
  for (const [id, disp] of Object.entries(obj)) {
    map[id] = parseDisponibilidadeEncomenda(disp);
  }
  return map;
}

/** Vagas de encomenda restantes numa data (YYYY-MM-DD, calendário da loja). */
export async function buscarEncomendasRestantesNoDia(
  produtoId: string,
  dataKey: string,
): Promise<number> {
  const { data, error } = await supabase.rpc("encomendas_restantes_no_dia", {
    p_produto_id: produtoId,
    p_data: dataKey,
  });
  if (error) throw new Error(error.message);
  return Math.max(0, Number(data) || 0);
}

export async function buscarEncomendasRestantesNoDiaLote(
  produtoIds: string[],
  dataKey: string,
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  await Promise.all(
    produtoIds.map(async (id) => {
      try {
        out[id] = await buscarEncomendasRestantesNoDia(id, dataKey);
      } catch {
        out[id] = 0;
      }
    }),
  );
  return out;
}

export function formatarRetiradaEncomenda(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function produtoVitrineIndisponivel(
  encomendaProgramada: boolean,
  disp: DisponibilidadeEncomenda | undefined,
  produtoEstoqueClassico?: { controlar_estoque?: boolean | null; quantidade_estoque?: number | null },
): boolean {
  if (!encomendaProgramada) {
    return (
      Boolean(produtoEstoqueClassico?.controlar_estoque) &&
      Number(produtoEstoqueClassico?.quantidade_estoque ?? 0) <= 0
    );
  }
  if (!disp) return false;
  return disp.modo === "indisponivel";
}

export interface TemplateEncomenda {
  id: string;
  nome: string;
}

export interface RegraEncomendaDia {
  dia_semana: number;
  ativo: boolean | null;
  cutoff: string | null;
  /** Intervalo Postgres (`02:30:00`) ou legado em horas inteiras. */
  tempo_ate_retirada?: string | null;
  horas_ate_retirada?: number | null;
  dias_apos_cutoff: number | null;
  limite_encomendas: number | null;
}

/** Template padrão criado na migration. */
export const TEMPLATE_ENCOMENDA_PADRAO_ID =
  "00000000-0000-4000-8000-000000000001";

export interface RegraEncomendaDiaEditavel {
  dia_semana: number;
  ativo: boolean;
  horario_limite: string;
  /** Prazo até retirada no formato HH:MM (input time). */
  tempo_retirada: string;
  dias_apos_limite: number;
  limite_encomendas: number;
}

export function horarioLimiteParaBanco(hora: string): string {
  const [h, m] = hora.split(":");
  const hh = String(Number(h) || 0).padStart(2, "0");
  const mm = String(Number(m) || 0).padStart(2, "0");
  return `${hh}:${mm}:00`;
}

export function horarioLimiteParaInput(
  valor: string | null | undefined,
): string {
  if (!valor) return "12:00";
  return valor.slice(0, 5);
}

/** Converte intervalo/horas do banco para value de `<input type="time">`. */
export function tempoRetiradaParaInput(valor: unknown): string {
  if (valor == null || valor === "") return "02:00";
  if (typeof valor === "number" && Number.isFinite(valor)) {
    const totalMin = Math.max(0, Math.round(valor * 60));
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  const s = String(valor).trim();
  const clock = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s);
  if (clock) {
    return `${String(Number(clock[1])).padStart(2, "0")}:${clock[2]}`;
  }
  const hours = /(\d+)\s*hours?/i.exec(s);
  const mins = /(\d+)\s*min/i.exec(s);
  if (hours || mins) {
    const h = hours ? Number(hours[1]) : 0;
    const m = mins ? Number(mins[1]) : 0;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  return "02:00";
}

export function tempoRetiradaParaBanco(hhmm: string): string {
  return horarioLimiteParaBanco(hhmm || "02:00");
}

export function montarGradeRegras(
  regrasDb: RegraEncomendaDia[] = [],
): RegraEncomendaDiaEditavel[] {
  return Array.from({ length: 7 }, (_, dia_semana) => {
    const r = regrasDb.find((x) => x.dia_semana === dia_semana);
    return {
      dia_semana,
      ativo: r?.ativo ?? true,
      horario_limite: horarioLimiteParaInput(r?.cutoff),
      tempo_retirada: tempoRetiradaParaInput(
        r?.tempo_ate_retirada ?? r?.horas_ate_retirada ?? 2,
      ),
      dias_apos_limite: r?.dias_apos_cutoff ?? 1,
      limite_encomendas: r?.limite_encomendas ?? 30,
    };
  });
}

export function regrasEditaveisParaDb(
  regras: RegraEncomendaDiaEditavel[],
): RegraEncomendaDia[] {
  return regras.map((r) => {
    const tempo = tempoRetiradaParaBanco(r.tempo_retirada);
    const [h] = tempo.split(":");
    return {
      dia_semana: r.dia_semana,
      ativo: r.ativo,
      cutoff: horarioLimiteParaBanco(r.horario_limite),
      tempo_ate_retirada: tempo,
      // Espelho legado (horas cheias) para colunas ainda existentes.
      horas_ate_retirada: Number(h) || 0,
      dias_apos_cutoff: r.dias_apos_limite,
      limite_encomendas: r.limite_encomendas,
    };
  });
}

export async function buscarRegrasTemplate(
  templateId: string,
): Promise<RegraEncomendaDia[]> {
  const { data, error } = await supabase
    .from("encomenda_programada_template_dias")
    .select(
      "dia_semana, ativo, cutoff, tempo_ate_retirada, horas_ate_retirada, dias_apos_cutoff, limite_encomendas",
    )
    .eq("template_id", templateId)
    .order("dia_semana");
  if (error) throw new Error(error.message);
  return (data ?? []) as RegraEncomendaDia[];
}

export async function salvarRegrasTemplate(
  templateId: string,
  regras: RegraEncomendaDiaEditavel[],
): Promise<void> {
  const rows = regrasEditaveisParaDb(regras).map((r) => ({
    template_id: templateId,
    dia_semana: r.dia_semana,
    ativo: r.ativo ?? true,
    cutoff: r.cutoff ?? "12:00:00",
    tempo_ate_retirada: r.tempo_ate_retirada ?? "02:00:00",
    horas_ate_retirada: r.horas_ate_retirada ?? 2,
    dias_apos_cutoff: r.dias_apos_cutoff ?? 1,
    limite_encomendas: r.limite_encomendas ?? 30,
  }));

  const { error } = await supabase
    .from("encomenda_programada_template_dias")
    .upsert(rows, { onConflict: "template_id,dia_semana" });
  if (error) throw new Error(error.message);
}

export async function criarTemplateEncomenda(nome: string): Promise<string> {
  const { data, error } = await supabase
    .from("encomenda_programada_templates")
    .insert({ nome: nome.trim() })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const id = data.id as string;
  await salvarRegrasTemplate(id, montarGradeRegras());
  return id;
}

export function templateIdEfetivo(templateId: string): string {
  return templateId.trim() || TEMPLATE_ENCOMENDA_PADRAO_ID;
}

export async function listarTemplatesEncomenda(): Promise<TemplateEncomenda[]> {
  const { data, error } = await supabase
    .from("encomenda_programada_templates")
    .select("id, nome")
    .order("nome");
  if (error) throw new Error(error.message);
  return (data ?? []) as TemplateEncomenda[];
}

function dataReferenciaSpHoje(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
}

export async function buscarEstoqueProntoHoje(
  produtoId: string,
): Promise<number> {
  const mapa = await buscarEstoqueProntoHojeLote([produtoId]);
  return mapa[produtoId] ?? 0;
}

export async function buscarEstoqueProntoHojeLote(
  produtoIds: string[],
): Promise<Record<string, number>> {
  if (produtoIds.length === 0) return {};
  const hoje = dataReferenciaSpHoje();
  const { data, error } = await supabase
    .from("produto_estoque_pronto")
    .select("produto_id, quantidade")
    .eq("referencia_data", hoje)
    .in("produto_id", produtoIds);
  if (error) throw new Error(error.message);
  const map: Record<string, number> = {};
  for (const row of data ?? []) {
    map[row.produto_id as string] = Number(row.quantidade ?? 0);
  }
  return map;
}

export async function salvarEstoqueProntoHoje(
  produtoId: string,
  quantidade: number,
): Promise<void> {
  const hoje = dataReferenciaSpHoje();
  const qtd = Math.max(0, Math.floor(quantidade));
  const { error } = await supabase.from("produto_estoque_pronto").upsert(
    {
      produto_id: produtoId,
      referencia_data: hoje,
      quantidade: qtd,
    },
    { onConflict: "produto_id,referencia_data" },
  );
  if (error) throw new Error(error.message);
}

export async function buscarRegrasEncomendaProduto(
  produtoId: string,
): Promise<RegraEncomendaDia[]> {
  const { data, error } = await supabase
    .from("produto_encomenda_regras")
    .select(
      "dia_semana, ativo, cutoff, tempo_ate_retirada, horas_ate_retirada, dias_apos_cutoff, limite_encomendas",
    )
    .eq("produto_id", produtoId)
    .order("dia_semana");
  if (error) throw new Error(error.message);
  return (data ?? []) as RegraEncomendaDia[];
}

export async function salvarRegrasEncomendaProduto(
  produtoId: string,
  regras: RegraEncomendaDiaEditavel[],
): Promise<void> {
  await supabase
    .from("produto_encomenda_regras")
    .delete()
    .eq("produto_id", produtoId);

  const rows = regrasEditaveisParaDb(regras).map((r) => ({
    produto_id: produtoId,
    dia_semana: r.dia_semana,
    ativo: r.ativo ?? true,
    cutoff: r.cutoff,
    tempo_ate_retirada: r.tempo_ate_retirada,
    horas_ate_retirada: r.horas_ate_retirada,
    dias_apos_cutoff: r.dias_apos_cutoff,
    limite_encomendas: r.limite_encomendas,
  }));

  const { error } = await supabase.from("produto_encomenda_regras").insert(rows);
  if (error) throw new Error(error.message);
}

export async function limparRegrasEncomendaProduto(
  produtoId: string,
): Promise<void> {
  const { error } = await supabase
    .from("produto_encomenda_regras")
    .delete()
    .eq("produto_id", produtoId);
  if (error) throw new Error(error.message);
}

export function resumoItensEncomenda(
  itens: Array<{
    nome: string;
    modoEncomenda?: ModoEncomendaItem;
    retiradaEncomenda?: string | null;
  }>,
): string[] {
  return itens
    .filter((i) => i.modoEncomenda === "encomenda")
    .map(
      (i) =>
        `${i.nome}: retirada prevista ${formatarRetiradaEncomenda(i.retiradaEncomenda)}`,
    );
}

/**
 * Maior `retirada_em` entre itens já em modo encomenda — força agendar a partir daí.
 */
export function minimoRetiradaEncomendaCarrinho(
  itens: Array<{
    modoEncomenda?: ModoEncomendaItem;
    retiradaEncomenda?: string | null;
  }>,
): string | null {
  let maxMs = 0;
  let maxIso: string | null = null;
  for (const i of itens) {
    if (i.modoEncomenda !== "encomenda" || !i.retiradaEncomenda) continue;
    const t = new Date(i.retiradaEncomenda).getTime();
    if (!Number.isFinite(t)) continue;
    if (t > maxMs) {
      maxMs = t;
      maxIso = i.retiradaEncomenda;
    }
  }
  return maxIso;
}

/** Piso de produção (mesmo com item pronto) — usado ao agendar dia futuro. */
export function pisoProducaoEncomendaCarrinho(
  itens: Array<{
    modoEncomenda?: ModoEncomendaItem;
    retiradaEncomenda?: string | null;
  }>,
): string | null {
  let maxMs = 0;
  let maxIso: string | null = null;
  for (const i of itens) {
    if (!i.retiradaEncomenda) continue;
    if (i.modoEncomenda !== "encomenda" && i.modoEncomenda !== "pronto") {
      continue;
    }
    const t = new Date(i.retiradaEncomenda).getTime();
    if (!Number.isFinite(t)) continue;
    if (t > maxMs) {
      maxMs = t;
      maxIso = i.retiradaEncomenda;
    }
  }
  return maxIso;
}

/** True se o carrinho tem produto de encomenda programada (pronto ou sob encomenda). */
export function carrinhoTemProdutoEncomenda(
  itens: Array<{ modoEncomenda?: ModoEncomendaItem | null }>,
): boolean {
  return itens.some(
    (i) => i.modoEncomenda === "pronto" || i.modoEncomenda === "encomenda",
  );
}

/** True se algum item já exige produção sob encomenda (sem “quanto antes”). */
export function carrinhoExigeAgendamentoEncomenda(
  itens: Array<{ modoEncomenda?: ModoEncomendaItem | null }>,
): boolean {
  return itens.some((i) => i.modoEncomenda === "encomenda");
}

/**
 * Resolve modo pelo dia do agendamento (espelha a regra SQL).
 * Hoje + pronto → pronto; dia futuro ou sem pronto → encomenda.
 * `forcarEncomenda`: cliente escolheu Agendar (mesmo com prontas / mesmo dia).
 */
export function modoEncomendaPorAgendamento(
  agendadoPara: string | null | undefined,
  opts: {
    estoquePronto?: number | null;
    quantidade?: number;
    podeAgendar?: boolean;
    forcarEncomenda?: boolean;
  } = {},
): ModoEncomendaItem {
  if (opts.forcarEncomenda) return "encomenda";
  const qtd = Math.max(1, opts.quantidade ?? 1);
  const pronto = Math.max(0, Number(opts.estoquePronto ?? 0));
  const TZ = "America/Sao_Paulo";
  const partes = (iso?: string | null) => {
    const d = iso ? new Date(iso) : new Date();
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return fmt.format(d);
  };
  const hoje = partes(null);
  const diaAg = agendadoPara ? partes(agendadoPara) : hoje;
  if (diaAg === hoje && pronto >= qtd) return "pronto";
  return "encomenda";
}

/** True se o horário escolhido (ou a intenção do item) consome vaga de encomenda. */
export function pedidoUsaVagaEncomenda(
  agendadoPara: string | null | undefined,
  opts: {
    estoquePronto?: number | null;
    modoItem?: ModoEncomendaItem | null;
  } = {},
): boolean {
  if (opts.modoItem === "encomenda") return true;
  return (
    modoEncomendaPorAgendamento(agendadoPara, {
      estoquePronto: opts.estoquePronto,
      quantidade: 1,
    }) === "encomenda"
  );
}
