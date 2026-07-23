import { formatarMedidaProduto } from "../lib/produtoMedida";

type TamanhoTag = "sm" | "md" | "lg";

const ESTILOS: Record<TamanhoTag, string> = {
  sm: "text-[0.7rem] px-2 py-0.5 rounded-md",
  md: "text-xs px-2.5 py-1 rounded-lg",
  lg: "text-sm px-3 py-1.5 rounded-lg",
};

export function TagMedidaProduto({
  valor,
  unidade,
  tamanho = "md",
  className = "",
  variante = "destaque",
}: {
  valor?: number | string | null;
  unidade?: string | null;
  tamanho?: TamanhoTag;
  className?: string;
  /** destaque = laranja da marca; overlay = sobre foto */
  variante?: "destaque" | "overlay";
}) {
  const texto = formatarMedidaProduto(valor, unidade);
  if (!texto) return null;

  const base =
    variante === "overlay"
      ? "bg-[#ff5722] text-white shadow-md ring-1 ring-white/30"
      : "bg-[#ff5722]/15 text-[#e64a19] dark:text-[#ff8a65] border border-[#ff5722]/45 dark:border-[#ff5722]/50 shadow-sm";

  return (
    <span
      className={`inline-flex items-center font-black tracking-wide tabular-nums ${base} ${ESTILOS[tamanho]} ${className}`}
    >
      {texto}
    </span>
  );
}
