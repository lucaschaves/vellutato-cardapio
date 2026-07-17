import { supabase } from "./supabase";

/** Resultado da função SQL loja_aberta_agora(). */
export interface StatusLoja {
  aberta: boolean;
  motivo: string | null;
  tempo_preparo_min: number;
}

export interface LojaConfig {
  pausado: boolean;
  mensagem_pausa: string | null;
  tempo_preparo_min: number;
  limite_pedidos_ativos: number | null;
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
    .select("pausado, mensagem_pausa, tempo_preparo_min, limite_pedidos_ativos")
    .eq("id", 1)
    .single();
  if (error) throw new Error(error.message);
  return data as LojaConfig;
}

export async function salvarConfigLoja(config: LojaConfig): Promise<void> {
  const { error } = await supabase
    .from("loja_config")
    .update({
      pausado: config.pausado,
      mensagem_pausa: config.mensagem_pausa?.trim() || null,
      tempo_preparo_min: config.tempo_preparo_min,
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
