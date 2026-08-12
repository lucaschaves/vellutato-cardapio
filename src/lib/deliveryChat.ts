import { supabase } from "./supabase";

export interface Conversa {
  id: string;
  cliente_id: string;
  pedido_id: string | null;
  status: "aberta" | "fechada";
  ultimo_mensagem_em: string | null;
  criado_em: string;
  nao_lida_admin?: boolean;
  nao_lida_cliente?: boolean;
  ultima_mensagem_corpo?: string | null;
  ultima_mensagem_autor?: "cliente" | "admin" | string | null;
  nao_lidas_admin_count?: number;
  nao_lidas_cliente_count?: number;
  clientes?: { nome: string; celular: string | null } | null;
}

export interface MensagemChat {
  id: string;
  conversa_id: string;
  autor: "cliente" | "admin";
  corpo: string;
  criado_em: string;
  lida_admin?: boolean;
  lida_cliente?: boolean;
}

export async function listarConversasAdmin(): Promise<Conversa[]> {
  const { data, error } = await supabase
    .from("conversas")
    .select(
      `id, cliente_id, pedido_id, status, ultimo_mensagem_em, criado_em,
       nao_lida_admin, nao_lida_cliente,
       ultima_mensagem_corpo, ultima_mensagem_autor,
       nao_lidas_admin_count, nao_lidas_cliente_count,
       clientes(nome, celular)`,
    )
    .order("ultimo_mensagem_em", { ascending: false, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Conversa[];
}

export async function contarMensagensNaoLidasAdmin(): Promise<number> {
  const { count, error } = await supabase
    .from("mensagens")
    .select("id", { count: "exact", head: true })
    .eq("autor", "cliente")
    .eq("lida_admin", false);
  if (error) {
    console.warn("[CHAT] Falha ao contar não lidas:", error.message);
    return 0;
  }
  return count ?? 0;
}

export async function contarMensagensNaoLidasCliente(
  clienteId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("conversas")
    .select("nao_lidas_cliente_count")
    .eq("cliente_id", clienteId);
  if (error) {
    // Fallback se migration ainda não aplicada
    console.warn("[CHAT] Falha ao contar não lidas cliente:", error.message);
    return 0;
  }
  return (data ?? []).reduce(
    (s, c) => s + Number(c.nao_lidas_cliente_count ?? 0),
    0,
  );
}

export async function marcarConversaLidaAdmin(
  conversaId: string,
): Promise<void> {
  const { error } = await supabase.rpc("marcar_conversa_lida_admin", {
    p_conversa_id: conversaId,
  });
  if (error) {
    const { error: errMsg } = await supabase
      .from("mensagens")
      .update({ lida_admin: true })
      .eq("conversa_id", conversaId)
      .eq("autor", "cliente")
      .eq("lida_admin", false);
    if (errMsg) console.warn("[CHAT] marcar lidas:", errMsg.message);

    const { error: errConv } = await supabase
      .from("conversas")
      .update({
        nao_lida_admin: false,
        nao_lidas_admin_count: 0,
      })
      .eq("id", conversaId);
    if (errConv) console.warn("[CHAT] limpar flag conversa:", errConv.message);
  }
}

export async function marcarConversaLidaCliente(
  conversaId: string,
): Promise<void> {
  const { error } = await supabase.rpc("marcar_conversa_lida_cliente", {
    p_conversa_id: conversaId,
  });
  if (error) {
    const { error: errMsg } = await supabase
      .from("mensagens")
      .update({ lida_cliente: true })
      .eq("conversa_id", conversaId)
      .eq("autor", "admin")
      .eq("lida_cliente", false);
    if (errMsg) console.warn("[CHAT] marcar lidas cliente:", errMsg.message);

    const { error: errConv } = await supabase
      .from("conversas")
      .update({
        nao_lida_cliente: false,
        nao_lidas_cliente_count: 0,
      })
      .eq("id", conversaId);
    if (errConv) {
      console.warn("[CHAT] limpar flag conversa cliente:", errConv.message);
    }
  }
}

export async function obterOuCriarConversa(opts: {
  clienteId: string;
  pedidoId?: string | null;
}): Promise<string> {
  const { data: aberta } = await supabase
    .from("conversas")
    .select("id")
    .eq("cliente_id", opts.clienteId)
    .eq("status", "aberta")
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (aberta?.id) {
    if (opts.pedidoId) {
      await supabase
        .from("conversas")
        .update({ pedido_id: opts.pedidoId })
        .eq("id", aberta.id)
        .is("pedido_id", null);
    }
    return aberta.id;
  }

  const { data, error } = await supabase
    .from("conversas")
    .insert({
      cliente_id: opts.clienteId,
      pedido_id: opts.pedidoId || null,
      status: "aberta",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function listarMensagens(
  conversaId: string,
): Promise<MensagemChat[]> {
  const { data, error } = await supabase
    .from("mensagens")
    .select(
      "id, conversa_id, autor, corpo, criado_em, lida_admin, lida_cliente",
    )
    .eq("conversa_id", conversaId)
    .order("criado_em", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as MensagemChat[];
}

export async function enviarMensagem(opts: {
  conversaId: string;
  autor: "cliente" | "admin";
  corpo: string;
}): Promise<void> {
  const texto = opts.corpo.trim();
  if (!texto) return;

  const { error } = await supabase.from("mensagens").insert({
    conversa_id: opts.conversaId,
    autor: opts.autor,
    corpo: texto,
  });
  if (error) throw new Error(error.message);

  // Trigger já atualiza ultimo_mensagem_em / preview; fallback se migration antiga.
  await supabase
    .from("conversas")
    .update({ ultimo_mensagem_em: new Date().toISOString() })
    .eq("id", opts.conversaId);
}

export function previewMensagemInbox(
  corpo: string | null | undefined,
  max = 60,
): string {
  const t = (corpo || "").trim().replace(/\s+/g, " ");
  if (!t) return "Sem mensagens";
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export function formatarHoraInbox(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const hoje = new Date();
    const mesmoDia =
      d.getFullYear() === hoje.getFullYear() &&
      d.getMonth() === hoje.getMonth() &&
      d.getDate() === hoje.getDate();
    if (mesmoDia) {
      return new Intl.DateTimeFormat("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(d);
    }
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    }).format(d);
  } catch {
    return "";
  }
}
