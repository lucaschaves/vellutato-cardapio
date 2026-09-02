import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import {
  dataKeyDeIso,
  hhmmDeIso,
  listarDiasAgendamento,
  montarIsoAgendamento,
  rotuloSlot,
  type DiaAgendavel,
} from "../lib/lojaAgendamento";
import type { StatusLoja } from "../lib/lojaStatus";
import { formatarRetiradaEncomenda } from "../lib/encomendaProgramada";

export type SeletorHorarioPedidoProps = {
  /** ISO mínimo rígido — esconde dias/horários anteriores (item já em encomenda). */
  naoAntesDe?: string | null;
  /**
   * Piso ao agendar produção (ex.: item pronto com retirada_em amanhã).
   * Hoje continua liberado; dias futuros respeitam este piso.
   */
  pisoProducao?: string | null;
  /** Exige horário (não permite “quanto antes”). */
  exigirHorario?: boolean;
  /** Mostra “O quanto antes” quando há dia “hoje”. */
  permitirQuantoAntes?: boolean;
  value: string | null;
  onChange: (iso: string | null) => void;
  onStatusLoja?: (s: StatusLoja | null) => void;
  onDiasCarregados?: (qtd: number) => void;
  className?: string;
  titulo?: string;
  avisoMinimo?: string | null;
};

/**
 * Dia (chips) + horário (input time), em vez de dezenas de tags de 15 min.
 * O horário vale para o pedido inteiro.
 */
