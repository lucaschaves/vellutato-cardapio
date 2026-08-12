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
import { ModalConfirmacao } from "../../components/ModalConfirmacao";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Switch } from "../../components/ui/switch";
import {
  formatarEquivalenteBase,
  formatarEstoqueInsumo,
  formatarPrecoBaseInsumo,
  formatarPrecoMoeda,
  formatarQtd,
  formatarQtdInput,
  insumoAbaixoDoMinimo,
  normalizarMarcas,
  parseDecimalBr,
  precoBaseParaEmbalagem,
  precoEmbalagemParaBase,
  rotuloConteudoEmbalagem,
  rotuloTipoInsumo,
  rotuloUnidade,
  TIPOS_INSUMO,
  UNIDADES_CONTEUDO_PESO,
  UNIDADES_CONTEUDO_VOLUME,
  UNIDADES_INSUMO,
  unidadePrecoBase,
  compraParaUnidadeConteudo,
  unidadeConteudoParaCompra,
  type Insumo,
  type TipoInsumo,
  type UnidadeConteudo,
  type UnidadeInsumo,
} from "../../lib/insumos";
import { supabase } from "../../lib/supabase";

function asInsumo(row: Record<string, unknown>): Insumo {
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
    unidade,
    tipo,
    conteudo_valor:
      row.conteudo_valor == null ? null : Number(row.conteudo_valor),
    conteudo_unidade: conteudoUn,
    marcas: normalizarMarcas(
      Array.isArray(row.marcas) ? (row.marcas as string[]) : [],
    ),
    quantidade_atual: Number(row.quantidade_atual ?? 0),
    estoque_minimo: Number(row.estoque_minimo ?? 0),
    imagem_url: (row.imagem_url as string | null) ?? null,
    preco_atual: row.preco_atual == null ? null : Number(row.preco_atual),
    preco_atualizado_em: (row.preco_atualizado_em as string | null) ?? null,
    observacao: (row.observacao as string | null) ?? null,
    ativo: Boolean(row.ativo),
    criado_em: String(row.criado_em ?? ""),
    atualizado_em: String(row.atualizado_em ?? ""),
  };
}

