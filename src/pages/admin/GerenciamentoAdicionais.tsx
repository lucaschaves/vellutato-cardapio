import { IceCream, Loader2, PlusCircle, Search } from "lucide-react";
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

  // Estados para cadastro
  const [novoNome, setNovoNome] = useState("");
  const [novoPreco, setNovoPreco] = useState("");
  const [cadastrando, setCadastrando] = useState(false);

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

  const cadastrarAdicional = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoNome.trim() || !novoPreco) {
      toast.warning("Preencha o nome e o preço do adicional.");
      return;
    }

    try {
      setCadastrando(true);
      const precoNumerico = parseFloat(novoPreco.replace(",", "."));

      const { data, error } = await supabase
        .from("adicionais")
        .insert([{ nome: novoNome, preco: precoNumerico, disponivel: true }])
        .select()
        .single();

      if (error) throw new Error(error.message);

      setAdicionais(
        [...adicionais, data].sort((a, b) => a.nome.localeCompare(b.nome)),
      );
      setNovoNome("");
      setNovoPreco("");
      toast.success("Novo adicional cadastrado com sucesso!");

      console.info(`[SUCESSO] Adicional "${data.nome}" inserido na base.`);
    } catch (erro: any) {
      console.error(
        "[ERRO - ADICIONAIS] Falha de inserção:",
        erro.message || erro,
      );
      toast.error(
        "Falha ao cadastrar. O nome já existe ou houve erro de rede.",
      );
    } finally {
      setCadastrando(false);
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

      {/* Painel de Cadastro Rápido */}
      <div className="bg-white dark:bg-surface-dark p-6 rounded-xl border dark:border-gray-800 shadow-sm">
        <h2 className="text-lg font-semibold mb-4 dark:text-white">
          Cadastrar Novo Adicional
        </h2>
        <form
          onSubmit={cadastrarAdicional}
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
            disabled={cadastrando}
            className="w-full md:w-auto bg-cookie-primary text-white h-10"
          >
            {cadastrando ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              <>
                <PlusCircle size={18} className="mr-2" /> Adicionar
              </>
            )}
          </Button>
        </form>
      </div>

      {/* Lista de Adicionais Ativos */}
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {adicionaisFiltrados.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="h-24 text-center text-gray-500"
                  >
                    Nenhum adicional encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                adicionaisFiltrados.map((item) => (
                  <TableRow
                    key={item.id}
                    className={`${!item.disponivel ? "opacity-60 bg-gray-50 dark:bg-gray-900/10" : ""}`}
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
