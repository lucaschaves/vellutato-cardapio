import { supabase } from "./supabase";

export async function buscarSaldoPontos(clienteId: string): Promise<number> {
  const { data, error } = await supabase
    .from("cliente_pontos")
    .select("saldo")
    .eq("cliente_id", clienteId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Number(data?.saldo ?? 0);
}

export async function listarExtratoPontos(clienteId: string) {
  const { data, error } = await supabase
    .from("pontos_extrato")
    .select("id, pontos, tipo, descricao, criado_em, pedido_id")
    .eq("cliente_id", clienteId)
    .order("criado_em", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function resgatarPontos(clienteId: string): Promise<{
  codigo: string;
  valor: number;
  pontos_debitados: number;
}> {
  const { data, error } = await supabase.rpc("resgatar_pontos", {
    p_cliente_id: clienteId,
  });
  if (error) throw new Error(error.message);
  const r = data as {
    codigo: string;
    valor: number;
    pontos_debitados: number;
  };
  return {
    codigo: r.codigo,
    valor: Number(r.valor),
    pontos_debitados: Number(r.pontos_debitados),
  };
}
