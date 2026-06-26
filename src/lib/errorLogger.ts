const STORAGE_KEY = "vellutato_error_log";
const MAX_ERROS = 100;

export interface ErroRegistrado {
  id: string;
  timestamp: string;
  mensagem: string;
  detalhes?: string;
  url: string;
}

function serializarValor(valor: unknown): string {
  if (valor instanceof Error) {
    return valor.stack ? `${valor.message}\n${valor.stack}` : valor.message;
  }

  if (typeof valor === "object" && valor !== null) {
    try {
      return JSON.stringify(valor, null, 2);
    } catch {
      return String(valor);
    }
  }

  return String(valor);
}

function serializarArgs(args: unknown[]): Pick<ErroRegistrado, "mensagem" | "detalhes"> {
  if (args.length === 0) {
    return { mensagem: "Erro desconhecido" };
  }

  const partes = args.map(serializarValor);
  const mensagem = partes[0];
  const detalhes = partes.length > 1 ? partes.slice(1).join("\n\n") : undefined;

  return { mensagem, detalhes };
}

function lerErros(): ErroRegistrado[] {
  try {
    const bruto = localStorage.getItem(STORAGE_KEY);
    if (!bruto) return [];

    const parsed = JSON.parse(bruto) as ErroRegistrado[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function salvarErros(erros: ErroRegistrado[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(erros));
}

function extrairMensagemErro(erro: unknown): string {
  if (erro instanceof Error) return erro.message;
  if (typeof erro === "object" && erro !== null && "message" in erro) {
    return String((erro as { message: unknown }).message);
  }
  return String(erro);
}

function extrairDetalhesErro(erro: unknown): string | undefined {
  if (typeof erro === "object" && erro !== null) {
    try {
      return JSON.stringify(erro, null, 2);
    } catch {
      return String(erro);
    }
  }
  return undefined;
}

export function registrarErroSupabase(
  operacao: string,
  erro: unknown,
  extras?: Record<string, string | number | boolean | undefined>,
) {
  const mensagem = `[SUPABASE - ${operacao}] ${extrairMensagemErro(erro)}`;
  const partes = [
    extras ? JSON.stringify(extras, null, 2) : null,
    extrairDetalhesErro(erro),
  ].filter(Boolean);

  registrarErro(mensagem, partes.length > 0 ? partes.join("\n\n") : undefined);
}

export function registrarErro(mensagem: string, detalhes?: string) {
  const novoErro: ErroRegistrado = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    mensagem,
    detalhes,
    url: window.location.href,
  };

  const errosAtualizados = [novoErro, ...lerErros()].slice(0, MAX_ERROS);
  salvarErros(errosAtualizados);
}

export function obterErros(): ErroRegistrado[] {
  return lerErros();
}

export function obterQuantidadeErros(): number {
  return lerErros().length;
}

export function limparErros() {
  localStorage.removeItem(STORAGE_KEY);
}

let capturaInicializada = false;

export function inicializarCapturaErros() {
  if (capturaInicializada) return;
  capturaInicializada = true;

  const consoleErrorOriginal = console.error.bind(console);

  console.error = (...args: unknown[]) => {
    consoleErrorOriginal(...args);

    try {
      const { mensagem, detalhes } = serializarArgs(args);
      registrarErro(mensagem, detalhes);
    } catch (erro) {
      consoleErrorOriginal("[errorLogger] Falha ao persistir erro:", erro);
    }
  };
}
