import { supabase } from "./supabase";

/** Resultado da função SQL loja_aberta_agora(). */
export interface StatusLoja {
  aberta: boolean;
  motivo: string | null;
  tempo_preparo_min: number;
  /** Minutos após a abertura antes do 1º slot agendável. */
  atraso_primeiro_agendamento_min?: number;
}

export interface LojaConfig {
  pausado: boolean;
  /** ISO; se no futuro, a loja reabre sozinha neste instante. */
  pausado_ate: string | null;
  mensagem_pausa: string | null;
  tempo_preparo_min: number;
  /**
   * Minutos após a abertura em que o primeiro horário de agendamento
   * pode ser oferecido (ex.: abre 14:00 + 15 → 14:15).
   */
  atraso_primeiro_agendamento_min: number;
  limite_pedidos_ativos: number | null;
}

export const MINUTOS_PAUSA_RAPIDA_LOJA = 10;

export function pausaLojaEfetiva(
  config: Pick<LojaConfig, "pausado" | "pausado_ate">,
  agora = Date.now(),
): boolean {
  if (!config.pausado) return false;
  if (!config.pausado_ate) return true;
  return new Date(config.pausado_ate).getTime() > agora;
}

export interface LojaHorario {
  dia_semana: number;
  aberto: boolean;
  abre: string; // "HH:MM:SS"
  fecha: string;
}

export const NOMES_DIAS_SEMANA = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
] as const;

export async function buscarStatusLoja(): Promise<StatusLoja | null> {
  const { data, error } = await supabase.rpc("loja_aberta_agora");
  if (error) {
    console.error("[LOJA] Falha ao consultar status:", error.message);
    return null;
  }
  return data as unknown as StatusLoja;
}

export async function buscarConfigLoja(): Promise<LojaConfig> {
  const { data, error } = await supabase
    .from("loja_config")
    .select(
      "pausado, pausado_ate, mensagem_pausa, tempo_preparo_min, atraso_primeiro_agendamento_min, limite_pedidos_ativos",
    )
    .eq("id", 1)
    .single();
  if (error) throw new Error(error.message);
  const row = data as LojaConfig;
  return {
    ...row,
    atraso_primeiro_agendamento_min: Number(
      row.atraso_primeiro_agendamento_min ?? 15,
    ),
  };
}

export async function salvarConfigLoja(config: LojaConfig): Promise<void> {
  const { error } = await supabase
    .from("loja_config")
    .update({
      pausado: config.pausado,
      pausado_ate: config.pausado
        ? config.pausado_ate
        : null,
      mensagem_pausa: config.mensagem_pausa?.trim() || null,
      tempo_preparo_min: config.tempo_preparo_min,
      atraso_primeiro_agendamento_min: Math.max(
        0,
        Math.min(180, Number(config.atraso_primeiro_agendamento_min) || 0),
      ),
      limite_pedidos_ativos: config.limite_pedidos_ativos,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) throw new Error(error.message);
}

export async function buscarHorariosLoja(): Promise<LojaHorario[]> {
  const { data, error } = await supabase
    .from("loja_horarios")
    .select("dia_semana, aberto, abre, fecha")
    .order("dia_semana");
  if (error) throw new Error(error.message);
  return (data ?? []) as LojaHorario[];
}

export async function pausarLojaPorMinutos(minutos: number): Promise<void> {
  const ate = new Date(Date.now() + minutos * 60 * 1000).toISOString();
  const { error } = await supabase
    .from("loja_config")
    .update({
      pausado: true,
      pausado_ate: ate,
      mensagem_pausa: `Pausa rápida de ${minutos} minutos. Voltamos já!`,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) throw new Error(error.message);
}

export async function reabrirLoja(): Promise<void> {
  const { error } = await supabase
    .from("loja_config")
    .update({
      pausado: false,
      pausado_ate: null,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) throw new Error(error.message);
}

export async function salvarHorarioLoja(horario: LojaHorario): Promise<void> {
  const { error } = await supabase
    .from("loja_horarios")
    .update({
      aberto: horario.aberto,
      abre: horario.abre,
      fecha: horario.fecha,
    })
    .eq("dia_semana", horario.dia_semana);
  if (error) throw new Error(error.message);
}
