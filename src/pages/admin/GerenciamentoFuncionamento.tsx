import { Clock, Loader2, PauseCircle, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  buscarConfigLoja,
  buscarHorariosLoja,
  buscarStatusLoja,
  NOMES_DIAS_SEMANA,
  salvarConfigLoja,
  salvarHorarioLoja,
  type LojaConfig,
  type LojaHorario,
  type StatusLoja,
} from "../../lib/lojaStatus";

import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Switch } from "../../components/ui/switch";

function horaParaInput(hora: string): string {
  return hora.slice(0, 5); // "HH:MM:SS" → "HH:MM"
}

export function GerenciamentoFuncionamento() {
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [config, setConfig] = useState<LojaConfig | null>(null);
  const [horarios, setHorarios] = useState<LojaHorario[]>([]);
  const [status, setStatus] = useState<StatusLoja | null>(null);

  useEffect(() => {
    void carregarTudo();
  }, []);

  const carregarTudo = async () => {
    try {
      setCarregando(true);
      const [cfg, hrs, st] = await Promise.all([
        buscarConfigLoja(),
        buscarHorariosLoja(),
        buscarStatusLoja(),
      ]);
      setConfig(cfg);
      setHorarios(hrs);
      setStatus(st);
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error("[ERRO - FUNCIONAMENTO] Falha na leitura:", mensagem);
      toast.error(
        "Falha ao carregar o horário de funcionamento. Rode a migration no banco.",
      );
    } finally {
      setCarregando(false);
    }
  };

  const atualizarHorario = (
    diaSemana: number,
    mudanca: Partial<LojaHorario>,
  ) => {
    setHorarios((atuais) =>
      atuais.map((h) =>
        h.dia_semana === diaSemana ? { ...h, ...mudanca } : h,
      ),
    );
  };

  const salvarTudo = async () => {
    if (!config) return;

    if (config.tempo_preparo_min <= 0) {
      toast.warning("Informe um tempo de preparo válido (em minutos).");
      return;
    }

    try {
      setSalvando(true);
      await salvarConfigLoja(config);
      await Promise.all(horarios.map((h) => salvarHorarioLoja(h)));
      setStatus(await buscarStatusLoja());
      toast.success("Horário de funcionamento salvo!");
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error("[ERRO - FUNCIONAMENTO] Falha ao salvar:", mensagem);
      toast.error("Erro ao salvar as configurações.");
    } finally {
      setSalvando(false);
    }
  };

  if (carregando || !config) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <Loader2 className="animate-spin mr-2" size={20} />
        Carregando funcionamento...
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-950 dark:text-white flex items-center gap-2">
            <Clock className="text-[#ff5722]" size={26} />
            Funcionamento
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Horários da loja, pausa temporária e limite de pedidos. Fora do
            horário, o checkout é bloqueado automaticamente.
          </p>
        </div>

        {status && (
          <span
            className={`px-4 py-2 rounded-full text-sm font-bold ${
              status.aberta
                ? "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300"
                : "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300"
            }`}
          >
            {status.aberta ? "Loja aberta agora" : "Loja fechada agora"}
          </span>
        )}
      </div>

      {/* Pausa temporária */}
      <section className="rounded-2xl border border-gray-200 dark:border-[#2a2c30] bg-white dark:bg-[#181a1b] p-5 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-bold text-gray-950 dark:text-white flex items-center gap-2">
              <PauseCircle size={18} className="text-[#ff5722]" />
              Pausa temporária
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Bloqueia novos pedidos imediatamente, mesmo dentro do horário.
            </p>
          </div>
          <Switch
            checked={config.pausado}
            onCheckedChange={(pausado) =>
              setConfig({ ...config, pausado })
            }
          />
        </div>

        {config.pausado && (
          <div>
            <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Mensagem exibida ao cliente
            </label>
            <Input
              value={config.mensagem_pausa ?? ""}
              onChange={(e) =>
                setConfig({ ...config, mensagem_pausa: e.target.value })
              }
              placeholder="Ex.: Pausa rápida! Voltamos às 15h."
              className="mt-1"
            />
          </div>
        )}
      </section>

      {/* Preparo e limite */}
      <section className="rounded-2xl border border-gray-200 dark:border-[#2a2c30] bg-white dark:bg-[#181a1b] p-5">
        <h2 className="font-bold text-gray-950 dark:text-white mb-4">
          Operação
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Tempo estimado de preparo (min)
            </label>
            <Input
              type="number"
              min={1}
              value={config.tempo_preparo_min}
              onChange={(e) =>
                setConfig({
                  ...config,
                  tempo_preparo_min: Number(e.target.value),
                })
              }
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Limite de pedidos ativos (vazio = sem limite)
            </label>
            <Input
              type="number"
              min={1}
              value={config.limite_pedidos_ativos ?? ""}
              onChange={(e) =>
                setConfig({
                  ...config,
                  limite_pedidos_ativos: e.target.value
                    ? Number(e.target.value)
                    : null,
                })
              }
              placeholder="Sem limite"
              className="mt-1"
            />
            <p className="text-xs text-gray-400 mt-1">
              Ao atingir o limite de pedidos pendentes/em produção, novos
              pedidos são recusados até a fila baixar.
            </p>
          </div>
        </div>
      </section>

      {/* Horários da semana */}
      <section className="rounded-2xl border border-gray-200 dark:border-[#2a2c30] bg-white dark:bg-[#181a1b] p-5">
        <h2 className="font-bold text-gray-950 dark:text-white mb-1">
          Horários da semana
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Se o fechamento for menor que a abertura (ex.: 18:00 → 02:00), o
          horário atravessa a meia-noite.
        </p>

        <div className="divide-y divide-gray-100 dark:divide-[#2a2c30]">
          {horarios.map((horario) => (
            <div
              key={horario.dia_semana}
              className="flex flex-wrap items-center gap-3 py-3"
            >
              <div className="flex items-center gap-3 w-44">
                <Switch
                  checked={horario.aberto}
                  onCheckedChange={(aberto) =>
                    atualizarHorario(horario.dia_semana, { aberto })
                  }
                />
                <span
                  className={`font-semibold text-sm ${
                    horario.aberto
                      ? "text-gray-950 dark:text-white"
                      : "text-gray-400 line-through"
                  }`}
                >
                  {NOMES_DIAS_SEMANA[horario.dia_semana]}
                </span>
              </div>

              {horario.aberto ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="time"
                    value={horaParaInput(horario.abre)}
                    onChange={(e) =>
                      atualizarHorario(horario.dia_semana, {
                        abre: e.target.value,
                      })
                    }
                    className="w-32"
                  />
                  <span className="text-gray-400 text-sm">às</span>
                  <Input
                    type="time"
                    value={horaParaInput(horario.fecha)}
                    onChange={(e) =>
                      atualizarHorario(horario.dia_semana, {
                        fecha: e.target.value,
                      })
                    }
                    className="w-32"
                  />
                </div>
              ) : (
                <span className="text-sm text-gray-400">Fechado</span>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="flex justify-end">
        <Button
          onClick={() => void salvarTudo()}
          disabled={salvando}
          className="bg-[#ff5722] hover:bg-[#e64a19] text-white font-bold px-6"
        >
          {salvando ? (
            <Loader2 className="animate-spin" size={18} />
          ) : (
            <>
              <Save size={18} className="mr-2" />
              Salvar tudo
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
