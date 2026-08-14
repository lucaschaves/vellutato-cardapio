import type { Session, User } from "@supabase/supabase-js";

/** Staff da loja: app_metadata.role definido só via Dashboard / service_role. */
export function usuarioEhAdmin(user: User | null | undefined): boolean {
  if (!user) return false;
  const role = (user.app_metadata as { role?: string } | undefined)?.role;
  return role === "admin";
}

export function sessaoEhAdmin(sessao: Session | null | undefined): boolean {
  return usuarioEhAdmin(sessao?.user);
}