export function SeletorHorarioPedido({
  naoAntesDe,
  pisoProducao = null,
  exigirHorario = false,
  permitirQuantoAntes = true,
  value,
  onChange,
  onStatusLoja,
  onDiasCarregados,
  className = "",
  titulo = "Horário do pedido",
  avisoMinimo = null,
}: SeletorHorarioPedidoProps) {
  const [dias, setDias] = useState<DiaAgendavel[]>([]);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [dataKey, setDataKey] = useState<string | null>(null);
  const [hora, setHora] = useState("");
  const [lojaAberta, setLojaAberta] = useState(false);

  const diaAtual = dias.find((d) => d.dataKey === dataKey) ?? null;
  const mostraQuantoAntes =
    permitirQuantoAntes &&
    !exigirHorario &&
    lojaAberta &&
    dias.some((d) => d.ehHoje);

  useEffect(() => {
    let cancelado = false;
    void (async () => {
      setCarregando(true);
      const r = await listarDiasAgendamento(new Date(), { naoAntesDe });
      if (cancelado) return;
      setDias(r.dias);
      setMotivo(r.motivoSemDias);
      setLojaAberta(Boolean(r.status?.aberta));
      onStatusLoja?.(r.status);
      onDiasCarregados?.(r.dias.length);
      setCarregando(false);

      const keyAtual = dataKeyDeIso(value);
      const diaOk = r.dias.find((d) => d.dataKey === keyAtual);
      if (value && diaOk) {
        setDataKey(diaOk.dataKey);
        setHora(hhmmDeIso(value));
        return;
      }

      const podeAntes =
        permitirQuantoAntes &&
        !exigirHorario &&
        Boolean(r.status?.aberta) &&
        r.dias.some((d) => d.ehHoje);

      if (!podeAntes) {
        const primeiro = r.dias[0];
        if (primeiro?.primeiroSlot) {
          setDataKey(primeiro.dataKey);
          setHora(hhmmDeIso(primeiro.primeiroSlot));
          onChange(primeiro.primeiroSlot);
        } else {
          setDataKey(null);
          setHora("");
          onChange(null);
        }
      } else {
        const hoje = r.dias.find((d) => d.ehHoje) ?? r.dias[0];
        setDataKey(hoje?.dataKey ?? null);
        setHora(hoje?.horaMin ?? "");
        onChange(null);
      }
    })();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [naoAntesDe, exigirHorario, permitirQuantoAntes]);

  const emitir = (key: string | null, hhmm: string, quantoAntes: boolean) => {
    if (quantoAntes) {
      onChange(null);
      return;
    }
    if (!key || !hhmm) {
      onChange(null);
      return;
    }
    let iso = montarIsoAgendamento(key, hhmm);
    const dia = dias.find((d) => d.dataKey === key);
    if (iso && dia?.horaMin && hhmm < dia.horaMin) {
      iso = montarIsoAgendamento(key, dia.horaMin);
      setHora(dia.horaMin);
    }
    if (iso && dia?.horaMax && hhmmDeIso(iso) > dia.horaMax) {
      iso = montarIsoAgendamento(key, dia.horaMax);
      setHora(dia.horaMax);
    }
    // Dia futuro (ou qualquer dia sob piso de produção): não antes do piso
    if (iso && pisoProducao) {
      const pisoMs = new Date(pisoProducao).getTime();
      const isoMs = new Date(iso).getTime();
      const diaIso = dataKeyDeIso(iso);
      const diaPiso = dataKeyDeIso(pisoProducao);
      const ehHoje = Boolean(dias.find((d) => d.dataKey === diaIso)?.ehHoje);
      if ((!ehHoje || (diaPiso && diaIso === diaPiso)) && isoMs < pisoMs) {
        iso = pisoProducao;
        setHora(hhmmDeIso(pisoProducao));
      }
    }
    onChange(iso);
  };

  const escolherDia = (d: DiaAgendavel) => {
    setDataKey(d.dataKey);
    const hh = d.horaMin || hhmmDeIso(d.primeiroSlot) || "14:00";
    setHora(hh);
    emitir(d.dataKey, hh, false);
  };

  const onHoraChange = (hhmm: string) => {
    setHora(hhmm);
    if (!dataKey) return;
    emitir(dataKey, hhmm, false);
  };

  return (
    <section
      className={`bg-white rounded-2xl border border-zinc-200 p-4 space-y-3 ${className}`}
    >
      <div className="flex items-start gap-2">
        <Clock size={18} className="mt-0.5 shrink-0 text-cookie-primary" />
        <div className="min-w-0 flex-1">
          <h2 className="font-bold">{titulo}</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Este horário vale para o pedido inteiro — todos os itens ficam
            agendados juntos.
          </p>
          {avisoMinimo ? (
            <p className="mt-1 text-xs text-amber-700">{avisoMinimo}</p>
          ) : naoAntesDe ? (
            <p className="mt-1 text-xs text-amber-700">
              Horário mínimo:{" "}
              <strong>{formatarRetiradaEncomenda(naoAntesDe)}</strong>. Você
              pode escolher um horário posterior.
            </p>
          ) : null}
        </div>
      </div>

      {carregando ? (
        <p className="text-sm text-zinc-500">Carregando horários…</p>
      ) : dias.length === 0 ? (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          {motivo || "Não há horários disponíveis."}
        </p>
      ) : (
        <>
          {mostraQuantoAntes && (
            <button
              type="button"
              onClick={() => {
                const hoje = dias.find((d) => d.ehHoje);
                if (hoje) setDataKey(hoje.dataKey);
                onChange(null);
              }}
              className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
                value == null
                  ? "border-cookie-primary bg-cookie-primary text-white"
                  : "border-zinc-200 bg-white text-zinc-700"
              }`}
            >
              O quanto antes
            </button>
          )}

          <div>
            <p className="text-xs font-semibold text-zinc-600 mb-1.5">Dia</p>
            <div className="flex flex-wrap gap-2">
              {dias.map((d) => (
                <button
                  key={d.dataKey}
                  type="button"
                  onClick={() => escolherDia(d)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
                    value != null && dataKey === d.dataKey
                      ? "border-cookie-primary bg-cookie-primary text-white"
                      : "border-zinc-200 bg-white text-zinc-700"
                  }`}
                >
                  {d.ehHoje ? "Hoje" : d.rotulo}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-zinc-600 mb-1.5 block">
              Horário
            </label>
            <input
              type="time"
              step={900}
              min={diaAtual?.horaMin ?? undefined}
              max={diaAtual?.horaMax ?? undefined}
              value={hora}
              disabled={!dataKey}
              onChange={(e) => onHoraChange(e.target.value)}
              className="w-full max-w-[10rem] rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold"
            />
            {value && (
              <p className="mt-1 text-xs text-zinc-500">
                Selecionado: {rotuloSlot(value)}
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
