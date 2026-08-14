import { supabase } from "./supabase";
import {
  custoExplosao,
  explodeFicha,
  mapFichaItemRow,
  mapFichaRow,
  type FichaTecnicaItem,
} from "./fichasTecnicas";
import type { Insumo } from "./insumos";

export async function recalcularCustosFichas(filtroInsumoId?: string): Promise<number> {
  const [{ data: fichasRaw, error: e1 }, { data: itensRaw, error: e2 }, { data: insumosRaw, error: e3 }] =
    await Promise.all([
      supabase.from("fichas_tecnicas").select("*"),
      supabase.from("ficha_tecnica_itens").select("*"),
      supabase.from("insumos").select("id, nome, tipo, preco_atual"),
    ]);
  if (e1) throw new Error(e1.message);
  if (e2) throw new Error(e2.message);
  if (e3) throw new Error(e3.message);

  const fichas = ((fichasRaw ?? []) as Record<string, unknown>[]).map(mapFichaRow);
  const itens = ((itensRaw ?? []) as Record<string, unknown>[]).map(mapFichaItemRow);
  const insumosPorId = new Map(
    ((insumosRaw ?? []) as Pick<Insumo, "id" | "nome" | "tipo" | "preco_atual">[]).map(
      (i) => [i.id, i],
    ),
  );
  const fichasPorId = new Map(fichas.map((f) => [f.id, f]));
  const itensPorFicha = new Map<string, FichaTecnicaItem[]>();
  for (const it of itens) {
    const arr = itensPorFicha.get(it.ficha_id) ?? [];
    arr.push(it);
    itensPorFicha.set(it.ficha_id, arr);
  }

  const fichasQueUsamInsumo = new Set<string>();
  if (filtroInsumoId) {
    for (const it of itens) {
      if (it.insumo_id === filtroInsumoId) fichasQueUsamInsumo.add(it.ficha_id);
    }
    for (const it of itens) {
      if (it.ficha_filha_id && fichasQueUsamInsumo.has(it.ficha_filha_id)) {
        fichasQueUsamInsumo.add(it.ficha_id);
      }
    }
  }

  const agora = new Date().toISOString();
  let n = 0;
  for (const ficha of fichas) {
    if (filtroInsumoId && !fichasQueUsamInsumo.has(ficha.id)) continue;
    const consumo = explodeFicha(ficha, itensPorFicha.get(ficha.id) ?? [], 1, {
      fichasPorId,
      itensPorFicha,
      insumosPorId,
    });
    const { custo } = custoExplosao(consumo, insumosPorId);
    const { error } = await supabase
      .from("fichas_tecnicas")
      .update({
        custo_calculado: custo,
        custo_atualizado_em: agora,
        atualizado_em: agora,
      })
      .eq("id", ficha.id);
    if (error) throw new Error(error.message);
    n += 1;
  }
  return n;
}
