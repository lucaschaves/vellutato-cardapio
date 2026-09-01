import { Calculator, Loader2, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AdminPageShell } from "../../components/AdminPageShell";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { ifoodSyncProdutoSilencioso } from "../../lib/ifoodAdmin";
import { formatarMoeda } from "../../lib/pedidosAdmin";
import {
  aplicarPrecoCanal,
  buscarPrecificacaoConfig,
  CANAL_PRECIFICACAO_LABEL,
  type CanalPrecificacao,
  margemLucroCanal,
  type PrecificacaoConfig,
  precoAbaixoDoMinimo,
  precoCanalBase,
  precoMinimoCanal,
  simularDescontoVolume,
  taxasCanalPct,
} from "../../lib/precificacao";
import { supabase } from "../../lib/supabase";

type ProdutoCalc = {
  id: string;
  nome: string;
  preco: number;
  preco_delivery: number | null;
  preco_ifood: number | null;
  ficha_produto_id: string | null;
  ficha_embalagem_viagem_id: string | null;
  ficha_embalagem_delivery_id: string | null;
  ficha_embalagem_levar_rapido_id: string | null;
};

type FichaCusto = { id: string; custo_calculado: number | null };

type EmbPedidoConfig = {
  deliveryId: string | null;
  retiradaId: string | null;
  lojaId: string | null;
  capacidadeDelivery: number;
  capacidadeRetirada: number;
  capacidadeLoja: number;
};

const CANAIS: CanalPrecificacao[] = ["loja", "delivery", "ifood"];

