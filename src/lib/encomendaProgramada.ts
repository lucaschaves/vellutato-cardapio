import { supabase } from "./supabase";

export type ModoDisponibilidadeEncomenda = "pronto" | "encomenda" | "indisponivel";

export interface DisponibilidadeEncomenda {
  modo: ModoDisponibilidadeEncomenda;
  encomenda_programada: boolean;
  estoque_pronto: number | null;
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
  return {
    modo: modo === "pronto" || modo === "encomenda" ? modo : "indisponivel",
    encomenda_programada: Boolean(o.encomenda_programada),
    estoque_pronto:
      o.estoque_pronto == null ? null : Number(o.estoque_pronto),
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
  horas_ate_retirada: number | null;
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
  horas_ate_retirada: number;
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

export function montarGradeRegras(
  regrasDb: RegraEncomendaDia[] = [],
): RegraEncomendaDiaEditavel[] {
  return Array.from({ length: 7 }, (_, dia_semana) => {
    const r = regrasDb.find((x) => x.dia_semana === dia_semana);
    return {
      dia_semana,
      ativo: r?.ativo ?? true,
      horario_limite: horarioLimiteParaInput(r?.cutoff),
      horas_ate_retirada: r?.horas_ate_retirada ?? 2,
      dias_apos_limite: r?.dias_apos_cutoff ?? 1,
      limite_encomendas: r?.limite_encomendas ?? 30,
    };
  });
}

export function regrasEditaveisParaDb(
  regras: RegraEncomendaDiaEditavel[],
): RegraEncomendaDia[] {
  return regras.map((r) => ({
    dia_semana: r.dia_semana,
    ativo: r.ativo,
    cutoff: horarioLimiteParaBanco(r.horario_limite),
    horas_ate_retirada: r.horas_ate_retirada,
    dias_apos_cutoff: r.dias_apos_limite,
    limite_encomendas: r.limite_encomendas,
  }));
}

export async function buscarRegrasTemplate(
  templateId: string,
): Promise<RegraEncomendaDia[]> {
  const { data, error } = await supabase
    .from("encomenda_programada_template_dias")
    .select(
      "dia_semana, ativo, cutoff, horas_ate_retirada, dias_apos_cutoff, limite_encomendas",
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

export async function buscarEstoqueProntoHoje(
  produtoId: string,
): Promise<number> {
  const hoje = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
  const { data, error } = await supabase
    .from("produto_estoque_pronto")
    .select("quantidade")
    .eq("produto_id", produtoId)
    .eq("referencia_data", hoje)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Number(data?.quantidade ?? 0);
}

export async function salvarEstoqueProntoHoje(
  produtoId: string,
  quantidade: number,
): Promise<void> {
  const hoje = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
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
      "dia_semana, ativo, cutoff, horas_ate_retirada, dias_apos_cutoff, limite_encomendas",
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
