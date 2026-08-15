export type JwtInfo = {
  role: string;
  sub: string | null;
  appRole: string | null;
};

function decodificarPayload(token: string): Record<string, unknown> | null {
  const partes = token.split(".");
  if (partes.length < 2) return null;
  try {
    const b64 = partes[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = "=".repeat((4 - (b64.length % 4)) % 4);
    const json = atob(b64 + pad);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function lerJwt(req: Request): JwtInfo | null {
  const h = req.headers.get("Authorization");
  if (!h?.toLowerCase().startsWith("bearer ")) return null;
  const payload = decodificarPayload(h.slice(7).trim());
  if (!payload) return null;
  const meta = payload.app_metadata as Record<string, unknown> | undefined;
  return {
    role: String(payload.role || ""),
    sub: typeof payload.sub === "string" ? payload.sub : null,
    appRole: typeof meta?.role === "string" ? meta.role : null,
  };
}

/** Staff da loja (Auth e-mail, app_metadata.role = admin). */
export function ehAdminRequest(req: Request): boolean {
  const j = lerJwt(req);
  return j?.role === "authenticated" && j.appRole === "admin";
}

/** Anon key (visitante) ou qualquer usuário autenticado (cliente ou admin). */
export function ehAnonOuAutenticado(req: Request): boolean {
  const j = lerJwt(req);
  if (!j) return false;
  return j.role === "anon" || j.role === "authenticated";
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function uuidValido(valor: unknown): valor is string {
  return typeof valor === "string" && UUID_RE.test(valor);
}
