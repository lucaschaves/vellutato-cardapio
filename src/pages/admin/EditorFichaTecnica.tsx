import {
  ArrowLeft,
  Loader2,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { AdminPageShell } from "../../components/AdminPageShell";
import { ModalConfirmacao } from "../../components/ModalConfirmacao";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  custoExplosao,
  explodeFicha,
  ESCOPOS_EMBALAGEM,
  formatarCustoFicha,
  rotuloEscopo,
  rotuloStatusFicha,
  rotuloTipoFicha,
  STATUS_FICHA,
  TIPOS_FICHA,
  unidadesParaTipoInsumo,
  type EscopoEmbalagem,
  type FichaTecnica,
  type FichaTecnicaItem,
  type StatusFicha,
  type TipoFicha,
  type UnidadeFicha,
} from "../../lib/fichasTecnicas";
import {
  parseDecimalBr,
  rotuloTipoInsumo,
  type Insumo,
} from "../../lib/insumos";
import { supabase } from "../../lib/supabase";

type LinhaRascunho = {
  key: string;
  kind: "insumo" | "ficha";
  insumo_id: string;
  ficha_filha_id: string;
  quantidade: string;
  unidade: UnidadeFicha;
  observacao: string;
};

function novaLinha(kind: "insumo" | "ficha"): LinhaRascunho {
  return {
    key: `${kind}-${crypto.randomUUID()}`,
    kind,
    insumo_id: "",
    ficha_filha_id: "",
    quantidade: "1",
    unidade: "g",
    observacao: "",
  };
}

function mapFicha(row: Record<string, unknown>): FichaTecnica {
  return {
    id: String(row.id),
    nome: String(row.nome ?? ""),
    descricao: row.descricao != null ? String(row.descricao) : null,
    observacao: row.observacao != null ? String(row.observacao) : null,
    tipo: row.tipo as TipoFicha,
    status: row.status as StatusFicha,
    rendimento: Number(row.rendimento ?? 1),
    escopo: (row.escopo as EscopoEmbalagem | null) ?? null,
    custo_calculado:
      row.custo_calculado == null ? null : Number(row.custo_calculado),
    custo_atualizado_em:
      row.custo_atualizado_em != null ? String(row.custo_atualizado_em) : null,
    criado_em: String(row.criado_em ?? ""),
    atualizado_em: String(row.atualizado_em ?? ""),
  };
}

