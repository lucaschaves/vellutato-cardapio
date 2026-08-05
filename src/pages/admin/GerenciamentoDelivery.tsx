import {
  Bike,
  CloudRain,
  Copy,
  Gift,
  Loader2,
  MapPinned,
  MessageCircle,
  Plus,
  Save,
  Trash2,
  Truck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminPageShell } from "../../components/AdminPageShell";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Switch } from "../../components/ui/switch";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../components/ui/tabs";
import {
  buscarDeliveryConfig,
  salvarDeliveryConfig,
} from "../../lib/deliveryConfig";
import {
  DIAS_SEMANA_LABEL,
  normalizarClimaFrete,
  novaRegraFrete,
  novoEnderecoReferencia,
  type DeliveryConfig,
  type DiaSemana,
  type EnderecoReferenciaFrete,
  type FaixaFrete,
  type RegraFrete,
} from "../../lib/deliveryFrete";

const TODOS_DIAS: DiaSemana[] = [0, 1, 2, 3, 4, 5, 6];

type AbaDelivery =
  | "operacao"
  | "frete"
  | "enderecos"
  | "pontos"
  | "whatsapp";

const painelClass =
  "rounded-2xl border border-gray-200 dark:border-[#2a2c30] bg-white dark:bg-[#181a1b] p-5 flex flex-col gap-4";

