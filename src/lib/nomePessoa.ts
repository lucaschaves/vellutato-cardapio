/** Partes do nome (nome + sobrenome), ignorando espaços extras. */
export function partesNomePessoa(nome: string): string[] {
  return nome.trim().split(/\s+/).filter(Boolean);
}

/**
 * Nome aceito pelo Asaas no checkout: pelo menos nome e sobrenome,
 * cada parte com 2+ caracteres.
 */
export function nomeCompletoValido(nome: string): boolean {
  const partes = partesNomePessoa(nome);
  return partes.length >= 2 && partes.every((p) => p.length >= 2);
}

export function mensagemNomeIncompleto(nome: string): string | null {
  if (!nome.trim()) return "Informe seu nome e sobrenome.";
  if (!nomeCompletoValido(nome)) {
    return "Informe nome e sobrenome (ex.: Maria Silva).";
  }
  return null;
}
