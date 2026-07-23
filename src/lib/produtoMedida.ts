export const UNIDADES_MEDIDA = ["g", "kg", "ml", "L"] as const;

export type UnidadeMedidaProduto = (typeof UNIDADES_MEDIDA)[number];

export const LABELS_UNIDADE_MEDIDA: Record<UnidadeMedidaProduto, string> = {
  g: "Gramas (g)",
  kg: "Quilos (kg)",
  ml: "Mililitros (ml)",
  L: "Litros (L)",
};

export function isUnidadeMedida(
  valor: string | null | undefined,
): valor is UnidadeMedidaProduto {
  return (
    typeof valor === "string" &&
    (UNIDADES_MEDIDA as readonly string[]).includes(valor)
  );
}

/** Formata tag: "85g", "1,5kg", "250ml", "1L" */
export function formatarMedidaProduto(
  valor: number | string | null | undefined,
  unidade: string | null | undefined,
): string | null {
  if (valor == null || valor === "" || !isUnidadeMedida(unidade)) return null;
  const num = typeof valor === "number" ? valor : Number(valor);
  if (!Number.isFinite(num) || num <= 0) return null;

  const texto =
    Number.isInteger(num) || Math.abs(num - Math.round(num)) < 1e-9
      ? String(Math.round(num))
      : num.toLocaleString("pt-BR", {
          maximumFractionDigits: 3,
          minimumFractionDigits: 0,
        });

  return `${texto}${unidade}`;
}
