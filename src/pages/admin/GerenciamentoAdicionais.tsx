import { IceCream, Loader2, Pencil, PlusCircle, Search, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";

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

interface Adicional {
  id: string;
  nome: string;
  preco: number;
  disponivel: boolean;
}

export function GerenciamentoAdicionais() {
  const [adicionais, setAdicionais] = useState<Adicional[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [termoBusca, setTermoBusca] = useState("");

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [novoNome, setNovoNome] = useState("");
  const [novoPreco, setNovoPreco] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    carregarAdicionais();
  }, []);

  const carregarAdicionais = async () => {
    try {
      setCarregando(true);
      const { data, error } = await supabase
        .from("adicionais")
        .select("*")
        .order("nome", { ascending: true });

      if (error) throw new Error(error.message);
      setAdicionais(data || []);
    } catch (erro: any) {
      console.error(
        "[ERRO - ADICIONAIS] Falha na leitura:",
        erro.message || erro,
      );
      toast.error("Falha ao carregar adicionais. Verifique a conexão.");
    } finally {
      setCarregando(false);
    }
  };

  const limparFormulario = () => {
    setEditandoId(null);
    setNovoNome("");
    setNovoPreco("");
  };

  const iniciarEdicao = (item: Adicional) => {
    setEditandoId(item.id);
    setNovoNome(item.nome);
    setNovoPreco(item.preco.toFixed(2));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const excluirAdicional = async (id: string, nomeAdicional: string) => {
    const { count: qtdPedidos, error: erroPedidos } = await supabase
      .from("pedido_item_adicionais")
      .select("id", { count: "exact", head: true })
      .eq("adicional_id", id);

    if (erroPedidos) {
      toast.error("Não foi possível verificar uso em pedidos.");
      return;
    }

    if (qtdPedidos && qtdPedidos > 0) {
      toast.error(
        `Não é possível excluir "${nomeAdicional}": já foi usado em pedidos. Desative-o no cardápio.`,
      );
      return;
    }

    if (
      !window.confirm(
        `Excluir o adicional "${nomeAdicional}"? Esta ação não pode ser desfeita.`,
      )
    ) {
      return;
    }

    try {
      const { error: erroVinculos } = await supabase
        .from("produto_adicionais")
        .delete()
        .eq("adicional_id", id);

      if (erroVinculos) throw new Error(erroVinculos.message);

      const { error } = await supabase.from("adicionais").delete().eq("id", id);

      if (error) throw new Error(error.message);

      setAdicionais((prev) => prev.filter((a) => a.id !== id));
      if (editandoId === id) limparFormulario();
      toast.success("Adicional excluído.");
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error("[ERRO - ADICIONAIS] Falha ao excluir:", mensagem);
      toast.error("Erro ao excluir adicional.");
    }
  };

  const alternarDisponibilidade = async (id: string, statusAtual: boolean) => {
    try {
      const novoStatus = !statusAtual;
      const { error } = await supabase
        .from("adicionais")
        .update({ disponivel: novoStatus })
        .eq("id", id);

      if (error) throw new Error(error.message);

      setAdicionais(
        adicionais.map((a) =>
          a.id === id ? { ...a, disponivel: novoStatus } : a,
        ),
      );
      toast.success(
        novoStatus
          ? "Adicional reativado no cardápio."
          : "Adicional suspenso temporariamente.",
      );
    } catch (erro: any) {
      console.error(
        "[ERRO - ADICIONAIS] Falha ao atualizar status:",
        erro.message || erro,
      );
      toast.error("Erro ao atualizar a disponibilidade do adicional.");
    }
  };

  const salvarAdicional = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoNome.trim() || !novoPreco) {
      toast.warning("Preencha o nome e o preço do adicional.");
      return;
    }

    const precoNumerico = parseFloat(novoPreco.replace(",", "."));
    if (Number.isNaN(precoNumerico) || precoNumerico < 0) {
      toast.warning("Informe um preço válido.");
      return;
    }

    try {
      setSalvando(true);

      if (editandoId) {
        const { data, error } = await supabase
          .from("adicionais")
          .update({ nome: novoNome.trim(), preco: precoNumerico })
          .eq("id", editandoId)
          .select()
          .single();

        if (error) throw new Error(error.message);

        setAdicionais(
          adicionais
            .map((a) => (a.id === editandoId ? data : a))
            .sort((a, b) => a.nome.localeCompare(b.nome)),
        );
        toast.success("Adicional atualizado com sucesso!");
      } else {
        const { data, error } = await supabase
          .from("adicionais")
          .insert([
            { nome: novoNome.trim(), preco: precoNumerico, disponivel: true },
          ])
          .select()
          .single();

        if (error) throw new Error(error.message);

        setAdicionais(
          [...adicionais, data].sort((a, b) => a.nome.localeCompare(b.nome)),
        );
        toast.success("Novo adicional cadastrado com sucesso!");
      }

      limparFormulario();
    } catch (erro: any) {
      console.error(
        "[ERRO - ADICIONAIS] Falha ao salvar:",
        erro.message || erro,
      );
      toast.error(
        editandoId
          ? "Falha ao atualizar. O nome já existe ou houve erro de rede."
          : "Falha ao cadastrar. O nome já existe ou houve erro de rede.",
      );
    } finally {
      setSalvando(false);
    }
  };

  const adicionaisFiltrados = adicionais.filter((a) =>
    a.nome.toLowerCase().includes(termoBusca.toLowerCase()),
  );

  return (
    <div className="p-6 max-w-5xl mx-auto h-full space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <IceCream size={28} className="text-cookie-primary" />
            Extras e Adicionais
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Gerencie sorvetes, caldas e coberturas oferecidos nos produtos.
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-surface-dark p-6 rounded-xl border dark:border-gray-800 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold dark:text-white">
            {editandoId ? "Editar Adicional" : "Cadastrar Novo Adicional"}
          </h2>
          {editandoId && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={limparFormulario}
              className="text-gray-500"
            >
              <X size={16} className="mr-1" />
              Cancelar edição
            </Button>
          )}
        </div>
        <form
          onSubmit={salvarAdicional}
          className="flex flex-col md:flex-row gap-4 items-end"
        >
          <div className="flex-1 w-full space-y-2">
            <label className="text-sm font-medium dark:text-gray-300">
              Nome (Ex: Bola de Sorvete de Creme)
            </label>
            <Input
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              placeholder="Digite o nome..."
              className="dark:bg-[#1a1815]"
            />
          </div>
          <div className="w-full md:w-48 space-y-2">
            <label className="text-sm font-medium dark:text-gray-300">
              Preço (R$)
            </label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={novoPreco}
              onChange={(e) => setNovoPreco(e.target.value)}
              placeholder="0.00"
              className="dark:bg-[#1a1815]"
            />
          </div>
          <Button
            type="submit"
            disabled={salvando}
            className="w-full md:w-auto bg-cookie-primary text-white h-10"
          >
            {salvando ? (
              <Loader2 className="animate-spin" size={18} />
            ) : editandoId ? (
              <>
                <Pencil size={18} className="mr-2" /> Salvar
              </>
            ) : (
              <>
                <PlusCircle size={18} className="mr-2" /> Adicionar
              </>
            )}
          </Button>
        </form>
      </div>

      <div className="border rounded-xl dark:border-gray-800 bg-white dark:bg-surface-dark shadow-sm overflow-hidden">
        <div className="p-4 border-b dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/20">
          <div className="relative w-full max-w-sm">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              size={16}
            />
            <Input
              placeholder="Buscar adicional..."
              value={termoBusca}
              onChange={(e) => setTermoBusca(e.target.value)}
              className="pl-9 dark:bg-[#1a1815] bg-white"
            />
          </div>
        </div>

        {carregando ? (
          <div className="flex justify-center items-center h-40">
            <Loader2 className="animate-spin text-cookie-primary" size={32} />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome do Extra</TableHead>
                <TableHead>Preço Adicionado</TableHead>
                <TableHead className="text-right">
                  Visibilidade no Cardápio
                </TableHead>
                <TableHead className="w-28 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {adicionaisFiltrados.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="h-24 text-center text-gray-500"
                  >
                    Nenhum adicional encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                adicionaisFiltrados.map((item) => (
                  <TableRow
                    key={item.id}
                    className={`${!item.disponivel ? "opacity-60 bg-gray-50 dark:bg-gray-900/10" : ""} ${
                      editandoId === item.id
                        ? "ring-2 ring-inset ring-cookie-primary/40"
                        : ""
                    }`}
                  >
                    <TableCell className="font-medium text-gray-900 dark:text-gray-100">
                      {item.nome}
                    </TableCell>
                    <TableCell className="text-cookie-accent font-semibold">
                      + R$ {item.preco.toFixed(2).replace(".", ",")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-3">
                        <span className="text-sm text-gray-500 font-medium w-20 text-right">
                          {item.disponivel ? "Disponível" : "Esgotado"}
                        </span>
                        <Switch
                          checked={item.disponivel}
                          onCheckedChange={() =>
                            alternarDisponibilidade(item.id, item.disponivel)
                          }
                          className="data-[state=checked]:bg-green-500"
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => iniciarEdicao(item)}
                          title="Editar adicional"
                          aria-label={`Editar ${item.nome}`}
                        >
                          <Pencil size={16} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            void excluirAdicional(item.id, item.nome)
                          }
                          title="Excluir adicional"
                          aria-label={`Excluir ${item.nome}`}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
