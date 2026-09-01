/**
 * Cliente Merchant API iFood (auth, eventos, pedidos).
 * Docs: https://developer.ifood.com.br
 */

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { lerSegredos } from "./segredos.ts";

export const IFOOD_AUTH_URL =
  "https://merchant-api.ifood.com.br/authentication/v1.0/oauth/token";
export const IFOOD_EVENTS_BASE =
  "https://merchant-api.ifood.com.br/events/v1.0";
export const IFOOD_ORDER_BASE =
  "https://merchant-api.ifood.com.br/order/v1.0";
export const IFOOD_MERCHANT_BASE =
  "https://merchant-api.ifood.com.br/merchant/v1.0";
export const IFOOD_CATALOG_BASE =
  "https://merchant-api.ifood.com.br/catalog/v2.0";

export type IfoodCredenciais = {
  clientId: string;
  clientSecret: string;
  merchantId: string;
};

export type IfoodEvento = {
  id: string;
  code?: string;
  fullCode?: string;
  orderId?: string;
  createdAt?: string;
  merchantId?: string;
  metadata?: Record<string, unknown>;
};

export async function carregarCredenciaisIfood(): Promise<IfoodCredenciais> {
  const s = await lerSegredos([
    "IFOOD_CLIENT_ID",
    "IFOOD_CLIENT_SECRET",
    "IFOOD_MERCHANT_ID",
  ]);
  const clientId = s.IFOOD_CLIENT_ID?.trim();
  const clientSecret = s.IFOOD_CLIENT_SECRET?.trim();
  const merchantId = s.IFOOD_MERCHANT_ID?.trim();
  if (!clientId || !clientSecret || !merchantId) {
    throw new Error(
      "Credenciais iFood ausentes (IFOOD_CLIENT_ID, IFOOD_CLIENT_SECRET, IFOOD_MERCHANT_ID)",
    );
  }
  return { clientId, clientSecret, merchantId };
}

function sbService(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function pedirTokenNovo(cred: IfoodCredenciais): Promise<{
  accessToken: string;
  expiresIn: number;
}> {
  const body = new URLSearchParams();
  body.set("grantType", "client_credentials");
  body.set("clientId", cred.clientId);
  body.set("clientSecret", cred.clientSecret);

  const res = await fetch(IFOOD_AUTH_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `iFood auth ${res.status}: ${JSON.stringify(data).slice(0, 400)}`,
    );
  }

  const accessToken =
    (data.accessToken as string | undefined) ||
    (data.access_token as string | undefined);
  const expiresIn = Number(data.expiresIn ?? data.expires_in ?? 3600);

  if (!accessToken) {
    throw new Error("iFood auth: accessToken ausente na resposta");
  }

  return { accessToken, expiresIn };
}

/** Token com cache em `ifood_oauth_cache` (margem de 60s). */
export async function obterAccessTokenIfood(
  cred?: IfoodCredenciais,
): Promise<string> {
  const c = cred ?? (await carregarCredenciaisIfood());
  const sb = sbService();

  const { data: cache } = await sb
    .from("ifood_oauth_cache")
    .select("access_token, expires_at")
    .eq("id", "default")
    .maybeSingle();

  if (cache?.access_token && cache.expires_at) {
    const exp = new Date(cache.expires_at).getTime();
    if (exp - Date.now() > 60_000) {
      return cache.access_token as string;
    }
  }

  const { accessToken, expiresIn } = await pedirTokenNovo(c);
  const expiresAt = new Date(Date.now() + Math.max(expiresIn - 60, 60) * 1000)
    .toISOString();

  await sb.from("ifood_oauth_cache").upsert({
    id: "default",
    access_token: accessToken,
    expires_at: expiresAt,
    atualizado_em: new Date().toISOString(),
  });

  return accessToken;
}

async function ifoodFetch(
  url: string,
  token: string,
  init: RequestInit = {},
  merchantId?: string,
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  if (merchantId) {
    headers.set("x-polling-merchants", merchantId);
  }
  return fetch(url, { ...init, headers });
}

