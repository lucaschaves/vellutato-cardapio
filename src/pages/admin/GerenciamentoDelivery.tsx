import { Bike, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Switch } from "../../components/ui/switch";
import {
  buscarDeliveryConfig,
  salvarDeliveryConfig,
} from "../../lib/deliveryConfig";
import type { DeliveryConfig, FaixaFrete } from "../../lib/deliveryFrete";

export function GerenciamentoDelivery() {
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [config, setConfig] = useState<DeliveryConfig | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setCarregando(true);
        setConfig(await buscarDeliveryConfig());
      } catch (erro: unknown) {
        const mensagem = erro instanceof Error ? erro.message : String(erro);
        console.error("[DELIVERY ADMIN]", mensagem);
        toast.error("Falha ao carregar. Rode a migration de delivery no banco.");
      } finally {
        setCarregando(false);
      }
    })();
  }, []);

  const atualizarFaixa = (indice: number, mudanca: Partial<FaixaFrete>) => {
    if (!config) return;
    const faixas = config.faixas_frete.map((f, i) =>
      i === indice ? { ...f, ...mudanca } : f,
    );
    setConfig({ ...config, faixas_frete: faixas });
  };

  const adicionarFaixa = () => {
    if (!config) return;
    const ultima = config.faixas_frete[config.faixas_frete.length - 1];
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
  };

  const removerFaixa = (indice: number) => {
    if (!config || config.faixas_frete.length <= 1) return;
    setConfig({
      ...config,
      faixas_frete: config.faixas_frete.filter((_, i) => i !== indice),
    });
  };

  const salvar = async () => {
    if (!config) return;
    if (config.pedido_minimo < 0 || config.raio_km <= 0) {
      toast.warning("Informe pedido mínimo e raio válidos.");
      return;
    }
    try {
      setSalvando(true);
      await salvarDeliveryConfig(config);
      toast.success("Configuração de delivery salva!");
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error("[DELIVERY ADMIN] salvar", mensagem);
      toast.error("Erro ao salvar. Verifique a migration no banco.");
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
    <div className="max-w-3xl mx-auto space-y-6 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-950 dark:text-white flex items-center gap-2">
            <Bike className="text-[#ff5722]" size={26} />
            Delivery
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Pedido mínimo, raio, faixas de frete e pontos do canal /delivery.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-600 dark:text-gray-300">
            Canal ativo
          </span>
          <Switch
            checked={config.ativo}
            onCheckedChange={(ativo) => setConfig({ ...config, ativo })}
          />
        </div>
      </div>

      <section className="rounded-2xl border border-gray-200 dark:border-[#2a2c30] bg-white dark:bg-[#181a1b] p-5 space-y-4">
        <h2 className="font-bold text-gray-950 dark:text-white">Operação</h2>
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

      <section className="rounded-2xl border border-gray-200 dark:border-[#2a2c30] bg-white dark:bg-[#181a1b] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-gray-950 dark:text-white">
            Faixas de frete
          </h2>
          <Button type="button" variant="outline" size="sm" onClick={adicionarFaixa}>
            <Plus size={16} className="mr-1" /> Faixa
          </Button>
        </div>
        <p className="text-xs text-gray-500">
          Distância até X km cobra a taxa da faixa. Ordene do menor para o
          maior.
        </p>
        <div className="space-y-3">
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
                    atualizarFaixa(indice, { ate_km: Number(e.target.value) })
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
                    atualizarFaixa(indice, { taxa: Number(e.target.value) })
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
                onClick={() => removerFaixa(indice)}
              >
                <Trash2 size={16} />
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 dark:border-[#2a2c30] bg-white dark:bg-[#181a1b] p-5 space-y-4">
        <h2 className="font-bold text-gray-950 dark:text-white">
          WhatsApp (acompanhamento)
        </h2>
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
            className="mt-1"
          />
          <p className="text-xs text-gray-500 mt-1">
            Mesmo número da API oficial. O cliente toca em “Acompanhar no
            WhatsApp”, envia a mensagem e abre a janela de 24h para receber
            status sem template pago.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 dark:border-[#2a2c30] bg-white dark:bg-[#181a1b] p-5 space-y-4">
        <h2 className="font-bold text-gray-950 dark:text-white">Pontos</h2>
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
        <p className="text-xs text-gray-500">
          Padrão: 1 ponto por R$ 1 · 100 pontos = cupom de R$ 5.
        </p>
      </section>

      <div className="flex justify-end">
        <Button
          onClick={() => void salvar()}
          disabled={salvando}
          className="bg-[#ff5722] hover:bg-[#e64a19] text-white font-bold px-6"
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
      </div>
    </div>
  );
}
