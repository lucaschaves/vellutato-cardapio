import { formatarRetiradaEncomenda } from "../lib/encomendaProgramada";
import type { DisponibilidadeEncomenda } from "../lib/encomendaProgramada";

export type IntencaoRetirada = "agora" | "agendar";

type Props = {
  disp: DisponibilidadeEncomenda;
  value: IntencaoRetirada;
  onChange: (v: IntencaoRetirada) => void;
  className?: string;
};

/**
 * Agora vs Agendar no produto com encomenda.
 * O horário exato do pedido é definido no checkout/carrinho.
 */
export function EscolhaRetiradaEncomenda({
  disp,
  value,
  onChange,
  className = "",
}: Props) {
  if (!disp.encomenda_programada) return null;
  if (disp.modo === "indisponivel") return null;

  const podeAgora = disp.modo === "pronto" && (disp.estoque_pronto ?? 0) > 0;
  const podeAgendar =
    disp.modo === "encomenda" || Boolean(disp.pode_agendar);

  if (!podeAgora && !podeAgendar) return null;
  if (podeAgora && !podeAgendar) return null; // só pronto, sem escolha

  return (
    <div
      className={`rounded-xl border border-zinc-200 bg-zinc-50 p-3 space-y-2 ${className}`}
    >
      <p className="text-xs font-semibold text-zinc-700">Quando deseja?</p>
      <div className="flex flex-wrap gap-2">
        {podeAgora && (
          <button
            type="button"
            onClick={() => onChange("agora")}
            className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
              value === "agora"
                ? "border-cookie-primary bg-cookie-primary text-white"
                : "border-zinc-200 bg-white text-zinc-700"
            }`}
          >
            Retirar agora
          </button>
        )}
        {podeAgendar && (
          <button
            type="button"
            onClick={() => onChange("agendar")}
            className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
              value === "agendar"
                ? "border-cookie-primary bg-cookie-primary text-white"
                : "border-zinc-200 bg-white text-zinc-700"
            }`}
          >
            Agendar
          </button>
        )}
      </div>
      <p className="text-[11px] text-zinc-500 leading-snug">
        O horário do pedido é escolhido no checkout e vale para todos os itens
        da sacola
        {value === "agendar" && disp.retirada_em
          ? ` (produção a partir de ${formatarRetiradaEncomenda(disp.retirada_em)})`
          : ""}
        .
      </p>
    </div>
  );
}

export function modoEncomendaDaIntencao(
  disp: DisponibilidadeEncomenda | null | undefined,
  intencao: IntencaoRetirada,
): "pronto" | "encomenda" | undefined {
  if (!disp?.encomenda_programada) return undefined;
  if (disp.modo === "indisponivel") return undefined;
  if (intencao === "agora" && disp.modo === "pronto") return "pronto";
  return "encomenda";
}
