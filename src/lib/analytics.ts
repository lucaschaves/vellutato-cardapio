import { emModoToten } from "./modoCardapio";
import { supabase } from "./supabase";

export type CanalAnalytics = "mesa" | "totem" | "balcao" | "delivery";

export type EventoAnalytics =
  | "page_view"
  | "product_view"
  | "add_cart"
  | "begin_checkout"
  | "cep_ok"
  | "cep_fora_raio"
  | "auth_ok"
  | "checkout_error"
  | "order_created"
  | "payment_ok"
  | "payment_abandoned";

const KEY_SESSAO = "analytics_sessao_id";
const KEY_MESA = "analytics_mesa";
const KEY_CLIENTE = "analytics_cliente_id";

export function obterSessaoAnalytics(): string {
  try {
    let id = sessionStorage.getItem(KEY_SESSAO);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(KEY_SESSAO, id);
    }
    return id;
  } catch {
    return `s-${Date.now()}`;
  }
}

/** Persiste mesa da URL para rotas filhas (/cardapio/item/…). */
export function lembrarMesaAnalytics(mesa: string | null | undefined) {
  try {
    const v = mesa?.trim();
    if (v) sessionStorage.setItem(KEY_MESA, v);
  } catch {
    /* ignore */
  }
}

export function lembrarClienteAnalytics(clienteId: string | null | undefined) {
  try {
    if (clienteId) sessionStorage.setItem(KEY_CLIENTE, clienteId);
  } catch {
    /* ignore */
  }
}

function mesaAtual(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const daUrl = params.get("mesa")?.trim();
    if (daUrl) {
      sessionStorage.setItem(KEY_MESA, daUrl);
      return daUrl;
    }
    return sessionStorage.getItem(KEY_MESA);
  } catch {
    return null;
  }
}

/** Infere canal a partir da rota / modo totem / mesa. */
export function detectarCanal(): CanalAnalytics | null {
  if (typeof window === "undefined") return null;
  const path = window.location.pathname;

  if (
    path.startsWith("/admin") ||
    path.startsWith("/login") ||
    path === "/erros"
  ) {
    return null;
  }

  if (
    path.startsWith("/totem") ||
    path.startsWith("/cardapio-toten") ||
    emModoToten()
  ) {
    return "totem";
  }

  if (path.startsWith("/cardapio") || path.startsWith("/inicio")) {
    return mesaAtual() ? "mesa" : "balcao";
  }

  // Delivery na raiz (e rotas legadas já redirecionadas)
  return "delivery";
}

export const CANAL_LABEL: Record<CanalAnalytics, string> = {
  mesa: "Mesa",
  totem: "Totem",
  balcao: "Balcão",
  delivery: "Delivery",
};

type TrackOpts = {
  canal?: CanalAnalytics | null;
  produtoId?: string | null;
  pedidoId?: string | null;
  clienteId?: string | null;
  props?: Record<string, unknown>;
};

/**
 * Dispara evento de funil (fire-and-forget). Não bloqueia a UI.
 */
export function track(
  evento: EventoAnalytics | string,
  opts: TrackOpts = {},
): void {
  try {
    const canal = opts.canal === undefined ? detectarCanal() : opts.canal;
    if (!canal) return;

    const clienteId =
      opts.clienteId ||
      (typeof sessionStorage !== "undefined"
        ? sessionStorage.getItem(KEY_CLIENTE)
        : null);

    void supabase
      .from("analytics_eventos")
      .insert({
        canal,
        sessao_id: obterSessaoAnalytics(),
        evento,
        produto_id: opts.produtoId || null,
        pedido_id: opts.pedidoId || null,
        cliente_id: clienteId || null,
        props: opts.props || {},
      })
      .then(({ error }) => {
        if (error) {
          console.warn("[analytics]", error.message);
        }
      });
  } catch (erro) {
    console.warn("[analytics]", erro);
  }
}
