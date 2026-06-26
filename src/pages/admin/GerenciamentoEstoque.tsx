import { AnimatePresence, motion } from "framer-motion";
import {
  Layers,
  Loader2,
  Minus,
  Package,
  Pencil,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";

// Shadcn/ui
import { toast } from "sonner";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Switch } from "../../components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";

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
  categorias: { nome: string } | null;
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
          categorias ( nome )
        `,
        )
        .order("nome", { ascending: true });

      if (error) throw new Error(error.message);
      setProdutos(data || []);
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
          ? "Produto visível no cardápio."
          : "Produto ocultado do cardápio.",
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

  const produtosFiltrados = produtos.filter((p) =>
    p.nome.toLowerCase().includes(termoBusca.toLowerCase()),
  );

  return (
    <div className="p-6 max-w-5xl mx-auto h-full space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <Package size={28} className="text-cookie-primary" /> Gestão de
            Estoque
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Gerencie produtos e libere extras para vendas.
          </p>
        </div>

        <div className="relative w-full md:w-80">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            size={16}
          />
          <Input
            placeholder="Filtrar produtos..."
            value={termoBusca}
            onChange={(e) => setTermoBusca(e.target.value)}
            className="pl-9 dark:bg-[#1a1815]"
          />
        </div>
      </div>

      {/* Tabela de Produtos */}
      <div className="border rounded-xl dark:border-gray-800 bg-white dark:bg-surface-dark shadow-sm overflow-hidden">
        {carregando ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="animate-spin text-cookie-primary" size={32} />
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-gray-50/50 dark:bg-gray-900/20">
              <TableRow>
                <TableHead className="w-[320px]">Produto</TableHead>
                <TableHead className="text-center">Quantidade</TableHead>
                <TableHead className="text-center">Extras</TableHead>
                <TableHead className="text-center">Visibilidade</TableHead>
                <TableHead className="text-right pr-6">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {produtosFiltrados.map((produto) => (
                <TableRow
                  key={produto.id}
                  className={`${!produto.ativo ? "opacity-60" : ""}`}
                >
                  <TableCell className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-800 flex-shrink-0 overflow-hidden border">
                      {produto.imagem_url ? (
                        <img
                          src={produto.imagem_url}
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
                      {produto.categorias?.nome && (
                        <span className="text-xs text-gray-500 mt-0.5">
                          {produto.categorias.nome}
                        </span>
                      )}
                      {produto.descricao && (
                        <span className="text-xs text-gray-400 mt-0.5 line-clamp-1 max-w-[240px]">
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

                  {/* NOVO BOTÃO: Gerenciar Extras */}
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
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

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
