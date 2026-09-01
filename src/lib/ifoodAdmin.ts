import { supabase } from "./supabase";

export type IfoodMapRow = {
  external_code: string;
  produto_id: string | null;
  adicional_id: string | null;
  ifood_item_id: string | null;
};

export type IfoodCatalogItem = {
  itemId: string;
  name: string;
  externalCode: string | null;
  status: string | null;
  price: number | null;
  categoryName: string | null;
};

export type IfoodMotivoCancel = {
  cancelCodeId?: string;
  code?: string;
  description?: string;
  [key: string]: unknown;
};

async function chamarIfoodAdmin<T = Record<string, unknown>>(
  acao: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("ifood-admin", {
    body: { acao, ...(body || {}) },
  });
  if (error) throw new Error(error.message);
  if (data?.erro) throw new Error(String(data.erro));
  return data as T;
}

export async function ifoodPing(): Promise<{ ok: boolean; merchantId: string }> {
  return chamarIfoodAdmin("ping");
}

export async function ifoodStatusLoja(): Promise<{
  status: unknown;
  interrupcoes: unknown[];
}> {
  return chamarIfoodAdmin("status-loja");
}

export async function ifoodPausarLoja(
  minutos: number,
  description?: string,
): Promise<void> {
  await chamarIfoodAdmin("pausar-loja", { minutos, description });
}

export async function ifoodReabrirLoja(interruptionId?: string): Promise<void> {
  await chamarIfoodAdmin("reabrir-loja", {
    interruptionId: interruptionId || undefined,
  });
}

export async function ifoodListarCatalogo(): Promise<IfoodCatalogItem[]> {
  const data = await chamarIfoodAdmin<{ itens: IfoodCatalogItem[] }>(
    "listar-catalogo",
  );
  return data.itens || [];
}

export async function ifoodSyncProduto(produtoId: string): Promise<{
  ok: boolean;
  ignorado?: boolean;
  motivo?: string;
}> {
  return chamarIfoodAdmin("sync-produto", { produto_id: produtoId });
}

/** Fire-and-forget: não quebra o fluxo do admin se iFood falhar. */
export function ifoodSyncProdutoSilencioso(produtoId: string): void {
  void ifoodSyncProduto(produtoId).catch((e) => {
    console.warn("[ifood] sync produto:", e);
  });
}

export async function ifoodSyncTodos(): Promise<{
  total: number;
  resultados: Array<{ produto_id: string; ok: boolean; erro?: string }>;
}> {
  return chamarIfoodAdmin("sync-todos");
}

export async function ifoodMotivosCancelamento(
  orderId: string,
): Promise<IfoodMotivoCancel[]> {
  const data = await chamarIfoodAdmin<{ motivos: IfoodMotivoCancel[] }>(
    "motivos-cancelamento",
    { order_id: orderId },
  );
  return data.motivos || [];
}

export async function ifoodCancelarPedido(args: {
  orderId: string;
  cancellationCode: string;
  reason?: string;
}): Promise<void> {
  await chamarIfoodAdmin("cancelar-pedido", {
    order_id: args.orderId,
    cancellationCode: args.cancellationCode,
    reason: args.reason,
  });
}

export async function listarMapeamentosIfood(): Promise<IfoodMapRow[]> {
  const { data, error } = await supabase
    .from("ifood_mapeamentos")
    .select("external_code, produto_id, adicional_id, ifood_item_id");
  if (error) throw new Error(error.message);
  return (data || []) as IfoodMapRow[];
}

export async function salvarMapeamentoProduto(args: {
  produtoId: string;
  externalCode: string;
  ifoodItemId: string | null;
}): Promise<void> {
  const code = args.externalCode.trim();
  if (!code) throw new Error("externalCode obrigatório");

  // Remove mapeamentos antigos deste produto
  await supabase
    .from("ifood_mapeamentos")
    .delete()
    .eq("produto_id", args.produtoId);

  const { error } = await supabase.from("ifood_mapeamentos").upsert({
    external_code: code,
    produto_id: args.produtoId,
    adicional_id: null,
    ifood_item_id: args.ifoodItemId || null,
  });
  if (error) throw new Error(error.message);
}

export async function removerMapeamentoProduto(produtoId: string): Promise<void> {
  const { error } = await supabase
    .from("ifood_mapeamentos")
    .delete()
    .eq("produto_id", produtoId);
  if (error) throw new Error(error.message);
}