export async function listarMerchants(token: string): Promise<unknown> {
  const res = await ifoodFetch(`${IFOOD_MERCHANT_BASE}/merchants`, token);
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`listarMerchants ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

export async function pollingEventos(
  token: string,
  merchantId: string,
): Promise<IfoodEvento[]> {
  const res = await ifoodFetch(
    `${IFOOD_EVENTS_BASE}/events:polling`,
    token,
    { method: "GET" },
    merchantId,
  );

  // 204 = sem eventos
  if (res.status === 204) return [];

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`polling ${res.status}: ${JSON.stringify(data)}`);
  }

  if (Array.isArray(data)) return data as IfoodEvento[];
  if (data && Array.isArray((data as { events?: unknown }).events)) {
    return (data as { events: IfoodEvento[] }).events;
  }
  return [];
}

export async function acknowledgmentEventos(
  token: string,
  eventIds: string[],
): Promise<void> {
  if (eventIds.length === 0) return;

  // Formato clássico da Events API
  const body = eventIds.map((id) => ({ id }));
  const res = await ifoodFetch(
    `${IFOOD_EVENTS_BASE}/events/acknowledgment`,
    token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok && res.status !== 202) {
    const text = await res.text().catch(() => "");
    throw new Error(`acknowledgment ${res.status}: ${text.slice(0, 400)}`);
  }
}

export async function buscarPedidoIfood(
  token: string,
  orderId: string,
): Promise<Record<string, unknown>> {
  const res = await ifoodFetch(
    `${IFOOD_ORDER_BASE}/orders/${orderId}`,
    token,
  );

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      `order ${orderId} ${res.status}: ${JSON.stringify(data).slice(0, 400)}`,
    );
  }
  return (data || {}) as Record<string, unknown>;
}

export async function confirmarPedidoIfood(
  token: string,
  orderId: string,
): Promise<void> {
  const res = await ifoodFetch(
    `${IFOOD_ORDER_BASE}/orders/${orderId}/confirm`,
    token,
    { method: "POST", headers: { "Content-Type": "application/json" } },
  );

  if (!res.ok && res.status !== 202) {
    const text = await res.text().catch(() => "");
    throw new Error(`confirm ${orderId} ${res.status}: ${text.slice(0, 400)}`);
  }
}

/** Eventos que pedem importação local do pedido. */
export function ehEventoNovoPedido(code?: string, fullCode?: string): boolean {
  const c = (code || "").toUpperCase();
  const f = (fullCode || "").toUpperCase();
  return (
    c === "PLC" ||
    c === "PLACED" ||
    f === "PLACED" ||
    f === "ORDER_PLACED" ||
    c === "CONFIRMED" ||
    f === "ORDER_CONFIRMED" ||
    f === "CONFIRMED"
  );
}

/** Só PLACED precisa de POST /confirm (SLA 8 min). */
export function ehEventoParaConfirmar(code?: string, fullCode?: string): boolean {
  const c = (code || "").toUpperCase();
  const f = (fullCode || "").toUpperCase();
  return (
    c === "PLC" ||
    c === "PLACED" ||
    f === "PLACED" ||
    f === "ORDER_PLACED"
  );
}

export function ehEventoCancelado(code?: string, fullCode?: string): boolean {
  const c = (code || "").toUpperCase();
  const f = (fullCode || "").toUpperCase();
  return (
    c === "CAN" ||
    c === "CANCELLED" ||
    f === "CANCELLED" ||
    f === "ORDER_CANCELLED"
  );
}

// ---------------------------------------------------------------------------
// Merchant — status / interrupções
// ---------------------------------------------------------------------------

export async function statusMerchant(
  token: string,
  merchantId: string,
): Promise<unknown> {
  const res = await ifoodFetch(
    `${IFOOD_MERCHANT_BASE}/merchants/${merchantId}/status`,
    token,
  );
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`status merchant ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

export async function listarInterrupcoes(
  token: string,
  merchantId: string,
): Promise<unknown[]> {
  const res = await ifoodFetch(
    `${IFOOD_MERCHANT_BASE}/merchants/${merchantId}/interruptions`,
    token,
  );
  if (res.status === 204) return [];
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`interruptions ${res.status}: ${JSON.stringify(data)}`);
  }
  return Array.isArray(data) ? data : [];
}

