export const TELEFONE_DIGITOS_MAX = 11;

export function extrairDigitosTelefone(valor: string): string {
  return valor.replace(/\D/g, "").slice(0, TELEFONE_DIGITOS_MAX);
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

export function telefoneDigitosCompleto(valor: string): boolean {
  return extrairDigitosTelefone(valor).length === TELEFONE_DIGITOS_MAX;
}

export function fecharTeclado(input?: HTMLElement | null) {
  input?.blur();

  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}

export function criarHandlerTelefone(
  aoAtualizar: (valor: string) => void,
) {
  return (evento: React.ChangeEvent<HTMLInputElement>) => {
    const formatado = formatarTelefoneBr(evento.target.value);
    aoAtualizar(formatado);

    if (telefoneDigitosCompleto(formatado)) {
      fecharTeclado(evento.target);
    }
  };
}

export function aoTeclaTelefone(evento: React.KeyboardEvent<HTMLInputElement>) {
  if (evento.key === "Enter") {
    evento.preventDefault();
    fecharTeclado(evento.currentTarget);
  }
}
