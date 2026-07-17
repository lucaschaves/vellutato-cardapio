import { supabase } from "./supabase";

export interface MensagemWhatsapp {
  id: string;
  titulo: string;
  conteudo: string;
  ordem: number;
}

export interface DadosMensagemPedido {
  nome: string;
  pedido: number | null;
  produtos: string;
  total: string;
  status: string;
  local: string;
}

/** Tags disponíveis para os modelos de mensagem. */
export const TAGS_MENSAGEM_WHATSAPP: Array<{
  tag: string;
  descricao: string;
}> = [
  { tag: "{nome}", descricao: "Primeiro nome do cliente" },
  { tag: "{pedido}", descricao: "Número do pedido" },
  { tag: "{produtos}", descricao: "Lista dos itens do pedido" },
  { tag: "{total}", descricao: "Valor total (R$)" },
  { tag: "{status}", descricao: "Frase do status atual do pedido" },
  { tag: "{local}", descricao: "Mesa ou balcão" },
];

export const MENSAGEM_WHATSAPP_PADRAO =
  "Olá, {nome}! 😊\n" +
  "Obrigado pelo seu pedido na *Vellutato*!\n\n" +
  "*Pedido #{pedido}*\n" +
  "{produtos}\n\n" +
  "Total: {total}\n\n" +
  "{status}\n\n" +
  "Qualquer dúvida é só responder por aqui!";

export function preencherMensagemWhatsapp(
  modelo: string,
  dados: DadosMensagemPedido,
): string {
  return modelo
    .replaceAll("{nome}", dados.nome)
    .replaceAll("{pedido}", dados.pedido != null ? String(dados.pedido) : "")
    .replaceAll("{produtos}", dados.produtos)
    .replaceAll("{total}", dados.total)
    .replaceAll("{status}", dados.status)
    .replaceAll("{local}", dados.local);
}

export function montarLinkWhatsapp(
  celular: string | null | undefined,
  mensagem: string,
): string | null {
  const digitos = (celular || "").replace(/\D/g, "");
  if (digitos.length < 10) return null;

  const numeroComPais = digitos.startsWith("55") ? digitos : `55${digitos}`;
  return `https://wa.me/${numeroComPais}?text=${encodeURIComponent(mensagem)}`;
}

export async function buscarMensagensWhatsapp(): Promise<MensagemWhatsapp[]> {
  const { data, error } = await supabase
    .from("whatsapp_mensagens")
    .select("id, titulo, conteudo, ordem")
    .order("ordem", { ascending: true })
    .order("criado_em", { ascending: true });

  if (error) throw new Error(error.message);
  return (data as MensagemWhatsapp[]) || [];
}