function numInput(valor: string): number {
  const n = parseFloat(valor.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function formatCustoCampo(valor: number): string {
  return (Math.round(valor * 100) / 100).toFixed(2).replace(".", ",");
}

export function CalculadoraPreco() {
  const [carregando, setCarregando] = useState(true);
  const [config, setConfig] = useState<PrecificacaoConfig | null>(null);
  const [produtos, setProdutos] = useState<ProdutoCalc[]>([]);
  const [fichas, setFichas] = useState<Record<string, number | null>>({});
  const [embPedido, setEmbPedido] = useState<EmbPedidoConfig>({
    deliveryId: null,
    retiradaId: null,
    lojaId: null,
    capacidadeDelivery: 1,
    capacidadeRetirada: 1,
    capacidadeLoja: 1,
  });

  const [busca, setBusca] = useState("");
  const [produtoId, setProdutoId] = useState<string>("");
  const [custoManual, setCustoManual] = useState("");
  const [usarCustoManual, setUsarCustoManual] = useState(false);

  const [margemLojaSessao, setMargemLojaSessao] = useState("40");
  const [margemDeliverySessao, setMargemDeliverySessao] = useState("40");
  const [margemIfoodSessao, setMargemIfoodSessao] = useState("25");
  const [contribPctSessao, setContribPctSessao] = useState("0");
  const [contribRsSessao, setContribRsSessao] = useState("0");
  const [aplicandoCanal, setAplicandoCanal] = useState<CanalPrecificacao | null>(
    null,
  );

  const carregar = useCallback(async () => {
    try {
      setCarregando(true);
      const [cfg, prodRes, fichasRes, lojaRes] = await Promise.all([
        buscarPrecificacaoConfig(),
        supabase
          .from("produtos")
          .select(
            "id, nome, preco, preco_delivery, preco_ifood, ficha_produto_id, ficha_embalagem_viagem_id, ficha_embalagem_delivery_id, ficha_embalagem_levar_rapido_id",
          )
          .eq("ativo", true)
          .order("nome"),
        supabase.from("fichas_tecnicas").select("id, custo_calculado"),
        supabase
          .from("loja_config")
          .select(
            "ficha_embalagem_pedido_delivery_id, ficha_embalagem_pedido_retirada_id, ficha_embalagem_pedido_loja_id, capacidade_embalagem_pedido_delivery, capacidade_embalagem_pedido_retirada, capacidade_embalagem_pedido_loja",
          )
          .eq("id", 1)
          .maybeSingle(),
      ]);

      if (prodRes.error) throw prodRes.error;
      if (fichasRes.error) throw fichasRes.error;
      if (lojaRes.error) throw lojaRes.error;

      setConfig(cfg);
      setMargemLojaSessao(String(cfg.margem_lucro_loja_pct));
      setMargemDeliverySessao(String(cfg.margem_lucro_delivery_pct));
      setMargemIfoodSessao(String(cfg.margem_lucro_ifood_pct));
      setContribPctSessao(String(cfg.contribuicao_pct));
      setContribRsSessao(String(cfg.contribuicao_rs_unidade));
      setProdutos((prodRes.data as ProdutoCalc[]) || []);

      const map: Record<string, number | null> = {};
      for (const f of (fichasRes.data as FichaCusto[]) || []) {
        map[f.id] = f.custo_calculado;
      }
      setFichas(map);

      const loja = lojaRes.data as Record<string, unknown> | null;
      setEmbPedido({
        deliveryId: loja?.ficha_embalagem_pedido_delivery_id
          ? String(loja.ficha_embalagem_pedido_delivery_id)
          : null,
        retiradaId: loja?.ficha_embalagem_pedido_retirada_id
          ? String(loja.ficha_embalagem_pedido_retirada_id)
          : null,
        lojaId: loja?.ficha_embalagem_pedido_loja_id
          ? String(loja.ficha_embalagem_pedido_loja_id)
          : null,
        capacidadeDelivery: Math.max(
          1,
          Number(loja?.capacidade_embalagem_pedido_delivery ?? 1) || 1,
        ),
        capacidadeRetirada: Math.max(
          1,
          Number(loja?.capacidade_embalagem_pedido_retirada ?? 1) || 1,
        ),
        capacidadeLoja: Math.max(
          1,
          Number(loja?.capacidade_embalagem_pedido_loja ?? 1) || 1,
        ),
      });
    } catch (erro: unknown) {
      const msg = erro instanceof Error ? erro.message : String(erro);
      console.error("[CALCULADORA PRECO]", msg);
      toast.error("Falha ao carregar dados da calculadora.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const produtosFiltrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return produtos.slice(0, 40);
    return produtos
      .filter((p) => p.nome.toLowerCase().includes(t))
      .slice(0, 40);
  }, [produtos, busca]);

  const produto = useMemo(
    () => produtos.find((p) => p.id === produtoId) ?? null,
    [produtos, produtoId],
  );

  const custoFichaProduto = produto?.ficha_produto_id
    ? fichas[produto.ficha_produto_id] ?? null
    : null;

  /** Custo de 1 sacola/caixa do pedido (pior caso: 1 item sozinho → ceil(1/N)=1). */
  const custoSacolaPedido = useMemo(() => {
    const id = embPedido.deliveryId;
    if (!id) return 0;
    return Math.max(0, Number(fichas[id] ?? 0) || 0);
  }, [embPedido.deliveryId, fichas]);

  const custoServicoLoja = useMemo(() => {
    const id = embPedido.lojaId;
    if (!id) return 0;
    return Math.max(0, Number(fichas[id] ?? 0) || 0);
  }, [embPedido.lojaId, fichas]);

  const embalagemPorCanal = useMemo(() => {
    const zero = { loja: 0, delivery: 0, ifood: 0 };
    if (!produto) return zero;
    const embItemDelivery = produto.ficha_embalagem_delivery_id
      ? Number(fichas[produto.ficha_embalagem_delivery_id] ?? 0)
      : 0;
    const embViagem = produto.ficha_embalagem_viagem_id
      ? Number(fichas[produto.ficha_embalagem_viagem_id] ?? 0)
      : 0;
    const embItemDel = embItemDelivery || embViagem;
    const sacola = custoSacolaPedido;
    return {
      loja: custoServicoLoja,
      delivery: embItemDel + sacola,
      ifood: embItemDel + sacola,
    };
  }, [produto, fichas, custoSacolaPedido, custoServicoLoja]);

  const custoBase = useMemo(() => {
    if (usarCustoManual || !produto) return Math.round(numInput(custoManual) * 100) / 100;
    if (custoFichaProduto != null) {
      return Math.round(Number(custoFichaProduto) * 100) / 100;
    }
    return Math.round(numInput(custoManual) * 100) / 100;
  }, [usarCustoManual, produto, custoManual, custoFichaProduto]);

  const simulacoes = useMemo(() => {
    if (!config) return [];
    const margensSessao = {
      margem_lucro_loja_pct: numInput(margemLojaSessao),
      margem_lucro_delivery_pct: numInput(margemDeliverySessao),
      margem_lucro_ifood_pct: numInput(margemIfoodSessao),
      margem_lucro_pct: numInput(margemLojaSessao),
    };
    return CANAIS.map((canal) => {
      const taxas = taxasCanalPct(canal, config);
      const emb = embalagemPorCanal[canal];
      const margemPct = margemLucroCanal(canal, margensSessao);
      const resultado = precoMinimoCanal({
        custo: custoBase,
        embalagem: emb,
        margemPct,
        contribuicaoModo: config.contribuicao_modo,
        contribuicaoPct: numInput(contribPctSessao),
        contribuicaoRsUnidade: numInput(contribRsSessao),
        taxasCanalPct: taxas,
      });
      const atual = produto ? precoCanalBase(produto, canal) : null;
      const abaixo = precoAbaixoDoMinimo(atual, resultado.precoMinimo);
      const volume =
        resultado.precoMinimo != null
          ? simularDescontoVolume({
              preco: resultado.precoMinimo,
              custoTotal: resultado.custoTotal,
              faixas: config.descontos_volume,
              taxasCanalPct: taxas,
              contribuicaoModo: config.contribuicao_modo,
              contribuicaoPct: numInput(contribPctSessao),
              contribuicaoRsUnidade: numInput(contribRsSessao),
              precoMinimo: resultado.precoMinimo,
            })
          : [];
      return { canal, taxas, emb, margemPct, resultado, atual, abaixo, volume };
    });
  }, [
    config,
    custoBase,
    embalagemPorCanal,
    margemLojaSessao,
    margemDeliverySessao,
    margemIfoodSessao,
    contribPctSessao,
    contribRsSessao,
    produto,
  ]);

  const selecionarProduto = (id: string) => {
    setProdutoId(id);
    const p = produtos.find((x) => x.id === id);
    if (!p) return;
    const custo = p.ficha_produto_id
      ? fichas[p.ficha_produto_id]
      : null;
    if (custo != null) {
      setCustoManual(formatCustoCampo(custo));
      setUsarCustoManual(false);
    } else {
      setCustoManual("");
      setUsarCustoManual(true);
    }
  };

  const aplicar = async (canal: CanalPrecificacao, preco: number) => {
    if (!produto) {
      toast.error("Selecione um produto para aplicar o preço.");
      return;
    }
    try {
      setAplicandoCanal(canal);
      await aplicarPrecoCanal({
        produtoId: produto.id,
        canal,
        preco,
      });
      setProdutos((prev) =>
        prev.map((p) => {
          if (p.id !== produto.id) return p;
          if (canal === "loja") return { ...p, preco };
          if (canal === "delivery") return { ...p, preco_delivery: preco };
          return { ...p, preco_ifood: preco };
        }),
      );
      if (canal === "ifood") {
        ifoodSyncProdutoSilencioso(produto.id);
      }
      toast.success(
        `Preço ${CANAL_PRECIFICACAO_LABEL[canal]} atualizado para ${formatarMoeda(preco)}.`,
      );
    } catch (erro: unknown) {
      const msg = erro instanceof Error ? erro.message : String(erro);
      console.error("[APLICAR PRECO]", msg);
      toast.error("Não foi possível aplicar o preço.");
    } finally {
      setAplicandoCanal(null);
    }
  };

  if (carregando || !config) {
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
          <Calculator size={28} className="text-cookie-primary" />
          Calculadora de preço
        </h1>
      }
      description="Simule o preço mínimo por canal (loja, delivery, iFood) e aplique no produto."
      actions={
        <Button asChild variant="outline">
          <Link to="/admin/precificacao">Configurar taxas</Link>
        </Button>
      }
      contentClassName="space-y-6"
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="lg:col-span-1 rounded-2xl border bg-white dark:bg-surface-dark p-4 space-y-3">
          <h2 className="font-bold">Produto ou custo</h2>
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              size={16}
            />
            <Input
              className="pl-9"
              placeholder="Buscar produto…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <div className="max-h-56 overflow-y-auto rounded-xl border divide-y">
            {produtosFiltrados.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => selecionarProduto(p.id)}
                className={`flex w-full items-center justify-between gap-2 text-left px-3 py-2 text-sm hover:bg-muted/60 ${
                  produtoId === p.id ? "bg-cookie-primary/10 font-semibold" : ""
                }`}
              >
                <span className="min-w-0 truncate">{p.nome}</span>
                {p.ficha_produto_id ? (
                  <Badge
                    variant="outline"
                    className="shrink-0 text-[0.625rem] border-emerald-500 text-emerald-800 dark:text-emerald-300"
                  >
                    Com ficha
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="shrink-0 text-[0.625rem] text-amber-700 border-amber-400 dark:text-amber-300"
                  >
                    Sem ficha
                  </Badge>
                )}
              </button>
            ))}
            {produtosFiltrados.length === 0 && (
              <p className="p-3 text-sm text-muted-foreground">
                Nenhum produto encontrado.
              </p>
            )}
          </div>

          {produto && (
            <p className="text-xs text-muted-foreground">
              Selecionado: <strong>{produto.nome}</strong>
              {custoFichaProduto != null
                ? ` · custo ficha ${formatarMoeda(custoFichaProduto)}`
                : " · sem custo de ficha"}
              {custoSacolaPedido > 0 && (
                <>
                  {" "}
                  · sacola pedido {formatarMoeda(custoSacolaPedido)}
                  {embPedido.capacidadeDelivery > 1
                    ? ` (capa. ${embPedido.capacidadeDelivery}; preço usa 1 sacola — pior caso)`
                    : ""}
                </>
              )}
              {custoServicoLoja > 0 && (
                <>
                  {" "}
                  · serviço loja {formatarMoeda(custoServicoLoja)}
                  {embPedido.capacidadeLoja > 1
                    ? ` (capa. ${embPedido.capacidadeLoja})`
                    : ""}
                </>
              )}
            </p>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="custo">Custo do produto (R$)</Label>
              <label className="text-xs flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={usarCustoManual || !produto}
                  onChange={(e) => setUsarCustoManual(e.target.checked)}
                  disabled={!produto}
                />
                Manual
              </label>
            </div>
            <Input
              id="custo"
              inputMode="decimal"
              value={custoManual}
              onChange={(e) => {
                setCustoManual(e.target.value);
                setUsarCustoManual(true);
              }}
              onBlur={() => {
                const n = numInput(custoManual);
                if (Number.isFinite(n) && n >= 0) {
                  setCustoManual(formatCustoCampo(n));
                }
              }}
              placeholder="0,00"
            />
          </div>
        </section>

        <section className="lg:col-span-2 rounded-2xl border bg-white dark:bg-surface-dark p-4 space-y-4">
          <h2 className="font-bold">Parâmetros da simulação</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Lucro loja (%)</Label>
              <Input
                inputMode="decimal"
                value={margemLojaSessao}
                onChange={(e) => setMargemLojaSessao(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Lucro delivery (%)</Label>
              <Input
                inputMode="decimal"
                value={margemDeliverySessao}
                onChange={(e) => setMargemDeliverySessao(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Lucro iFood (%)</Label>
              <Input
                inputMode="decimal"
                value={margemIfoodSessao}
                onChange={(e) => setMargemIfoodSessao(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Contribuição (%)</Label>
              <Input
                inputMode="decimal"
                value={contribPctSessao}
                onChange={(e) => setContribPctSessao(e.target.value)}
                disabled={config.contribuicao_modo !== "pct_faturamento"}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Contribuição (R$/un)</Label>
              <Input
                inputMode="decimal"
                value={contribRsSessao}
                onChange={(e) => setContribRsSessao(e.target.value)}
                disabled={config.contribuicao_modo !== "custo_por_unidade"}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Modo ativo na config:{" "}
            {config.contribuicao_modo === "pct_faturamento"
              ? "% sobre o preço"
              : "R$ por unidade"}
            . Ajuste só para esta simulação — não grava na config. iFood usa só a
            comissão all-in (sem somar cartão). Delivery/iFood: embalagem de item +
            sacola do pedido. Loja: serviço (prato/talheres) configurado em Fichas.
          </p>
        </section>
      </div>

      <section className="rounded-2xl border bg-white dark:bg-surface-dark overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-4 py-3">Canal</th>
                <th className="px-4 py-3">Lucro</th>
                <th className="px-4 py-3">Custo + emb.</th>
                <th className="px-4 py-3">Taxas</th>
                <th className="px-4 py-3">Preço mínimo</th>
                <th className="px-4 py-3">Preço atual</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {simulacoes.map((s) => (
                <tr key={s.canal}>
                  <td className="px-4 py-3 font-semibold">
                    {CANAL_PRECIFICACAO_LABEL[s.canal]}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {s.margemPct.toFixed(1)}%
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatarMoeda(s.resultado.custoTotal)}
                    {s.emb > 0 && (
                      <span className="block text-xs text-muted-foreground">
                        emb. {formatarMoeda(s.emb)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{s.taxas.toFixed(2)}%</td>
                  <td className="px-4 py-3 tabular-nums font-bold text-cookie-accent">
                    {s.resultado.precoMinimo != null
                      ? formatarMoeda(s.resultado.precoMinimo)
                      : "—"}
                    {s.resultado.erro && (
                      <span className="block text-xs text-red-600 font-normal">
                        {s.resultado.erro}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {s.atual != null ? formatarMoeda(s.atual) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {s.resultado.precoMinimo == null ? (
                      <Badge variant="outline">Inválido</Badge>
                    ) : s.atual == null ? (
                      <Badge variant="outline">Sem produto</Badge>
                    ) : s.abaixo ? (
                      <Badge className="bg-red-100 text-red-800 border-0">
                        Abaixo
                      </Badge>
                    ) : (
                      <Badge className="bg-emerald-100 text-emerald-800 border-0">
                        Ok
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      type="button"
                      size="sm"
                      disabled={
                        !produto ||
                        s.resultado.precoMinimo == null ||
                        aplicandoCanal === s.canal
                      }
                      onClick={() =>
                        s.resultado.precoMinimo != null &&
                        void aplicar(s.canal, s.resultado.precoMinimo)
                      }
                    >
                      {aplicandoCanal === s.canal ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        "Aplicar"
                      )}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {config.descontos_volume.length > 0 && (
        <section className="rounded-2xl border bg-white dark:bg-surface-dark p-4 space-y-3">
          <h2 className="font-bold">Desconto por quantidade (sobre o mínimo)</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {simulacoes.map((s) => (
              <div key={s.canal} className="rounded-xl border p-3 space-y-2">
                <p className="font-semibold text-sm">
                  {CANAL_PRECIFICACAO_LABEL[s.canal]}
                </p>
                {s.volume.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sem simulação.</p>
                ) : (
                  <ul className="space-y-1.5 text-xs">
                    {s.volume.map((v) => (
                      <li
                        key={`${s.canal}-${v.qtd_min}`}
                        className="flex justify-between gap-2"
                      >
                        <span>
                          {v.qtd_min}+ un (−{v.desconto_pct}%)
                        </span>
                        <span
                          className={
                            v.abaixoDoMinimo
                              ? "text-red-600 font-semibold"
                              : "tabular-nums"
                          }
                        >
                          {formatarMoeda(v.precoLiquido)}
                          {v.margemLiquidaPct != null &&
                            ` · ${v.margemLiquidaPct.toFixed(1)}%`}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </AdminPageShell>
  );
}
