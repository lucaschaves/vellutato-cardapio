import { supabase } from "./supabase";

export interface Conversa {
  id: string;
  cliente_id: string;
  pedido_id: string | null;
  status: "aberta" | "fechada";
  ultimo_mensagem_em: string | null;
  criado_em: string;
  clientes?: { nome: string; celular: string | null } | null;
}

export interface MensagemChat {
  id: string;
  conversa_id: string;
  autor: "cliente" | "admin";
  corpo: string;
  criado_em: string;
}

export async function listarConversasAdmin(): Promise<Conversa[]> {
  const { data, error } = await supabase
    .from("conversas")
    .select(
      "id, cliente_id, pedido_id, status, ultimo_mensagem_em, criado_em, clientes(nome, celular)",
    )
    .order("ultimo_mensagem_em", { ascending: false, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Conversa[];
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
    .select("id, conversa_id, autor, corpo, criado_em")
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

  await supabase
    .from("conversas")
    .update({ ultimo_mensagem_em: new Date().toISOString() })
    .eq("id", opts.conversaId);
}