export function GerenciamentoDelivery() {
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [config, setConfig] = useState<DeliveryConfig | null>(null);
  const [aba, setAba] = useState<AbaDelivery>("operacao");

  useEffect(() => {
    void (async () => {
      try {
        setCarregando(true);
        setConfig(await buscarDeliveryConfig());
      } catch (erro: unknown) {
        const mensagem = erro instanceof Error ? erro.message : String(erro);
        console.error("[DELIVERY ADMIN]", mensagem);
        toast.error("Falha ao carregar. Rode a migration de frete no banco.");
      } finally {
        setCarregando(false);
      }
    })();
  }, []);

  const atualizarFaixaPadrao = (
    indice: number,
    mudanca: Partial<FaixaFrete>,
  ) => {
    if (!config) return;
    const faixas = config.faixas_frete.map((f, i) =>
      i === indice ? { ...f, ...mudanca } : f,
    );
    setConfig({ ...config, faixas_frete: faixas });
  };

  const atualizarRegra = (indice: number, mudanca: Partial<RegraFrete>) => {
    if (!config) return;
    const regras = config.regras_frete.map((r, i) =>
      i === indice ? { ...r, ...mudanca } : r,
    );
    setConfig({ ...config, regras_frete: regras });
  };

  const atualizarFaixaRegra = (
    regraIdx: number,
    faixaIdx: number,
    mudanca: Partial<FaixaFrete>,
  ) => {
    if (!config) return;
    const regras = config.regras_frete.map((r, i) => {
      if (i !== regraIdx) return r;
      const faixas = r.faixas.map((f, j) =>
        j === faixaIdx ? { ...f, ...mudanca } : f,
      );
      return { ...r, faixas };
    });
    setConfig({ ...config, regras_frete: regras });
  };

  const atualizarClimaRegra = (
    regraIdx: number,
    mudanca: Partial<RegraFrete["clima"]>,
  ) => {
    if (!config) return;
    const regra = config.regras_frete[regraIdx];
    atualizarRegra(regraIdx, {
      clima: {
        ...normalizarClimaFrete(regra?.clima),
        ...mudanca,
      },
    });
  };

  const atualizarEndereco = (
    indice: number,
    mudanca: Partial<EnderecoReferenciaFrete>,
  ) => {
    if (!config) return;
    const lista = config.enderecos_referencia.map((e, i) =>
      i === indice ? { ...e, ...mudanca } : e,
    );
    setConfig({ ...config, enderecos_referencia: lista });
  };

  const copiarEndereco = async (item: EnderecoReferenciaFrete) => {
    const texto = item.endereco.trim();
    if (!texto) {
      toast.warning("Informe o endereço antes de copiar.");
      return;
    }
    try {
      await navigator.clipboard.writeText(texto);
      toast.success(
        `Copiado · ${item.rotulo || `Faixa ${item.ate_km} km`}`,
      );
    } catch {
      toast.error("Não foi possível copiar. Selecione e copie manualmente.");
    }
  };

  const toggleDia = (regraIdx: number, dia: DiaSemana) => {
    if (!config) return;
    const regra = config.regras_frete[regraIdx];
    const tem = regra.dias.includes(dia);
    const dias = tem
      ? regra.dias.filter((d) => d !== dia)
      : [...regra.dias, dia].sort((a, b) => a - b);
    atualizarRegra(regraIdx, { dias: dias as DiaSemana[] });
  };

  const salvar = async () => {
    if (!config) return;
    if (config.pedido_minimo < 0 || config.raio_km <= 0) {
      toast.warning("Informe pedido mínimo e raio válidos.");
      setAba("operacao");
      return;
    }
    for (const r of config.regras_frete) {
      if (r.dias.length === 0) {
        toast.warning("Cada regra precisa de ao menos um dia da semana.");
        setAba("frete");
        return;
      }
      if (!r.faixas.length) {
        toast.warning("Cada regra precisa de ao menos uma faixa de km.");
        setAba("frete");
        return;
      }
    }
    try {
      setSalvando(true);
      await salvarDeliveryConfig(config);
      toast.success("Configuração de delivery salva!");
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error("[DELIVERY ADMIN] salvar", mensagem);
      toast.error(
        mensagem.includes("regras_frete") ||
        mensagem.includes("clima_frete") ||
        mensagem.includes("enderecos_referencia")
          ? "Rode a migration de frete/endereços no banco."
          : "Erro ao salvar. Verifique a migration no banco.",
      );
    } finally {
      setSalvando(false);
    }
  };

  if (carregando || !config) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <Loader2 className="animate-spin mr-2" size={20} />
        Carregando delivery...
      </div>
    );
  }

  return (
    <AdminPageShell
      title={
        <span className="flex items-center gap-2">
          <Bike className="text-cookie-primary" size={26} />
          Delivery
        </span>
      }
      description="Operação, frete, pontos e WhatsApp do canal delivery."
      actions={
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-600 dark:text-gray-300">
            Canal ativo
          </span>
          <Switch
            checked={config.ativo}
            onCheckedChange={(ativo) => setConfig({ ...config, ativo })}
          />
        </div>
      }
      footer={
        <Button
          onClick={() => void salvar()}
          disabled={salvando}
          className="bg-cookie-primary hover:bg-cookie-primary-hover text-white font-bold px-6"
        >
          {salvando ? (
            <Loader2 className="animate-spin" size={18} />
          ) : (
            <>
              <Save size={18} className="mr-2" />
              Salvar
            </>
          )}
        </Button>
      }
      contentClassName="flex flex-col gap-4"
    >
      <Tabs
        value={aba}
        onValueChange={(v) => setAba(v as AbaDelivery)}
        className="gap-4"
      >
        <TabsList
          variant="line"
          className="w-full h-auto max-w-full justify-start overflow-x-auto flex-nowrap rounded-none border-b border-gray-200 dark:border-gray-800 bg-transparent p-0 gap-0"
        >
          <TabsTrigger
            value="operacao"
            className="shrink-0 rounded-none px-3 py-2.5 data-active:shadow-none gap-1.5"
          >
            <MapPinned size={15} />
            Operação
          </TabsTrigger>
          <TabsTrigger
            value="frete"
            className="shrink-0 rounded-none px-3 py-2.5 data-active:shadow-none gap-1.5"
          >
            <Truck size={15} />
            Frete
          </TabsTrigger>
          <TabsTrigger
            value="enderecos"
            className="shrink-0 rounded-none px-3 py-2.5 data-active:shadow-none gap-1.5"
          >
            <Copy size={15} />
            Endereços
          </TabsTrigger>
          <TabsTrigger
            value="pontos"
            className="shrink-0 rounded-none px-3 py-2.5 data-active:shadow-none gap-1.5"
          >
            <Gift size={15} />
            Pontos
          </TabsTrigger>
          <TabsTrigger
            value="whatsapp"
            className="shrink-0 rounded-none px-3 py-2.5 data-active:shadow-none gap-1.5"
          >
            <MessageCircle size={15} />
            WhatsApp
          </TabsTrigger>
        </TabsList>

        <TabsContent value="operacao" className="mt-0">
          <section className={painelClass}>
            <div>
              <h2 className="font-bold text-gray-950 dark:text-white">
                Operação
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Pedido mínimo, tempo e cobertura geográfica da loja.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Pedido mínimo (R$ — só itens)
                </label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={config.pedido_minimo}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      pedido_minimo: Number(e.target.value),
                    })
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Tempo estimado (min)
                </label>
                <Input
                  type="number"
                  min={1}
                  value={config.tempo_estimado_min}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      tempo_estimado_min: Number(e.target.value),
                    })
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Latitude da loja
                </label>
                <Input
                  type="number"
                  step="any"
                  value={config.loja_latitude ?? ""}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      loja_latitude: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })
                  }
                  placeholder="-23.55"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Longitude da loja
                </label>
                <Input
                  type="number"
                  step="any"
                  value={config.loja_longitude ?? ""}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      loja_longitude: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })
                  }
                  placeholder="-46.63"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Raio máximo (km)
                </label>
                <Input
                  type="number"
                  min={0.1}
                  step="0.1"
                  value={config.raio_km}
                  onChange={(e) =>
                    setConfig({ ...config, raio_km: Number(e.target.value) })
                  }
                  className="mt-1"
                />
              </div>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="frete" className="mt-0 flex flex-col gap-4">
          <section className={painelClass}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="font-bold text-gray-950 dark:text-white">
                  Regras de frete (dia + horário)
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  Cada regra (ex.: terça, sábado tarde, sábado noite) tem suas
                  faixas de km e o próprio acréscimo de chuva. Horário no fuso
                  de São Paulo. Se nenhuma regra bater, usa as faixas padrão.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setConfig({
                    ...config,
                    regras_frete: [
                      ...config.regras_frete,
                      novaRegraFrete({}, config.faixas_frete),
                    ],
                  })
                }
              >
                <Plus size={16} className="mr-1" /> Regra
              </Button>
            </div>

            <div className="flex flex-col gap-4">
              {config.regras_frete.map((regra, ri) => (
                <div
                  key={regra.id}
                  className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-col gap-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <Input
                      placeholder="Nome da regra (opcional)"
                      value={regra.rotulo || ""}
                      onChange={(e) =>
                        atualizarRegra(ri, {
                          rotulo: e.target.value || undefined,
                        })
                      }
                      className="max-w-xs"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-red-600"
                      onClick={() =>
                        setConfig({
                          ...config,
                          regras_frete: config.regras_frete.filter(
                            (_, i) => i !== ri,
                          ),
                        })
                      }
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {TODOS_DIAS.map((d) => {
                      const on = regra.dias.includes(d);
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => toggleDia(ri, d)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
                            on
                              ? "bg-cookie-primary text-white border-cookie-primary"
                              : "border-gray-200 text-gray-500"
                          }`}
                        >
                          {DIAS_SEMANA_LABEL[d]}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap gap-3 items-end">
                    <div>
                      <label className="text-xs font-semibold text-gray-500">
                        Das
                      </label>
                      <Input
                        type="time"
                        value={regra.inicio}
                        onChange={(e) =>
                          atualizarRegra(ri, { inicio: e.target.value })
                        }
                        className="w-32 mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500">
                        Até
                      </label>
                      <Input
                        type="time"
                        value={regra.fim === "23:59" ? "23:59" : regra.fim}
                        onChange={(e) =>
                          atualizarRegra(ri, {
                            fim: e.target.value || "23:59",
                          })
                        }
                        className="w-32 mt-1"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const ultima = regra.faixas[regra.faixas.length - 1];
                        atualizarRegra(ri, {
                          faixas: [
                            ...regra.faixas,
                            {
                              ate_km: (ultima?.ate_km ?? 0) + 2,
                              taxa: (ultima?.taxa ?? 0) + 5,
                            },
                          ],
                        });
                      }}
                    >
                      <Plus size={14} className="mr-1" /> Faixa km
                    </Button>
                  </div>

                  <div className="flex flex-col gap-2">
                    {regra.faixas.map((faixa, fi) => (
                      <div key={fi} className="flex flex-wrap items-end gap-3">
                        <div>
                          <label className="text-xs font-semibold text-gray-500">
                            Até (km)
                          </label>
                          <Input
                            type="number"
                            min={0}
                            step="0.1"
                            value={faixa.ate_km}
                            onChange={(e) =>
                              atualizarFaixaRegra(ri, fi, {
                                ate_km: Number(e.target.value),
                              })
                            }
                            className="w-28 mt-1"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-gray-500">
                            Taxa (R$)
                          </label>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={faixa.taxa}
                            onChange={(e) =>
                              atualizarFaixaRegra(ri, fi, {
                                taxa: Number(e.target.value),
                              })
                            }
                            className="w-28 mt-1"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-red-600"
                          disabled={regra.faixas.length <= 1}
                          onClick={() =>
                            atualizarRegra(ri, {
                              faixas: regra.faixas.filter((_, j) => j !== fi),
                            })
                          }
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-lg border border-sky-200 dark:border-sky-900/50 bg-sky-50/60 dark:bg-sky-950/20 p-3 flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <CloudRain className="text-sky-600 shrink-0" size={16} />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">
                            Acréscimo de chuva nesta regra
                          </p>
                          <p className="text-[11px] text-gray-500">
                            Só vale neste dia/horário (Open-Meteo).
                          </p>
                        </div>
                      </div>
                      <Switch
                        checked={regra.clima.ativo}
                        onCheckedChange={(ativo) =>
                          atualizarClimaRegra(ri, { ativo })
                        }
                      />
                    </div>
                    {regra.clima.ativo && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-semibold text-gray-500">
                            Tipo
                          </label>
                          <select
                            className="mt-1 w-full h-10 rounded-md border border-gray-200 dark:border-gray-700 bg-transparent px-3 text-sm"
                            value={regra.clima.acrescimo_tipo}
                            onChange={(e) =>
                              atualizarClimaRegra(ri, {
                                acrescimo_tipo:
                                  e.target.value === "percentual"
                                    ? "percentual"
                                    : "fixo",
                              })
                            }
                          >
                            <option value="fixo">Valor fixo (R$)</option>
                            <option value="percentual">Percentual (%)</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-gray-500">
                            {regra.clima.acrescimo_tipo === "percentual"
                              ? "Acréscimo (%)"
                              : "Acréscimo (R$)"}
                          </label>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={regra.clima.acrescimo_valor}
                            onChange={(e) =>
                              atualizarClimaRegra(ri, {
                                acrescimo_valor: Number(e.target.value),
                              })
                            }
                            className="mt-1"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {config.regras_frete.length === 0 && (
                <p className="text-sm text-gray-500">
                  Nenhuma regra. Será usada só a faixa padrão abaixo.
                </p>
              )}
            </div>
          </section>

          <section className={painelClass}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-gray-950 dark:text-white">
                  Faixas padrão (fallback)
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  Usadas quando o horário atual não entra em nenhuma regra.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const ultima =
                    config.faixas_frete[config.faixas_frete.length - 1];
                  setConfig({
                    ...config,
                    faixas_frete: [
                      ...config.faixas_frete,
                      {
                        ate_km: (ultima?.ate_km ?? 0) + 2,
                        taxa: (ultima?.taxa ?? 0) + 5,
                      },
                    ],
                  });
                }}
              >
                <Plus size={16} className="mr-1" /> Faixa
              </Button>
            </div>
            <div className="flex flex-col gap-3">
              {config.faixas_frete.map((faixa, indice) => (
                <div key={indice} className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500">
                      Até (km)
                    </label>
                    <Input
                      type="number"
                      min={0}
                      step="0.1"
                      value={faixa.ate_km}
                      onChange={(e) =>
                        atualizarFaixaPadrao(indice, {
                          ate_km: Number(e.target.value),
                        })
                      }
                      className="w-28 mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500">
                      Taxa (R$)
                    </label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={faixa.taxa}
                      onChange={(e) =>
                        atualizarFaixaPadrao(indice, {
                          taxa: Number(e.target.value),
                        })
                      }
                      className="w-28 mt-1"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-red-600"
                    disabled={config.faixas_frete.length <= 1}
                    onClick={() =>
                      setConfig({
                        ...config,
                        faixas_frete: config.faixas_frete.filter(
                          (_, i) => i !== indice,
                        ),
                      })
                    }
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              ))}
            </div>
          </section>

          <section className={painelClass}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CloudRain className="text-sky-600" size={20} />
                <div>
                  <h2 className="font-bold text-gray-950 dark:text-white">
                    Chuva no fallback
                  </h2>
                  <p className="text-xs text-gray-500">
                    Só aplica quando nenhuma regra de dia/horário bate. Prefira
                    configurar chuva dentro de cada regra acima.
                  </p>
                </div>
              </div>
              <Switch
                checked={config.clima_frete.ativo}
                onCheckedChange={(ativo) =>
                  setConfig({
                    ...config,
                    clima_frete: { ...config.clima_frete, ativo },
                  })
                }
              />
            </div>
            {config.clima_frete.ativo && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Tipo
                  </label>
                  <select
                    className="mt-1 w-full h-10 rounded-md border border-gray-200 dark:border-gray-700 bg-transparent px-3 text-sm"
                    value={config.clima_frete.acrescimo_tipo}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        clima_frete: {
                          ...config.clima_frete,
                          acrescimo_tipo:
                            e.target.value === "percentual"
                              ? "percentual"
                              : "fixo",
                        },
                      })
                    }
                  >
                    <option value="fixo">Valor fixo (R$)</option>
                    <option value="percentual">Percentual (%)</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    {config.clima_frete.acrescimo_tipo === "percentual"
                      ? "Acréscimo (%)"
                      : "Acréscimo (R$)"}
                  </label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={config.clima_frete.acrescimo_valor}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        clima_frete: {
                          ...config.clima_frete,
                          acrescimo_valor: Number(e.target.value),
                        },
                      })
                    }
                    className="mt-1"
                  />
                </div>
              </div>
            )}
          </section>
        </TabsContent>

        <TabsContent value="enderecos" className="mt-0">
          <section className={painelClass}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-bold text-gray-950 dark:text-white">
                  Endereços de referência
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  Cadastre um endereço por faixa (1 km, 2 km…). Copie, consulte o
                  preço em uma plataforma externa e atualize o frete na aba
                  Frete.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const ultimo =
                    config.enderecos_referencia[
                      config.enderecos_referencia.length - 1
                    ];
                  setConfig({
                    ...config,
                    enderecos_referencia: [
                      ...config.enderecos_referencia,
                      novoEnderecoReferencia({
                        ate_km: (ultimo?.ate_km ?? 0) + 1,
                      }),
                    ],
                  });
                }}
              >
                <Plus size={16} className="mr-1" /> Endereço
              </Button>
            </div>

            <div className="flex flex-col gap-3">
              {config.enderecos_referencia.map((item, idx) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-col gap-3"
                >
                  <div className="flex flex-wrap items-end gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-500">
                        Faixa (km)
                      </label>
                      <Input
                        type="number"
                        min={0.1}
                        step="0.1"
                        value={item.ate_km}
                        onChange={(e) => {
                          const ate_km = Number(e.target.value);
                          atualizarEndereco(idx, {
                            ate_km,
                            rotulo:
                              item.rotulo.startsWith("Faixa ") || !item.rotulo
                                ? `Faixa ${ate_km} km`
                                : item.rotulo,
                          });
                        }}
                        className="w-28 mt-1"
                      />
                    </div>
                    <div className="flex-1 min-w-40">
                      <label className="text-xs font-semibold text-gray-500">
                        Rótulo
                      </label>
                      <Input
                        value={item.rotulo}
                        onChange={(e) =>
                          atualizarEndereco(idx, { rotulo: e.target.value })
                        }
                        placeholder="Ex.: Faixa 1 km"
                        className="mt-1"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!item.endereco.trim()}
                      onClick={() => void copiarEndereco(item)}
                    >
                      <Copy size={14} className="mr-1" />
                      Copiar
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-red-600"
                      onClick={() =>
                        setConfig({
                          ...config,
                          enderecos_referencia:
                            config.enderecos_referencia.filter(
                              (_, i) => i !== idx,
                            ),
                        })
                      }
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500">
                      Endereço completo
                    </label>
                    <textarea
                      value={item.endereco}
                      onChange={(e) =>
                        atualizarEndereco(idx, { endereco: e.target.value })
                      }
                      placeholder="Rua, número, bairro, cidade — UF, CEP"
                      rows={2}
                      className="mt-1 w-full rounded-md border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500">
                      Observação (opcional)
                    </label>
                    <Input
                      value={item.observacao || ""}
                      onChange={(e) =>
                        atualizarEndereco(idx, {
                          observacao: e.target.value || undefined,
                        })
                      }
                      placeholder="Ex.: iFood cobrou R$ X em dia de sol"
                      className="mt-1"
                    />
                  </div>
                </div>
              ))}
              {config.enderecos_referencia.length === 0 && (
                <p className="text-sm text-gray-500">
                  Nenhum endereço ainda. Adicione um por faixa de km para
                  calibrar.
                </p>
              )}
            </div>
          </section>
        </TabsContent>

        <TabsContent value="pontos" className="mt-0">
          <section className={painelClass}>
            <div>
              <h2 className="font-bold text-gray-950 dark:text-white">
                Pontos
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Acúmulo e resgate de pontos no canal delivery.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Pontos por R$ 1 (itens)
                </label>
                <Input
                  type="number"
                  min={0}
                  step="0.1"
                  value={config.pontos_por_real}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      pontos_por_real: Number(e.target.value),
                    })
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Resgate (pontos)
                </label>
                <Input
                  type="number"
                  min={1}
                  value={config.resgate_pontos}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      resgate_pontos: Number(e.target.value),
                    })
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Valor do cupom (R$)
                </label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={config.resgate_valor_reais}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      resgate_valor_reais: Number(e.target.value),
                    })
                  }
                  className="mt-1"
                />
              </div>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="whatsapp" className="mt-0">
          <section className={painelClass}>
            <div>
              <h2 className="font-bold text-gray-950 dark:text-white">
                WhatsApp
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Número usado para acompanhamento do pedido pelo cliente.
              </p>
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Número da loja (com DDI)
              </label>
              <Input
                value={config.whatsapp_numero || ""}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    whatsapp_numero: e.target.value.replace(/\D/g, "") || null,
                  })
                }
                placeholder="5511999999999"
                className="mt-1 max-w-sm"
              />
            </div>
          </section>
        </TabsContent>
      </Tabs>
    </AdminPageShell>
  );
}
