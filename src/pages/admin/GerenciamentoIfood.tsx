import {
  Link2,
  Loader2,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Store,
  UtensilsCrossed,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AdminPageShell } from "../../components/AdminPageShell";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  ifoodListarCatalogo,
  ifoodPausarLoja,
  ifoodPing,
  ifoodReabrirLoja,
  ifoodStatusLoja,
  ifoodSyncProduto,
  ifoodSyncTodos,
  listarMapeamentosIfood,
  removerMapeamentoProduto,
  salvarMapeamentoProduto,
  type IfoodCatalogItem,
  type IfoodMapRow,
} from "../../lib/ifoodAdmin";
import { supabase } from "../../lib/supabase";

type ProdutoRow = {
  id: string;
  nome: string;
  preco: number;
  preco_ifood?: number | null;
  ativo: boolean;
  controlar_estoque: boolean;
  quantidade_estoque: number;
};

type Aba = "mapeamento" | "loja" | "sync";

export function GerenciamentoIfood() {
  const [aba, setAba] = useState<Aba>("mapeamento");
  const [carregando, setCarregando] = useState(true);
  const [produtos, setProdutos] = useState<ProdutoRow[]>([]);
  const [mapas, setMapas] = useState<IfoodMapRow[]>([]);
  const [catalogo, setCatalogo] = useState<IfoodCatalogItem[]>([]);
  const [busca, setBusca] = useState("");
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<
    Record<string, { externalCode: string; ifoodItemId: string }>
  >({});
  const [lojaStatus, setLojaStatus] = useState<unknown>(null);
  const [interrupcoes, setInterrupcoes] = useState<unknown[]>([]);
  const [minutosPausa, setMinutosPausa] = useState(30);
  const [busyLoja, setBusyLoja] = useState(false);
  const [busySync, setBusySync] = useState(false);
  const [merchantOk, setMerchantOk] = useState<boolean | null>(null);

  const mapaPorProduto = useMemo(() => {
    const m = new Map<string, IfoodMapRow>();
    for (const row of mapas) {
      if (row.produto_id) m.set(row.produto_id, row);
    }
    return m;
  }, [mapas]);

  const carregarBase = useCallback(async () => {
    setCarregando(true);
    try {
      const [prods, maps] = await Promise.all([
        supabase
          .from("produtos")
          .select(
            "id, nome, preco, preco_ifood, ativo, controlar_estoque, quantidade_estoque",
          )
          .order("nome"),
        listarMapeamentosIfood(),
      ]);
      if (prods.error) throw new Error(prods.error.message);
      setProdutos((prods.data || []) as ProdutoRow[]);
      setMapas(maps);

      const d: Record<string, { externalCode: string; ifoodItemId: string }> =
        {};
      for (const p of prods.data || []) {
        const map = maps.find((m) => m.produto_id === p.id);
        d[p.id] = {
          externalCode: map?.external_code || p.id,
          ifoodItemId: map?.ifood_item_id || "",
        };
      }
      setDrafts(d);

      try {
        const ping = await ifoodPing();
        setMerchantOk(Boolean(ping.ok));
      } catch {
        setMerchantOk(false);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregarBase();
  }, [carregarBase]);

  const carregarCatalogoIfood = async () => {
    try {
      setBusySync(true);
      const itens = await ifoodListarCatalogo();
      setCatalogo(itens);
      toast.success(`${itens.length} itens no catálogo iFood`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao listar catálogo");
    } finally {
      setBusySync(false);
    }
  };

  const carregarStatusLoja = async () => {
    try {
      setBusyLoja(true);
      const data = await ifoodStatusLoja();
      setLojaStatus(data.status);
      setInterrupcoes(data.interrupcoes || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha status loja");
    } finally {
      setBusyLoja(false);
    }
  };

  useEffect(() => {
    if (aba === "loja") void carregarStatusLoja();
  }, [aba]);

  const produtosFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return produtos;
    return produtos.filter(
      (p) =>
        p.nome.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        (drafts[p.id]?.externalCode || "").toLowerCase().includes(q),
    );
  }, [produtos, busca, drafts]);

  const salvarLinha = async (produtoId: string) => {
    const d = drafts[produtoId];
    if (!d) return;
    try {
      setSalvandoId(produtoId);
      await salvarMapeamentoProduto({
        produtoId,
        externalCode: d.externalCode || produtoId,
        ifoodItemId: d.ifoodItemId || null,
      });
      toast.success("Mapeamento salvo");
      setMapas(await listarMapeamentosIfood());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSalvandoId(null);
    }
  };

  const limparLinha = async (produtoId: string) => {
    try {
      setSalvandoId(produtoId);
      await removerMapeamentoProduto(produtoId);
      setDrafts((prev) => ({
        ...prev,
        [produtoId]: { externalCode: produtoId, ifoodItemId: "" },
      }));
      setMapas(await listarMapeamentosIfood());
      toast.success("Mapeamento removido");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao remover");
    } finally {
      setSalvandoId(null);
    }
  };

  const autoVincularPorExternalCode = () => {
    if (!catalogo.length) {
      toast.warning("Carregue o catálogo iFood primeiro");
      return;
    }
    let n = 0;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const p of produtos) {
        const code = (next[p.id]?.externalCode || p.id).trim();
        const hit = catalogo.find(
          (c) =>
            (c.externalCode || "").trim() === code ||
            c.itemId === code,
        );
        if (hit) {
          next[p.id] = {
            externalCode: code,
            ifoodItemId: hit.itemId,
          };
          n++;
        }
      }
      return next;
    });
    toast.success(
      n
        ? `${n} produtos vinculados pelo externalCode`
        : "Nenhum match por externalCode",
    );
  };

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <Loader2 className="animate-spin mr-2" size={20} />
        Carregando iFood...
      </div>
    );
  }

  return (
    <AdminPageShell
      title={
        <span className="flex items-center gap-2">
          <UtensilsCrossed className="text-[#6b1d2a]" size={26} />
          iFood
        </span>
      }
      description="Mapeamento de produtos, pausa da loja, sync de preço/status e operação."
      actions={
        <span
          className={`text-xs font-bold uppercase tracking-wide px-2 py-1 rounded ${
            merchantOk
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
              : merchantOk === false
              ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
              : "bg-gray-100 text-gray-600"
          }`}
        >
          {merchantOk
            ? "API ok"
            : merchantOk === false
            ? "API offline"
            : "…"}
        </span>
      }
    >
      <div className="flex flex-wrap gap-2 mb-6">
        {(
          [
            ["mapeamento", "Mapeamento", Link2],
            ["loja", "Loja", Store],
            ["sync", "Sync preço/status", RefreshCw],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setAba(id)}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
              aba === id
                ? "bg-[#6b1d2a] text-white"
                : "bg-gray-100 dark:bg-[#1a1b1d] text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#242628]"
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {aba === "mapeamento" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar produto…"
              className="max-w-xs"
            />
            <Button
              type="button"
              variant="outline"
              disabled={busySync}
              onClick={() => void carregarCatalogoIfood()}
            >
              {busySync ? (
                <Loader2 className="animate-spin mr-2" size={16} />
              ) : null}
              Carregar catálogo iFood
              {catalogo.length ? ` (${catalogo.length})` : ""}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={autoVincularPorExternalCode}
            >
              Auto-vincular por externalCode
            </Button>
          </div>
          <p className="text-xs text-gray-500">
            Use o UUID do produto como <code>externalCode</code> no portal iFood,
            ou escolha o item iFood na lista. O <code>itemId</code> é necessário
            para sync de preço/status.
          </p>

          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-[#2a2c30]">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-[#161718] text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">Produto</th>
                  <th className="px-3 py-2">externalCode</th>
                  <th className="px-3 py-2">Item iFood</th>
                  <th className="px-3 py-2 w-40">Ações</th>
                </tr>
              </thead>
              <tbody>
                {produtosFiltrados.map((p) => {
                  const map = mapaPorProduto.get(p.id);
                  const d = drafts[p.id] || {
                    externalCode: p.id,
                    ifoodItemId: "",
                  };
                  return (
                    <tr
                      key={p.id}
                      className="border-t border-gray-100 dark:border-[#2a2c30]"
                    >
                      <td className="px-3 py-2 align-top">
                        <div className="font-semibold text-gray-900 dark:text-white">
                          {p.nome}
                        </div>
                        <div className="text-[0.65rem] text-gray-400 font-mono">
                          Loja R$ {Number(p.preco).toFixed(2)}
                          {" · iFood R$ "}
                          {Number(p.preco_ifood ?? p.preco).toFixed(2)}
                          {map ? " · mapeado" : ""}
                          {!p.ativo ? " · inativo" : ""}
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <Input
                          value={d.externalCode}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [p.id]: {
                                ...d,
                                externalCode: e.target.value,
                              },
                            }))
                          }
                          className="font-mono text-xs min-w-[12rem]"
                        />
                      </td>
                      <td className="px-3 py-2 align-top">
                        {catalogo.length > 0 ? (
                          <select
                            value={d.ifoodItemId}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [p.id]: {
                                  ...d,
                                  ifoodItemId: e.target.value,
                                },
                              }))
                            }
                            className="w-full min-w-[14rem] rounded-xl border border-gray-200 dark:border-[#2a2c30] bg-white dark:bg-[#121314] px-2 py-2 text-xs"
                          >
                            <option value="">— sem item —</option>
                            {catalogo.map((c) => (
                              <option key={c.itemId} value={c.itemId}>
                                {c.name}
                                {c.externalCode
                                  ? ` (${c.externalCode})`
                                  : ""}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <Input
                            value={d.ifoodItemId}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [p.id]: {
                                  ...d,
                                  ifoodItemId: e.target.value,
                                },
                              }))
                            }
                            placeholder="itemId UUID"
                            className="font-mono text-xs min-w-[12rem]"
                          />
                        )}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="flex flex-wrap gap-1">
                          <Button
                            type="button"
                            size="sm"
                            disabled={salvandoId === p.id}
                            onClick={() => void salvarLinha(p.id)}
                          >
                            Salvar
                          </Button>
                          {map ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={salvandoId === p.id}
                              onClick={() => void limparLinha(p.id)}
                            >
                              Limpar
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {aba === "loja" && (
        <div className="space-y-6 max-w-xl">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busyLoja}
              onClick={() => void carregarStatusLoja()}
            >
              {busyLoja ? (
                <Loader2 className="animate-spin mr-2" size={16} />
              ) : (
                <RefreshCw className="mr-2" size={16} />
              )}
              Atualizar status
            </Button>
          </div>

          <pre className="text-xs bg-gray-50 dark:bg-[#121314] rounded-xl p-3 overflow-auto max-h-48 border border-gray-200 dark:border-[#2a2c30]">
            {lojaStatus
              ? JSON.stringify(lojaStatus, null, 2)
              : "Sem dados ainda"}
          </pre>

          <div>
            <h3 className="text-sm font-bold mb-2">Interrupções ativas</h3>
            {interrupcoes.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhuma pausa no iFood.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {interrupcoes.map((raw, i) => {
                  const it = raw as {
                    id?: string;
                    description?: string;
                    start?: string;
                    end?: string;
                  };
                  return (
                    <li
                      key={it.id || i}
                      className="rounded-xl border border-gray-200 dark:border-[#2a2c30] px-3 py-2"
                    >
                      <div className="font-semibold">
                        {it.description || "Pausa"}
                      </div>
                      <div className="text-xs text-gray-500">
                        {it.start} → {it.end}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500">
                Minutos
              </label>
              <Input
                type="number"
                min={1}
                max={1440}
                value={minutosPausa}
                onChange={(e) => setMinutosPausa(Number(e.target.value) || 30)}
                className="w-28 mt-1"
              />
            </div>
            <Button
              type="button"
              disabled={busyLoja}
              onClick={async () => {
                try {
                  setBusyLoja(true);
                  await ifoodPausarLoja(minutosPausa);
                  toast.success(`iFood pausado por ${minutosPausa} min`);
                  await carregarStatusLoja();
                } catch (e) {
                  toast.error(
                    e instanceof Error ? e.message : "Falha ao pausar",
                  );
                } finally {
                  setBusyLoja(false);
                }
              }}
            >
              <PauseCircle className="mr-2" size={16} />
              Pausar no iFood
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busyLoja}
              onClick={async () => {
                try {
                  setBusyLoja(true);
                  await ifoodReabrirLoja();
                  toast.success("iFood reaberto");
                  await carregarStatusLoja();
                } catch (e) {
                  toast.error(
                    e instanceof Error ? e.message : "Falha ao reabrir",
                  );
                } finally {
                  setBusyLoja(false);
                }
              }}
            >
              <PlayCircle className="mr-2" size={16} />
              Reabrir iFood
            </Button>
          </div>
        </div>
      )}

      {aba === "sync" && (
        <div className="space-y-4 max-w-lg">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Envia preço e disponibilidade (ativo + estoque) de todos os produtos
            com <code>ifood_item_id</code> mapeado.
          </p>
          <Button
            type="button"
            disabled={busySync}
            onClick={async () => {
              try {
                setBusySync(true);
                const r = await ifoodSyncTodos();
                const ok = r.resultados.filter((x) => x.ok).length;
                const fail = r.resultados.filter((x) => !x.ok).length;
                toast.success(
                  `Sync: ${ok} ok${fail ? `, ${fail} falha(s)` : ""}`,
                );
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Falha no sync");
              } finally {
                setBusySync(false);
              }
            }}
          >
            {busySync ? (
              <Loader2 className="animate-spin mr-2" size={16} />
            ) : (
              <RefreshCw className="mr-2" size={16} />
            )}
            Sincronizar todos
          </Button>

          <div className="space-y-2">
            <h3 className="text-sm font-bold">Sync individual (mapeados)</h3>
            {produtos
              .filter((p) => mapaPorProduto.get(p.id)?.ifood_item_id)
              .map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 dark:border-[#2a2c30] px-3 py-2"
                >
                  <span className="text-sm font-medium">{p.nome}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busySync}
                    onClick={async () => {
                      try {
                        setBusySync(true);
                        const r = await ifoodSyncProduto(p.id);
                        if (r.ignorado) {
                          toast.warning(r.motivo || "Ignorado");
                        } else {
                          toast.success("Sincronizado");
                        }
                      } catch (e) {
                        toast.error(
                          e instanceof Error ? e.message : "Falha",
                        );
                      } finally {
                        setBusySync(false);
                      }
                    }}
                  >
                    Sync
                  </Button>
                </div>
              ))}
          </div>
        </div>
      )}
    </AdminPageShell>
  );
}