export async function criarInterrupcao(
  token: string,
  merchantId: string,
  args: { description: string; start: string; end: string },
): Promise<unknown> {
  const res = await ifoodFetch(
    `${IFOOD_MERCHANT_BASE}/merchants/${merchantId}/interruptions`,
    token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    },
  );
  const data = await res.json().catch(() => null);
  if (!res.ok && res.status !== 201 && res.status !== 202) {
    throw new Error(`criar interrupção ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

export async function removerInterrupcao(
  token: string,
  merchantId: string,
  interruptionId: string,
): Promise<void> {
  const res = await ifoodFetch(
    `${IFOOD_MERCHANT_BASE}/merchants/${merchantId}/interruptions/${interruptionId}`,
    token,
    { method: "DELETE" },
  );
  if (!res.ok && res.status !== 202 && res.status !== 204) {
    const text = await res.text().catch(() => "");
    throw new Error(`remover interrupção ${res.status}: ${text.slice(0, 300)}`);
  }
}

// ---------------------------------------------------------------------------
// Catalog — listagem / preço / status
// ---------------------------------------------------------------------------

export type IfoodCatalogItem = {
  itemId: string;
  name: string;
  externalCode: string | null;
  status: string | null;
  price: number | null;
  categoryName: string | null;
};

export async function listarCatalogos(
  token: string,
  merchantId: string,
): Promise<Array<{ catalogId: string; context?: string }>> {
  const res = await ifoodFetch(
    `${IFOOD_CATALOG_BASE}/merchants/${merchantId}/catalogs`,
    token,
  );
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`catalogs ${res.status}: ${JSON.stringify(data)}`);
  }
  const lista = Array.isArray(data)
    ? data
    : Array.isArray((data as { catalogs?: unknown })?.catalogs)
    ? (data as { catalogs: unknown[] }).catalogs
    : [];
  return lista.map((c) => {
    const o = c as Record<string, unknown>;
    return {
      catalogId: String(o.catalogId || o.id || ""),
      context: o.context ? String(o.context) : undefined,
    };
  }).filter((c) => c.catalogId);
}

export async function listarItensCatalogo(
  token: string,
  merchantId: string,
): Promise<IfoodCatalogItem[]> {
  const catalogs = await listarCatalogos(token, merchantId);
  const itens: IfoodCatalogItem[] = [];
  const visto = new Set<string>();

  for (const cat of catalogs) {
    const res = await ifoodFetch(
      `${IFOOD_CATALOG_BASE}/merchants/${merchantId}/catalogs/${cat.catalogId}/categories?includeItems=true`,
      token,
    );
    if (!res.ok) continue;
    const data = await res.json().catch(() => null);
    const categorias = Array.isArray(data)
      ? data
      : Array.isArray((data as { categories?: unknown })?.categories)
      ? (data as { categories: unknown[] }).categories
      : [];

    for (const catRow of categorias) {
      const cr = catRow as Record<string, unknown>;
      const catName = String(cr.name || cr.title || "");
      const items = Array.isArray(cr.items) ? cr.items : [];
      for (const raw of items) {
        const it = raw as Record<string, unknown>;
        const itemId = String(it.itemId || it.id || "");
        if (!itemId || visto.has(itemId)) continue;
        visto.add(itemId);
        const priceObj = it.price as { value?: number } | number | undefined;
        const price = typeof priceObj === "number"
          ? priceObj
          : Number(priceObj?.value ?? NaN);
        itens.push({
          itemId,
          name: String(it.name || it.title || "Item"),
          externalCode: it.externalCode != null
            ? String(it.externalCode)
            : null,
          status: it.status != null ? String(it.status) : null,
          price: Number.isFinite(price) ? price : null,
          categoryName: catName || null,
        });
      }
    }
  }

  return itens;
}

export async function patchItemStatus(
  token: string,
  merchantId: string,
  body: unknown,
): Promise<unknown> {
  const res = await ifoodFetch(
    `${IFOOD_CATALOG_BASE}/merchants/${merchantId}/items/status`,
    token,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const data = await res.json().catch(() => null);
  if (!res.ok && res.status !== 202) {
    throw new Error(`items/status ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

export async function patchItemPrice(
  token: string,
  merchantId: string,
  body: unknown,
): Promise<unknown> {
  const res = await ifoodFetch(
    `${IFOOD_CATALOG_BASE}/merchants/${merchantId}/items/price`,
    token,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const data = await res.json().catch(() => null);
  if (!res.ok && res.status !== 202) {
    throw new Error(`items/price ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Order — cancelamento
// ---------------------------------------------------------------------------

export async function motivosCancelamento(
  token: string,
  orderId: string,
): Promise<unknown[]> {
  const res = await ifoodFetch(
    `${IFOOD_ORDER_BASE}/orders/${orderId}/cancellationReasons`,
    token,
  );
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      `cancellationReasons ${res.status}: ${JSON.stringify(data)}`,
    );
  }
  if (Array.isArray(data)) return data;
  if (Array.isArray((data as { cancellationReasons?: unknown })?.cancellationReasons)) {
    return (data as { cancellationReasons: unknown[] }).cancellationReasons;
  }
  return [];
}

export async function solicitarCancelamento(
  token: string,
  orderId: string,
  args: { cancellationCode: string; reason?: string },
): Promise<void> {
  const res = await ifoodFetch(
    `${IFOOD_ORDER_BASE}/orders/${orderId}/requestCancellation`,
    token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cancellationCode: args.cancellationCode,
        reason: args.reason || undefined,
      }),
    },
  );
  if (!res.ok && res.status !== 202) {
    const text = await res.text().catch(() => "");
    throw new Error(`requestCancellation ${res.status}: ${text.slice(0, 400)}`);
  }
}
