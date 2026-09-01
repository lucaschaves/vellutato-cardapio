import { Clock } from "lucide-react";
import {
  formatarRetiradaEncomenda,
  type DisponibilidadeEncomenda,
} from "../lib/encomendaProgramada";

interface AvisoEncomendaProps {
  disp: DisponibilidadeEncomenda;
  className?: string;
}

/** Destaque de disponibilidade (pronto / encomenda / esgotado). */
export function AvisoEncomenda({ disp, className = "" }: AvisoEncomendaProps) {
  if (!disp.encomenda_programada && disp.modo === "pronto") return null;

  const base =
    "rounded-xl border px-4 py-3 text-sm font-semibold flex gap-2 items-start";

  if (disp.modo === "indisponivel") {
    return (
      <div
        className={`${base} bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-800 dark:text-red-200 ${className}`}
      >
        <span>{disp.mensagem || "Indisponível no momento"}</span>
      </div>
    );
  }

  if (disp.modo === "pronto") {
    return (
      <div
        className={`${base} bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100 ${className}`}
      >
        <span>{disp.mensagem || "Disponível agora"}</span>
      </div>
    );
  }

  return (
    <div
      className={`${base} bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-100 ${className}`}
    >
      <Clock className="shrink-0 mt-0.5" size={18} />
      <div>
        <p>{disp.mensagem || "Produto sob encomenda"}</p>
        {disp.retirada_em && (
          <p className="font-bold mt-1">
            Retirada prevista: {formatarRetiradaEncomenda(disp.retirada_em)}
          </p>
        )}
      </div>
    </div>
  );
}
