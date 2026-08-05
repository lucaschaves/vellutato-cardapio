import { cn } from "../lib/utils";

type Props = {
  className?: string;
  /** Diâmetro do círculo da logo em px (padrão 40). */
  size?: number;
  /** Cor do nome ao lado. */
  tom?: "bordo" | "branco" | "escuro";
};

/** Logomarca: círculo com zoom + “Vellutato” ao lado (como no mockup). */
export function LogoMarca({ className, size = 40, tom = "escuro" }: Props) {
  // Nome um pouco menor que o diâmetro, alinhado ao centro do círculo
  const nomeSize = Math.max(16, Math.round(size * 0.52));

  return (
    <span
      className={cn("inline-flex items-center gap-3 select-none", className)}
      aria-label="Vellutato — Cookies & Brownies"
    >
      <span
        className="relative shrink-0 overflow-hidden rounded-full bg-[#6b1d2a] ring-1 ring-black/5"
        style={{ width: size, height: size }}
      >
        <img
          src="/logo-vellutato.png"
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover scale-[1.75]"
          draggable={false}
        />
      </span>
      <span
        className={cn(
          "font-sans font-semibold tracking-tight leading-none",
          tom === "branco" && "text-white",
          tom === "bordo" && "text-cookie-primary",
          tom === "escuro" && "text-stone-900 dark:text-white",
        )}
        style={{ fontSize: nomeSize }}
      >
        Vellutato
      </span>
    </span>
  );
}
