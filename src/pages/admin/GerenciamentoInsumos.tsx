import {
  AlertTriangle,
  ImagePlus,
  Loader2,
  Minus,
  Pencil,
  Plus,
  PlusCircle,
  Search,
  ShoppingCart,
  Trash2,
  Warehouse,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AdminPageShell } from "../../components/AdminPageShell";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Switch } from "../../components/ui/switch";
import {
  formatarPrecoInsumo,
  insumoAbaixoDoMinimo,
  rotuloUnidade,
  UNIDADES_INSUMO,
  type Insumo,
  type UnidadeInsumo,
} from "../../lib/insumos";
import { supabase } from "../../lib/supabase";

type AlternativaRow = {
  id: string;
  alternativa_id: string;
  ordem: number;
  alternativa: Pick<Insumo, "id" | "nome" | "imagem_url" | "unidade"> | null;
};

export function GerenciamentoInsumos() {
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [alternativasPorInsumo, setAlternativasPorInsumo] = useState<
    Record<string, AlternativaRow[]>
  >({});
  const [carregando, setCarregando] = useState(true);
  const [termoBusca, setTermoBusca] = useState("");
  const [aba, setAba] = useState<"ativos" | "desativados">("ativos");
  const [processandoId, setProcessandoId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [unidade, setUnidade] = useState<UnidadeInsumo>("unidade");
  const [quantidade, setQuantidade] = useState("0");
  const [estoqueMinimo, setEstoqueMinimo] = useState("0");
  const [observacao, setObservacao] = useState("");
  const [precoAtual, setPrecoAtual] = useState("");
  const [imagemUrlAtual, setImagemUrlAtual] = useState<string | null>(null);
  const [imagemArquivo, setImagemArquivo] = useState<File | null>(null);
  const [imagemPreview, setImagemPreview] = useState<string | null>(null);
  const [alternativasSelecionadas, setAlternativasSelecionadas] = useState<
    string[]
  >([]);

  useEffect(() => {
    void carregar();
  }, []);

  useEffect(() => {
    return () => {
      if (imagemPreview) URL.revokeObjectURL(imagemPreview);
    };
  }, [imagemPreview]);

  const carregar = async () => {
    try {
      setCarregando(true);
      const [{ data, error }, { data: alts, error: erroAlts }] =
        await Promise.all([
          supabase.from("insumos").select("*").order("nome", { ascending: true }),
          supabase
            .from("insumo_alternativas")
            .select(
              "id, insumo_id, alternativa_id, ordem, alternativa:insumos!insumo_alternativas_alternativa_id_fkey ( id, nome, imagem_url, unidade )",
            )
            .order("ordem", { ascending: true }),
        ]);

      if (error) throw new Error(error.message);
      if (erroAlts) throw new Error(erroAlts.message);

      setInsumos((data as Insumo[]) || []);

      const mapa: Record<string, AlternativaRow[]> = {};
      for (const row of alts || []) {
        // Supabase tipa joins many-to-one como array; normalizamos para objeto.
        const bruto = row as {
          id: string;
          insumo_id: string;
          alternativa_id: string;
          ordem: number;
          alternativa:
            | AlternativaRow["alternativa"]
            | NonNullable<AlternativaRow["alternativa"]>[]
            | null;
        };
        const alternativa = Array.isArray(bruto.alternativa)
          ? (bruto.alternativa[0] ?? null)
          : bruto.alternativa;
        if (!mapa[bruto.insumo_id]) mapa[bruto.insumo_id] = [];
        mapa[bruto.insumo_id].push({
          id: bruto.id,
          alternativa_id: bruto.alternativa_id,
          ordem: bruto.ordem,
          alternativa,
        });
      }
      setAlternativasPorInsumo(mapa);
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error("[ERRO - INSUMOS]", mensagem);
      toast.error("Falha ao carregar insumos.");
    } finally {
      setCarregando(false);
    }
  };

  const limparFormulario = () => {
    setEditandoId(null);
    setNome("");
    setUnidade("unidade");
    setQuantidade("0");
    setEstoqueMinimo("0");
    setObservacao("");
    setPrecoAtual("");
    setImagemUrlAtual(null);
    setImagemArquivo(null);
    if (imagemPreview) URL.revokeObjectURL(imagemPreview);
    setImagemPreview(null);
    setAlternativasSelecionadas([]);
  };

  const iniciarEdicao = (item: Insumo) => {
    setEditandoId(item.id);
    setNome(item.nome);
    setUnidade(
      (UNIDADES_INSUMO.includes(item.unidade as UnidadeInsumo)
        ? item.unidade
        : "unidade") as UnidadeInsumo,
    );
    setQuantidade(String(item.quantidade_atual));
    setEstoqueMinimo(String(item.estoque_minimo));
    setObservacao(item.observacao || "");
    setPrecoAtual(
      item.preco_atual != null ? Number(item.preco_atual).toFixed(2) : "",
    );
    setImagemUrlAtual(item.imagem_url);
    setImagemArquivo(null);
    if (imagemPreview) URL.revokeObjectURL(imagemPreview);
    setImagemPreview(null);
    setAlternativasSelecionadas(
      (alternativasPorInsumo[item.id] || []).map((a) => a.alternativa_id),
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const uploadImagem = async (arquivo: File): Promise<string | null> => {
    try {
      if (arquivo.size > 5 * 1024 * 1024) {
        throw new Error("A imagem excede o limite de 5MB.");
      }
      const extensao = arquivo.name.split(".").pop();
      const nomeLimpo = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${extensao}`;
      const caminho = `insumos/${nomeLimpo}`;

      const { data, error } = await supabase.storage
        .from("cardapio-midia")
        .upload(caminho, arquivo, { cacheControl: "3600", upsert: false });

      if (error) throw new Error(error.message);

      const { data: publicUrlData } = supabase.storage
        .from("cardapio-midia")
        .getPublicUrl(data.path);

      return publicUrlData.publicUrl;
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      toast.error(`Falha ao enviar imagem: ${mensagem}`);
      return null;
    }
  };

  const salvarAlternativas = async (insumoId: string, ids: string[]) => {
    const { error: delErr } = await supabase
      .from("insumo_alternativas")
      .delete()
      .eq("insumo_id", insumoId);
    if (delErr) throw new Error(delErr.message);

    if (ids.length === 0) return;

    const rows = ids.map((alternativa_id, ordem) => ({
      insumo_id: insumoId,
      alternativa_id,
      ordem,
    }));
    const { error: insErr } = await supabase
      .from("insumo_alternativas")
      .insert(rows);
    if (insErr) throw new Error(insErr.message);
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      toast.warning("Informe o nome do insumo.");
      return;
    }

    const qtd = parseInt(quantidade, 10);
    const min = parseInt(estoqueMinimo, 10);
    if (Number.isNaN(qtd) || qtd < 0 || Number.isNaN(min) || min < 0) {
      toast.warning("Quantidade e estoque mínimo devem ser números ≥ 0.");
      return;
    }

    let preco: number | null = null;
    if (precoAtual.trim()) {
      preco = parseFloat(precoAtual.replace(",", "."));
      if (Number.isNaN(preco) || preco < 0) {
        toast.warning("Preço inválido.");
        return;
      }
    }

    try {
      setSalvando(true);

      let imagemUrl = imagemUrlAtual;
      if (imagemArquivo) {
        const url = await uploadImagem(imagemArquivo);
        if (!url) {
          setSalvando(false);
          return;
        }
        imagemUrl = url;
      }

      const payload = {
        nome: nome.trim(),
        unidade,
        estoque_minimo: min,
        observacao: observacao.trim() || null,
        imagem_url: imagemUrl,
        preco_atual: preco,
        preco_atualizado_em: preco != null ? new Date().toISOString() : null,
        atualizado_em: new Date().toISOString(),
      };

      if (editandoId) {
        const { error } = await supabase
          .from("insumos")
          .update(payload)
          .eq("id", editandoId);
        if (error) throw new Error(error.message);

        await salvarAlternativas(editandoId, alternativasSelecionadas);

        if (preco != null) {
          const atual = insumos.find((i) => i.id === editandoId);
          if (atual && Number(atual.preco_atual) !== preco) {
            await supabase.from("insumo_precos_historico").insert({
              insumo_id: editandoId,
              preco_unitario: preco,
              observacao: "Ajuste manual no cadastro",
            });
          }
        }

        toast.success("Insumo atualizado.");
      } else {
        const { data, error } = await supabase
          .from("insumos")
          .insert({ ...payload, quantidade_atual: qtd, ativo: true })
          .select("*")
          .single();
        if (error) throw new Error(error.message);

        if (data && alternativasSelecionadas.length > 0) {
          await salvarAlternativas(data.id, alternativasSelecionadas);
        }

        if (data && preco != null) {
          await supabase.from("insumo_precos_historico").insert({
            insumo_id: data.id,
            preco_unitario: preco,
            observacao: "Preço inicial",
          });
        }

        toast.success("Insumo cadastrado.");
      }

      limparFormulario();
      await carregar();
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error("[ERRO - INSUMOS] salvar:", mensagem);
      toast.error("Não foi possível salvar o insumo.");
    } finally {
      setSalvando(false);
    }
  };

  const ajustarQtd = async (insumo: Insumo, delta: number) => {
    try {
      setProcessandoId(insumo.id);
      const { data, error } = await supabase.rpc("ajustar_estoque_insumo", {
        p_insumo_id: insumo.id,
        p_delta: delta,
        p_origem: delta < 0 ? "uso" : "ajuste",
        p_observacao: delta < 0 ? "Uso registrado no admin" : "Ajuste manual",
      });
      if (error) throw new Error(error.message);

      setInsumos((prev) =>
        prev.map((i) =>
          i.id === insumo.id
            ? { ...i, quantidade_atual: Number(data) }
            : i,
        ),
      );
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      toast.error(mensagem || "Falha ao ajustar estoque.");
    } finally {
      setProcessandoId(null);
    }
  };

  const alternarAtivo = async (insumo: Insumo) => {
    try {
      setProcessandoId(insumo.id);
      const { error } = await supabase
        .from("insumos")
        .update({ ativo: !insumo.ativo, atualizado_em: new Date().toISOString() })
        .eq("id", insumo.id);
      if (error) throw new Error(error.message);
      setInsumos((prev) =>
        prev.map((i) => (i.id === insumo.id ? { ...i, ativo: !i.ativo } : i)),
      );
      toast.success(insumo.ativo ? "Insumo desativado." : "Insumo reativado.");
    } catch {
      toast.error("Erro ao alterar status.");
    } finally {
      setProcessandoId(null);
    }
  };

  const excluir = async (insumo: Insumo) => {
    if (
      !window.confirm(
        `Excluir "${insumo.nome}"? Histórico e vínculos de alternativas serão removidos.`,
      )
    ) {
      return;
    }
    try {
      const { error } = await supabase.from("insumos").delete().eq("id", insumo.id);
      if (error) throw new Error(error.message);
      if (editandoId === insumo.id) limparFormulario();
      toast.success("Insumo excluído.");
      await carregar();
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      toast.error(
        mensagem.includes("lista_compras")
          ? "Não é possível excluir: está em alguma lista de compras."
          : "Erro ao excluir.",
      );
    }
  };

  const adicionarALista = async (insumo: Insumo) => {
    try {
      setProcessandoId(insumo.id);
      let listaId: string | null = null;

      const { data: aberta } = await supabase
        .from("lista_compras")
        .select("id")
        .eq("status", "aberta")
        .order("criado_em", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (aberta?.id) {
        listaId = aberta.id;
      } else {
        const { data: nova, error } = await supabase
          .from("lista_compras")
          .insert({ status: "aberta", titulo: "Lista de compras" })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        listaId = nova.id;
      }

      const { error: itemErr } = await supabase.from("lista_compras_itens").insert({
        lista_id: listaId,
        insumo_id: insumo.id,
        quantidade_planejada: 1,
      });

      if (itemErr) {
        if (itemErr.code === "23505") {
          toast.info("Já está na lista de compras aberta.");
        } else {
          throw new Error(itemErr.message);
        }
      } else {
        toast.success("Adicionado à lista de compras.", {
          action: {
            label: "Abrir lista",
            onClick: () => {
              window.location.href = "/admin/lista-compras";
            },
          },
        });
      }
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      toast.error(mensagem || "Falha ao adicionar à lista.");
    } finally {
      setProcessandoId(null);
    }
  };

  const filtrados = useMemo(() => {
    const termo = termoBusca.trim().toLowerCase();
    return insumos.filter((i) => {
      if (aba === "ativos" ? !i.ativo : i.ativo) return false;
      if (!termo) return true;
      return i.nome.toLowerCase().includes(termo);
    });
  }, [insumos, termoBusca, aba]);

  const candidatosAlternativa = useMemo(
    () =>
      insumos.filter(
        (i) => i.ativo && i.id !== editandoId && !alternativasSelecionadas.includes(i.id),
      ),
    [insumos, editandoId, alternativasSelecionadas],
  );

  return (
    <AdminPageShell
      title={
        <span className="flex items-center gap-2">
          <Warehouse className="h-5 w-5 text-cookie-primary" />
          Insumos
        </span>
      }
      description="Controle de pacotes, latas e unidades (não é o estoque do cardápio)."
      actions={
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/lista-compras">
            <ShoppingCart className="h-4 w-4" />
            Lista de compras
          </Link>
        </Button>
      }
    >
      <form
        onSubmit={salvar}
        className="mb-6 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-surface-dark"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
            {editandoId ? "Editar insumo" : "Novo insumo"}
          </h2>
          {editandoId && (
            <Button type="button" variant="ghost" size="sm" onClick={limparFormulario}>
              <X className="h-4 w-4" />
              Cancelar
            </Button>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
            <Label htmlFor="insumo-nome">Nome</Label>
            <Input
              id="insumo-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Chocolate em pó 2kg"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="insumo-unidade">Unidade</Label>
            <select
              id="insumo-unidade"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={unidade}
              onChange={(e) => setUnidade(e.target.value as UnidadeInsumo)}
            >
              {UNIDADES_INSUMO.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>

          {!editandoId && (
            <div className="space-y-1.5">
              <Label htmlFor="insumo-qtd">Qtd. inicial</Label>
              <Input
                id="insumo-qtd"
                type="number"
                min={0}
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="insumo-min">Estoque mínimo</Label>
            <Input
              id="insumo-min"
              type="number"
              min={0}
              value={estoqueMinimo}
              onChange={(e) => setEstoqueMinimo(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="insumo-preco">Preço atual (opcional)</Label>
            <Input
              id="insumo-preco"
              inputMode="decimal"
              placeholder="0,00"
              value={precoAtual}
              onChange={(e) => setPrecoAtual(e.target.value)}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="insumo-obs">Observação</Label>
            <Input
              id="insumo-obs"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Preferir marca X, embalagem 2kg…"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
            <Label>Foto da embalagem</Label>
            <div className="flex flex-wrap items-center gap-3">
              {(imagemPreview || imagemUrlAtual) && (
                <img
                  src={imagemPreview || imagemUrlAtual || ""}
                  alt=""
                  className="h-20 w-20 rounded-lg object-cover border border-gray-200 dark:border-gray-700"
                />
              )}
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-900">
                <ImagePlus className="h-4 w-4" />
                {imagemArquivo ? "Trocar foto" : "Enviar foto"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (imagemPreview) URL.revokeObjectURL(imagemPreview);
                    setImagemArquivo(file);
                    setImagemPreview(URL.createObjectURL(file));
                  }}
                />
              </label>
            </div>
          </div>

          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
            <Label>Alternativas (podem substituir na compra)</Label>
            {alternativasSelecionadas.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {alternativasSelecionadas.map((id) => {
                  const alt = insumos.find((i) => i.id === id);
                  return (
                    <Badge key={id} variant="secondary" className="gap-1 pr-1">
                      {alt?.nome || id}
                      <button
                        type="button"
                        className="rounded p-0.5 hover:bg-black/10"
                        onClick={() =>
                          setAlternativasSelecionadas((prev) =>
                            prev.filter((x) => x !== id),
                          )
                        }
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  );
                })}
              </div>
            )}
            <select
              className="flex h-10 w-full max-w-md rounded-md border border-input bg-background px-3 text-sm"
              value=""
              onChange={(e) => {
                const id = e.target.value;
                if (!id) return;
                setAlternativasSelecionadas((prev) => [...prev, id]);
              }}
            >
              <option value="">Adicionar alternativa…</option>
              {candidatosAlternativa.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nome}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Cadastre cada marca/embalagem como insumo e vincule aqui.
            </p>
          </div>
        </div>

        <div className="mt-4">
          <Button type="submit" disabled={salvando}>
            {salvando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PlusCircle className="h-4 w-4" />
            )}
            {editandoId ? "Salvar alterações" : "Cadastrar"}
          </Button>
        </div>
      </form>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={aba === "ativos" ? "default" : "outline"}
            onClick={() => setAba("ativos")}
          >
            Ativos
          </Button>
          <Button
            type="button"
            size="sm"
            variant={aba === "desativados" ? "default" : "outline"}
            onClick={() => setAba("desativados")}
          >
            Desativados
          </Button>
        </div>
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar insumo…"
            value={termoBusca}
            onChange={(e) => setTermoBusca(e.target.value)}
          />
        </div>
      </div>

      {carregando ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-cookie-primary" />
        </div>
      ) : filtrados.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Nenhum insumo encontrado.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtrados.map((insumo) => {
            const baixo = insumoAbaixoDoMinimo(insumo);
            const alts = alternativasPorInsumo[insumo.id] || [];
            const busy = processandoId === insumo.id;

            return (
              <li
                key={insumo.id}
                className="flex gap-3 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-surface-dark"
              >
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-900">
                  {insumo.imagem_url ? (
                    <img
                      src={insumo.imagem_url}
                      alt={insumo.nome}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-gray-400">
                      <Warehouse className="h-6 w-6" />
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-gray-900 dark:text-white">
                        {insumo.nome}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {rotuloUnidade(insumo.unidade)} ·{" "}
                        {formatarPrecoInsumo(insumo.preco_atual)}
                      </p>
                    </div>
                    {baixo && insumo.ativo && (
                      <Badge variant="destructive" className="shrink-0 gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Baixo
                      </Badge>
                    )}
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-8 w-8"
                      disabled={busy || insumo.quantidade_atual <= 0}
                      onClick={() => void ajustarQtd(insumo, -1)}
                      title="Registrar uso (−1)"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <span className="min-w-12 text-center text-sm font-semibold tabular-nums">
                      {insumo.quantidade_atual}
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-8 w-8"
                      disabled={busy}
                      onClick={() => void ajustarQtd(insumo, 1)}
                      title="Ajuste (+1)"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      mín. {insumo.estoque_minimo}
                    </span>
                  </div>

                  {alts.length > 0 && (
                    <p className="mt-1.5 truncate text-xs text-muted-foreground">
                      Ou: {alts.map((a) => a.alternativa?.nome).filter(Boolean).join(", ")}
                    </p>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2"
                      onClick={() => iniciarEdicao(insumo)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2"
                      disabled={busy}
                      onClick={() => void adicionarALista(insumo)}
                      title="Adicionar à lista"
                    >
                      <ShoppingCart className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-destructive"
                      onClick={() => void excluir(insumo)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <div className="ml-auto flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">Ativo</span>
                      <Switch
                        checked={insumo.ativo}
                        disabled={busy}
                        onCheckedChange={() => void alternarAtivo(insumo)}
                      />
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </AdminPageShell>
  );
}
