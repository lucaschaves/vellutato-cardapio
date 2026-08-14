import {
  AlertTriangle,
  ClipboardList,
  Loader2,
  PlusCircle,
  RefreshCw,
  Search,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AdminPageShell } from "../../components/AdminPageShell";
import { ModalConfirmacao } from "../../components/ModalConfirmacao";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../components/ui/tabs";
import { recalcularCustosFichas } from "../../lib/fichasCusto";
import {
  projetarConsumoInsumos,
  type JanelaProjecao,
  type LinhaProjecaoInsumo,
  type ProdutoComposicao,
} from "../../lib/fichasProjecao";
import {
  alertaMargemBaixa,
  custoExplosao,
  explodeFicha,
  fichaCustoDesatualizado,
  formatarCustoFicha,
  insumoPrecoDesatualizado,
  mapFichaItemRow,
  mapFichaRow,
  MARGEM_MINIMA_ALERTA_PCT,
  rotuloEscopo,
  rotuloStatusFicha,
  rotuloTipoFicha,
  type FichaTecnica,
  type FichaTecnicaItem,
  type TipoFicha,
} from "../../lib/fichasTecnicas";
import {
  formatarQtd,
  formatarQtdEstoqueBase,
  parseDecimalBr,
  rotuloUnidade,
  type Insumo,
} from "../../lib/insumos";
import { STATUS_VENDA_CONCLUIDA } from "../../lib/pedidosAdmin";
import { supabase } from "../../lib/supabase";

