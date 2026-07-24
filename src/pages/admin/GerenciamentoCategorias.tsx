import {
  ChevronDown,
  ChevronUp,
  FolderTree,
  Loader2,
  Pencil,
  PlusCircle,
  Search,
  Trash2,
} from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { gerarSlug } from "../../lib/slug";
import { supabase } from "../../lib/supabase";

interface Categoria {
  id: string;
  nome: string;
  slug: string;
  ordem: number;
  icone: string | null;
  criado_em: string;
}

interface ProdutoCategoria {
  id: string;
  nome: string;
  ativo: boolean;
  ordem: number;
  imagem_url: string | null;
}

export function GerenciamentoCategorias() {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [termoBusca, setTermoBusca] = useState("");

  const [nome, setNome] = useState("");
  const [slug, setSlug] = useState("");
  const [ordem, setOrdem] = useState("");
  const [icone, setIcone] = useState("");
  const [editandoId, setEditandoId] = useState<string | null>(null);

  const [categoriaExpandidaId, setCategoriaExpandidaId] = useState<
    string | null
  >(null);
  const [produtosCategoria, setProdutosCategoria] = useState<
    ProdutoCategoria[]
  >([]);
  const [carregandoProdutos, setCarregandoProdutos] = useState(false);
  const [reordenandoId, setReordenandoId] = useState<string | null>(null);

  useEffect(() => {
    void carregarCategorias();
  }, []);

  const carregarCategorias = async () => {
    try {
      setCarregando(true);
      const { data, error } = await supabase
        .from("categorias")
        .select("*")
        .order("ordem", { ascending: true });

      if (error) throw error;
      setCategorias((data as Categoria[]) || []);
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error("[ERRO - CATEGORIAS]", mensagem);
      toast.error("Falha ao carregar categorias.");
    } finally {
      setCarregando(false);
    }
  };

  const carregarProdutosDaCategoria = async (categoriaId: string) => {
    try {
      setCarregandoProdutos(true);
      const { data, error } = await supabase
        .from("produtos")
        .select("id, nome, ativo, ordem, imagem_url")
        .eq("categoria_id", categoriaId)
        .order("ordem", { ascending: true })
        .order("nome", { ascending: true });

      if (error) throw error;
      setProdutosCategoria((data as ProdutoCategoria[]) || []);
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error("[ERRO - CATEGORIAS] produtos:", mensagem);
      toast.error("Falha ao carregar produtos da categoria.");
      setProdutosCategoria([]);
    } finally {
      setCarregandoProdutos(false);
    }
  };

  const alternarExpandir = (categoriaId: string) => {
    if (categoriaExpandidaId === categoriaId) {
      setCategoriaExpandidaId(null);
      setProdutosCategoria([]);
      return;
    }
    setCategoriaExpandidaId(categoriaId);
    void carregarProdutosDaCategoria(categoriaId);
  };

  const moverProduto = async (produtoId: string, direcao: -1 | 1) => {
    const idx = produtosCategoria.findIndex((p) => p.id === produtoId);
    const alvo = idx + direcao;
    if (idx < 0 || alvo < 0 || alvo >= produtosCategoria.length) return;

    const atual = produtosCategoria[idx];
    const vizinho = produtosCategoria[alvo];
    const novaLista = [...produtosCategoria];
    novaLista[idx] = vizinho;
    novaLista[alvo] = atual;

    // Atualiza ordens locais 0..n-1
    const comOrdem = novaLista.map((p, i) => ({ ...p, ordem: i }));
    setProdutosCategoria(comOrdem);

    try {
      setReordenandoId(produtoId);
      const results = await Promise.all(
        comOrdem.map((p) =>
          supabase.from("produtos").update({ ordem: p.ordem }).eq("id", p.id),
        ),
      );
      const falha = results.find((r) => r.error);
      if (falha?.error) throw falha.error;
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error("[ERRO - CATEGORIAS] reordenar:", mensagem);
      toast.error("Não foi possível salvar a ordem.");
      if (categoriaExpandidaId) {
        void carregarProdutosDaCategoria(categoriaExpandidaId);
      }
    } finally {
      setReordenandoId(null);
    }
  };

  const limparFormulario = () => {
    setNome("");
    setSlug("");
    setOrdem("");
    setIcone("");
    setEditandoId(null);
  };

  const iniciarEdicao = (categoria: Categoria) => {
    setEditandoId(categoria.id);
    setNome(categoria.nome);
    setSlug(categoria.slug);
    setOrdem(String(categoria.ordem));
    setIcone(categoria.icone || "");
  };

  const handleNomeChange = (valor: string) => {
    setNome(valor);
    if (!editandoId) {
      setSlug(gerarSlug(valor));
    }
  };

  const salvarCategoria = async (e: React.FormEvent) => {
    e.preventDefault();
    const nomeLimpo = nome.trim();
    const slugLimpo = (slug.trim() || gerarSlug(nomeLimpo)).toLowerCase();

    if (!nomeLimpo || !slugLimpo) {
      toast.warning("Informe nome e slug.");
      return;
    }

    const ordemNum = ordem ? parseInt(ordem, 10) : categorias.length + 1;
    if (Number.isNaN(ordemNum)) {
      toast.warning("Ordem inválida.");
      return;
    }

    try {
      setSalvando(true);

      const payload = {
        nome: nomeLimpo,
        slug: slugLimpo,
        ordem: ordemNum,
        icone: icone.trim() || null,
      };

      if (editandoId) {
        const { error } = await supabase
          .from("categorias")
          .update(payload)
          .eq("id", editandoId);

        if (error) throw error;
        setCategorias((prev) =>
          prev
            .map((c) =>
              c.id === editandoId
                ? { ...c, ...payload, icone: payload.icone }
                : c,
            )
            .sort((a, b) => a.ordem - b.ordem),
        );
        toast.success("Categoria atualizada!");
      } else {
        const { data, error } = await supabase
          .from("categorias")
          .insert(payload)
          .select("*")
          .single();

        if (error) throw error;
        setCategorias((prev) =>
          [...prev, data as Categoria].sort((a, b) => a.ordem - b.ordem),
        );
        toast.success("Categoria criada!");
      }

      limparFormulario();
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error("[ERRO - CATEGORIAS]", mensagem);
      toast.error(
        mensagem.includes("duplicate") || mensagem.includes("unique")
          ? "Já existe uma categoria com este slug."
          : "Erro ao salvar categoria.",
      );
    } finally {
      setSalvando(false);
    }
  };

  const excluirCategoria = async (id: string, nomeCategoria: string) => {
    const { count, error: erroCount } = await supabase
      .from("produtos")
      .select("id", { count: "exact", head: true })
      .eq("categoria_id", id);

    if (erroCount) {
      toast.error("Não foi possível verificar produtos vinculados.");
      return;
    }

    if (count && count > 0) {
      toast.error(
        `Não é possível excluir: ${count} produto(s) usam "${nomeCategoria}".`,
      );
      return;
    }

    if (
      !window.confirm(
        `Excluir a categoria "${nomeCategoria}"? Esta ação não pode ser desfeita.`,
      )
    ) {
      return;
    }

    const { error } = await supabase.from("categorias").delete().eq("id", id);

    if (error) {
      toast.error("Erro ao excluir categoria.");
      return;
    }

    setCategorias((prev) => prev.filter((c) => c.id !== id));
    if (editandoId === id) limparFormulario();
    if (categoriaExpandidaId === id) {
      setCategoriaExpandidaId(null);
      setProdutosCategoria([]);
    }
    toast.success("Categoria excluída.");
  };

  const categoriasFiltradas = categorias.filter((c) => {
    const termo = termoBusca.trim().toLowerCase();
    if (!termo) return true;
    return (
      c.nome.toLowerCase().includes(termo) ||
      c.slug.toLowerCase().includes(termo)
    );
  });

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
          <FolderTree size={28} className="text-cookie-primary" />
          Categorias
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Clique numa categoria para abrir e ordenar os produtos dela no
          cardápio.
        </p>
      </div>

      <form
        onSubmit={salvarCategoria}
        className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-4"
      >
        <h2 className="font-bold text-gray-900 dark:text-white">
          {editandoId ? "Editar categoria" : "Nova categoria"}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="categoria-nome">Nome</Label>
            <Input
              id="categoria-nome"
              placeholder="Ex: Bebidas"
              value={nome}
              onChange={(e) => handleNomeChange(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="categoria-slug">Slug</Label>
            <Input
              id="categoria-slug"
              placeholder="Ex: bebidas"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
            />
            <p className="text-[11px] text-gray-500">
              Identificador na URL do cardápio.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="categoria-ordem">Ordem</Label>
            <Input
              id="categoria-ordem"
              placeholder="Número (ex: 1)"
              type="number"
              min={0}
              value={ordem}
              onChange={(e) => setOrdem(e.target.value)}
            />
            <p className="text-[11px] text-gray-500">
              Posição da categoria no cardápio.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="categoria-icone">Ícone</Label>
            <Input
              id="categoria-icone"
              placeholder="Emoji opcional"
              value={icone}
              onChange={(e) => setIcone(e.target.value)}
              maxLength={8}
            />
            <p className="text-[11px] text-gray-500">
              Opcional — emoji exibido junto ao nome.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={salvando}>
            {salvando ? (
              <Loader2 className="animate-spin" size={18} />
            ) : editandoId ? (
              <>
                <Pencil size={18} className="mr-2" /> Salvar alterações
              </>
            ) : (
              <>
                <PlusCircle size={18} className="mr-2" /> Criar categoria
              </>
            )}
          </Button>
          {editandoId && (
            <Button type="button" variant="outline" onClick={limparFormulario}>
              Cancelar edição
            </Button>
          )}
        </div>
      </form>

      <div className="relative w-full md:w-80">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          size={16}
        />
        <Input
          placeholder="Buscar categoria..."
          value={termoBusca}
          onChange={(e) => setTermoBusca(e.target.value)}
          className="pl-9 dark:bg-[#1a1815]"
        />
      </div>

      {carregando ? (
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-cookie-primary" size={40} />
        </div>
      ) : (
        <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Ordem</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Ícone</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categoriasFiltradas.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center py-10 text-gray-500"
                  >
                    Nenhuma categoria encontrada.
                  </TableCell>
                </TableRow>
              ) : (
                categoriasFiltradas.map((categoria) => {
                  const expandida = categoriaExpandidaId === categoria.id;
                  return (
                    <Fragment key={categoria.id}>
                      <TableRow
                        className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900/30"
                        onClick={() => alternarExpandir(categoria.id)}
                      >
                        <TableCell className="w-10">
                          {expandida ? (
                            <ChevronUp size={16} className="text-gray-500" />
                          ) : (
                            <ChevronDown size={16} className="text-gray-500" />
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {categoria.ordem}
                        </TableCell>
                        <TableCell className="font-semibold">
                          {categoria.icone && (
                            <span className="mr-2">{categoria.icone}</span>
                          )}
                          {categoria.nome}
                        </TableCell>
                        <TableCell className="text-gray-500 font-mono text-sm">
                          {categoria.slug}
                        </TableCell>
                        <TableCell>{categoria.icone || "—"}</TableCell>
                        <TableCell
                          className="text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex justify-end gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => iniciarEdicao(categoria)}
                              title="Editar"
                            >
                              <Pencil size={16} />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="text-red-600 hover:text-red-700"
                              onClick={() =>
                                void excluirCategoria(
                                  categoria.id,
                                  categoria.nome,
                                )
                              }
                              title="Excluir"
                            >
                              <Trash2 size={16} />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {expandida && (
                        <TableRow>
                          <TableCell
                            colSpan={6}
                            className="bg-gray-50/80 dark:bg-gray-900/40 p-0"
                          >
                            <div className="px-4 py-3 space-y-2">
                              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                                Produtos nesta categoria
                              </p>
                              {carregandoProdutos ? (
                                <div className="flex justify-center py-6">
                                  <Loader2
                                    className="animate-spin text-cookie-primary"
                                    size={24}
                                  />
                                </div>
                              ) : produtosCategoria.length === 0 ? (
                                <p className="text-sm text-gray-500 py-2">
                                  Nenhum produto nesta categoria.
                                </p>
                              ) : (
                                <ul className="space-y-1.5">
                                  {produtosCategoria.map((produto, index) => (
                                    <li
                                      key={produto.id}
                                      className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-surface-dark px-3 py-2"
                                    >
                                      <div className="flex flex-col gap-0.5">
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7"
                                          disabled={
                                            index === 0 ||
                                            reordenandoId === produto.id
                                          }
                                          title="Subir"
                                          onClick={() =>
                                            void moverProduto(produto.id, -1)
                                          }
                                        >
                                          <ChevronUp size={14} />
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7"
                                          disabled={
                                            index ===
                                              produtosCategoria.length - 1 ||
                                            reordenandoId === produto.id
                                          }
                                          title="Descer"
                                          onClick={() =>
                                            void moverProduto(produto.id, 1)
                                          }
                                        >
                                          <ChevronDown size={14} />
                                        </Button>
                                      </div>
                                      <div className="h-10 w-10 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 shrink-0 border">
                                        {produto.imagem_url ? (
                                          <img
                                            src={produto.imagem_url}
                                            alt=""
                                            className="h-full w-full object-cover"
                                          />
                                        ) : null}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <p className="font-medium text-sm truncate">
                                          {produto.nome}
                                          {!produto.ativo && (
                                            <span className="ml-2 text-[10px] uppercase text-zinc-400">
                                              oculto
                                            </span>
                                          )}
                                        </p>
                                        <p className="text-[11px] text-zinc-400 font-mono">
                                          posição {index + 1}
                                        </p>
                                      </div>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
