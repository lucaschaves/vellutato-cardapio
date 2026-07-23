import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * Bridge HTTPS para callbacks do Asaas.
 * Asaas exige successUrl/cancelUrl/expiredUrl em https:// —
 * em desenvolvimento (http://localhost) redirecionamos por aqui.
 */
Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const url = new URL(req.url);
    const to = url.searchParams.get("to");
    if (!to) {
      return new Response("Parâmetro to obrigatório", { status: 400 });
    }

    let destino: URL;
    try {
      destino = new URL(to);
    } catch {
      return new Response("URL inválida", { status: 400 });
    }

    const host = destino.hostname.toLowerCase();
    const permitido =
      destino.protocol === "https:" ||
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".localhost");

    if (!permitido) {
      return new Response("Destino não permitido", { status: 400 });
    }

    return Response.redirect(destino.toString(), 302);
  } catch (e) {
    console.error(e);
    return new Response(String(e), { status: 500 });
  }
});
