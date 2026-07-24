/** Normaliza o máximo configurado: null/undefined/≤0 = sem limite. */
export function maxAdicionaisProduto(
  maximo: number | null | undefined,
): number | null {
  if (maximo == null || maximo <= 0) return null;
  return Math.floor(maximo);
}

export function rotuloAdicionaisProduto(opts: {
  obrigatorio?: boolean | null;
  maximo?: number | null;
}): string {
  const obrigatorio = Boolean(opts.obrigatorio);
  const max = maxAdicionaisProduto(opts.maximo);

  if (obrigatorio && max === 1) return "obrigatório · escolha 1";
  if (obrigatorio && max != null) return `obrigatório · máx. ${max}`;
  if (obrigatorio) return "obrigatório · pode escolher vários";
  if (max === 1) return "opcional · máx. 1";
  if (max != null) return `opcional · máx. ${max}`;
  return "opcional · pode escolher vários";
}
