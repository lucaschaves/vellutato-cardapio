import { AnimatePresence, motion } from "framer-motion";
import {
  Layers,
  Loader2,
  Minus,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";

// Shadcn/ui
import { toast } from "sonner";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Switch } from "../../components/ui/switch";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../components/ui/tabs";

interface ProdutoEstoque {
  id: string;
  nome: string;
  descricao: string | null;
  imagem_url: string;
  preco: number;
  preco_promocional: number | null;
  em_promocao: boolean;
  ativo: boolean;
  controlar_estoque: boolean;
  quantidade_estoque: number;
  categoria_id: string;
  video_url: string | null;
  adicional_obrigatorio: boolean;
  adicional_maximo: number | null;
  ordem?: number | null;
  categorias: { nome: string; ordem: number } | null;
}

interface AdicionalGlobal {
  id: string;
  nome: string;
  preco: number;
}

export function GerenciamentoEstoque() {
  const navigate = useNavigate();
  const [produtos, setProdutos] = useState<ProdutoEstoque[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [termoBusca, setTermoBusca] = useState("");
  const [processandoId, setProcessandoId] = useState<string | null>(null);
  const [aba, setAba] = useState<"ativos" | "desativados">("ativos");
  const [abaCategoria, setAbaCategoria] = useState<string>("");

  // Estados do Modal de Adicionais (Vínculos)
  const [produtoAtivo, setProdutoAtivo] = useState<ProdutoEstoque | null>(null);
  const [listaAdicionaisGlobais, setListaAdicionaisGlobais] = useState<
    AdicionalGlobal[]
  >([]);
  const [vinculosAtivos, setVinculosAtivos] = useState<string[]>([]); // Array de IDs de adicionais ligados a este produto
  const [carregandoModal, setCarregandoModal] = useState(false);

  useEffect(() => {
    carregarProdutos();
  }, []);

  const carregarProdutos = async () => {
    try {
      setCarregando(true);
      const { data, error } = await supabase
        .from("produtos")
        .select(
          `
          id, nome, descricao, imagem_url, preco, preco_promocional, em_promocao,
          ativo, controlar_estoque, quantidade_estoque, categoria_id, video_url,
          adicional_obrigatorio, adicional_maximo, ordem,
          categorias ( nome, ordem )
        `,
        )
        .order("ordem", { ascending: true })
        .order("nome", { ascending: true });

      if (error) throw new Error(error.message);
      setProdutos((data as unknown as ProdutoEstoque[]) || []);
    } catch (erro: any) {
      console.error(
        "[ERRO - ESTOQUE] Falha ao carregar produtos:",
        erro.message || erro,
      );
      toast.error("Falha de Conexão: Não foi possível carregar o estoque.");
    } finally {
      setCarregando(false);
    }
  };

  const alternarStatusProduto = async (id: string, statusAtual: boolean) => {
    try {
      setProcessandoId(id);
      const novoStatus = !statusAtual;

      const { error } = await supabase
        .from("produtos")
        .update({ ativo: novoStatus })
        .eq("id", id);
      if (error) throw new Error(error.message);

      setProdutos(
        produtos.map((p) => (p.id === id ? { ...p, ativo: novoStatus } : p)),
      );
      toast.success(
        novoStatus
          ? "Produto reativado e visível no cardápio."
          : "Produto desativado — movido para a aba Desativados.",
      );
    } catch (erro: any) {
      console.error(
        "[ERRO - ESTOQUE] Falha ao atualizar visibilidade:",
        erro.message || erro,
      );
      toast.error(
        "Erro na Atualização: Não foi possível alterar a visibilidade.",
      );
    } finally {
      setProcessandoId(null);
    }
  };

  const atualizarQuantidade = async (id: string, novaQuantidade: number) => {
    if (novaQuantidade < 0) return;
    try {
      setProcessandoId(id);
      const { error } = await supabase
        .from("produtos")
        .update({ quantidade_estoque: novaQuantidade })
        .eq("id", id);
      if (error) throw new Error(error.message);

      setProdutos(
        produtos.map((p) =>
          p.id === id ? { ...p, quantidade_estoque: novaQuantidade } : p,
        ),
      );
    } catch (erro: any) {
      console.error(
        "[ERRO - ESTOQUE] Falha de atualização de quantidade:",
        erro.message || erro,
      );
      toast.error("Erro de Sincronização: Falha ao salvar a quantidade.");
    } finally {
      setProcessandoId(null);
    }
  };

  const excluirProduto = async (produto: ProdutoEstoque) => {
    try {
      setProcessandoId(produto.id);

      const { count: qtdPedidos, error: erroPedidos } = await supabase
        .from("pedido_itens")
        .select("id", { count: "exact", head: true })
        .eq("produto_id", produto.id);

      if (erroPedidos) {
        toast.error("Não foi possível verificar uso em pedidos.");
        return;
      }

      if (qtdPedidos && qtdPedidos > 0) {
        toast.error(
          `Não é possível excluir "${produto.nome}": já teve vendas. Desative-o para tirar do cardápio sem afetar o histórico.`,
        );
        return;
      }

      if (
        !window.confirm(
          `Excluir o produto "${produto.nome}"? Esta ação não pode ser desfeita.`,
        )
      ) {
        return;
      }

      await supabase
        .from("produto_adicionais")
        .delete()
        .eq("produto_id", produto.id);

      await supabase
        .from("vendas_cruzadas")
        .delete()
        .or(
          `gatilho_produto_id.eq.${produto.id},alvo_produto_id.eq.${produto.id}`,
        );

      await supabase.from("combo_opcoes").delete().eq("produto_id", produto.id);

      const { error } = await supabase
        .from("produtos")
        .delete()
        .eq("id", produto.id);

      if (error) throw new Error(error.message);

      setProdutos((prev) => prev.filter((p) => p.id !== produto.id));
      if (produtoAtivo?.id === produto.id) setProdutoAtivo(null);
      toast.success("Produto excluído.");
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error("[ERRO - ESTOQUE] Falha ao excluir:", mensagem);
      toast.error(
        /foreign key|violates|constraint/i.test(mensagem)
          ? `Não é possível excluir "${produto.nome}": ainda está vinculado a outro registro.`
          : "Erro ao excluir produto.",
      );
    } finally {
      setProcessandoId(null);
    }
  };

  // ========================================================================
  // LÓGICA DE VINCULAÇÃO DE ADICIONAIS
  // ========================================================================

  const abrirModalVinculos = async (produto: ProdutoEstoque) => {
    setProdutoAtivo(produto);
    setCarregandoModal(true);

    try {
      // 1. Busca todos os adicionais globais cadastrados no sistema
      const { data: todosAdc, error: errTodos } = await supabase
        .from("adicionais")
        .select("id, nome, preco")
        .eq("disponivel", true)
        .order("nome");

      if (errTodos) throw new Error(errTodos.message);
      setListaAdicionaisGlobais(todosAdc || []);

      // 2. Busca QUAIS adicionais estão ligados ESPECIFICAMENTE a este produto
      const { data: vinculados, error: errVinc } = await supabase
        .from("produto_adicionais")
        .select("adicional_id")
        .eq("produto_id", produto.id);

      if (errVinc) throw new Error(errVinc.message);

      // Transforma o array de objetos em um array simples de IDs
      setVinculosAtivos(vinculados?.map((v) => v.adicional_id) || []);
    } catch (erro: any) {
      console.error(
        "[ERRO - VÍNCULOS] Falha ao carregar matriz de adicionais:",
        erro.message || erro,
      );
      toast.error(
        "Erro ao carregar as opções de adicionais para este produto.",
      );
      setProdutoAtivo(null); // Aborta a abertura
    } finally {
      setCarregandoModal(false);
    }
  };

  const atualizarConfigAdicionais = async (patch: {
    adicional_obrigatorio?: boolean;
    adicional_maximo?: number | null;
  }) => {
    if (!produtoAtivo) return;

    const obrigatorio =
      patch.adicional_obrigatorio ?? produtoAtivo.adicional_obrigatorio;
    let maximo =
      patch.adicional_maximo !== undefined
        ? patch.adicional_maximo
        : produtoAtivo.adicional_maximo;

    if (maximo != null && maximo < 1) maximo = null;
    if (obrigatorio && maximo != null && maximo < 1) maximo = 1;

    try {
      const { error } = await supabase
        .from("produtos")
        .update({
          adicional_obrigatorio: obrigatorio,
          adicional_maximo: maximo,
        })
        .eq("id", produtoAtivo.id);

      if (error) throw new Error(error.message);

      const atualizado = {
        ...produtoAtivo,
        adicional_obrigatorio: obrigatorio,
        adicional_maximo: maximo,
      };
      setProdutoAtivo(atualizado);
      setProdutos((prev) =>
        prev.map((p) => (p.id === produtoAtivo.id ? atualizado : p)),
      );
      toast.success("Configuração de adicionais salva.");
    } catch (erro: unknown) {
      console.error(
        "[ERRO - VÍNCULOS] Falha ao atualizar config de adicionais:",
        erro,
      );
      toast.error("Erro ao salvar. Tente novamente.");
    }
  };

  const alternarAdicionalObrigatorio = async () => {
    if (!produtoAtivo) return;
    await atualizarConfigAdicionais({
      adicional_obrigatorio: !produtoAtivo.adicional_obrigatorio,
    });
  };

  const alternarVinculoAdicional = async (
    adicionalId: string,
    estaVinculado: boolean,
  ) => {
    if (!produtoAtivo) return;

    try {
      if (estaVinculado) {
        // Se já está vinculado, vamos DELETAR da tabela pivô
        const { error } = await supabase
          .from("produto_adicionais")
          .delete()
          .match({ produto_id: produtoAtivo.id, adicional_id: adicionalId });

        if (error) throw new Error(error.message);

        setVinculosAtivos((prev) => prev.filter((id) => id !== adicionalId));
        toast.success("Adicional removido deste produto.");
      } else {
        // Se NÃO está vinculado, vamos INSERIR na tabela pivô
        const { error } = await supabase
          .from("produto_adicionais")
          .insert({ produto_id: produtoAtivo.id, adicional_id: adicionalId });

        if (error) throw new Error(error.message);

        setVinculosAtivos((prev) => [...prev, adicionalId]);
        toast.success("Adicional ativado para este produto!");
      }
    } catch (erro: any) {
      console.error(
        "[ERRO - VÍNCULOS] Falha ao alterar tabela pivô:",
        erro.message || erro,
      );
      toast.error("Erro de gravação. Tente novamente.");
    }
  };

  const qtdAtivos = produtos.filter((p) => p.ativo).length;
  const qtdDesativados = produtos.filter((p) => !p.ativo).length;

  const produtosFiltrados = produtos.filter((p) => {
    const naAba = aba === "ativos" ? p.ativo : !p.ativo;
    if (!naAba) return false;
    if (!termoBusca.trim()) return true;
    const termo = termoBusca.toLowerCase();
    return (
      p.nome.toLowerCase().includes(termo) ||
      (p.categorias?.nome || "").toLowerCase().includes(termo)
    );
  });

  const gruposPorCategoria = useMemo(() => {
    const mapa = new Map<
      string,
      {
        id: string;
        nome: string;
        ordem: number;
        produtos: ProdutoEstoque[];
      }
    >();

    for (const produto of produtosFiltrados) {
      const id = produto.categoria_id || "sem-categoria";
      const nome = produto.categorias?.nome || "Sem categoria";
      const ordem = produto.categorias?.ordem ?? 9999;
      const atual = mapa.get(id);
      if (atual) {
        atual.produtos.push(produto);
      } else {
        mapa.set(id, { id, nome, ordem, produtos: [produto] });
      }
    }

    return [...mapa.values()].sort((a, b) => {
      if (a.ordem !== b.ordem) return a.ordem - b.ordem;
      return a.nome.localeCompare(b.nome, "pt-BR");
    });
  }, [produtosFiltrados]);

  useEffect(() => {
    if (gruposPorCategoria.length === 0) {
      setAbaCategoria("");
      return;
    }
    if (!gruposPorCategoria.some((g) => g.id === abaCategoria)) {
      setAbaCategoria(gruposPorCategoria[0].id);
    }
  }, [gruposPorCategoria, abaCategoria]);

  const grupoAtivo =
    gruposPorCategoria.find((g) => g.id === abaCategoria) ??
    gruposPorCategoria[0] ??
    null;

  return (
    <div className="h-full min-h-0 max-h-full flex flex-col overflow-hidden p-6 max-w-5xl mx-auto gap-4">
      {/* Cabeçalho */}
      <div className="shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <Package size={28} className="text-cookie-primary" /> Gestão de
            Estoque
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {aba === "ativos"
              ? "Produtos no cardápio — quantidade, extras e visibilidade."
              : "Produtos ocultos. Quem já teve venda não pode ser excluído (histórico)."}
          </p>
        </div>

        <div className="relative w-full md:w-80">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            size={16}
          />
          <Input
            placeholder="Buscar produto ou categoria..."
            value={termoBusca}
            onChange={(e) => setTermoBusca(e.target.value)}
            className="pl-9 dark:bg-[#1a1815]"
          />
        </div>
      </div>

      <div className="shrink-0 flex gap-1 overflow-x-auto">
        {(
          [
            ["ativos", "Ativos", qtdAtivos],
            ["desativados", "Desativados", qtdDesativados],
          ] as const
        ).map(([id, label, qtd]) => (
          <button
            key={id}
            type="button"
            onClick={() => setAba(id)}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold shrink-0 ${
              aba === id
                ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                : "bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300"
            }`}
          >
            {label}
            <span
              className={`ml-1.5 text-xs font-bold ${
                aba === id ? "opacity-80" : "text-gray-400"
              }`}
            >
              ({qtd})
            </span>
          </button>
        ))}
      </div>

      {/* Produtos por categoria (aba) */}
      {carregando ? (
        <div className="flex-1 min-h-0 border rounded-xl dark:border-gray-800 bg-white dark:bg-surface-dark shadow-sm flex justify-center items-center">
          <Loader2 className="animate-spin text-cookie-primary" size={32} />
        </div>
      ) : produtosFiltrados.length === 0 ? (
        <div className="flex-1 min-h-0 border rounded-xl dark:border-gray-800 bg-white dark:bg-surface-dark shadow-sm flex flex-col items-center justify-center text-center px-4 text-gray-500 text-sm">
          {termoBusca.trim()
            ? "Nenhum produto encontrado com esse filtro."
            : aba === "ativos"
              ? "Nenhum produto ativo."
              : "Nenhum produto desativado."}
        </div>
      ) : (
        <Tabs
          value={abaCategoria || grupoAtivo?.id}
          onValueChange={setAbaCategoria}
          className="flex-1 min-h-0 overflow-hidden gap-3"
        >
          <TabsList
            variant="line"
            className="shrink-0 w-full h-auto max-w-full justify-start overflow-x-auto flex-nowrap rounded-none border-b border-gray-200 dark:border-gray-800 bg-transparent p-0 gap-0"
          >
            {gruposPorCategoria.map((grupo) => (
              <TabsTrigger
                key={grupo.id}
                value={grupo.id}
                className="shrink-0 rounded-none px-3 py-2.5 data-active:shadow-none"
              >
                {grupo.nome}
                <span className="ml-1 text-xs tabular-nums opacity-60">
                  ({grupo.produtos.length})
                </span>
              </TabsTrigger>
            ))}
          </TabsList>

          {grupoAtivo && (
            <TabsContent
              value={grupoAtivo.id}
              className="flex-1 min-h-0 mt-0 overflow-hidden border rounded-xl dark:border-gray-800 bg-white dark:bg-surface-dark shadow-sm flex flex-col data-[state=inactive]:hidden"
            >
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto">
                <table className="w-full caption-bottom text-sm">
                  <TableHeader className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 [&_tr]:border-b shadow-[0_1px_0_0_rgba(0,0,0,0.06)]">
                    <TableRow>
                      <TableHead className="w-[320px] bg-gray-50 dark:bg-gray-900">
                        Produto
                      </TableHead>
                      <TableHead className="text-center bg-gray-50 dark:bg-gray-900">
                        Quantidade
                      </TableHead>
                      <TableHead className="text-center bg-gray-50 dark:bg-gray-900">
                        Extras
                      </TableHead>
                      <TableHead className="text-center bg-gray-50 dark:bg-gray-900">
                        Visibilidade
                      </TableHead>
                      <TableHead className="text-right pr-6 bg-gray-50 dark:bg-gray-900">
                        Ações
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {grupoAtivo.produtos.map((produto) => (
                    <TableRow key={produto.id}>
                      <TableCell className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-800 shrink-0 overflow-hidden border">
                          {produto.imagem_url ? (
                            <img
                              src={produto.imagem_url}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Package
                              className="m-auto h-full text-gray-400"
                              size={20}
                            />
                          )}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{produto.nome}</span>
                            {produto.em_promocao && (
                              <Badge className="bg-[#ff5722] hover:bg-[#ff5722] text-white text-[0.625rem]">
                                PROMO
                              </Badge>
                            )}
                            {produto.video_url && (
                              <Badge
                                variant="secondary"
                                className="text-[0.625rem]"
                              >
                                Vídeo
                              </Badge>
                            )}
                          </div>
                          {produto.descricao && (
                            <span className="text-xs text-gray-400 mt-0.5 line-clamp-1 max-w-60">
                              {produto.descricao}
                            </span>
                          )}
                          <span className="text-xs text-cookie-accent font-semibold mt-1">
                            R$ {produto.preco.toFixed(2).replace(".", ",")}
                            {produto.em_promocao &&
                              produto.preco_promocional != null && (
                                <span className="text-green-600 ml-2">
                                  → R${" "}
                                  {produto.preco_promocional
                                    .toFixed(2)
                                    .replace(".", ",")}
                                </span>
                              )}
                          </span>
                        </div>
                      </TableCell>

                      <TableCell className="text-center">
                        {produto.controlar_estoque ? (
                          <div className="flex items-center justify-center gap-3">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() =>
                                atualizarQuantidade(
                                  produto.id,
                                  produto.quantidade_estoque - 1,
                                )
                              }
                              disabled={
                                processandoId === produto.id ||
                                produto.quantidade_estoque <= 0
                              }
                            >
                              <Minus size={14} />
                            </Button>
                            <span className="w-8 text-center font-bold text-lg">
                              {produto.quantidade_estoque}
                            </span>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() =>
                                atualizarQuantidade(
                                  produto.id,
                                  produto.quantidade_estoque + 1,
                                )
                              }
                              disabled={processandoId === produto.id}
                            >
                              <Plus size={14} />
                            </Button>
                          </div>
                        ) : (
                          <Badge
                            variant="secondary"
                            className="font-normal text-xs dark:bg-gray-800"
                          >
                            Ilimitado
                          </Badge>
                        )}
                      </TableCell>

                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => abrirModalVinculos(produto)}
                          className="text-cookie-primary hover:text-cookie-primary hover:bg-cookie-primary/10"
                        >
                          <Layers size={16} className="mr-2" />
                          Definir
                        </Button>
                      </TableCell>

                      <TableCell className="text-right pr-6">
                        <div className="flex items-center justify-end gap-3">
                          <span className="text-sm text-gray-500 font-medium w-16 text-right">
                            {produto.ativo ? "Público" : "Oculto"}
                          </span>
                          <Switch
                            checked={produto.ativo}
                            disabled={processandoId === produto.id}
                            onCheckedChange={() =>
                              alternarStatusProduto(produto.id, produto.ativo)
                            }
                            className="data-[state=checked]:bg-green-500"
                          />
                        </div>
                      </TableCell>

                      <TableCell className="text-right pr-6">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              navigate(`/admin/catalogo?editar=${produto.id}`)
                            }
                            className="gap-2"
                          >
                            <Pencil size={14} />
                            Editar
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                            disabled={processandoId === produto.id}
                            title="Excluir produto"
                            onClick={() => void excluirProduto(produto)}
                          >
                            {processandoId === produto.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Trash2 size={14} />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                </table>
              </div>
            </TabsContent>
          )}
        </Tabs>
      )}

      {/* ========================================== */}
      {/* MODAL DE VINCULAÇÃO (SOBREPOSIÇÃO) */}
      {/* ========================================== */}
      <AnimatePresence>
        {produtoAtivo && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setProdutoAtivo(null)}
              className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-white dark:bg-surface-dark rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col max-h-[85vh]"
            >
              <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-900/20">
                <div>
                  <h3 className="font-bold text-lg dark:text-white">
                    Extras Permitidos
                  </h3>
                  <p className="text-sm text-gray-500 line-clamp-1">
                    {produtoAtivo.nome}
                  </p>
                </div>
                <button
                  onClick={() => setProdutoAtivo(null)}
                  className="p-2 bg-white dark:bg-gray-800 rounded-full border dark:border-gray-700 active:scale-95"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-5 overflow-y-auto flex-1">
                <div className="mb-4 space-y-3 p-3 rounded-xl border border-cookie-primary/30 bg-cookie-primary/5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-sm dark:text-gray-200">
                        Escolha obrigatória
                      </p>
                      <p className="text-xs text-gray-500">
                        Cliente precisa escolher pelo menos 1 adicional.
                      </p>
                    </div>
                    <Switch
                      checked={produtoAtivo.adicional_obrigatorio}
                      onCheckedChange={() => void alternarAdicionalObrigatorio()}
                      className="data-[state=checked]:bg-cookie-primary"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="adicional-maximo"
                      className="font-semibold text-sm dark:text-gray-200 block"
                    >
                      Máximo de adicionais
                      <span className="font-normal text-gray-500">
                        {" "}
                        (opcional)
                      </span>
                    </label>
                    <p className="text-xs text-gray-500 mb-2">
                      Deixe vazio para permitir todos. Ex.: 1 = só um adicional.
                    </p>
                    <Input
                      id="adicional-maximo"
                      type="number"
                      min={1}
                      inputMode="numeric"
                      placeholder="Sem limite"
                      value={produtoAtivo.adicional_maximo ?? ""}
                      onChange={(e) => {
                        const raw = e.target.value.trim();
                        const valor =
                          raw === "" ? null : Math.max(1, Number(raw) || 1);
                        setProdutoAtivo({
                          ...produtoAtivo,
                          adicional_maximo: valor,
                        });
                      }}
                      onBlur={() =>
                        void atualizarConfigAdicionais({
                          adicional_maximo: produtoAtivo.adicional_maximo,
                        })
                      }
                      className="h-10 max-w-[140px] bg-white dark:bg-gray-900"
                    />
                  </div>
                </div>

                {carregandoModal ? (
                  <div className="flex justify-center py-10">
                    <Loader2
                      className="animate-spin text-cookie-primary"
                      size={24}
                    />
                  </div>
                ) : listaAdicionaisGlobais.length === 0 ? (
                  <div className="text-center text-gray-500 py-6">
                    Nenhum adicional global cadastrado no sistema.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {listaAdicionaisGlobais.map((adc) => {
                      const vinculado = vinculosAtivos.includes(adc.id);
                      return (
                        <div
                          key={adc.id}
                          className="flex items-center justify-between p-3 rounded-xl border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900/10 transition-colors"
                        >
                          <div>
                            <p className="font-semibold text-sm dark:text-gray-200">
                              {adc.nome}
                            </p>
                            <p className="text-xs text-cookie-accent font-medium">
                              + R$ {adc.preco.toFixed(2).replace(".", ",")}
                            </p>
                          </div>
                          <Switch
                            checked={vinculado}
                            onCheckedChange={() =>
                              alternarVinculoAdicional(adc.id, vinculado)
                            }
                            className="data-[state=checked]:bg-cookie-primary"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="p-5 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/20">
                <Button
                  onClick={() => setProdutoAtivo(null)}
                  className="w-full h-12 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-xl"
                >
                  Concluir e Fechar
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