export function GerenciamentoInsumos() {
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [termoBusca, setTermoBusca] = useState("");
  const [aba, setAba] = useState<"ativos" | "desativados">("ativos");
  const [processandoId, setProcessandoId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [insumoExcluir, setInsumoExcluir] = useState<Insumo | null>(null);

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<TipoInsumo>("peso");
  const [unidade, setUnidade] = useState<UnidadeInsumo>("unidade");
  const [conteudoValor, setConteudoValor] = useState("200");
  const [conteudoUnidade, setConteudoUnidade] = useState<UnidadeConteudo>("g");
  const [quantidade, setQuantidade] = useState("0");
  const [quantidadeBase, setQuantidadeBase] = useState("");
  const [estoqueMinimo, setEstoqueMinimo] = useState("0");
  const [estoqueMinimoBase, setEstoqueMinimoBase] = useState("");
  const [observacao, setObservacao] = useState("");
  const [precoEmbalagem, setPrecoEmbalagem] = useState("");
  const [imagemUrlAtual, setImagemUrlAtual] = useState<string | null>(null);
  const [imagemArquivo, setImagemArquivo] = useState<File | null>(null);
  const [imagemPreview, setImagemPreview] = useState<string | null>(null);
  const [marcas, setMarcas] = useState<string[]>([]);
  const [marcaInput, setMarcaInput] = useState("");

  const conversaoAtual = useMemo(
    () => ({
      tipo,
      unidade,
      conteudo_valor:
        tipo === "contagem" ? null : parseDecimalBr(conteudoValor),
      conteudo_unidade: tipo === "contagem" ? null : conteudoUnidade,
    }),
    [tipo, unidade, conteudoValor, conteudoUnidade],
  );

  const precoBasePreview = useMemo(() => {
    const embalagem = parseDecimalBr(precoEmbalagem);
    if (embalagem == null) return null;
    return precoEmbalagemParaBase(embalagem, conversaoAtual);
  }, [precoEmbalagem, conversaoAtual]);

  useEffect(() => {
    void carregar();
  }, []);

  useEffect(() => {
    if (tipo === "contagem") {
      setQuantidadeBase("");
      setEstoqueMinimoBase("");
      return;
    }
    syncBaseFromCompra(quantidade, "qtd");
    syncBaseFromCompra(estoqueMinimo, "min");
    // Recalcula equivalente quando muda o conteúdo da embalagem.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só conteúdo/tipo
  }, [tipo, conteudoValor, conteudoUnidade]);

  useEffect(() => {
    return () => {
      if (imagemPreview) URL.revokeObjectURL(imagemPreview);
    };
  }, [imagemPreview]);

  const carregar = async () => {
    try {
      setCarregando(true);
      const { data, error } = await supabase
        .from("insumos")
        .select("*")
        .order("nome", { ascending: true });
      if (error) throw new Error(error.message);
      setInsumos(((data ?? []) as Record<string, unknown>[]).map(asInsumo));
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error("[ERRO - INSUMOS]", mensagem);
      toast.error("Falha ao carregar insumos.");
    } finally {
      setCarregando(false);
    }
  };

  const aplicarTipo = (novo: TipoInsumo) => {
    setTipo(novo);
    if (novo === "peso") {
      setConteudoUnidade("g");
      if (!conteudoValor.trim()) setConteudoValor("200");
    } else if (novo === "volume") {
      setConteudoUnidade("ml");
      if (!conteudoValor.trim()) setConteudoValor("1000");
    } else {
      setConteudoValor("");
      setQuantidadeBase("");
      setEstoqueMinimoBase("");
    }
  };

  const syncBaseFromCompra = (qtdCompraStr: string, qual: "qtd" | "min") => {
    const n = parseDecimalBr(qtdCompraStr);
    if (n == null || tipo === "contagem") {
      if (qual === "qtd") setQuantidadeBase("");
      else setEstoqueMinimoBase("");
      return;
    }
    const base = compraParaUnidadeConteudo(n, {
      tipo,
      conteudo_valor: parseDecimalBr(conteudoValor),
      conteudo_unidade: conteudoUnidade,
    });
    const txt = base == null ? "" : formatarQtdInput(base);
    if (qual === "qtd") setQuantidadeBase(txt);
    else setEstoqueMinimoBase(txt);
  };

  const syncCompraFromBase = (qtdBaseStr: string, qual: "qtd" | "min") => {
    const n = parseDecimalBr(qtdBaseStr);
    if (n == null || tipo === "contagem") return;
    const compra = unidadeConteudoParaCompra(n, {
      tipo,
      conteudo_valor: parseDecimalBr(conteudoValor),
      conteudo_unidade: conteudoUnidade,
    });
    if (compra == null) return;
    const txt = formatarQtdInput(compra);
    if (qual === "qtd") setQuantidade(txt);
    else setEstoqueMinimo(txt);
  };

  const limparFormulario = () => {
    setEditandoId(null);
    setNome("");
    setTipo("peso");
    setUnidade("unidade");
    setConteudoValor("200");
    setConteudoUnidade("g");
    setQuantidade("0");
    setQuantidadeBase("");
    setEstoqueMinimo("0");
    setEstoqueMinimoBase("");
    setObservacao("");
    setPrecoEmbalagem("");
    setImagemUrlAtual(null);
    setImagemArquivo(null);
    if (imagemPreview) URL.revokeObjectURL(imagemPreview);
    setImagemPreview(null);
    setMarcas([]);
    setMarcaInput("");
  };

  const iniciarEdicao = (item: Insumo) => {
    setEditandoId(item.id);
    setNome(item.nome);
    setTipo(item.tipo);
    setUnidade(item.unidade);
    setConteudoValor(
      item.conteudo_valor != null ? formatarQtdInput(item.conteudo_valor) : "",
    );
    setConteudoUnidade(
      item.conteudo_unidade ?? (item.tipo === "volume" ? "ml" : "g"),
    );
    setQuantidade(formatarQtdInput(item.quantidade_atual));
    setEstoqueMinimo(formatarQtdInput(item.estoque_minimo));
    const baseQtd = compraParaUnidadeConteudo(item.quantidade_atual, item);
    const baseMin = compraParaUnidadeConteudo(item.estoque_minimo, item);
    setQuantidadeBase(baseQtd == null ? "" : formatarQtdInput(baseQtd));
    setEstoqueMinimoBase(baseMin == null ? "" : formatarQtdInput(baseMin));
    setObservacao(item.observacao || "");
    const embalagem =
      item.preco_atual != null
        ? precoBaseParaEmbalagem(item.preco_atual, item)
        : null;
    setPrecoEmbalagem(
      embalagem != null ? String(embalagem).replace(".", ",") : "",
    );
    setImagemUrlAtual(item.imagem_url);
    setImagemArquivo(null);
    if (imagemPreview) URL.revokeObjectURL(imagemPreview);
    setImagemPreview(null);
    setMarcas(item.marcas);
    setMarcaInput("");
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

  const adicionarMarca = (raw: string) => {
    const lista = normalizarMarcas([...marcas, raw]);
    setMarcas(lista);
    setMarcaInput("");
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      toast.warning("Informe o nome do insumo (ex.: Manteiga).");
      return;
    }

    const qtd = parseDecimalBr(quantidade);
    const min = parseDecimalBr(estoqueMinimo);
    if (qtd == null || qtd < 0 || min == null || min < 0) {
      toast.warning("Quantidade e estoque mínimo devem ser números ≥ 0.");
      return;
    }

    let conteudoNum: number | null = null;
    let conteudoUn: UnidadeConteudo | null = null;
    if (tipo !== "contagem") {
      conteudoNum = parseDecimalBr(conteudoValor);
      if (conteudoNum == null || conteudoNum <= 0) {
        toast.warning("Informe o conteúdo de 1 embalagem (ex.: 200 g).");
        return;
      }
      conteudoUn = conteudoUnidade;
    }

    let precoBase: number | null = null;
    if (precoEmbalagem.trim()) {
      const embalagem = parseDecimalBr(precoEmbalagem);
      if (embalagem == null || embalagem < 0) {
        toast.warning("Preço da embalagem inválido.");
        return;
      }
      precoBase = precoEmbalagemParaBase(embalagem, {
        tipo,
        conteudo_valor: conteudoNum,
        conteudo_unidade: conteudoUn,
      });
      if (precoBase == null) {
        toast.warning("Não foi possível converter o preço. Confira o conteúdo.");
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
        tipo,
        conteudo_valor: conteudoNum,
        conteudo_unidade: conteudoUn,
        marcas: normalizarMarcas(marcas),
        estoque_minimo: min,
        observacao: observacao.trim() || null,
        imagem_url: imagemUrl,
        preco_atual: precoBase,
        preco_atualizado_em: precoBase != null ? new Date().toISOString() : null,
        atualizado_em: new Date().toISOString(),
      };

      if (editandoId) {
        const atual = insumos.find((i) => i.id === editandoId);
        const { error } = await supabase
          .from("insumos")
          .update(payload)
          .eq("id", editandoId);
        if (error) throw new Error(error.message);

        if (atual && Math.abs(Number(atual.quantidade_atual) - qtd) > 0.0001) {
          const delta = qtd - Number(atual.quantidade_atual);
          const { error: errEst } = await supabase.rpc(
            "ajustar_estoque_insumo",
            {
              p_insumo_id: editandoId,
              p_delta: delta,
              p_origem: "ajuste",
              p_observacao: "Ajuste no cadastro",
            },
          );
          if (errEst) throw new Error(errEst.message);
        }

        if (precoBase != null && atual && Number(atual.preco_atual) !== precoBase) {
          await supabase.from("insumo_precos_historico").insert({
            insumo_id: editandoId,
            preco_unitario: precoBase,
            observacao: "Ajuste manual no cadastro",
          });
        }

        toast.success("Insumo atualizado.");
      } else {
        const { data, error } = await supabase
          .from("insumos")
          .insert({ ...payload, quantidade_atual: qtd, ativo: true })
          .select("*")
          .single();
        if (error) throw new Error(error.message);

        if (data && precoBase != null) {
          await supabase.from("insumo_precos_historico").insert({
            insumo_id: data.id,
            preco_unitario: precoBase,
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
      if (i.nome.toLowerCase().includes(termo)) return true;
      return i.marcas.some((m) => m.toLowerCase().includes(termo));
    });
  }, [insumos, termoBusca, aba]);

  const unidadesConteudo =
    tipo === "volume" ? UNIDADES_CONTEUDO_VOLUME : UNIDADES_CONTEUDO_PESO;

  return (
    <AdminPageShell
      title={
        <span className="flex items-center gap-2">
          <Warehouse className="h-5 w-5 text-cookie-primary" />
          Insumos
        </span>
      }
      description="Ingrediente genérico (manteiga, farinha). Marcas só ajudam na compra; estoque e preço são um só."
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
              placeholder="Ex.: Manteiga"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="insumo-tipo">Tipo</Label>
            <select
              id="insumo-tipo"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={tipo}
              onChange={(e) => aplicarTipo(e.target.value as TipoInsumo)}
            >
              {TIPOS_INSUMO.map((t) => (
                <option key={t} value={t}>
                  {rotuloTipoInsumo(t)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="insumo-unidade">Unidade de compra</Label>
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

          {tipo !== "contagem" && (
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
              <Label>Conteúdo de 1 {rotuloUnidade(unidade, 1)}</Label>
              <div className="flex max-w-md gap-2">
                <Input
                  inputMode="decimal"
                  value={conteudoValor}
                  onChange={(e) => setConteudoValor(e.target.value)}
                  placeholder="200"
                />
                <select
                  className="flex h-10 w-24 rounded-md border border-input bg-background px-3 text-sm"
                  value={conteudoUnidade}
                  onChange={(e) =>
                    setConteudoUnidade(e.target.value as UnidadeConteudo)
                  }
                >
                  {unidadesConteudo.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-muted-foreground">
                Ex.: tablete de manteiga = 200 g; saco de farinha = 5 kg; leite = 1 L.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="insumo-qtd">
              Estoque ({rotuloUnidade(unidade, 2)})
            </Label>
            <Input
              id="insumo-qtd"
              inputMode="decimal"
              value={quantidade}
              onChange={(e) => {
                setQuantidade(e.target.value);
                syncBaseFromCompra(e.target.value, "qtd");
              }}
            />
          </div>

          {tipo !== "contagem" && (
            <div className="space-y-1.5">
              <Label htmlFor="insumo-qtd-base">
                Estoque ({conteudoUnidade})
              </Label>
              <Input
                id="insumo-qtd-base"
                inputMode="decimal"
                value={quantidadeBase}
                onChange={(e) => {
                  setQuantidadeBase(e.target.value);
                  syncCompraFromBase(e.target.value, "qtd");
                }}
                placeholder="0"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="insumo-min">
              Mínimo ({rotuloUnidade(unidade, 2)})
            </Label>
            <Input
              id="insumo-min"
              inputMode="decimal"
              value={estoqueMinimo}
              onChange={(e) => {
                setEstoqueMinimo(e.target.value);
                syncBaseFromCompra(e.target.value, "min");
              }}
            />
          </div>

          {tipo !== "contagem" && (
            <div className="space-y-1.5">
              <Label htmlFor="insumo-min-base">
                Mínimo ({conteudoUnidade})
              </Label>
              <Input
                id="insumo-min-base"
                inputMode="decimal"
                value={estoqueMinimoBase}
                onChange={(e) => {
                  setEstoqueMinimoBase(e.target.value);
                  syncCompraFromBase(e.target.value, "min");
                }}
                placeholder="0"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="insumo-preco">Preço da embalagem (opcional)</Label>
            <Input
              id="insumo-preco"
              inputMode="decimal"
              placeholder="0,00"
              value={precoEmbalagem}
              onChange={(e) => setPrecoEmbalagem(e.target.value)}
            />
            {precoBasePreview != null && (
              <p className="text-xs text-muted-foreground">
                = {formatarPrecoMoeda(precoBasePreview)} /{" "}
                {unidadePrecoBase(tipo)}
              </p>
            )}
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="insumo-obs">Observação</Label>
            <Input
              id="insumo-obs"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Preferir tablete, evitar com sal…"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
            <Label>Marcas possíveis</Label>
            {marcas.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {marcas.map((m) => (
                  <Badge key={m} variant="secondary" className="gap-1 pr-1">
                    {m}
                    <button
                      type="button"
                      className="rounded p-0.5 hover:bg-black/10"
                      onClick={() =>
                        setMarcas((prev) => prev.filter((x) => x !== m))
                      }
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <Input
              value={marcaInput}
              onChange={(e) => setMarcaInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  adicionarMarca(marcaInput.replace(/,/g, ""));
                }
              }}
              onBlur={() => {
                if (marcaInput.trim()) adicionarMarca(marcaInput);
              }}
              placeholder="Batavo, Tirol… (Enter para adicionar)"
              className="max-w-md"
            />
            <p className="text-xs text-muted-foreground">
              Só uma lista para facilitar a compra. Não cria estoque separado.
            </p>
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
            placeholder="Buscar insumo ou marca…"
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
            const busy = processandoId === insumo.id;
            const deltaMenos =
              insumo.quantidade_atual <= 0
                ? 0
                : -Math.min(1, insumo.quantidade_atual);
            const conteudo = rotuloConteudoEmbalagem(insumo);
            const eqMin = formatarEquivalenteBase(insumo.estoque_minimo, insumo);

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
                        {rotuloTipoInsumo(insumo.tipo)}
                        {conteudo ? ` · ${conteudo}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatarPrecoBaseInsumo(insumo)}
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
                      disabled={busy || deltaMenos === 0}
                      onClick={() => void ajustarQtd(insumo, deltaMenos)}
                      title="Registrar uso (−1)"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <span className="min-w-16 text-center text-sm font-semibold tabular-nums leading-tight">
                      {formatarEstoqueInsumo(insumo)}
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
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    mín. {formatarQtd(insumo.estoque_minimo)}{" "}
                    {rotuloUnidade(insumo.unidade, insumo.estoque_minimo)}
                    {eqMin ? ` (${eqMin})` : ""}
                  </p>

                  {insumo.marcas.length > 0 && (
                    <p className="mt-1.5 truncate text-xs text-muted-foreground">
                      Marcas: {insumo.marcas.join(", ")}
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
                      onClick={() => setInsumoExcluir(insumo)}
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

      <ModalConfirmacao
        aberto={insumoExcluir != null}
        titulo="Excluir insumo?"
        mensagem={
          insumoExcluir
            ? `Excluir "${insumoExcluir.nome}"? Histórico de estoque e preços será removido.`
            : ""
        }
        textoConfirmar="Sim"
        textoCancelar="Não"
        aoCancelar={() => setInsumoExcluir(null)}
        aoConfirmar={() => {
          const item = insumoExcluir;
          setInsumoExcluir(null);
          if (item) void excluir(item);
        }}
      />
    </AdminPageShell>
  );
}
