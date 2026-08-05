/**
 * Lê segredos: valor em `integracoes_config` (admin) tem prioridade;
 * se vazio/ausente, usa Deno.env (secrets do deploy).
 */
import { createClient } from "npm:@supabase/supabase-js@2";

export async function lerSegredos(
  chaves: string[],
): Promise<Record<string, string | undefined>> {
  const resultado: Record<string, string | undefined> = {};
  for (const chave of chaves) {
    const env = Deno.env.get(chave);
    resultado[chave] = env && env.trim() !== "" ? env : undefined;
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey || chaves.length === 0) return resultado;

  try {
    const sb = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await sb
      .from("integracoes_config")
      .select("chave, valor")
      .in("chave", chaves);

    if (error) {
      console.warn("[segredos] falha ao ler integracoes_config:", error.message);
      return resultado;
    }

    for (const row of data || []) {
      const valor = row.valor != null ? String(row.valor).trim() : "";
      if (valor !== "") {
        resultado[row.chave as string] = valor;
      }
    }
  } catch (erro) {
    console.warn("[segredos] erro inesperado:", erro);
  }

  return resultado;
}

export async function lerSegredo(chave: string): Promise<string | undefined> {
  const mapa = await lerSegredos([chave]);
  return mapa[chave];
}
