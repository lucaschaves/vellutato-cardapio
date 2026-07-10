export const TELEFONE_DIGITOS_MAX = 11;

/** Apenas dígitos — formato para salvar no banco (clientes.celular, pedidos.cliente_celular). */
export function normalizarTelefoneParaSalvar(valor: string): string {
  return valor.replace(/\D/g, "").slice(0, TELEFONE_DIGITOS_MAX);
}

export function extrairDigitosTelefone(valor: string): string {
  return normalizarTelefoneParaSalvar(valor);
}

export function formatarTelefoneBr(valor: string): string {
  const digitos = extrairDigitosTelefone(valor);

  if (digitos.length > 7) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
  }

  if (digitos.length > 2) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2)}`;
  }

  if (digitos.length > 0) {
    return `(${digitos}`;
  }

  return "";
}

/** Converte dígitos salvos no banco para exibição na UI. */
export function formatarTelefoneDeSalvo(valor: string | null | undefined): string {
  if (!valor) return "";
  return formatarTelefoneBr(valor);
}

export function telefoneDigitosCompleto(valor: string): boolean {
  return extrairDigitosTelefone(valor).length === TELEFONE_DIGITOS_MAX;
}

export function criarHandlerTelefone(
  aoAtualizar: (valor: string) => void,
) {
  return (evento: React.ChangeEvent<HTMLInputElement>) => {
    aoAtualizar(formatarTelefoneBr(evento.target.value));
  };
}

export function lerCelularLocalStorage(): string {
  const salvo = localStorage.getItem("cliente_celular");
  return formatarTelefoneDeSalvo(salvo);
}

export function salvarCelularLocalStorage(valorFormatado: string) {
  const normalizado = normalizarTelefoneParaSalvar(valorFormatado);
  if (normalizado) {
    localStorage.setItem("cliente_celular", normalizado);
  } else {
    localStorage.removeItem("cliente_celular");
  }
}