export function EditorFichaTecnica() {
  const { id } = useParams();
  const navigate = useNavigate();
  const novo = !id || id === "nova";

  const [carregando, setCarregando] = useState(!novo);
  const [salvando, setSalvando] = useState(false);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [observacao, setObservacao] = useState("");
  const [tipo, setTipo] = useState<TipoFicha>("produto");
  const [status, setStatus] = useState<StatusFicha>("rascunho");
  const [rendimento, setRendimento] = useState("1");
  const [escopo, setEscopo] = useState<EscopoEmbalagem>("item");
  const [linhas, setLinhas] = useState<LinhaRascunho[]>([novaLinha("insumo")]);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [fichas, setFichas] = useState<FichaTecnica[]>([]);
  const [itensTodas, setItensTodas] = useState<FichaTecnicaItem[]>([]);
  const [confirmarExcluir, setConfirmarExcluir] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  useEffect(() => {
    void carregarAux();
  }, []);

  useEffect(() => {
    if (novo) return;
    void carregarFicha(id as string);
  }, [id, novo]);

  const carregarAux = async () => {
    const [{ data: ins }, { data: fs }, { data: its }] = await Promise.all([
      supabase.from("insumos").select("*").eq("ativo", true).order("nome"),
      supabase.from("fichas_tecnicas").select("*").order("nome"),
      supabase.from("ficha_tecnica_itens").select("*"),
    ]);
    setInsumos((ins ?? []) as Insumo[]);
    setFichas(((fs ?? []) as Record<string, unknown>[]).map(mapFicha));
    setItensTodas(
      ((its ?? []) as Record<string, unknown>[]).map((row) => ({
        id: String(row.id),
        ficha_id: String(row.ficha_id),
        insumo_id: row.insumo_id ? String(row.insumo_id) : null,
        ficha_filha_id: row.ficha_filha_id ? String(row.ficha_filha_id) : null,
        quantidade: Number(row.quantidade),
        unidade: (row.unidade as UnidadeFicha | null) ?? null,
        observacao: row.observacao != null ? String(row.observacao) : null,
      })),
    );
  };

  const carregarFicha = async (fichaId: string) => {
    try {
      setCarregando(true);
      const { data, error } = await supabase
        .from("fichas_tecnicas")
        .select("*")
        .eq("id", fichaId)
        .single();
      if (error) throw new Error(error.message);
      const f = mapFicha(data as Record<string, unknown>);
      setNome(f.nome);
      setDescricao(f.descricao ?? "");
      setObservacao(f.observacao ?? "");
      setTipo(f.tipo);
      setStatus(f.status);
      setRendimento(String(f.rendimento).replace(".", ","));
      setEscopo(f.escopo ?? "item");

      const { data: itens, error: errItens } = await supabase
        .from("ficha_tecnica_itens")
        .select("*")
        .eq("ficha_id", fichaId);
      if (errItens) throw new Error(errItens.message);
      const mapped = (itens ?? []).map((row: Record<string, unknown>) => {
        const kind: "insumo" | "ficha" = row.ficha_filha_id ? "ficha" : "insumo";
        return {
          key: String(row.id),
          kind,
          insumo_id: row.insumo_id ? String(row.insumo_id) : "",
          ficha_filha_id: row.ficha_filha_id ? String(row.ficha_filha_id) : "",
          quantidade: String(row.quantidade).replace(".", ","),
          unidade: (row.unidade as UnidadeFicha) || "g",
          observacao: row.observacao ? String(row.observacao) : "",
        } satisfies LinhaRascunho;
      });
      setLinhas(mapped.length ? mapped : [novaLinha("insumo")]);
    } catch (erro: unknown) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao carregar.");
      navigate("/admin/fichas-tecnicas");
    } finally {
      setCarregando(false);
    }
  };

  const idsUsadasComoFilha = useMemo(() => {
    const s = new Set<string>();
    for (const it of itensTodas) {
      if (it.ficha_filha_id) s.add(it.ficha_filha_id);
    }
    return s;
  }, [itensTodas]);

  const fichasFilhasOk = useMemo(() => {
    const temNeta = new Set<string>();
    for (const it of itensTodas) {
      if (it.ficha_filha_id) temNeta.add(it.ficha_id);
    }
    return fichas.filter((f) => {
      if (!novo && f.id === id) return false;
      if (temNeta.has(f.id)) return false;
      if (idsUsadasComoFilha.has(f.id) && f.id === id) return false;
      return f.status !== "arquivada";
    });
  }, [fichas, itensTodas, idsUsadasComoFilha, id, novo]);

  const preview = useMemo(() => {
    const rend = parseDecimalBr(rendimento) ?? 1;
    const fichaAtual: FichaTecnica = {
      id: id && id !== "nova" ? id : "preview",
      nome,
      descricao: null,
      observacao: null,
      tipo,
      status,
      rendimento: rend,
      escopo: tipo === "embalagem" ? escopo : null,
      custo_calculado: null,
      custo_atualizado_em: null,
      criado_em: "",
      atualizado_em: "",
    };
    const itens: FichaTecnicaItem[] = linhas.map((l, i) => ({
      id: String(i),
      ficha_id: fichaAtual.id,
      insumo_id: l.kind === "insumo" && l.insumo_id ? l.insumo_id : null,
      ficha_filha_id:
        l.kind === "ficha" && l.ficha_filha_id ? l.ficha_filha_id : null,
      quantidade: parseDecimalBr(l.quantidade) ?? 0,
      unidade: l.kind === "insumo" ? l.unidade : null,
      observacao: null,
    }));
    const fichasPorId = new Map(fichas.map((f) => [f.id, f]));
    const itensPorFicha = new Map<string, FichaTecnicaItem[]>();
    for (const it of itensTodas) {
      const arr = itensPorFicha.get(it.ficha_id) ?? [];
      arr.push(it);
      itensPorFicha.set(it.ficha_id, arr);
    }
    const insumosPorId = new Map(insumos.map((i) => [i.id, i]));
    const consumo = explodeFicha(fichaAtual, itens, 1, {
      fichasPorId,
      itensPorFicha,
      insumosPorId,
    });
    return custoExplosao(consumo, insumosPorId);
  }, [linhas, rendimento, tipo, escopo, status, nome, id, fichas, itensTodas, insumos]);

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      toast.warning("Informe o nome da ficha.");
      return;
    }
    const rend = parseDecimalBr(rendimento);
    if (rend == null || rend <= 0) {
      toast.warning("Rendimento deve ser maior que zero (porções do lote).");
      return;
    }

    const payloadItens: Array<Record<string, unknown>> = [];
    for (const l of linhas) {
      const qtd = parseDecimalBr(l.quantidade);
      if (qtd == null || qtd <= 0) continue;
      if (l.kind === "insumo") {
        if (!l.insumo_id) continue;
        payloadItens.push({
          insumo_id: l.insumo_id,
          ficha_filha_id: null,
          quantidade: qtd,
          unidade: l.unidade,
          observacao: l.observacao.trim() || null,
        });
      } else {
        if (!l.ficha_filha_id) continue;
        payloadItens.push({
          insumo_id: null,
          ficha_filha_id: l.ficha_filha_id,
          quantidade: qtd,
          unidade: null,
          observacao: l.observacao.trim() || null,
        });
      }
    }

    try {
      setSalvando(true);
      const corpo = {
        nome: nome.trim(),
        descricao: descricao.trim() || null,
        observacao: observacao.trim() || null,
        tipo,
        status,
        rendimento: rend,
        escopo: tipo === "embalagem" ? escopo : null,
        custo_calculado: preview.custo,
        custo_atualizado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
      };

      let fichaId = id && id !== "nova" ? id : "";
      if (novo) {
        const { data, error } = await supabase
          .from("fichas_tecnicas")
          .insert(corpo)
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        fichaId = data.id as string;
      } else {
        const { error } = await supabase
          .from("fichas_tecnicas")
          .update(corpo)
          .eq("id", fichaId);
        if (error) throw new Error(error.message);
        const { error: delErr } = await supabase
          .from("ficha_tecnica_itens")
          .delete()
          .eq("ficha_id", fichaId);
        if (delErr) throw new Error(delErr.message);
      }

      if (payloadItens.length) {
        const { error: insErr } = await supabase.from("ficha_tecnica_itens").insert(
          payloadItens.map((p) => ({ ...p, ficha_id: fichaId })),
        );
        if (insErr) throw new Error(insErr.message);
      }

      toast.success("Ficha salva.");
      navigate("/admin/fichas-tecnicas");
    } catch (erro: unknown) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao salvar.");
    } finally {
      setSalvando(false);
    }
  };

  const excluirFicha = async () => {
    if (!id || id === "nova") return;
    try {
      setExcluindo(true);
      const { error } = await supabase
        .from("fichas_tecnicas")
        .delete()
        .eq("id", id);
      if (error) throw new Error(error.message);
      toast.success("Ficha excluída.");
      navigate("/admin/fichas-tecnicas");
    } catch (erro: unknown) {
      toast.error(
        erro instanceof Error
          ? erro.message.includes("ficha_tecnica_itens")
            ? "Remova esta ficha como sub-receita de outra antes de excluir."
            : erro.message
          : "Falha ao excluir.",
      );
    } finally {
      setExcluindo(false);
      setConfirmarExcluir(false);
    }
  };

  if (carregando) {
    return (
      <AdminPageShell title="Ficha técnica">
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-cookie-primary" />
        </div>
      </AdminPageShell>
    );
  }

  const estaComoFilha = !novo && id ? idsUsadasComoFilha.has(id) : false;

  return (
    <AdminPageShell
      title={novo ? "Nova ficha técnica" : "Editar ficha técnica"}
      description="Quantidades são do lote. Rendimento = porções que esse lote rende."
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            asChild
          >
            <Link to="/admin/fichas-tecnicas">
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Link>
          </Button>
          {!novo && (
            <Button
              type="button"
              variant="destructive"
              onClick={() => setConfirmarExcluir(true)}
            >
              <Trash2 className="h-4 w-4" />
              Excluir
            </Button>
          )}
          <Button
            type="submit"
            form="form-ficha"
            disabled={salvando}
            className="bg-cookie-primary text-white"
          >
            {salvando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Salvar
          </Button>
        </>
      }
    >
      <form id="form-ficha" onSubmit={salvar} className="space-y-6 pb-8">
        <div className="grid gap-4 rounded-xl border bg-white p-4 dark:border-gray-800 dark:bg-surface-dark sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <select
              className="flex h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoFicha)}
            >
              {TIPOS_FICHA.map((t) => (
                <option key={t} value={t}>
                  {rotuloTipoFicha(t)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <select
              className="flex h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFicha)}
            >
              {STATUS_FICHA.map((s) => (
                <option key={s} value={s}>
                  {rotuloStatusFicha(s)}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Só ficha ativa baixa estoque. Teste pode vincular (mostra custo).
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Rendimento (porções do lote)</Label>
            <Input
              inputMode="decimal"
              value={rendimento}
              onChange={(e) => setRendimento(e.target.value)}
            />
          </div>
          {tipo === "embalagem" && (
            <div className="space-y-1.5">
              <Label>Escopo</Label>
              <select
                className="flex h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={escopo}
                onChange={(e) => setEscopo(e.target.value as EscopoEmbalagem)}
              >
                {ESCOPOS_EMBALAGEM.map((s) => (
                  <option key={s} value={s}>
                    {rotuloEscopo(s)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Descrição</Label>
            <Input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4 dark:border-gray-800 dark:bg-surface-dark">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Itens do lote</h2>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLinhas((p) => [...p, novaLinha("insumo")])}
              >
                <Plus className="h-4 w-4" />
                Insumo
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={estaComoFilha}
                onClick={() => setLinhas((p) => [...p, novaLinha("ficha")])}
              >
                <Plus className="h-4 w-4" />
                Sub-ficha
              </Button>
            </div>
          </div>
          {estaComoFilha && (
            <p className="mb-3 text-xs text-amber-700 dark:text-amber-400">
              Esta ficha já é sub-receita de outra; não pode ter sub-fichas.
            </p>
          )}

          <ul className="space-y-3">
            {linhas.map((l) => {
              const insumo = insumos.find((i) => i.id === l.insumo_id);
              const unids = insumo
                ? unidadesParaTipoInsumo(insumo.tipo)
                : (["g", "kg", "ml", "L", "un"] as UnidadeFicha[]);
              return (
                <li
                  key={l.key}
                  className="grid gap-2 rounded-lg border p-3 sm:grid-cols-12"
                >
                  <div className="sm:col-span-4">
                    {l.kind === "insumo" ? (
                      <select
                        className="flex h-10 w-full rounded-md border bg-background px-2 text-sm"
                        value={l.insumo_id}
                        onChange={(e) => {
                          const sel = insumos.find((i) => i.id === e.target.value);
                          setLinhas((prev) =>
                            prev.map((x) =>
                              x.key === l.key
                                ? {
                                    ...x,
                                    insumo_id: e.target.value,
                                    unidade: sel
                                      ? unidadesParaTipoInsumo(sel.tipo)[0]
                                      : x.unidade,
                                  }
                                : x,
                            ),
                          );
                        }}
                      >
                        <option value="">Insumo…</option>
                        {insumos.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.nome} ({rotuloTipoInsumo(i.tipo)})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <select
                        className="flex h-10 w-full rounded-md border bg-background px-2 text-sm"
                        value={l.ficha_filha_id}
                        onChange={(e) =>
                          setLinhas((prev) =>
                            prev.map((x) =>
                              x.key === l.key
                                ? { ...x, ficha_filha_id: e.target.value }
                                : x,
                            ),
                          )
                        }
                      >
                        <option value="">Sub-ficha (porções)…</option>
                        {fichasFilhasOk.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.nome} · {rotuloTipoFicha(f.tipo)}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="sm:col-span-2">
                    <Input
                      inputMode="decimal"
                      value={l.quantidade}
                      onChange={(e) =>
                        setLinhas((prev) =>
                          prev.map((x) =>
                            x.key === l.key
                              ? { ...x, quantidade: e.target.value }
                              : x,
                          ),
                        )
                      }
                      placeholder={l.kind === "ficha" ? "Porções" : "Qtd"}
                    />
                  </div>
                  {l.kind === "insumo" ? (
                    <div className="sm:col-span-2">
                      <select
                        className="flex h-10 w-full rounded-md border bg-background px-2 text-sm"
                        value={l.unidade}
                        onChange={(e) =>
                          setLinhas((prev) =>
                            prev.map((x) =>
                              x.key === l.key
                                ? { ...x, unidade: e.target.value as UnidadeFicha }
                                : x,
                            ),
                          )
                        }
                      >
                        {unids.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="flex items-center text-xs text-muted-foreground sm:col-span-2">
                      porções da sub-ficha
                    </div>
                  )}
                  <div className="sm:col-span-3">
                    <Input
                      value={l.observacao}
                      onChange={(e) =>
                        setLinhas((prev) =>
                          prev.map((x) =>
                            x.key === l.key
                              ? { ...x, observacao: e.target.value }
                              : x,
                          ),
                        )
                      }
                      placeholder="Obs."
                    />
                  </div>
                  <div className="sm:col-span-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setLinhas((prev) => prev.filter((x) => x.key !== l.key))
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="rounded-xl border bg-white p-4 text-sm dark:border-gray-800 dark:bg-surface-dark">
          <p className="font-semibold">
            Custo por porção: {formatarCustoFicha(preview.custo, preview.incompleto)}
          </p>
          <ul className="mt-2 space-y-1 text-muted-foreground">
            {preview.linhas.map((ln) => (
              <li key={ln}>{ln}</li>
            ))}
            {preview.linhas.length === 0 && (
              <li>Adicione itens para ver o custo.</li>
            )}
          </ul>
        </div>
      </form>
      <ModalConfirmacao
        aberto={confirmarExcluir}
        titulo="Excluir ficha?"
        mensagem="Produtos e adicionais vinculados ficam sem ficha. Sub-receita em outra ficha impede a exclusão."
        textoConfirmar="Excluir"
        aoConfirmar={() => void excluirFicha()}
        aoCancelar={() => setConfirmarExcluir(false)}
        carregando={excluindo}
      />
    </AdminPageShell>
  );
}
