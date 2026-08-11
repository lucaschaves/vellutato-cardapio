import { supabase } from "./supabase";

export type CampoImpressaoId =
  | "logo_nome"
  | "titulo_via"
  | "numero_pedido"
  | "data_hora"
  | "origem"
  | "modalidade"
  | "pagamento_destaque"
  | "cliente_nome"
  | "cliente_telefone"
  | "local"
  | "endereco_entrega"
  | "taxa_entrega"
  | "resumo_consumo"
  | "itens"
  | "subtotal"
  | "desconto"
  | "total"
  | "endereco_loja"
  | "cnpj"
  | "instagram"
  | "wifi"
  | "mensagem_agradecimento"
  | "qr_pedido";

export type EstiloBloco = "normal" | "faixa" | "invertido";

export type TipoBloco =
  | "campo"
  | "colunas"
  | "texto"
  | "separador"
  | "espaco"
  | "grupo";

export interface BlocoImpressao {
  id: string;
  tipo: TipoBloco;
  ativo: boolean;
  estilo: EstiloBloco;
  /** tipo "campo" */
  campo?: CampoImpressaoId;
  /** tipo "colunas" */
  esquerda?: CampoImpressaoId;
  direita?: CampoImpressaoId;
  /** tipo "texto" */
  texto?: string;
  /** tipo "separador" (1 caractere) */
  separadorChar?: string;
  /** tipo "grupo" */
  titulo?: string;
  moldura?: boolean;
  filhos?: BlocoImpressao[];
}

export interface ViaImpressaoConfig {
  ativa: boolean;
  copias: number;
  titulo: string;
  blocos: BlocoImpressao[];
}

export interface FormatacaoImpressao {
  /** 48 = bobina 80mm; 32 = bobina 58mm. */
  colunas: number;
  separador: "=" | "-" | "*" | ".";
  caixaAltaTitulos: boolean;
  linhaEntreItens: boolean;
  precoPorItem: boolean;
}

export interface LojaImpressaoInfo {
  nome: string;
  endereco: string;
  cnpj: string;
  instagram: string;
  wifi: string;
  agradecimento: string;
  qrUrlBase: string;
}

export interface ImpressaoConfig {
  loja: LojaImpressaoInfo;
  formatacao: FormatacaoImpressao;
  via_cozinha: ViaImpressaoConfig;
  via_cliente: ViaImpressaoConfig;
}

export const CAMPO_LABEL: Record<CampoImpressaoId, string> = {
  logo_nome: "Nome da loja (topo)",
  titulo_via: "Título da via",
  numero_pedido: "Número do pedido",
  data_hora: "Data e hora",
  origem: "Origem",
  modalidade: "Entrega / Retirada",
  pagamento_destaque: "Status de pagamento",
  cliente_nome: "Nome do cliente",
  cliente_telefone: "Telefone do cliente",
  local: "Local / Mesa / Identificador",
  endereco_entrega: "Endereço de entrega (só entrega)",
  taxa_entrega: "Taxa de entrega (só entrega)",
  resumo_consumo: "Resumo (loja / levar)",
  itens: "Itens do pedido",
  subtotal: "Subtotal",
  desconto: "Desconto",
  total: "Total",
  endereco_loja: "Endereço da loja",
  cnpj: "CNPJ",
  instagram: "Instagram / Redes",
  wifi: "Wi-Fi",
  mensagem_agradecimento: "Mensagem de agradecimento",
  qr_pedido: "QR Code do pedido",
};

export const TIPO_BLOCO_LABEL: Record<TipoBloco, string> = {
  campo: "Campo",
  colunas: "2 colunas",
  texto: "Texto livre",
  separador: "Separador",
  espaco: "Espaço em branco",
  grupo: "Grupo / seção",
};

export const ESTILO_LABEL: Record<EstiloBloco, string> = {
  normal: "Normal",
  faixa: "Faixa (asteriscos)",
  invertido: "Invertido (faixa preta)",
};

/** IDs de campos elegíveis para blocos de campo/colunas. */
export const CAMPOS_IDS = Object.keys(CAMPO_LABEL) as CampoImpressaoId[];

