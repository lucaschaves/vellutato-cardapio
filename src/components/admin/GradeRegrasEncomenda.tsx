import { rotuloDiaSemana, type RegraEncomendaDiaEditavel } from "../../lib/encomendaProgramada";

interface GradeRegrasEncomendaProps {
  regras: RegraEncomendaDiaEditavel[];
  onChange: (regras: RegraEncomendaDiaEditavel[]) => void;
  somenteLeitura?: boolean;
}

function atualizarDia(
  regras: RegraEncomendaDiaEditavel[],
  dia: number,
  patch: Partial<RegraEncomendaDiaEditavel>,
): RegraEncomendaDiaEditavel[] {
  return regras.map((r) =>
    r.dia_semana === dia ? { ...r, ...patch } : r,
  );
}

/** Grade semanal: horário limite, retirada e dias extras por dia. */
export function GradeRegrasEncomenda({
  regras,
  onChange,
  somenteLeitura = false,
}: GradeRegrasEncomendaProps) {
  const inputCls =
    "w-full min-w-0 px-2 py-1.5 text-sm rounded border dark:bg-[#1a1815] dark:border-gray-700 disabled:opacity-60";

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 dark:bg-[#1a1815] text-left text-xs uppercase tracking-wide text-gray-500">
            <th className="px-3 py-2 font-semibold">Dia</th>
            <th className="px-3 py-2 font-semibold w-16">Ativo</th>
            <th className="px-3 py-2 font-semibold min-w-[7rem]">
              Horário limite
              <span className="block font-normal normal-case text-[0.65rem]">
                encomenda de hoje até este horário
              </span>
            </th>
            <th className="px-3 py-2 font-semibold min-w-[5rem]">
              Retirada
              <span className="block font-normal normal-case text-[0.65rem]">
                pedido + X horas
              </span>
            </th>
            <th className="px-3 py-2 font-semibold min-w-[5rem]">
              Depois do limite
              <span className="block font-normal normal-case text-[0.65rem]">
                + N dias úteis
              </span>
            </th>
            <th className="px-3 py-2 font-semibold min-w-[5rem]">
              Limite/dia
            </th>
          </tr>
        </thead>
        <tbody>
          {regras.map((r) => (
            <tr
              key={r.dia_semana}
              className="border-t border-gray-100 dark:border-gray-800"
            >
              <td className="px-3 py-2 font-medium whitespace-nowrap">
                {rotuloDiaSemana(r.dia_semana)}
              </td>
              <td className="px-3 py-2 text-center">
                <input
                  type="checkbox"
                  checked={r.ativo}
                  disabled={somenteLeitura}
                  onChange={(e) =>
                    onChange(
                      atualizarDia(regras, r.dia_semana, {
                        ativo: e.target.checked,
                      }),
                    )
                  }
                  className="h-4 w-4 rounded border-gray-300"
                />
              </td>
              <td className="px-3 py-2">
                <input
                  type="time"
                  value={r.horario_limite}
                  disabled={somenteLeitura || !r.ativo}
                  onChange={(e) =>
                    onChange(
                      atualizarDia(regras, r.dia_semana, {
                        horario_limite: e.target.value,
                      }),
                    )
                  }
                  className={inputCls}
                />
              </td>
              <td className="px-3 py-2">
                <input
                  type="number"
                  min={0}
                  max={48}
                  value={r.horas_ate_retirada}
                  disabled={somenteLeitura || !r.ativo}
                  onChange={(e) =>
                    onChange(
                      atualizarDia(regras, r.dia_semana, {
                        horas_ate_retirada: Math.max(
                          0,
                          Math.min(48, Number(e.target.value) || 0),
                        ),
                      }),
                    )
                  }
                  className={inputCls}
                />
              </td>
              <td className="px-3 py-2">
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={r.dias_apos_limite}
                  disabled={somenteLeitura || !r.ativo}
                  onChange={(e) =>
                    onChange(
                      atualizarDia(regras, r.dia_semana, {
                        dias_apos_limite: Math.max(
                          0,
                          Math.min(30, Number(e.target.value) || 0),
                        ),
                      }),
                    )
                  }
                  className={inputCls}
                />
              </td>
              <td className="px-3 py-2">
                <input
                  type="number"
                  min={0}
                  value={r.limite_encomendas}
                  disabled={somenteLeitura || !r.ativo}
                  onChange={(e) =>
                    onChange(
                      atualizarDia(regras, r.dia_semana, {
                        limite_encomendas: Math.max(
                          0,
                          Number(e.target.value) || 0,
                        ),
                      }),
                    )
                  }
                  className={inputCls}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
