import { supabase } from "./supabase";
import { normalizarTelefoneParaSalvar } from "./telefone";

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
): Promise<{ id: string; nome: string } | null> {
  const celularNormalizado = normalizarTelefoneParaSalvar(celular);
  if (celularNormalizado.length < 10) return null;

  const { data, error } = await supabase
    .from("clientes")
    .select("id, nome")
    .eq("celular", celularNormalizado)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return { id: data.id, nome: data.nome };
}

