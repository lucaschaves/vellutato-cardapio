import { Check, X } from "lucide-react";
import { cn } from "../lib/utils";
import type { PassoTimeline } from "../lib/pedidoStatusCliente";

type Props = {
  passos: PassoTimeline[];
  className?: string;
};

export function TimelinePedido({ passos, className }: Props) {
  return (
    <ol className={cn("space-y-0", className)}>
      {passos.map((passo, i) => {
        const ultimo = i === passos.length - 1;
        const ativo =
          passo.estado === "current" || passo.estado === "completed";
        const cancelado = passo.estado === "cancelled";

        return (
          <li key={passo.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold",
                  passo.estado === "completed" &&
                    "border-cookie-primary bg-cookie-primary text-white",
                  passo.estado === "current" &&
                    "border-cookie-primary bg-cookie-primary/10 text-cookie-primary ring-4 ring-cookie-primary/15",
                  passo.estado === "upcoming" &&
                    "border-zinc-200 bg-white text-zinc-300",
                  cancelado && "border-red-500 bg-red-500 text-white",
                )}
              >
                {passo.estado === "completed" ? (
                  <Check size={14} strokeWidth={3} />
                ) : cancelado ? (
                  <X size={14} strokeWidth={3} />
                ) : (
                  i + 1
                )}
              </span>
              {!ultimo && (
                <span
                    className={cn(
                      "w-0.5 flex-1 min-h-5 my-1",
                      ativo && !cancelado ? "bg-cookie-primary" : "bg-zinc-200",
                      cancelado && "bg-red-200",
                    )}
                />
              )}
            </div>
            <div className={cn("pb-5", ultimo && "pb-0")}>
              <p
                className={cn(
                  "text-sm font-bold leading-7",
                  passo.estado === "upcoming" && "text-zinc-400",
                  passo.estado === "current" && "text-cookie-primary",
                  cancelado && "text-red-600",
                )}
              >
                {passo.titulo}
              </p>
              {passo.descricao && (
                <p
                  className={cn(
                    "text-xs mt-0.5",
                    passo.estado === "upcoming"
                      ? "text-zinc-400"
                      : "text-zinc-500",
                  )}
                >
                  {passo.descricao}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