let contadorId = 0;
export function novoIdBloco(): string {
  contadorId += 1;
  return `b${Date.now().toString(36)}_${contadorId}`;
}

export function criarBloco(tipo: TipoBloco): BlocoImpressao {
  const base: BlocoImpressao = {
    id: novoIdBloco(),
    tipo,
    ativo: true,
    estilo: "normal",
  };
  if (tipo === "campo") base.campo = "cliente_nome";
  if (tipo === "colunas") {
    base.esquerda = "numero_pedido";
    base.direita = "data_hora";
  }
  if (tipo === "texto") base.texto = "Texto";
  if (tipo === "grupo") {
    base.titulo = "Grupo";
    base.estilo = "invertido";
    base.moldura = false;
    base.filhos = [];
  }
  return base;
}

function campo(
  campoId: CampoImpressaoId,
  estilo: EstiloBloco = "normal",
): BlocoImpressao {
  return { id: novoIdBloco(), tipo: "campo", ativo: true, estilo, campo: campoId };
}
function sep(): BlocoImpressao {
  return { id: novoIdBloco(), tipo: "separador", ativo: true, estilo: "normal" };
}
function colunas(
  esquerda: CampoImpressaoId,
  direita: CampoImpressaoId,
): BlocoImpressao {
  return {
    id: novoIdBloco(),
    tipo: "colunas",
    ativo: true,
    estilo: "normal",
    esquerda,
    direita,
  };
}
function texto(txt: string, estilo: EstiloBloco = "normal"): BlocoImpressao {
  return { id: novoIdBloco(), tipo: "texto", ativo: true, estilo, texto: txt };
}

function blocosPadrao(tipo: "cozinha" | "cliente"): BlocoImpressao[] {
  const ehCozinha = tipo === "cozinha";
  return [
    campo("logo_nome", "invertido"),
    campo("titulo_via", "faixa"),
    colunas("numero_pedido", "data_hora"),
    sep(),
    campo("origem", "faixa"),
    campo("modalidade", "faixa"),
    campo("pagamento_destaque", "invertido"),
    sep(),
    campo("cliente_nome"),
    campo("cliente_telefone"),
    campo("local"),
    ...(ehCozinha
      ? []
      : [campo("endereco_entrega", "invertido")]),
    sep(),
    campo("resumo_consumo"),
    sep(),
    campo("itens"),
    campo("subtotal"),
    campo("desconto"),
    ...(ehCozinha ? [] : [campo("taxa_entrega")]),
    sep(),
    campo("total", "invertido"),
    sep(),
    texto(ehCozinha ? "Bom preparo!" : "Obrigado pela preferência!"),
    ...(ehCozinha ? [] : [campo("mensagem_agradecimento"), campo("instagram")]),
  ];
}

export function configPadrao(): ImpressaoConfig {
  return {
    loja: {
      nome: "VELLUTATO",
      endereco: "",
      cnpj: "",
      instagram: "",
      wifi: "",
      agradecimento: "Volte sempre!",
      qrUrlBase: "",
    },
    formatacao: {
      colunas: 48,
      separador: "=",
      caixaAltaTitulos: true,
      linhaEntreItens: true,
      precoPorItem: true,
    },
    via_cozinha: {
      ativa: true,
      copias: 1,
      titulo: "VIA COZINHA",
      blocos: blocosPadrao("cozinha"),
    },
    via_cliente: {
      ativa: true,
      copias: 1,
      titulo: "VIA CLIENTE",
      blocos: blocosPadrao("cliente"),
    },
  };
}

const TIPOS_VALIDOS = new Set<TipoBloco>([
  "campo",
  "colunas",
  "texto",
  "separador",
  "espaco",
  "grupo",
]);
const ESTILOS_VALIDOS = new Set<EstiloBloco>(["normal", "faixa", "invertido"]);
const CAMPOS_VALIDOS = new Set<CampoImpressaoId>(CAMPOS_IDS);

