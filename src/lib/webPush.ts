import { supabase } from "./supabase";

function urlBase64ParaUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

function comTimeout<T>(promise: Promise<T>, ms: number, mensagem: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(mensagem)), ms);
    promise
      .then((v) => {
        window.clearTimeout(t);
        resolve(v);
      })
      .catch((e) => {
        window.clearTimeout(t);
        reject(e);
      });
  });
}

export function pushSuportado(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function statusPermissaoNotificacao(): Promise<
  NotificationPermission | "unsupported"
> {
  if (!pushSuportado()) return "unsupported";
  return Notification.permission;
}

/**
 * Pede permissão, cria subscription e salva no Supabase.
 * Vincule ao pedido e/ou cliente para receber updates do KDS.
 */
export async function ativarPushPedido(opts: {
  pedidoId?: string | null;
  clienteId?: string | null;
}): Promise<{ ok: true } | { ok: false; motivo: string }> {
  if (!pushSuportado()) {
    return {
      ok: false,
      motivo: "Este aparelho/navegador não suporta notificações push.",
    };
  }

  const vapid = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  if (!vapid?.trim()) {
    return {
      ok: false,
      motivo: "Notificações ainda não configuradas (VITE_VAPID_PUBLIC_KEY).",
    };
  }

  if (!opts.pedidoId && !opts.clienteId) {
    return { ok: false, motivo: "Pedido ou cliente é obrigatório." };
  }

  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") {
    return {
      ok: false,
      motivo:
        "Permissão de notificação negada. Ative nas configurações do navegador.",
    };
  }

  let registro: ServiceWorkerRegistration;
  try {
    registro = await comTimeout(
      navigator.serviceWorker.ready,
      12000,
      "Service worker não respondeu. Recarregue a página e tente de novo.",
    );
  } catch (e: unknown) {
    return {
      ok: false,
      motivo: e instanceof Error ? e.message : String(e),
    };
  }

  let subscription = await registro.pushManager.getSubscription();
  if (!subscription) {
    try {
      subscription = await comTimeout(
        registro.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ParaUint8Array(
            vapid.trim(),
          ) as BufferSource,
        }),
        15000,
        "Tempo esgotado ao registrar o push. Tente novamente.",
      );
    } catch (e: unknown) {
      return {
        ok: false,
        motivo:
          e instanceof Error
            ? e.message
            : "Falha ao assinar notificações push.",
      };
    }
  }

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return { ok: false, motivo: "Falha ao obter dados da subscription." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      pedido_id: opts.pedidoId || null,
      cliente_id: opts.clienteId || null,
      user_id: user?.id || null,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    console.error("[PUSH] salvar subscription:", error.message);
    // Permissão ok — ainda assim avisamos; UI pode marcar ativo se quiser
    return {
      ok: false,
      motivo: `Permissão ok, mas não salvamos no servidor: ${error.message}. Rode a migration de notificações.`,
    };
  }

  return { ok: true };
}
