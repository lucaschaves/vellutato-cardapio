/** Origens do app que podem chamar as functions no browser. */
const ORIGENS = new Set([
  "https://vellutatocookies.com.br",
  "https://www.vellutatocookies.com.br",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:4173",
]);

export function origemPermitida(origin: string | null): string | null {
  if (!origin) return null;
  const limpa = origin.replace(/\/$/, "");
  return ORIGENS.has(limpa) ? limpa : null;
}

export function corsBrowser(req: Request): Record<string, string> {
  const allow = origemPermitida(req.headers.get("Origin"));
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    Vary: "Origin",
  };
  if (allow) headers["Access-Control-Allow-Origin"] = allow;
  return headers;
}

export function respostaOpcoes(req: Request): Response {
  return new Response("ok", { headers: corsBrowser(req) });
}