export function GerenciamentoFichasTecnicas() {
  const [fichas, setFichas] = useState<FichaTecnica[]>([]);
  const [itens, setItens] = useState<FichaTecnicaItem[]>([]);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [produtos, setProdutos] = useState<
    Array<ProdutoComposicao & { preco: number; tipo: string }>
  >([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<TipoFicha | "todos">("todos");
  const [usos, setUsos] = useState<Record<string, number>>({});
  const [filhasDe, setFilhasDe] = useState<Record<string, number>>({});
  const [embDelivery, setEmbDelivery] = useState("");
  const [embRetirada, setEmbRetirada] = useState("");
  const [capDelivery, setCapDelivery] = useState("4");
  const [capRetirada, setCapRetirada] = useState("4");
  const [salvandoCfg, setSalvandoCfg] = useState(false);
  const [recalcando, setRecalcando] = useState(false);
  const [fichaExcluir, setFichaExcluir] = useState<FichaTecnica | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [janela, setJanela] = useState<JanelaProjecao>(14);
  const [projecao, setProjecao] = useState<LinhaProjecaoInsumo[]>([]);
  const [carregandoProj, setCarregandoProj] = useState(false);
  const [adicionandoLista, setAdicionandoLista] = useState(false);

  useEffect(() => {
    void carregar();
  }, []);

  const carregar = async () => {
    try {
      setCarregando(true);
      const [fRes, iRes, insRes, cfg, prod, adi] = await Promise.all([
        supabase.from("fichas_tecnicas").select("*").order("nome"),
        supabase.from("ficha_tecnica_itens").select("*"),
        supabase.from("insumos").select("*"),
        supabase
          .from("loja_config")
          .select(
            "ficha_embalagem_pedido_delivery_id, ficha_embalagem_pedido_retirada_id, capacidade_embalagem_pedido_delivery, capacidade_embalagem_pedido_retirada",
          )
          .eq("id", 1)
          .maybeSingle(),
        supabase
          .from("produtos")
          .select(
            "id, tipo, preco, ficha_produto_id, ficha_embalagem_viagem_id, ficha_embalagem_delivery_id, ficha_embalagem_levar_rapido_id",
          ),
        supabase.from("adicionais").select("ficha_id"),
      ]);
      if (fRes.error) throw new Error(fRes.error.message);
      const lista = ((fRes.data ?? []) as Record<string, unknown>[]).map(mapFichaRow);
      setFichas(lista);
      setItens(((iRes.data ?? []) as Record<string, unknown>[]).map(mapFichaItemRow));
      setInsumos((insRes.data ?? []) as Insumo[]);
      setProdutos(
        ((prod.data ?? []) as Record<string, unknown>[]).map((row) => ({
          id: String(row.id),
          tipo: String(row.tipo ?? "simples"),
          preco: Number(row.preco ?? 0),
          ficha_produto_id: row.ficha_produto_id
            ? String(row.ficha_produto_id)
            : null,
          ficha_embalagem_viagem_id: row.ficha_embalagem_viagem_id
            ? String(row.ficha_embalagem_viagem_id)
            : null,
          ficha_embalagem_delivery_id: row.ficha_embalagem_delivery_id
            ? String(row.ficha_embalagem_delivery_id)
            : null,
          ficha_embalagem_levar_rapido_id: row.ficha_embalagem_levar_rapido_id
            ? String(row.ficha_embalagem_levar_rapido_id)
            : null,
        })),
      );

      const cont: Record<string, number> = {};
      const bump = (id: string | null | undefined) => {
        if (!id) return;
        cont[id] = (cont[id] ?? 0) + 1;
      };
      for (const p of prod.data ?? []) {
        const row = p as Record<string, unknown>;
        bump(row.ficha_produto_id as string);
        bump(row.ficha_embalagem_viagem_id as string);
        bump(row.ficha_embalagem_delivery_id as string);
        bump(row.ficha_embalagem_levar_rapido_id as string);
      }
      for (const a of adi.data ?? []) {
        bump((a as { ficha_id?: string }).ficha_id);
      }
      setUsos(cont);

      const filhos: Record<string, number> = {};
      for (const it of iRes.data ?? []) {
        const fid = (it as { ficha_filha_id?: string }).ficha_filha_id;
        if (fid) filhos[fid] = (filhos[fid] ?? 0) + 1;
      }
      setFilhasDe(filhos);

      const c = cfg.data as Record<string, unknown> | null;
      if (c) {
        setEmbDelivery(String(c.ficha_embalagem_pedido_delivery_id ?? ""));
        setEmbRetirada(String(c.ficha_embalagem_pedido_retirada_id ?? ""));
        setCapDelivery(String(c.capacidade_embalagem_pedido_delivery ?? 4));
        setCapRetirada(String(c.capacidade_embalagem_pedido_retirada ?? 4));
      }
    } catch (erro: unknown) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao carregar.");
    } finally {
      setCarregando(false);
    }
  };

  const fichasPorId = useMemo(
    () => new Map(fichas.map((f) => [f.id, f])),
    [fichas],
  );
  const itensPorFicha = useMemo(() => {
    const m = new Map<string, FichaTecnicaItem[]>();
    for (const it of itens) {
      const arr = m.get(it.ficha_id) ?? [];
      arr.push(it);
      m.set(it.ficha_id, arr);
    }
    return m;
  }, [itens]);
  const insumosPorId = useMemo(
    () => new Map(insumos.map((i) => [i.id, i])),
    [insumos],
  );

  const alertasPorFicha = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const ficha of fichas) {
      const consumo = explodeFicha(
        ficha,
        itensPorFicha.get(ficha.id) ?? [],
        1,
        { fichasPorId, itensPorFicha, insumosPorId },
      );
      const vivo = custoExplosao(consumo, insumosPorId);
      const tags: string[] = [];
      if (vivo.incompleto) tags.push("Custo incompleto");
      if (fichaCustoDesatualizado(ficha, vivo.custo, vivo.incompleto)) {
        tags.push("Preço desatualizado");
      }
      for (const c of consumo) {
        const ins = insumosPorId.get(c.insumo_id);
        if (ins && insumoPrecoDesatualizado(ins)) {
          tags.push("Insumo sem preço recente");
          break;
        }
      }
      if (ficha.tipo === "produto" && vivo.custo != null) {
        const ligados = produtos.filter((p) => p.ficha_produto_id === ficha.id);
        if (
          ligados.some((p) => alertaMargemBaixa(p.preco, vivo.custo))
        ) {
          tags.push(`Margem < ${MARGEM_MINIMA_ALERTA_PCT}%`);
        }
      }
      if (tags.length) out[ficha.id] = [...new Set(tags)];
    }
    return out;
  }, [fichas, itensPorFicha, fichasPorId, insumosPorId, produtos]);

  const salvarConfig = async () => {
    const nD = parseDecimalBr(capDelivery);
    const nR = parseDecimalBr(capRetirada);
    if (nD == null || nD < 1 || nR == null || nR < 1) {
      toast.warning("Capacidade N deve ser ≥ 1.");
      return;
    }
    try {
      setSalvandoCfg(true);
      const { error } = await supabase
        .from("loja_config")
        .update({
          ficha_embalagem_pedido_delivery_id: embDelivery || null,
          ficha_embalagem_pedido_retirada_id: embRetirada || null,
          capacidade_embalagem_pedido_delivery: Math.round(nD),
          capacidade_embalagem_pedido_retirada: Math.round(nR),
          atualizado_em: new Date().toISOString(),
        })
        .eq("id", 1);
      if (error) throw new Error(error.message);
      toast.success("Sacola/caixa salva.");
    } catch (erro: unknown) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao salvar.");
    } finally {
      setSalvandoCfg(false);
    }
  };

  const recalcular = async () => {
    try {
      setRecalcando(true);
      const n = await recalcularCustosFichas();
      toast.success(`${n} ficha(s) com custo atualizado.`);
      await carregar();
    } catch (erro: unknown) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao recalcular.");
    } finally {
      setRecalcando(false);
    }
  };

  const confirmarExcluir = async () => {
    if (!fichaExcluir) return;
    if (filhasDe[fichaExcluir.id]) {
      toast.error(
        "Esta ficha é sub-receita de outra. Remova o vínculo antes de excluir.",
      );
      setFichaExcluir(null);
      return;
    }
    try {
      setExcluindo(true);
      const { error } = await supabase
        .from("fichas_tecnicas")
        .delete()
        .eq("id", fichaExcluir.id);
      if (error) throw new Error(error.message);
      toast.success("Ficha excluída.");
      setFichaExcluir(null);
      await carregar();
    } catch (erro: unknown) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao excluir.");
    } finally {
      setExcluindo(false);
    }
  };

  const carregarProjecao = async (dias: JanelaProjecao) => {
    try {
      setCarregandoProj(true);
      const inicio = new Date();
      inicio.setDate(inicio.getDate() - (dias - 1));
      inicio.setHours(0, 0, 0, 0);
      const { data: pedRaw, error: ePed } = await supabase
        .from("pedidos")
        .select("id, origem, modalidade, status, criado_em")
        .gte("criado_em", inicio.toISOString());
      if (ePed) throw new Error(ePed.message);
      const pedidos = ((pedRaw ?? []) as Record<string, unknown>[]).filter((p) =>
        STATUS_VENDA_CONCLUIDA.has(String(p.status)),
      );
      const ids = pedidos.map((p) => String(p.id));
      if (ids.length === 0) {
        setProjecao(
          projetarConsumoInsumos({
            janelaDias: dias,
            pedidos: [],
            itens: [],
            adicionaisPorItem: new Map(),
            escolhasComboPorItem: new Map(),
            produtosPorId: new Map(),
            adicionaisFichaPorId: new Map(),
            fichasPorId,
            itensPorFicha,
            insumos,
            fichaEmbPedidoDeliveryId: embDelivery || null,
            fichaEmbPedidoRetiradaId: embRetirada || null,
            capacidadeDelivery: parseDecimalBr(capDelivery) ?? 4,
            capacidadeRetirada: parseDecimalBr(capRetirada) ?? 4,
          }),
        );
        return;
      }

      const { data: itRaw, error: eIt } = await supabase
        .from("pedido_itens")
        .select("id, pedido_id, produto_id, quantidade, modo_consumo")
        .in("pedido_id", ids);
      if (eIt) throw new Error(eIt.message);
      const itemIds = ((itRaw ?? []) as Record<string, unknown>[]).map((it) =>
        String(it.id),
      );
      const [{ data: adRaw }, { data: cbRaw }, { data: adi }] = await Promise.all([
        itemIds.length
          ? supabase
              .from("pedido_item_adicionais")
              .select("pedido_item_id, adicional_id")
              .in("pedido_item_id", itemIds)
          : Promise.resolve({ data: [] as unknown[] }),
        itemIds.length
          ? supabase
              .from("pedido_item_combo_escolhas")
              .select("pedido_item_id, produto_escolhido_id")
              .in("pedido_item_id", itemIds)
          : Promise.resolve({ data: [] as unknown[] }),
        supabase.from("adicionais").select("id, ficha_id"),
      ]);

      const adicionaisPorItem = new Map<string, string[]>();
      for (const row of adRaw ?? []) {
        const r = row as { pedido_item_id: string; adicional_id: string };
        const arr = adicionaisPorItem.get(r.pedido_item_id) ?? [];
        arr.push(r.adicional_id);
        adicionaisPorItem.set(r.pedido_item_id, arr);
      }
      const escolhasComboPorItem = new Map<string, string[]>();
      for (const row of cbRaw ?? []) {
        const r = row as {
          pedido_item_id: string;
          produto_escolhido_id: string | null;
        };
        if (!r.produto_escolhido_id) continue;
        const arr = escolhasComboPorItem.get(r.pedido_item_id) ?? [];
        arr.push(r.produto_escolhido_id);
        escolhasComboPorItem.set(r.pedido_item_id, arr);
      }
      const adicionaisFichaPorId = new Map<string, string | null>();
      for (const a of adi ?? []) {
        const r = a as { id: string; ficha_id: string | null };
        adicionaisFichaPorId.set(r.id, r.ficha_id);
      }

      setProjecao(
        projetarConsumoInsumos({
          janelaDias: dias,
          pedidos: pedidos.map((p) => ({
            id: String(p.id),
            origem: String(p.origem),
            modalidade: p.modalidade != null ? String(p.modalidade) : null,
          })),
          itens: ((itRaw ?? []) as Record<string, unknown>[]).map((it) => ({
            id: String(it.id),
            pedido_id: String(it.pedido_id),
            produto_id: String(it.produto_id),
            quantidade: Number(it.quantidade),
            modo_consumo: String(it.modo_consumo ?? "levar"),
          })),
          adicionaisPorItem,
          escolhasComboPorItem,
          produtosPorId: new Map(produtos.map((p) => [p.id, p])),
          adicionaisFichaPorId,
          fichasPorId,
          itensPorFicha,
          insumos,
          fichaEmbPedidoDeliveryId: embDelivery || null,
          fichaEmbPedidoRetiradaId: embRetirada || null,
          capacidadeDelivery: parseDecimalBr(capDelivery) ?? 4,
          capacidadeRetirada: parseDecimalBr(capRetirada) ?? 4,
        }),
      );
    } catch (erro: unknown) {
      toast.error(erro instanceof Error ? erro.message : "Falha na projeção.");
    } finally {
      setCarregandoProj(false);
    }
  };

  useEffect(() => {
    if (!carregando) void carregarProjecao(janela);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregando, janela, fichas, insumos, produtos]);

  const adicionarSugeridos = async () => {
    const sugeridos = projecao.filter((l) => l.qtdSugeridaBase > 0);
    if (sugeridos.length === 0) {
      toast.info("Nada a sugerir nesta janela.");
      return;
    }
    try {
      setAdicionandoLista(true);
      let listaId: string | null = null;
      const { data: aberta } = await supabase
        .from("lista_compras")
        .select("id")
        .eq("status", "aberta")
        .order("criado_em", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (aberta?.id) listaId = aberta.id;
      else {
        const { data: nova, error } = await supabase
          .from("lista_compras")
          .insert({ status: "aberta", titulo: "Sugestão (projeção)" })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        listaId = nova.id;
      }

      let ok = 0;
      let ja = 0;
      for (const l of sugeridos) {
        const qtd = Math.max(
          1,
          Math.ceil(l.qtdSugeridaEmbalagens ?? l.qtdSugeridaBase),
        );
        const { error } = await supabase.from("lista_compras_itens").insert({
          lista_id: listaId,
          insumo_id: l.insumo_id,
          quantidade_planejada: qtd,
        });
        if (error?.code === "23505") ja += 1;
        else if (error) throw new Error(error.message);
        else ok += 1;
      }
      toast.success(
        `${ok} item(ns) na lista` +
          (ja ? `; ${ja} já estavam.` : "."),
      );
    } catch (erro: unknown) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao montar lista.");
    } finally {
      setAdicionandoLista(false);
    }
  };

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return fichas.filter((f) => {
      if (filtroTipo !== "todos" && f.tipo !== filtroTipo) return false;
      if (q && !f.nome.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [fichas, busca, filtroTipo]);

  const fichasPedido = fichas.filter(
    (f) => f.tipo === "embalagem" && f.escopo === "pedido",
  );
  const insumosStale = insumos.filter((i) => i.ativo && insumoPrecoDesatualizado(i));

  return (
    <AdminPageShell
      title={
        <span className="flex items-center gap-2">
          <ClipboardList className="text-cookie-primary" />
          Fichas técnicas
        </span>
      }
      description="Receitas, custo, alertas e projeção de insumos."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={recalcando}
            onClick={() => void recalcular()}
          >
            {recalcando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Recalcular custos
          </Button>
          <Button asChild className="bg-cookie-primary text-white">
            <Link to="/admin/fichas-tecnicas/nova">
              <PlusCircle className="h-4 w-4" />
              Nova ficha
            </Link>
          </Button>
        </div>
      }
    >
      <Tabs defaultValue="biblioteca" className="pb-8">
        <TabsList>
          <TabsTrigger value="biblioteca">Biblioteca</TabsTrigger>
          <TabsTrigger value="projecao">Projeção</TabsTrigger>
        </TabsList>

        <TabsContent value="biblioteca" className="space-y-6">
          {insumosStale.length > 0 && (
            <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {insumosStale.length} insumo(s) sem preço recente (mais de 30
              dias). Atualize em Insumos e recálcule os custos.
            </div>
          )}

          <div className="rounded-xl border bg-white p-4 dark:border-gray-800 dark:bg-surface-dark">
            <h2 className="mb-3 font-semibold">Sacola / caixa do pedido</h2>
            <p className="mb-4 text-xs text-muted-foreground">
              Quantidade de sacolas = teto (itens embaláveis ÷ N). Não vale para
              mesa / comer na loja.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Delivery (entrega)</Label>
                <select
                  className="flex h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={embDelivery}
                  onChange={(e) => setEmbDelivery(e.target.value)}
                >
                  <option value="">Sem ficha</option>
                  {fichasPedido.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}
                    </option>
                  ))}
                </select>
                <Input
                  value={capDelivery}
                  onChange={(e) => setCapDelivery(e.target.value)}
                  placeholder="N itens por sacola"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Retirada</Label>
                <select
                  className="flex h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={embRetirada}
                  onChange={(e) => setEmbRetirada(e.target.value)}
                >
                  <option value="">Sem ficha</option>
                  {fichasPedido.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}
                    </option>
                  ))}
                </select>
                <Input
                  value={capRetirada}
                  onChange={(e) => setCapRetirada(e.target.value)}
                  placeholder="N itens por sacola"
                />
              </div>
            </div>
            <Button
              type="button"
              className="mt-3"
              disabled={salvandoCfg}
              onClick={() => void salvarConfig()}
            >
              {salvandoCfg ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Salvar sacola
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-48 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <select
              className="flex h-10 rounded-md border bg-background px-3 text-sm"
              value={filtroTipo}
              onChange={(e) =>
                setFiltroTipo(e.target.value as TipoFicha | "todos")
              }
            >
              <option value="todos">Todos os tipos</option>
              <option value="produto">Produto</option>
              <option value="adicional">Adicional</option>
              <option value="embalagem">Embalagem</option>
            </select>
          </div>

          {carregando ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-cookie-primary" />
            </div>
          ) : filtradas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma ficha ainda.</p>
          ) : (
            <ul className="divide-y rounded-xl border bg-white dark:border-gray-800 dark:bg-surface-dark">
              {filtradas.map((f) => (
                <li
                  key={f.id}
                  className="flex items-stretch gap-1 px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-900/40"
                >
                  <Link
                    to={`/admin/fichas-tecnicas/${f.id}`}
                    className="min-w-0 flex-1 px-2 py-2"
                  >
                    <p className="font-medium">{f.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {rotuloTipoFicha(f.tipo)}
                      {f.escopo ? ` · ${rotuloEscopo(f.escopo)}` : ""} ·{" "}
                      {rotuloStatusFicha(f.status)} · rend. {f.rendimento}
                      {usos[f.id] ? ` · usada em ${usos[f.id]}` : ""}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(alertasPorFicha[f.id] ?? []).map((t) => (
                        <Badge
                          key={t}
                          variant="destructive"
                          className="text-[0.625rem]"
                        >
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </Link>
                  <div className="flex shrink-0 items-center gap-1 pr-1">
                    <span className="text-sm tabular-nums">
                      {formatarCustoFicha(f.custo_calculado)}
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      title="Excluir"
                      onClick={() => setFichaExcluir(f)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="projecao" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-1.5">
              <Label>Janela de vendas</Label>
              <select
                className="flex h-10 rounded-md border bg-background px-3 text-sm"
                value={janela}
                onChange={(e) => setJanela(Number(e.target.value) as JanelaProjecao)}
              >
                <option value={7}>7 dias</option>
                <option value={14}>14 dias</option>
                <option value={30}>30 dias</option>
              </select>
            </div>
            <Button
              type="button"
              disabled={adicionandoLista || projecao.every((l) => l.qtdSugeridaBase <= 0)}
              onClick={() => void adicionarSugeridos()}
            >
              {adicionandoLista ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShoppingCart className="h-4 w-4" />
              )}
              Adicionar sugeridos à lista
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Média diária com fichas ativas e mix real de adicionais. Sugestão =
            cobrir 7 dias ou o mínimo, o que for maior.
          </p>
          {carregandoProj ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-cookie-primary" />
            </div>
          ) : projecao.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sem consumo projetado nesta janela (cadastre fichas ativas e
              vendas concluídas).
            </p>
          ) : (
            <ul className="divide-y rounded-xl border bg-white dark:border-gray-800 dark:bg-surface-dark">
              {projecao.map((l) => (
                <li
                  key={l.insumo_id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                >
                  <div>
                    <p className="font-medium">{l.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatarQtdEstoqueBase(l.consumoDia, insumosPorId.get(l.insumo_id)?.tipo ?? "contagem")}
                      /dia · estoque{" "}
                      {formatarQtdEstoqueBase(
                        l.estoque,
                        insumosPorId.get(l.insumo_id)?.tipo ?? "contagem",
                      )}
                      {l.diasRestantes != null
                        ? ` · ~${formatarQtd(l.diasRestantes, 1)} dia(s)`
                        : " · sem demanda"}
                    </p>
                    <div className="mt-1 flex gap-1">
                      {l.abaixoMinimo && (
                        <Badge variant="destructive" className="text-[0.625rem]">
                          Abaixo do mínimo
                        </Badge>
                      )}
                      {l.alertaDias && (
                        <Badge variant="destructive" className="text-[0.625rem]">
                          Acaba em breve
                        </Badge>
                      )}
                    </div>
                  </div>
                  <span className="text-sm">
                    {l.qtdSugeridaBase > 0
                      ? l.qtdSugeridaEmbalagens != null
                        ? `sugerir ${formatarQtd(l.qtdSugeridaEmbalagens)} ${rotuloUnidade(
                            insumosPorId.get(l.insumo_id)?.unidade ?? "unidade",
                            l.qtdSugeridaEmbalagens,
                          )}`
                        : `sugerir ${formatarQtdEstoqueBase(
                            l.qtdSugeridaBase,
                            insumosPorId.get(l.insumo_id)?.tipo ?? "contagem",
                          )}`
                      : "ok"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      <ModalConfirmacao
        aberto={Boolean(fichaExcluir)}
        titulo="Excluir ficha?"
        mensagem={
          fichaExcluir
            ? usos[fichaExcluir.id]
              ? `"${fichaExcluir.nome}" está vinculada a ${usos[fichaExcluir.id]} item(ns). A exclusão remove o vínculo.`
              : `Excluir "${fichaExcluir.nome}"?`
            : ""
        }
        textoConfirmar="Excluir"
        aoConfirmar={() => void confirmarExcluir()}
        aoCancelar={() => setFichaExcluir(null)}
        carregando={excluindo}
      />
    </AdminPageShell>
  );
}
