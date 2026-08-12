import {
  Check,
  Loader2,
  Plus,
  ShoppingCart,
  Trash2,
  Warehouse,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AdminPageShell } from "../../components/AdminPageShell";
import { ModalConfirmacao } from "../../components/ModalConfirmacao";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  TIPOS_INSUMO,
  UNIDADES_INSUMO,
  formatarEquivalenteBase,
  formatarPrecoBaseInsumo,
  formatarPrecoMoeda,
  formatarQtd,
  normalizarMarcas,
  parseDecimalBr,
  precoBaseParaEmbalagem,
  precoEmbalagemParaBase,
  rotuloConteudoEmbalagem,
  rotuloUnidade,
  type Insumo,
  type TipoInsumo,
  type UnidadeConteudo,
  type UnidadeInsumo,
} from "../../lib/insumos";
import { supabase } from "../../lib/supabase";
import { cn } from "../../lib/utils";

type InsumoResumo = Pick<
  Insumo,
  | "id"
  | "nome"
  | "imagem_url"
  | "unidade"
  | "tipo"
  | "conteudo_valor"
  | "conteudo_unidade"
  | "marcas"
  | "preco_atual"
  | "ativo"
>;

type ItemLista = {
  id: string;
  lista_id: string;
  insumo_id: string;
  quantidade_planejada: number;
  quantidade_comprada: number | null;
  marcado: boolean;
  comprado: boolean;
  preco_unitario: number | null;
  observacao: string | null;
  insumo: InsumoResumo | null;
};

const SELECT_INSUMO =
  "id, nome, imagem_url, unidade, tipo, conteudo_valor, conteudo_unidade, marcas, preco_atual, ativo";

function asInsumoResumo(row: Record<string, unknown> | null): InsumoResumo | null {
  if (!row) return null;
  const tipo = TIPOS_INSUMO.includes(row.tipo as TipoInsumo)
    ? (row.tipo as TipoInsumo)
    : "contagem";
  const unidade = UNIDADES_INSUMO.includes(row.unidade as UnidadeInsumo)
    ? (row.unidade as UnidadeInsumo)
    : "unidade";
  const conteudoUn =
    row.conteudo_unidade === "g" ||
    row.conteudo_unidade === "kg" ||
    row.conteudo_unidade === "ml" ||
    row.conteudo_unidade === "L"
      ? (row.conteudo_unidade as UnidadeConteudo)
      : null;
  return {
    id: String(row.id),
    nome: String(row.nome ?? ""),
    imagem_url: (row.imagem_url as string | null) ?? null,
    unidade,
    tipo,
    conteudo_valor:
      row.conteudo_valor == null ? null : Number(row.conteudo_valor),
    conteudo_unidade: conteudoUn,
    marcas: normalizarMarcas(
      Array.isArray(row.marcas) ? (row.marcas as string[]) : [],
    ),
    preco_atual: row.preco_atual == null ? null : Number(row.preco_atual),
    ativo: Boolean(row.ativo),
  };
}

function asItemLista(row: Record<string, unknown>): ItemLista {
  const insumoRaw = row.insumo;
  const insumoObj = Array.isArray(insumoRaw)
    ? (insumoRaw[0] as Record<string, unknown> | undefined)
    : (insumoRaw as Record<string, unknown> | null);
  return {
    id: String(row.id),
    lista_id: String(row.lista_id),
    insumo_id: String(row.insumo_id),
    quantidade_planejada: Number(row.quantidade_planejada ?? 1),
    quantidade_comprada:
      row.quantidade_comprada == null ? null : Number(row.quantidade_comprada),
    marcado: Boolean(row.marcado),
    comprado: Boolean(row.comprado),
    preco_unitario:
      row.preco_unitario == null ? null : Number(row.preco_unitario),
    observacao: (row.observacao as string | null) ?? null,
    insumo: asInsumoResumo(insumoObj ?? null),
  };
}

