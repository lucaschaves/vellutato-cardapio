import { supabase } from "./supabase";
import { todasChavesIntegracoes } from "./integracoesCatalogo";

export type IntegracoesMapa = Record<string, string>;

export async function buscarIntegracoesConfig(): Promise<IntegracoesMapa> {
  const chaves = todasChavesIntegracoes();
  const mapa: IntegracoesMapa = {};
  for (const chave of chaves) mapa[chave] = "";

  const { data, error } = await supabase
    .from("integracoes_config")
    .select("chave, valor")
    .in("chave", chaves);

  if (error) throw new Error(error.message);

  for (const row of data || []) {
    mapa[row.chave as string] = row.valor != null ? String(row.valor) : "";
  }
  return mapa;
}

export async function salvarIntegracoesConfig(
  valores: IntegracoesMapa,
  usuarioId?: string | null,
): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) {
    throw new Error(
      "Sessão expirada. Faça login de novo no admin e tente salvar.",
    );
  }

  const agora = new Date().toISOString();
  const autor = usuarioId || session.user.id;
  const linhas = todasChavesIntegracoes().map((chave) => ({
    chave,
    valor: valores[chave] ?? "",
    atualizado_em: agora,
    atualizado_por: autor,
  }));

  const { error } = await supabase
    .from("integracoes_config")
    .upsert(linhas, { onConflict: "chave" });

  if (error) throw new Error(error.message);
}
