import type { ReactNode } from "react";

/** `#` na descrição vira quebra de linha na exibição. */
export function formatarDescricaoComQuebras(
  descricao: string | null | undefined,
): string {
  if (!descricao) return "";
  return descricao
    .split("#")
    .map((parte) => parte.trim())
    .filter(Boolean)
    .join("\n");
}

export function renderizarDescricaoComQuebras(
  descricao: string | null | undefined,
): ReactNode {
  const texto = formatarDescricaoComQuebras(descricao);
  if (!texto) return null;

  const linhas = texto.split("\n");
  return linhas.map((linha, index) => (
    <span key={index}>
      {index > 0 && <br />}
      {linha}
    </span>
  ));
}