function sanearBloco(bruto: unknown): BlocoImpressao | null {
  if (!bruto || typeof bruto !== "object") return null;
  const b = bruto as Record<string, unknown>;
  const tipo = b.tipo as TipoBloco;
  if (!TIPOS_VALIDOS.has(tipo)) return null;

  const bloco: BlocoImpressao = {
    id: typeof b.id === "string" ? b.id : novoIdBloco(),
    tipo,
    ativo: typeof b.ativo === "boolean" ? b.ativo : true,
    estilo: ESTILOS_VALIDOS.has(b.estilo as EstiloBloco)
      ? (b.estilo as EstiloBloco)
      : "normal",
  };

  if (tipo === "campo") {
    bloco.campo = CAMPOS_VALIDOS.has(b.campo as CampoImpressaoId)
      ? (b.campo as CampoImpressaoId)
      : "cliente_nome";
  }
  if (tipo === "colunas") {
    bloco.esquerda = CAMPOS_VALIDOS.has(b.esquerda as CampoImpressaoId)
      ? (b.esquerda as CampoImpressaoId)
      : "numero_pedido";
    bloco.direita = CAMPOS_VALIDOS.has(b.direita as CampoImpressaoId)
      ? (b.direita as CampoImpressaoId)
      : "data_hora";
  }
  if (tipo === "texto") bloco.texto = typeof b.texto === "string" ? b.texto : "";
  if (tipo === "separador") {
    bloco.separadorChar =
      typeof b.separadorChar === "string" ? b.separadorChar : undefined;
  }
  if (tipo === "grupo") {
    bloco.titulo = typeof b.titulo === "string" ? b.titulo : "";
    bloco.moldura = typeof b.moldura === "boolean" ? b.moldura : false;
    bloco.filhos = Array.isArray(b.filhos)
      ? (b.filhos
          .map(sanearBloco)
          .filter((f): f is BlocoImpressao => f != null && f.tipo !== "grupo"))
      : [];
  }
  return bloco;
}

function mesclarVia(
  salva: Partial<ViaImpressaoConfig> | undefined,
  padrao: ViaImpressaoConfig,
): ViaImpressaoConfig {
  if (!salva) return padrao;
  const blocos = Array.isArray(salva.blocos)
    ? salva.blocos
        .map(sanearBloco)
        .filter((b): b is BlocoImpressao => b != null)
    : padrao.blocos;
  return {
    ativa: typeof salva.ativa === "boolean" ? salva.ativa : padrao.ativa,
    copias:
      typeof salva.copias === "number" && salva.copias > 0
        ? Math.min(Math.floor(salva.copias), 5)
        : padrao.copias,
    titulo: salva.titulo ?? padrao.titulo,
    blocos: blocos.length ? blocos : padrao.blocos,
  };
}

export function mesclarConfig(
  parcial: Partial<ImpressaoConfig> | null | undefined,
): ImpressaoConfig {
  const padrao = configPadrao();
  if (!parcial) return padrao;
  return {
    loja: { ...padrao.loja, ...(parcial.loja || {}) },
    formatacao: { ...padrao.formatacao, ...(parcial.formatacao || {}) },
    via_cozinha: mesclarVia(parcial.via_cozinha, padrao.via_cozinha),
    via_cliente: mesclarVia(parcial.via_cliente, padrao.via_cliente),
  };
}

let cacheConfig: ImpressaoConfig = configPadrao();

export function obterConfigImpressaoCache(): ImpressaoConfig {
  return cacheConfig;
}

export function definirConfigImpressaoCache(config: ImpressaoConfig): void {
  cacheConfig = config;
}

export async function buscarConfigImpressao(): Promise<ImpressaoConfig> {
  const { data, error } = await supabase
    .from("impressao_config")
    .select("config")
    .eq("id", 1)
    .single();

  if (error) {
    console.error("[IMPRESSÃO CONFIG] Falha ao carregar:", error.message);
    return configPadrao();
  }

  const config = mesclarConfig(
    (data?.config as Partial<ImpressaoConfig>) || null,
  );
  cacheConfig = config;
  return config;
}

export async function salvarConfigImpressao(
  config: ImpressaoConfig,
): Promise<void> {
  const { error } = await supabase
    .from("impressao_config")
    .update({ config, atualizado_em: new Date().toISOString() })
    .eq("id", 1);

  if (error) throw new Error(error.message);
  cacheConfig = config;
}