export function ListaCompras() {
  const [listaId, setListaId] = useState<string | null>(null);
  const [itens, setItens] = useState<ItemLista[]>([]);
  const [insumos, setInsumos] = useState<InsumoResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [finalizando, setFinalizando] = useState(false);
  const [insumoParaAdd, setInsumoParaAdd] = useState("");
  const [qtdParaAdd, setQtdParaAdd] = useState("1");
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [itemRemover, setItemRemover] = useState<ItemLista | null>(null);
  const [confirmacaoFinalizar, setConfirmacaoFinalizar] = useState<
    string | null
  >(null);

  const carregar = useCallback(async () => {
    try {
      setCarregando(true);

      const { data: insumosData, error: erroInsumos } = await supabase
        .from("insumos")
        .select(SELECT_INSUMO)
        .eq("ativo", true)
        .order("nome", { ascending: true });
      if (erroInsumos) throw new Error(erroInsumos.message);
      setInsumos(
        ((insumosData ?? []) as Record<string, unknown>[])
          .map((r) => asInsumoResumo(r))
          .filter((x): x is InsumoResumo => x != null),
      );

      let { data: lista } = await supabase
        .from("lista_compras")
        .select("id")
        .eq("status", "aberta")
        .order("criado_em", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!lista) {
        const { data: nova, error } = await supabase
          .from("lista_compras")
          .insert({ status: "aberta", titulo: "Lista de compras" })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        lista = nova;
      }

      setListaId(lista.id);

      const { data: itensData, error: erroItens } = await supabase
        .from("lista_compras_itens")
        .select(
          `
          id, lista_id, insumo_id, quantidade_planejada, quantidade_comprada,
          marcado, comprado, preco_unitario, observacao,
          insumo:insumos!lista_compras_itens_insumo_id_fkey (
            ${SELECT_INSUMO}
          )
        `,
        )
        .eq("lista_id", lista.id)
        .eq("comprado", false)
        .order("criado_em", { ascending: true });

      if (erroItens) throw new Error(erroItens.message);
      setItens(
        ((itensData ?? []) as unknown as Record<string, unknown>[]).map(
          asItemLista,
        ),
      );
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error("[ERRO - LISTA COMPRAS]", mensagem);
      toast.error("Falha ao carregar a lista de compras.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const idsNaLista = useMemo(
    () => new Set(itens.map((i) => i.insumo_id)),
    [itens],
  );

  const disponiveisParaAdd = useMemo(
    () => insumos.filter((i) => !idsNaLista.has(i.id)),
    [insumos, idsNaLista],
  );

  const atualizarItem = async (
    itemId: string,
    patch: Partial<{
      marcado: boolean;
      quantidade_planejada: number;
      quantidade_comprada: number | null;
      preco_unitario: number | null;
    }>,
  ) => {
    try {
      setSalvandoId(itemId);
      const { error } = await supabase
        .from("lista_compras_itens")
        .update(patch)
        .eq("id", itemId);
      if (error) throw new Error(error.message);
      setItens((prev) =>
        prev.map((i) => (i.id === itemId ? { ...i, ...patch } : i)),
      );
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      toast.error(mensagem || "Não foi possível atualizar o item.");
    } finally {
      setSalvandoId(null);
    }
  };

  const adicionarItem = async () => {
    if (!listaId || !insumoParaAdd) {
      toast.warning("Selecione um insumo.");
      return;
    }
    const qtd = parseDecimalBr(qtdParaAdd);
    if (qtd == null || qtd <= 0) {
      toast.warning("Quantidade inválida.");
      return;
    }

    try {
      const { data, error } = await supabase
        .from("lista_compras_itens")
        .insert({
          lista_id: listaId,
          insumo_id: insumoParaAdd,
          quantidade_planejada: qtd,
        })
        .select(
          `
          id, lista_id, insumo_id, quantidade_planejada, quantidade_comprada,
          marcado, comprado, preco_unitario, observacao,
          insumo:insumos!lista_compras_itens_insumo_id_fkey (
            ${SELECT_INSUMO}
          )
        `,
        )
        .single();

      if (error) throw new Error(error.message);
      setItens((prev) => [...prev, asItemLista(data as unknown as Record<string, unknown>)]);
      setInsumoParaAdd("");
      setQtdParaAdd("1");
      toast.success("Item adicionado.");
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      toast.error(mensagem || "Erro ao adicionar.");
    }
  };

  const removerItem = async (item: ItemLista) => {
    try {
      const { error } = await supabase
        .from("lista_compras_itens")
        .delete()
        .eq("id", item.id);
      if (error) throw new Error(error.message);
      setItens((prev) => prev.filter((i) => i.id !== item.id));
    } catch {
      toast.error("Erro ao remover item.");
    }
  };

  const finalizar = async () => {
    if (!listaId) return;
    const marcados = itens.filter((i) => i.marcado && !i.comprado);
    if (marcados.length === 0) {
      toast.warning("Marque pelo menos um item do carrinho para finalizar.");
      return;
    }

    const semPreco = marcados.filter((i) => i.preco_unitario == null);
    const msg =
      semPreco.length > 0
        ? `${marcados.length} item(ns) entram no estoque. ${semPreco.length} sem preço novo (mantém o atual). Continuar?`
        : `${marcados.length} item(ns) entram no estoque. Confirmar compra?`;

    setConfirmacaoFinalizar(msg);
  };

  const executarFinalizar = async () => {
    if (!listaId) return;
    try {
      setFinalizando(true);
      const { data, error } = await supabase.rpc("finalizar_lista_compras", {
        p_lista_id: listaId,
      });
      if (error) throw new Error(error.message);
      toast.success(
        `${data ?? itens.filter((i) => i.marcado).length} item(ns) entraram no estoque.`,
      );
      await carregar();
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      toast.error(mensagem || "Falha ao finalizar a compra.");
    } finally {
      setFinalizando(false);
    }
  };

  const marcadosCount = itens.filter((i) => i.marcado).length;

  return (
    <AdminPageShell
      title={
        <span className="flex items-center gap-2">
          <ShoppingCart className="h-5 w-5 text-cookie-primary" />
          Lista de compras
        </span>
      }
      description="Checklist do mercado: informe o preço da embalagem; o sistema grava R$/kg (ou R$/L)."
      actions={
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/insumos">
            <Warehouse className="h-4 w-4" />
            Insumos
          </Link>
        </Button>
      }
      footer={
        itens.length > 0 ? (
          <div className="flex w-full items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {marcadosCount} de {itens.length} no carrinho
            </p>
            <Button
              onClick={() => void finalizar()}
              disabled={finalizando || marcadosCount === 0}
            >
              {finalizando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Finalizar compra
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="mb-5 flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-surface-dark sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor="add-insumo">Adicionar à lista</Label>
          <select
            id="add-insumo"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={insumoParaAdd}
            onChange={(e) => setInsumoParaAdd(e.target.value)}
          >
            <option value="">Selecione…</option>
            {disponiveisParaAdd.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="w-24 space-y-1.5">
          <Label htmlFor="add-qtd">Qtd</Label>
          <Input
            id="add-qtd"
            inputMode="decimal"
            value={qtdParaAdd}
            onChange={(e) => setQtdParaAdd(e.target.value)}
          />
        </div>
        <Button type="button" onClick={() => void adicionarItem()}>
          <Plus className="h-4 w-4" />
          Adicionar
        </Button>
      </div>

      {carregando ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-cookie-primary" />
        </div>
      ) : itens.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-muted-foreground">
            Lista vazia. Adicione insumos ou use o botão do carrinho em{" "}
            <Link to="/admin/insumos" className="underline">
              Insumos
            </Link>
            .
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {itens.map((item) => {
            const busy = salvandoId === item.id;
            const marcas = item.insumo?.marcas ?? [];
            const precoStr =
              item.preco_unitario != null
                ? String(item.preco_unitario).replace(".", ",")
                : "";
            const qtd = item.quantidade_planejada;
            const eq = item.insumo
              ? formatarEquivalenteBase(qtd, item.insumo)
              : null;
            const conteudo = item.insumo
              ? rotuloConteudoEmbalagem(item.insumo)
              : null;
            const precoEmbalagemHint =
              item.insumo?.preco_atual != null
                ? precoBaseParaEmbalagem(item.insumo.preco_atual, item.insumo)
                : null;
            const precoBaseNovo =
              item.marcado &&
              item.preco_unitario != null &&
              item.insumo
                ? precoEmbalagemParaBase(item.preco_unitario, item.insumo)
                : null;

            return (
              <li
                key={item.id}
                className={cn(
                  "rounded-xl border bg-white p-3 transition-colors dark:bg-surface-dark",
                  item.marcado
                    ? "border-emerald-300 dark:border-emerald-800"
                    : "border-gray-200 dark:border-gray-800",
                )}
              >
                <div className="flex gap-3">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void atualizarItem(item.id, { marcado: !item.marcado })
                    }
                    className={cn(
                      "mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
                      item.marcado
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-gray-300 dark:border-gray-600",
                    )}
                    aria-label={item.marcado ? "Desmarcar" : "Marcar no carrinho"}
                  >
                    {item.marcado ? <Check className="h-4 w-4" /> : null}
                  </button>

                  <div className="h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-900">
                    {item.insumo?.imagem_url ? (
                      <img
                        src={item.insumo.imagem_url}
                        alt={item.insumo.nome}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-gray-400">
                        <Warehouse className="h-7 w-7" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p
                          className={cn(
                            "font-semibold text-gray-900 dark:text-white",
                            item.marcado && "line-through opacity-70",
                          )}
                        >
                          {item.insumo?.nome || "Insumo"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatarQtd(qtd)}{" "}
                          {rotuloUnidade(
                            item.insumo?.unidade || "unidade",
                            qtd,
                          )}
                          {eq ? ` (${eq})` : ""}
                          {conteudo ? ` · ${conteudo}` : ""}
                        </p>
                        {item.insumo?.preco_atual != null && (
                          <p className="text-xs text-muted-foreground">
                            último {formatarPrecoBaseInsumo(item.insumo)}
                            {precoEmbalagemHint != null
                              ? ` · embalagem ${formatarPrecoMoeda(precoEmbalagemHint)}`
                              : ""}
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive"
                        onClick={() => setItemRemover(item)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    {marcas.length > 0 && (
                      <div className="mt-2">
                        <p className="mb-1 text-xs font-medium text-muted-foreground">
                          Pode ser:
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {marcas.map((marca) => (
                            <Badge
                              key={marca}
                              variant="outline"
                              className="py-1"
                            >
                              {marca}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {item.marcado && (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Qtd comprada</Label>
                          <Input
                            inputMode="decimal"
                            disabled={busy}
                            defaultValue={String(
                              item.quantidade_comprada ??
                                item.quantidade_planejada,
                            ).replace(".", ",")}
                            onBlur={(e) => {
                              const n = parseDecimalBr(e.target.value);
                              if (n == null || n <= 0) return;
                              const atual =
                                item.quantidade_comprada ??
                                item.quantidade_planejada;
                              if (Math.abs(n - atual) < 0.0001) return;
                              void atualizarItem(item.id, {
                                quantidade_comprada: n,
                              });
                            }}
                          />
                          {item.insumo &&
                            formatarEquivalenteBase(
                              item.quantidade_comprada ??
                                item.quantidade_planejada,
                              item.insumo,
                            ) && (
                              <p className="text-[11px] text-muted-foreground">
                                ≈{" "}
                                {formatarEquivalenteBase(
                                  item.quantidade_comprada ??
                                    item.quantidade_planejada,
                                  item.insumo,
                                )}
                              </p>
                            )}
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">
                            Preço da embalagem (opcional)
                          </Label>
                          <Input
                            inputMode="decimal"
                            placeholder={
                              precoEmbalagemHint != null
                                ? String(precoEmbalagemHint).replace(".", ",")
                                : "mesmo preço"
                            }
                            disabled={busy}
                            defaultValue={precoStr}
                            onBlur={(e) => {
                              const raw = e.target.value.trim();
                              if (!raw) {
                                if (item.preco_unitario != null) {
                                  void atualizarItem(item.id, {
                                    preco_unitario: null,
                                  });
                                }
                                return;
                              }
                              const n = parseDecimalBr(raw);
                              if (n == null || n < 0) {
                                toast.warning("Preço inválido.");
                                return;
                              }
                              if (n === item.preco_unitario) return;
                              void atualizarItem(item.id, {
                                preco_unitario: n,
                              });
                            }}
                          />
                          {precoBaseNovo != null && item.insumo && (
                            <p className="text-[11px] text-muted-foreground">
                              = {formatarPrecoMoeda(precoBaseNovo)} /{" "}
                              {item.insumo.tipo === "peso"
                                ? "kg"
                                : item.insumo.tipo === "volume"
                                  ? "L"
                                  : "un"}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ModalConfirmacao
        aberto={itemRemover != null}
        titulo="Remover da lista?"
        mensagem={
          itemRemover
            ? `Remover "${itemRemover.insumo?.nome || "item"}" da lista?`
            : ""
        }
        textoConfirmar="Sim"
        textoCancelar="Não"
        aoCancelar={() => setItemRemover(null)}
        aoConfirmar={() => {
          const item = itemRemover;
          setItemRemover(null);
          if (item) void removerItem(item);
        }}
      />

      <ModalConfirmacao
        aberto={confirmacaoFinalizar != null}
        titulo="Finalizar compra?"
        mensagem={confirmacaoFinalizar || ""}
        textoConfirmar="Sim"
        textoCancelar="Não"
        varianteConfirmar="default"
        carregando={finalizando}
        aoCancelar={() => setConfirmacaoFinalizar(null)}
        aoConfirmar={() => {
          setConfirmacaoFinalizar(null);
          void executarFinalizar();
        }}
      />
    </AdminPageShell>
  );
}
