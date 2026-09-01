import { Loader2, Percent, Plus, Save, Trash2, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AdminPageShell } from "../../components/AdminPageShell";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { formatarMoeda } from "../../lib/pedidosAdmin";
import {
  buscarPrecificacaoConfig,
  type ContribuicaoModo,
  type FaixaDescontoVolume,
  type PrecificacaoConfig,
  recalcularContribuicao,
  salvarPrecificacaoConfig,
  somarDespesasFixasMensais,
} from "../../lib/precificacao";

function numInput(valor: string): number {
  const n = parseFloat(valor.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function GerenciamentoPrecificacao() {
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [despesasFixas, setDespesasFixas] = useState(0);

  const [margemLoja, setMargemLoja] = useState("40");
  const [margemDelivery, setMargemDelivery] = useState("40");
  const [margemIfood, setMargemIfood] = useState("25");
  const [modo, setModo] = useState<ContribuicaoModo>("pct_faturamento");
  const [contribuicaoPct, setContribuicaoPct] = useState("0");
  const [contribuicaoRs, setContribuicaoRs] = useState("0");
  const [faturamento, setFaturamento] = useState("0");
  const [qtdItens, setQtdItens] = useState("0");
  const [taxaCartao, setTaxaCartao] = useState("0");
  const [taxaDelivery, setTaxaDelivery] = useState("0");
  const [taxaIfood, setTaxaIfood] = useState("0");
  const [faixas, setFaixas] = useState<FaixaDescontoVolume[]>([]);

  const aplicarConfig = useCallback((cfg: PrecificacaoConfig) => {
    setMargemLoja(String(cfg.margem_lucro_loja_pct));
    setMargemDelivery(String(cfg.margem_lucro_delivery_pct));
    setMargemIfood(String(cfg.margem_lucro_ifood_pct));
    setModo(cfg.contribuicao_modo);
    setContribuicaoPct(String(cfg.contribuicao_pct));
    setContribuicaoRs(String(cfg.contribuicao_rs_unidade));
    setFaturamento(String(cfg.faturamento_esperado_mensal));
    setQtdItens(String(cfg.qtd_itens_esperada_mensal));
    setTaxaCartao(String(cfg.taxa_cartao_pct));
    setTaxaDelivery(String(cfg.taxa_delivery_pct));
    setTaxaIfood(String(cfg.taxa_ifood_pct));
    setFaixas(cfg.descontos_volume);
  }, []);

  const carregar = useCallback(async () => {
    try {
      setCarregando(true);
      const [cfg, despesas] = await Promise.all([
        buscarPrecificacaoConfig(),
        somarDespesasFixasMensais().catch(() => 0),
      ]);
      aplicarConfig(cfg);
      setDespesasFixas(despesas);
    } catch (erro: unknown) {
      const msg = erro instanceof Error ? erro.message : String(erro);
      console.error("[PRECIFICACAO]", msg);
      toast.error(
        "Falha ao carregar precificação. Rode a migration no banco.",
      );
    } finally {
      setCarregando(false);
    }
  }, [aplicarConfig]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const sugestao = useMemo(
    () =>
      recalcularContribuicao({
        despesasFixas,
        faturamentoEsperado: numInput(faturamento),
        qtdItensEsperada: numInput(qtdItens),
      }),
    [despesasFixas, faturamento, qtdItens],
  );

  const aplicarSugestao = () => {
    setContribuicaoPct(String(sugestao.pct));
    setContribuicaoRs(String(sugestao.rsUnidade));
    toast.success("Valores de contribuição preenchidos a partir das despesas.");
  };

  const salvar = async () => {
    try {
      setSalvando(true);
      const faixasLimpas = faixas
        .map((f) => ({
          qtd_min: Number(f.qtd_min) || 0,
          desconto_pct: Number(f.desconto_pct) || 0,
        }))
        .filter((f) => f.qtd_min > 0);

      const salva = await salvarPrecificacaoConfig({
        margem_lucro_loja_pct: numInput(margemLoja),
        margem_lucro_delivery_pct: numInput(margemDelivery),
        margem_lucro_ifood_pct: numInput(margemIfood),
        contribuicao_modo: modo,
        contribuicao_pct: numInput(contribuicaoPct),
        contribuicao_rs_unidade: numInput(contribuicaoRs),
        faturamento_esperado_mensal: numInput(faturamento),
        qtd_itens_esperada_mensal: numInput(qtdItens),
        taxa_cartao_pct: numInput(taxaCartao),
        taxa_delivery_pct: numInput(taxaDelivery),
        taxa_ifood_pct: numInput(taxaIfood),
        descontos_volume: faixasLimpas,
      });
      aplicarConfig(salva);
      toast.success("Configuração de precificação salva.");
    } catch (erro: unknown) {
      const msg = erro instanceof Error ? erro.message : String(erro);
      console.error("[PRECIFICACAO SALVAR]", msg);
      toast.error("Não foi possível salvar a configuração.");
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) {
    return (
      <AdminPageShell contentClassName="flex justify-center py-20">
        <Loader2 className="animate-spin text-cookie-primary" size={40} />
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell
      title={
        <h1 className="flex items-center gap-2">
          <Percent size={28} className="text-cookie-primary" />
          Precificação
        </h1>
      }
      description="Margem, taxas, contribuição e descontos por quantidade usados na calculadora de preço."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/admin/calculadora-preco">Abrir calculadora</Link>
          </Button>
          <Button
            type="button"
            disabled={salvando}
            onClick={() => void salvar()}
            className="bg-cookie-primary hover:bg-cookie-primary-hover text-white"
          >
            {salvando ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Save size={16} />
            )}
            Salvar
          </Button>
        </div>
      }
      contentClassName="space-y-6 max-w-3xl"
    >
      <section className="rounded-2xl border bg-white dark:bg-surface-dark p-5 space-y-4">
        <h2 className="font-bold text-lg">Lucro alvo por canal (%)</h2>
        <p className="text-sm text-muted-foreground -mt-2">
          % sobre o preço de venda. No iFood use um lucro menor (ex.: 20–25%).
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="margem-loja">Lucro loja (%)</Label>
            <Input
              id="margem-loja"
              inputMode="decimal"
              value={margemLoja}
              onChange={(e) => setMargemLoja(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="margem-delivery">Lucro delivery (%)</Label>
            <Input
              id="margem-delivery"
              inputMode="decimal"
              value={margemDelivery}
              onChange={(e) => setMargemDelivery(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="margem-ifood">Lucro iFood (%)</Label>
            <Input
              id="margem-ifood"
              inputMode="decimal"
              value={margemIfood}
              onChange={(e) => setMargemIfood(e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border bg-white dark:bg-surface-dark p-5 space-y-4">
        <h2 className="font-bold text-lg">Taxas (%)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="taxa-cartao">Taxa de cartão (%)</Label>
            <Input
              id="taxa-cartao"
              inputMode="decimal"
              value={taxaCartao}
              onChange={(e) => setTaxaCartao(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Usada na loja e somada no delivery. Não entra no iFood.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="taxa-delivery">Taxa delivery / gateway (%)</Label>
            <Input
              id="taxa-delivery"
              inputMode="decimal"
              value={taxaDelivery}
              onChange={(e) => setTaxaDelivery(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Soma-se ao cartão só no canal delivery.
            </p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="taxa-ifood">Comissão iFood completa (%)</Label>
            <Input
              id="taxa-ifood"
              inputMode="decimal"
              value={taxaIfood}
              onChange={(e) => setTaxaIfood(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              All-in do iFood (comissão + adicionais). Não soma a taxa de cartão.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border bg-white dark:bg-surface-dark p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h2 className="font-bold text-lg flex items-center gap-2">
              <Wallet size={18} />
              Contribuição da empresa
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Despesas fixas (recorrências ativas):{" "}
              <strong>{formatarMoeda(despesasFixas)}</strong>/mês ·{" "}
              <Link
                to="/admin/despesas"
                className="text-cookie-primary hover:underline"
              >
                gerenciar despesas
              </Link>
            </p>
          </div>
          <Button type="button" variant="outline" onClick={aplicarSugestao}>
            Calcular a partir das despesas
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="fat">Faturamento esperado (R$/mês)</Label>
            <Input
              id="fat"
              inputMode="decimal"
              value={faturamento}
              onChange={(e) => setFaturamento(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Sugestão %: {sugestao.pct.toFixed(2)}%
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qtd">Qtd. de itens esperada / mês</Label>
            <Input
              id="qtd"
              inputMode="decimal"
              value={qtdItens}
              onChange={(e) => setQtdItens(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Sugestão R$/un: {formatarMoeda(sugestao.rsUnidade)}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Modo ativo na fórmula</Label>
          <div className="flex flex-col sm:flex-row gap-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="modo-contrib"
                checked={modo === "pct_faturamento"}
                onChange={() => setModo("pct_faturamento")}
              />
              % sobre o preço de venda
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="modo-contrib"
                checked={modo === "custo_por_unidade"}
                onChange={() => setModo("custo_por_unidade")}
              />
              R$ por unidade (soma no custo)
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="contrib-pct">Contribuição (%)</Label>
            <Input
              id="contrib-pct"
              inputMode="decimal"
              value={contribuicaoPct}
              onChange={(e) => setContribuicaoPct(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contrib-rs">Contribuição (R$/un)</Label>
            <Input
              id="contrib-rs"
              inputMode="decimal"
              value={contribuicaoRs}
              onChange={(e) => setContribuicaoRs(e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border bg-white dark:bg-surface-dark p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-lg">Desconto por quantidade</h2>
            <p className="text-sm text-muted-foreground">
              Faixas usadas na simulação da calculadora.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setFaixas((prev) => [...prev, { qtd_min: 5, desconto_pct: 5 }])
            }
          >
            <Plus size={16} />
            Faixa
          </Button>
        </div>

        {faixas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma faixa cadastrada.</p>
        ) : (
          <div className="space-y-2">
            {faixas.map((faixa, idx) => (
              <div
                key={`${faixa.qtd_min}-${idx}`}
                className="flex flex-wrap items-end gap-2"
              >
                <div className="space-y-1.5">
                  <Label>A partir de (un)</Label>
                  <Input
                    className="w-28"
                    inputMode="numeric"
                    value={String(faixa.qtd_min)}
                    onChange={(e) => {
                      const v = Number(e.target.value) || 0;
                      setFaixas((prev) =>
                        prev.map((f, i) =>
                          i === idx ? { ...f, qtd_min: v } : f,
                        ),
                      );
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Desconto (%)</Label>
                  <Input
                    className="w-28"
                    inputMode="decimal"
                    value={String(faixa.desconto_pct)}
                    onChange={(e) => {
                      const v = numInput(e.target.value);
                      setFaixas((prev) =>
                        prev.map((f, i) =>
                          i === idx ? { ...f, desconto_pct: v } : f,
                        ),
                      );
                    }}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title="Remover faixa"
                  onClick={() =>
                    setFaixas((prev) => prev.filter((_, i) => i !== idx))
                  }
                >
                  <Trash2 size={16} className="text-red-600" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </AdminPageShell>
  );
}
