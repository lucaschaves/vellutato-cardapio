import {
  ChevronDown,
  ChevronUp,
  FolderTree,
  Loader2,
  Pencil,
  PlusCircle,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminPageShell } from "../../components/AdminPageShell";
import { ModalConfirmacao } from "../../components/ModalConfirmacao";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../components/ui/tabs";
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

const ABA_NOVA = "__nova__";

export function GerenciamentoCategorias() {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [aba, setAba] = useState(ABA_NOVA);

  const [nome, setNome] = useState("");
  const [slug, setSlug] = useState("");
  const [ordem, setOrdem] = useState("");
  const [icone, setIcone] = useState("");
  const [editandoId, setEditandoId] = useState<string | null>(null);

  const [produtosCategoria, setProdutosCategoria] = useState<
    ProdutoCategoria[]
  >([]);
  const [carregandoProdutos, setCarregandoProdutos] = useState(false);
  const [reordenandoId, setReordenandoId] = useState<string | null>(null);
  const [categoriaExcluir, setCategoriaExcluir] = useState<{
    id: string;
    nome: string;
  } | null>(null);

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
      const lista = (data as Categoria[]) || [];
      setCategorias(lista);
      if (lista.length > 0) {
        setAba((atual) =>
          atual === ABA_NOVA || lista.some((c) => c.id === atual)
            ? atual === ABA_NOVA
              ? lista[0].id
              : atual
            : lista[0].id,
        );
      } else {
        setAba(ABA_NOVA);
      }
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

  const selecionarAba = (valor: string) => {
    setAba(valor);
    if (valor === ABA_NOVA) {
      limparFormulario();
      setProdutosCategoria([]);
    }
  };

  useEffect(() => {
    if (carregando || aba === ABA_NOVA) return;
    const cat = categorias.find((c) => c.id === aba);
    if (!cat) return;
    iniciarEdicao(cat);
    void carregarProdutosDaCategoria(cat.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ao trocar aba após load
  }, [carregando, aba]);

  const moverProduto = async (produtoId: string, direcao: -1 | 1) => {
    const idx = produtosCategoria.findIndex((p) => p.id === produtoId);
    const alvo = idx + direcao;
    if (idx < 0 || alvo < 0 || alvo >= produtosCategoria.length) return;

    const atual = produtosCategoria[idx];
    const vizinho = produtosCategoria[alvo];
    const novaLista = [...produtosCategoria];
    novaLista[idx] = vizinho;
    novaLista[alvo] = atual;

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
      if (aba !== ABA_NOVA) void carregarProdutosDaCategoria(aba);
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

  const salvarCategoria = async () => {
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
        const criada = data as Categoria;
        setCategorias((prev) =>
          [...prev, criada].sort((a, b) => a.ordem - b.ordem),
        );
        toast.success("Categoria criada!");
        setAba(criada.id);
        iniciarEdicao(criada);
        setProdutosCategoria([]);
      }
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error("[ERRO - CATEGORIAS] salvar:", mensagem);
      toast.error("Erro ao salvar categoria.");
    } finally {
      setSalvando(false);
    }
  };

  const excluirCategoria = async (id: string) => {
    const { error } = await supabase.from("categorias").delete().eq("id", id);
    if (error) {
      console.error("[ERRO - CATEGORIAS] excluir:", error.message);
      toast.error("Não foi possível excluir. Verifique se há produtos.");
      return;
    }

    setCategorias((prev) => {
      const resto = prev.filter((c) => c.id !== id);
      if (aba === id) {
        if (resto[0]) {
          setAba(resto[0].id);
          iniciarEdicao(resto[0]);
          void carregarProdutosDaCategoria(resto[0].id);
        } else {
          setAba(ABA_NOVA);
          limparFormulario();
          setProdutosCategoria([]);
        }
      }
      return resto;
    });
    toast.success("Categoria excluída.");
  };

  const formulario = (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-surface-dark p-5 flex flex-col gap-4">
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
    </div>
  );

  const listaProdutos = (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-surface-dark flex flex-col min-h-0 flex-1 overflow-hidden">
      <div className="shrink-0 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
          Produtos nesta categoria
        </p>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {carregandoProdutos ? (
          <div className="flex justify-center py-10">
            <Loader2 className="animate-spin text-cookie-primary" size={24} />
          </div>
        ) : produtosCategoria.length === 0 ? (
          <p className="text-sm text-gray-500 py-2">
            Nenhum produto nesta categoria.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {produtosCategoria.map((produto, index) => (
              <li
                key={produto.id}
                className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[#1a1815] px-3 py-2"
              >
                <div className="flex flex-col gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={index === 0 || reordenandoId === produto.id}
                    title="Subir"
                    onClick={() => void moverProduto(produto.id, -1)}
                  >
                    <ChevronUp size={14} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={
                      index === produtosCategoria.length - 1 ||
                      reordenandoId === produto.id
                    }
                    title="Descer"
                    onClick={() => void moverProduto(produto.id, 1)}
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
    </div>
  );

  return (
    <AdminPageShell
      title={
        <h1 className="flex items-center gap-2">
          <FolderTree size={24} className="text-cookie-primary" />
          Categorias
        </h1>
      }
      description="Organize categorias em abas e ordene os produtos de cada uma."
      scroll={false}
      contentClassName="gap-4"
      footer={
        <>
          {editandoId && (
            <Button
              type="button"
              variant="outline"
              className="text-red-600 mr-auto"
              onClick={() => {
                const cat = categorias.find((c) => c.id === editandoId);
                if (cat) setCategoriaExcluir({ id: cat.id, nome: cat.nome });
              }}
            >
              <Trash2 size={16} className="mr-2" />
              Excluir
            </Button>
          )}
          {aba === ABA_NOVA ? null : (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setAba(ABA_NOVA);
                limparFormulario();
                setProdutosCategoria([]);
              }}
            >
              Nova categoria
            </Button>
          )}
          <Button
            type="button"
            disabled={salvando}
            onClick={() => void salvarCategoria()}
            className="bg-cookie-primary hover:bg-cookie-primary-hover text-white"
          >
            {salvando ? (
              <Loader2 className="animate-spin" size={18} />
            ) : editandoId ? (
              <>
                <Pencil size={18} className="mr-2" /> Salvar
              </>
            ) : (
              <>
                <PlusCircle size={18} className="mr-2" /> Criar categoria
              </>
            )}
          </Button>
        </>
      }
    >
      {carregando ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="animate-spin text-cookie-primary" size={40} />
        </div>
      ) : (
        <Tabs
          value={aba}
          onValueChange={selecionarAba}
          className="flex-1 min-h-0 overflow-hidden gap-3"
        >
          <TabsList
            variant="line"
            className="shrink-0 w-full h-auto justify-start overflow-x-auto flex-nowrap rounded-none border-b border-gray-200 dark:border-gray-800 bg-transparent p-0 gap-0"
          >
            {categorias.map((c) => (
              <TabsTrigger
                key={c.id}
                value={c.id}
                className="shrink-0 rounded-none px-3 py-2.5 data-active:shadow-none"
              >
                {c.icone ? `${c.icone} ` : ""}
                {c.nome}
              </TabsTrigger>
            ))}
            <TabsTrigger
              value={ABA_NOVA}
              className="shrink-0 rounded-none px-3 py-2.5 data-active:shadow-none gap-1"
            >
              <PlusCircle size={14} />
              Nova
            </TabsTrigger>
          </TabsList>

          {categorias.map((c) => (
            <TabsContent
              key={c.id}
              value={c.id}
              className="flex-1 min-h-0 mt-0 overflow-hidden flex flex-col gap-4 data-[state=inactive]:hidden"
            >
              {aba === c.id ? (
                <>
                  {formulario}
                  {listaProdutos}
                </>
              ) : null}
            </TabsContent>
          ))}

          <TabsContent
            value={ABA_NOVA}
            className="flex-1 min-h-0 mt-0 overflow-y-auto data-[state=inactive]:hidden"
          >
            {aba === ABA_NOVA ? formulario : null}
          </TabsContent>
        </Tabs>
      )}

      <ModalConfirmacao
        aberto={categoriaExcluir != null}
        titulo="Excluir categoria?"
        mensagem={
          categoriaExcluir
            ? `Excluir a categoria "${categoriaExcluir.nome}"? Produtos vinculados podem impedir a exclusão.`
            : ""
        }
        textoConfirmar="Sim"
        textoCancelar="Não"
        aoCancelar={() => setCategoriaExcluir(null)}
        aoConfirmar={() => {
          const cat = categoriaExcluir;
          setCategoriaExcluir(null);
          if (cat) void excluirCategoria(cat.id);
        }}
      />
    </AdminPageShell>
  );
}
