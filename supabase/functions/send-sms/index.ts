import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

const KINGSMS_URL = "http://painel.kingsms.com.br/kingsms/api.php";

/** KingSMS: DDD + número, sem +55. Aceita E.164 (+5511…) ou só dígitos. */
function telefoneParaKingSms(phone: string): string | null {
  let digitos = phone.replace(/\D/g, "");
  if (digitos.startsWith("55") && digitos.length >= 12) {
    digitos = digitos.slice(2);
  }
  if (digitos.length < 10 || digitos.length > 11) return null;
  return digitos;
}

function soBrasil(phone: string): boolean {
  const digitos = phone.replace(/\D/g, "");
  if (digitos.startsWith("55") && digitos.length >= 12) return true;
  // Auth às vezes manda sem +; 11 dígitos BR
  return digitos.length === 10 || digitos.length === 11;
}

/** KingSMS pede mensagem sem acentuação (máx. 160). */
function mensagemSemAcento(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .slice(0, 160);
}

function jsonError(httpCode: number, message: string, status = 500) {
  return new Response(
    JSON.stringify({
      error: { http_code: httpCode, message },
    }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    },
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200 });
  }

  if (req.method !== "POST") {
    return jsonError(405, "Method not allowed", 405);
  }

  const hookSecret = Deno.env.get("SEND_SMS_HOOK_SECRET");
  const login = Deno.env.get("KINGSMS_LOGIN");
  const token = Deno.env.get("KINGSMS_TOKEN");

  if (!hookSecret) {
    console.error("[send-sms] SEND_SMS_HOOK_SECRET ausente");
    return jsonError(500, "Hook secret nao configurado");
  }
  if (!login || !token) {
    console.error("[send-sms] KINGSMS_LOGIN / KINGSMS_TOKEN ausentes");
    return jsonError(500, "Credenciais KingSMS nao configuradas");
  }

  const payload = await req.text();
  const headers = Object.fromEntries(req.headers);
  const base64Secret = hookSecret.replace(/^v1,whsec_/, "");

  try {
    const wh = new Webhook(base64Secret);
    const event = wh.verify(payload, headers) as {
      user?: { phone?: string };
      sms?: { otp?: string };
    };

    const phone = event.user?.phone || "";
    const otp = event.sms?.otp || "";

    if (!phone || !otp) {
      return jsonError(400, "Payload sem telefone ou OTP", 400);
    }

    if (!soBrasil(phone)) {
      console.warn("[send-sms] numero nao BR:", phone);
      return jsonError(400, "Apenas numeros brasileiros (+55) sao suportados", 400);
    }

    const numero = telefoneParaKingSms(phone);
    if (!numero) {
      return jsonError(400, "Numero de telefone invalido", 400);
    }

    const msg = mensagemSemAcento(
      `Vellutato: seu codigo de acesso e ${otp}. Valido por alguns minutos.`,
    );

    const url = new URL(KINGSMS_URL);
    url.searchParams.set("acao", "sendsms");
    url.searchParams.set("login", login);
    url.searchParams.set("token", token);
    url.searchParams.set("numero", numero);
    url.searchParams.set("msg", msg);
    url.searchParams.set("campanha", "auth-otp");

    const resp = await fetch(url.toString(), { method: "GET" });
    const texto = await resp.text();
    let data: { status?: string; cause?: string; id?: string } = {};
    try {
      data = JSON.parse(texto) as typeof data;
    } catch {
      console.error("[send-sms] resposta nao JSON:", texto);
      return jsonError(502, "Resposta invalida da KingSMS");
    }

    if (data.status !== "success") {
      console.error("[send-sms] KingSMS erro:", data);
      return jsonError(
        502,
        `KingSMS: ${data.cause || "falha no envio"}`,
        502,
      );
    }

    console.log("[send-sms] enfileirado id=", data.id, "numero=***", numero.slice(-4));
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[send-sms] falha:", message);
    return jsonError(500, `Falha ao enviar SMS: ${message}`);
  }
});
