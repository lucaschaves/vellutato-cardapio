import {
  detectarCanal,
  obterSessaoAnalytics,
  type CanalAnalytics,
} from "./analytics";
import { supabase } from "./supabase";

/** Mensagem única mostrada ao cliente em falha técnica. */
export const MSG_ERRO_TECNICO_CLIENTE =
  "Não foi possível concluir. Tente de novo ou fale com a loja.";

/** Erro de negócio (loja fechada, estoque etc.): mensagem amigável para o cliente. */
export class ErroNegocioCheckout extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErroNegocioCheckout";
  }
}

/**
 * Erro técnico (banco, rede, RPC): toast genérico; detalhe vai para erros_cliente.
 */
export class ErroTecnicoCheckout extends Error {
  readonly tecnico: string;
  readonly codigo: string | null;

  constructor(tecnico: string, codigo?: string | null) {
    super(MSG_ERRO_TECNICO_CLIENTE);
    this.name = "ErroTecnicoCheckout";
    this.tecnico = tecnico;
    this.codigo = codigo ?? null;
  }
}

const PREFIXOS_NEGOCIO =
  /^(LOJA_FECHADA|LOJA_CHEIA|FORA_AREA|DELIVERY_INDISPONIVEL|AGENDAMENTO_INVALIDO|CUPOM_INVALIDO|SUBTOTAL_INVALIDO|TOTAL_INVALIDO|TAXA_INVALIDA|ENCOMENDA_INDISPONIVEL|ENCOMENDA_INVALIDA):\s*/;

export type ErroRpcClassificado =
  | { tipo: "negocio"; mensagem: string }
  | { tipo: "tecnico"; mensagem: string; codigo: string | null };

function extrairCodigo(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const o = error as Record<string, unknown>;
  const code = o.code ?? o.codigo;
  return code != null && String(code).trim() ? String(code) : null;
}

function extrairMensagem(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message || "");
  }
  return String(error || "Erro desconhecido");
}

/** Classifica erro de RPC PostgREST / Postgres (negócio vs técnico). */
export function classificarErroRpc(error: unknown): ErroRpcClassificado {
  const mensagemBruta = extrairMensagem(error);
  const codigo = extrairCodigo(error);
  const ehNegocio =
    PREFIXOS_NEGOCIO.test(mensagemBruta) ||
    mensagemBruta.includes("Estoque insuficiente") ||
    mensagemBruta.includes("Estoque pronto insuficiente");

  if (ehNegocio) {
    return {
      tipo: "negocio",
      mensagem: mensagemBruta.replace(PREFIXOS_NEGOCIO, ""),
    };
  }
  return { tipo: "tecnico", mensagem: mensagemBruta, codigo };
}

export type ReportarErroOpts = {
  canal?: CanalAnalytics | null;
  acao: string;
  mensagemTecnica: string;
  codigo?: string | null;
  clienteId?: string | null;
  props?: Record<string, unknown>;
};

/**
 * Persiste erro técnico para a loja (fire-and-forget).
 * Não lança; falha no insert só vai para o console.
 */
export function reportarErroCliente(opts: ReportarErroOpts): void {
  try {
    const canal = opts.canal === undefined ? detectarCanal() : opts.canal;
    if (!canal) {
      console.error(`[${opts.acao}]`, opts.mensagemTecnica);
      return;
    }

    console.error(`[${opts.acao}]`, opts.mensagemTecnica);

    void supabase
      .from("erros_cliente")
      .insert({
        canal,
        acao: opts.acao,
        mensagem_tecnica: opts.mensagemTecnica.slice(0, 8000),
        codigo: opts.codigo ?? null,
        url: typeof window !== "undefined" ? window.location.href : null,
        sessao_id: obterSessaoAnalytics(),
        cliente_id: opts.clienteId || null,
        props: opts.props || {},
        status: "aberto",
      })
      .then(({ error }) => {
        if (error) {
          console.warn("[erros_cliente] insert falhou:", error.message);
        }
      });
  } catch (e) {
    console.warn("[erros_cliente] reportar falhou:", e);
  }
}

/**
 * Trata erro de RPC de pedido: negócio → ErroNegocioCheckout;
 * técnico → reporta + ErroTecnicoCheckout.
 */
export function lancarErroRpcPedido(
  error: unknown,
  acao: string,
  extras?: { clienteId?: string | null; props?: Record<string, unknown> },
): never {
  const c = classificarErroRpc(error);
  if (c.tipo === "negocio") {
    throw new ErroNegocioCheckout(c.mensagem);
  }
  reportarErroCliente({
    acao,
    mensagemTecnica: c.mensagem,
    codigo: c.codigo,
    clienteId: extras?.clienteId,
    props: extras?.props,
  });
  throw new ErroTecnicoCheckout(c.mensagem, c.codigo);
}

/** Toast seguro: negócio = mensagem; técnico/genérico = mensagem fixa. */
export function mensagemToastCliente(erro: unknown): string {
  if (erro instanceof ErroNegocioCheckout) return erro.message;
  if (erro instanceof ErroTecnicoCheckout) return erro.message;
  return MSG_ERRO_TECNICO_CLIENTE;
}

export type ErroClienteRow = {
  id: string;
  criado_em: string;
  canal: CanalAnalytics;
  acao: string;
  mensagem_tecnica: string;
  codigo: string | null;
  url: string | null;
  sessao_id: string | null;
  cliente_id: string | null;
  props: Record<string, unknown>;
  status: "aberto" | "resolvido";
  resolvido_em: string | null;
  resolvido_por: string | null;
};

export async function listarErrosCliente(opts: {
  status?: "aberto" | "resolvido" | "todos";
  canal?: CanalAnalytics | "todos";
  desde?: string | null;
  limite?: number;
}): Promise<ErroClienteRow[]> {
  let q = supabase
    .from("erros_cliente")
    .select(
      "id, criado_em, canal, acao, mensagem_tecnica, codigo, url, sessao_id, cliente_id, props, status, resolvido_em, resolvido_por",
    )
    .order("criado_em", { ascending: false })
    .limit(opts.limite ?? 100);

  if (opts.status && opts.status !== "todos") {
    q = q.eq("status", opts.status);
  }
  if (opts.canal && opts.canal !== "todos") {
    q = q.eq("canal", opts.canal);
  }
  if (opts.desde) {
    q = q.gte("criado_em", opts.desde);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []) as ErroClienteRow[];
}

export async function marcarErroClienteResolvido(id: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("erros_cliente")
    .update({
      status: "resolvido",
      resolvido_em: new Date().toISOString(),
      resolvido_por: userData.user?.id ?? null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
