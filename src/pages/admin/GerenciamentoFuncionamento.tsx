import { Clock, DoorClosed, Loader2, PauseCircle, Save, Store } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  aberturaTemporariaEfetiva,
  buscarConfigLoja,
  buscarHorariosLoja,
  buscarStatusLoja,
  fecharLojaManualmente,
  MENSAGEM_FECHAMENTO_PADRAO,
  MINUTOS_ABERTURA_RAPIDA_LOJA,
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
import { AdminPageShell } from "../../components/AdminPageShell";

function horaParaInput(hora: string): string {
  return hora.slice(0, 5); // "HH:MM:SS" → "HH:MM"
}

export function GerenciamentoFuncionamento() {
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [config, setConfig] = useState<LojaConfig | null>(null);
  const [horarios, setHorarios] = useState<LojaHorario[]>([]);
  const [status, setStatus] = useState<StatusLoja | null>(null);

  const [fechando, setFechando] = useState(false);

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
    if (
      config.atraso_primeiro_agendamento_min < 0 ||
      config.atraso_primeiro_agendamento_min > 180
    ) {
      toast.warning(
        "Atraso do 1º agendamento deve ser entre 0 e 180 minutos.",
      );
      return;
    }

    try {
      setSalvando(true);
      await salvarConfigLoja(config);
      await Promise.all(horarios.map((h) => salvarHorarioLoja(h)));

      try {
        const { ifoodPausarLoja, ifoodReabrirLoja } = await import(
          "../../lib/ifoodAdmin"
        );
        if (config.pausado || config.fechado_manual) {
          const minutos = config.pausado_ate
            ? Math.max(
              1,
              Math.round(
                (new Date(config.pausado_ate).getTime() - Date.now()) /
                  60_000,
              ),
            )
            : config.fechado_manual
              ? 480
              : 60;
          const descricao = config.pausado
            ? config.mensagem_pausa || "Loja pausada"
            : config.mensagem_fechamento || "Loja fechada";
          await ifoodPausarLoja(minutos, descricao);
        } else {
          await ifoodReabrirLoja();
        }
      } catch (e) {
        console.warn("[funcionamento] iFood:", e);
      }

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

  const fecharAgora = async () => {
    if (!config) return;
    try {
      setFechando(true);
      const mensagem =
        config.mensagem_fechamento?.trim() || MENSAGEM_FECHAMENTO_PADRAO;
      await fecharLojaManualmente(mensagem);
      const [cfg, st] = await Promise.all([
        buscarConfigLoja(),
        buscarStatusLoja(),
      ]);
      setConfig(cfg);
      setStatus(st);
      toast.success("Loja fechada. Novos pedidos estão bloqueados.");
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error("[ERRO - FUNCIONAMENTO] Falha ao fechar:", mensagem);
      toast.error("Não foi possível fechar a loja.");
    } finally {
      setFechando(false);
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
    <AdminPageShell
      title={
        <span className="flex items-center gap-2">
          <Clock className="text-[#6b1d2a]" size={26} />
          Funcionamento
        </span>
      }
      description="Horários da loja, abertura/pausa/fechamento manual e limite de pedidos. Fora do horário, o checkout é bloqueado automaticamente."
      actions={
        status ? (
          <span
            className={`px-4 py-2 rounded-full text-sm font-bold ${
              status.aberta
                ? "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300"
                : "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300"
            }`}
          >
            {status.aberta ? "Loja aberta agora" : "Loja fechada agora"}
          </span>
        ) : null
      }
      footer={
        <Button
          onClick={() => void salvarTudo()}
          disabled={salvando}
          className="bg-[#6b1d2a] hover:bg-[#541622] text-white font-bold px-6"
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
      }
      contentClassName="space-y-6"
    >
      {/* Abertura temporária */}
      <section className="rounded-2xl border border-gray-200 dark:border-[#2a2c30] bg-white dark:bg-[#181a1b] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-bold text-gray-950 dark:text-white flex items-center gap-2">
              <Store size={18} className="text-[#6b1d2a]" />
              Abertura temporária
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Abre a loja fora do horário cadastrado, sem alterar a grade semanal.
              A pausa temporária tem prioridade e bloqueia pedidos mesmo com abertura ativa.
            </p>
            {config.abertura_temporaria &&
              config.abertura_temporaria_ate &&
              new Date(config.abertura_temporaria_ate).getTime() > Date.now() && (
                <p className="text-xs font-semibold text-green-700 dark:text-green-400">
                  Aberta até{" "}
                  {new Date(config.abertura_temporaria_ate).toLocaleTimeString(
                    "pt-BR",
                    { hour: "2-digit", minute: "2-digit" },
                  )}
                  .
                </p>
              )}
            {aberturaTemporariaEfetiva(config) &&
              !config.abertura_temporaria_ate && (
                <p className="text-xs font-semibold text-green-700 dark:text-green-400">
                  Aberta manualmente até você desligar.
                </p>
              )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="font-semibold"
              onClick={() => {
                setConfig({
                  ...config,
                  abertura_temporaria: true,
                  abertura_temporaria_ate: new Date(
                    Date.now() + MINUTOS_ABERTURA_RAPIDA_LOJA * 60 * 1000,
                  ).toISOString(),
                  pausado: false,
                  pausado_ate: null,
                  fechado_manual: false,
                  mensagem_fechamento: null,
                });
              }}
            >
              Abrir por {MINUTOS_ABERTURA_RAPIDA_LOJA / 60}h
            </Button>
            <Switch
              checked={config.abertura_temporaria}
              onCheckedChange={(abertura_temporaria) =>
                setConfig({
                  ...config,
                  abertura_temporaria,
                  abertura_temporaria_ate: abertura_temporaria
                    ? config.abertura_temporaria_ate
                    : null,
                  fechado_manual: abertura_temporaria
                    ? false
                    : config.fechado_manual,
                  mensagem_fechamento: abertura_temporaria
                    ? null
                    : config.mensagem_fechamento,
                })
              }
            />
          </div>
        </div>
      </section>

      {/* Pausa temporária */}
      <section className="rounded-2xl border border-gray-200 dark:border-[#2a2c30] bg-white dark:bg-[#181a1b] p-5 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-bold text-gray-950 dark:text-white flex items-center gap-2">
              <PauseCircle size={18} className="text-[#6b1d2a]" />
              Pausa temporária
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Bloqueia novos pedidos imediatamente, mesmo dentro do horário.
              No topo do admin há um atalho de 10 minutos que reabre sozinho.
            </p>
            {config.pausado &&
              config.pausado_ate &&
              new Date(config.pausado_ate).getTime() > Date.now() && (
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                  Pausa automática até{" "}
                  {new Date(config.pausado_ate).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  .
                </p>
              )}
          </div>
          <Switch
            checked={config.pausado}
            onCheckedChange={(pausado) =>
              setConfig({
                ...config,
                pausado,
                pausado_ate: null,
              })
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

      {/* Fechamento manual */}
      <section className="rounded-2xl border border-gray-200 dark:border-[#2a2c30] bg-white dark:bg-[#181a1b] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-bold text-gray-950 dark:text-white flex items-center gap-2">
              <DoorClosed size={18} className="text-[#6b1d2a]" />
              Fechar loja
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Encerra os pedidos imediatamente, mesmo dentro do horário cadastrado.
              Permanece fechada até você desligar manualmente — ideal quando
              fecham mais cedo por imprevisto.
            </p>
            {config.fechado_manual && (
              <p className="text-xs font-semibold text-red-700 dark:text-red-400">
                Loja fechada manualmente até você reabrir.
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="font-semibold border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30"
              disabled={fechando || config.fechado_manual}
              onClick={() => void fecharAgora()}
            >
              {fechando ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                "Fechar agora"
              )}
            </Button>
            <Switch
              checked={config.fechado_manual}
              onCheckedChange={(fechado_manual) =>
                setConfig({
                  ...config,
                  fechado_manual,
                  mensagem_fechamento: fechado_manual
                    ? config.mensagem_fechamento || MENSAGEM_FECHAMENTO_PADRAO
                    : null,
                  abertura_temporaria: fechado_manual
                    ? false
                    : config.abertura_temporaria,
                  abertura_temporaria_ate: fechado_manual
                    ? null
                    : config.abertura_temporaria_ate,
                })
              }
            />
          </div>
        </div>

        {config.fechado_manual && (
          <div>
            <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Mensagem exibida ao cliente
            </label>
            <Input
              value={config.mensagem_fechamento ?? ""}
              onChange={(e) =>
                setConfig({ ...config, mensagem_fechamento: e.target.value })
              }
              placeholder={MENSAGEM_FECHAMENTO_PADRAO}
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
              1º horário agendável após abrir (min)
            </label>
            <Input
              type="number"
              min={0}
              max={180}
              value={config.atraso_primeiro_agendamento_min}
              onChange={(e) =>
                setConfig({
                  ...config,
                  atraso_primeiro_agendamento_min: Number(e.target.value),
                })
              }
              className="mt-1"
            />
            <p className="text-xs text-gray-400 mt-1">
              Ex.: abre 14:00 e este valor é 15 → o cliente só vê slots a partir
              de 14:15. Use 0 para permitir agendar no horário de abertura.
            </p>
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
    </AdminPageShell>
  );
}
