import { supabase } from "./supabase";
import { normalizarTelefoneParaSalvar } from "./telefone";

export interface ClientePerfil {
  id: string;
  nome: string;
  celular: string;
  total_pedidos: number;
  valor_gasto: number;
  ultimo_pedido: string | null;
}

export interface CupomCliente {
  id: string;
  codigo: string;
  tipo: string;
  valor: number;
  valor_minimo: number | null;
  limite_uso: number | null;
  usos: number;
  validade: string | null;
}

export async function upsertCliente(
  nome: string,
  celular: string | null | undefined,
): Promise<string | null> {
  const celularNormalizado = celular
    ? normalizarTelefoneParaSalvar(celular)
    : "";

  if (!celularNormalizado) return null;

  const nomeLimpo = nome.trim();
  if (!nomeLimpo) return null;

  const { data: existente, error: erroBusca } = await supabase
    .from("clientes")
    .select("id")
    .eq("celular", celularNormalizado)
    .maybeSingle();

  if (erroBusca) throw new Error(erroBusca.message);

  if (existente?.id) {
    const { error: erroUpdate } = await supabase
      .from("clientes")
      .update({ nome: nomeLimpo })
      .eq("id", existente.id);

    if (erroUpdate) throw new Error(erroUpdate.message);
    return existente.id;
  }

  const { data: novo, error: erroInsert } = await supabase
    .from("clientes")
    .insert({ celular: celularNormalizado, nome: nomeLimpo })
    .select("id")
    .single();

  if (erroInsert) throw new Error(erroInsert.message);
  return novo.id;
}

export async function buscarClientePorCelular(
  celular: string,
): Promise<ClientePerfil | null> {
  const celularNormalizado = normalizarTelefoneParaSalvar(celular);
  if (celularNormalizado.length < 10) return null;

  const { data, error } = await supabase
    .from("clientes")
    .select("id, nome, celular, total_pedidos, valor_gasto, ultimo_pedido")
    .eq("celular", celularNormalizado)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    id: data.id,
    nome: data.nome,
    celular: data.celular,
    total_pedidos: Number(data.total_pedidos ?? 0),
    valor_gasto: Number(data.valor_gasto ?? 0),
    ultimo_pedido: data.ultimo_pedido,
  };
}

/** Cupons exclusivos ainda utilizáveis vinculados ao cliente. */
export async function buscarCuponsDoCliente(
  clienteId: string,
): Promise<CupomCliente[]> {
  const { data, error } = await supabase
    .from("cupons")
    .select(
      "id, codigo, tipo, valor, valor_minimo, limite_uso, usos, validade, ativo",
    )
    .eq("cliente_id", clienteId)
    .eq("ativo", true)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const agora = Date.now();

  return (data ?? [])
    .filter((c) => {
      if (c.validade && new Date(c.validade).getTime() < agora) return false;
      const usos = Number(c.usos ?? 0);
      if (c.limite_uso != null && usos >= c.limite_uso) return false;
      return true;
    })
    .map((c) => ({
      id: c.id,
      codigo: c.codigo,
      tipo: c.tipo,
      valor: Number(c.valor),
      valor_minimo: c.valor_minimo != null ? Number(c.valor_minimo) : null,
      limite_uso: c.limite_uso,
      usos: Number(c.usos ?? 0),
      validade: c.validade,
    }));
}

export function rotuloCupomResumo(cupom: CupomCliente): string {
  if (cupom.tipo === "percentual") {
    return `${cupom.valor}% de desconto`;
  }
  return `R$ ${cupom.valor.toFixed(2)} de desconto`;
}
