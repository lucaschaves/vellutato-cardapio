import {
  IceCream,
  Loader2,
  Pencil,
  PlusCircle,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Switch } from "../../components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import {
  normalizarDisponibilidade,
  rotuloDisponibilidadeCurto,
  type DisponibilidadeProduto,
} from "../../lib/disponibilidadeProduto";
import { supabase } from "../../lib/supabase";

interface Adicional {
  id: string;
  nome: string;
  preco: number;
  disponivel: boolean;
  disponibilidade: DisponibilidadeProduto;
}

function ehAdicionalGratis(preco: number) {
  return Number(preco) === 0;
}

export function GerenciamentoAdicionais() {
  const [adicionais, setAdicionais] = useState<Adicional[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [termoBusca, setTermoBusca] = useState("");
  const [aba, setAba] = useState<"ativos" | "desativados">("ativos");
  const [tipoPreco, setTipoPreco] = useState<"pagos" | "gratis">("pagos");

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [novoNome, setNovoNome] = useState("");
  const [novoPreco, setNovoPreco] = useState("");
  const [novaDisponibilidade, setNovaDisponibilidade] =
    useState<DisponibilidadeProduto>("ambos");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    void carregarAdicionais();
  }, []);

  const carregarAdicionais = async () => {
    try {
      setCarregando(true);
      const { data, error } = await supabase
        .from("adicionais")
        .select("*")
        .order("nome", { ascending: true });

      if (error) throw new Error(error.message);
      setAdicionais(
        ((data as Adicional[]) || []).map((a) => ({
          ...a,
          disponibilidade: normalizarDisponibilidade(a.disponibilidade),
        })),
      );
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error("[ERRO - ADICIONAIS] Falha na leitura:", mensagem);
      toast.error("Falha ao carregar adicionais. Verifique a conexão.");
    } finally {
      setCarregando(false);
    }
  };

  const limparFormulario = () => {
    setEditandoId(null);
    setNovoNome("");
    setNovoPreco("");
    setNovaDisponibilidade("ambos");
  };

  const iniciarEdicao = (item: Adicional) => {
    setEditandoId(item.id);
    setNovoNome(item.nome);
    setNovoPreco(item.preco.toFixed(2));
    setNovaDisponibilidade(normalizarDisponibilidade(item.disponibilidade));
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
          ? "Adicional reativado — movido para a aba Ativos."
          : "Adicional desativado — movido para a aba Desativados.",
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
          .update({
            nome: novoNome.trim(),
            preco: precoNumerico,
            disponibilidade: novaDisponibilidade,
          })
          .eq("id", editandoId)
          .select()
          .single();

        if (error) throw new Error(error.message);

        setAdicionais(
          adicionais
            .map((a) =>
              a.id === editandoId
                ? {
                    ...data,
                    disponibilidade: normalizarDisponibilidade(
                      data.disponibilidade,
                    ),
                  }
                : a,
            )
            .sort((a, b) => a.nome.localeCompare(b.nome)),
        );
        toast.success("Adicional atualizado com sucesso!");
      } else {
        const { data, error } = await supabase
          .from("adicionais")
          .insert([
            {
              nome: novoNome.trim(),
              preco: precoNumerico,
              disponivel: true,
              disponibilidade: novaDisponibilidade,
            },
          ])
          .select()
          .single();

        if (error) throw new Error(error.message);

        setAdicionais(
          [
            ...adicionais,
            {
              ...data,
              disponibilidade: normalizarDisponibilidade(data.disponibilidade),
            },
          ].sort((a, b) => a.nome.localeCompare(b.nome)),
        );
        toast.success("Novo adicional cadastrado com sucesso!");
      }

      limparFormulario();

      const novoTipo = ehAdicionalGratis(precoNumerico) ? "gratis" : "pagos";
      setTipoPreco(novoTipo);
      setAba("ativos");
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

  const adicionaisDoTipo = adicionais.filter((a) =>
    tipoPreco === "gratis"
      ? ehAdicionalGratis(a.preco)
      : !ehAdicionalGratis(a.preco),
  );

  const qtdAtivos = adicionaisDoTipo.filter((a) => a.disponivel).length;
  const qtdDesativados = adicionaisDoTipo.filter((a) => !a.disponivel).length;
  const qtdPagos = adicionais.filter((a) => !ehAdicionalGratis(a.preco)).length;
  const qtdGratis = adicionais.filter((a) => ehAdicionalGratis(a.preco)).length;

  const adicionaisFiltrados = adicionaisDoTipo.filter((a) => {
    const naAba = aba === "ativos" ? a.disponivel : !a.disponivel;
    if (!naAba) return false;
    if (!termoBusca.trim()) return true;
    return a.nome.toLowerCase().includes(termoBusca.toLowerCase());
  });

  return (
    <div className="p-6 max-w-5xl mx-auto h-full space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <IceCream size={28} className="text-cookie-primary" />
            Extras e Adicionais
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {tipoPreco === "pagos"
              ? aba === "ativos"
                ? "Extras pagos visíveis no cardápio (aumentam o valor do item)."
                : "Extras pagos ocultos. Quem já teve venda não pode ser excluído."
              : aba === "ativos"
                ? "Opções grátis (R$ 0) visíveis no cardápio — escolha sem custo."
                : "Opções grátis ocultas do cardápio."}
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
        <form onSubmit={salvarAdicional} className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row gap-4 items-start">
            <div className="flex-1 w-full space-y-2">
              <Label htmlFor="adicional-nome">Nome</Label>
              <Input
                id="adicional-nome"
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                placeholder="Ex: Bola de sorvete de creme"
                className="dark:bg-[#1a1815]"
              />
            </div>
            <div className="w-full md:w-48 space-y-2">
              <Label htmlFor="adicional-preco">Preço (R$)</Label>
              <Input
                id="adicional-preco"
                type="number"
                step="0.01"
                min="0"
                value={novoPreco}
                onChange={(e) => setNovoPreco(e.target.value)}
                placeholder="0.00"
                className="dark:bg-[#1a1815]"
              />
              <p className="text-xs text-gray-500">
                Use 0 para opção grátis; valor maior para extra pago.
              </p>
            </div>
            <div className="w-full md:w-56 space-y-2">
              <Label htmlFor="adicional-disponibilidade">Disponibilidade</Label>
              <select
                id="adicional-disponibilidade"
                value={novaDisponibilidade}
                onChange={(e) => {
                  const valor = e.target.value;
                  setNovaDisponibilidade(
                    valor === "loja" || valor === "levar" ? valor : "ambos",
                  );
                }}
                className="w-full h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-[#1a1815] text-sm outline-none focus:ring-2 focus:ring-cookie-primary"
              >
                <option value="ambos">Loja e levar</option>
                <option value="loja">Só para comer aqui</option>
                <option value="levar">Só para levar</option>
              </select>
              <p className="text-xs text-gray-500">
                Filtrado pelo modo que o cliente escolheu.
              </p>
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
          </div>
        </form>
      </div>

      <div className="space-y-3">
        <div className="flex gap-1 overflow-x-auto">
          {(
            [
              ["pagos", "Com valor", qtdPagos],
              ["gratis", "Grátis (R$ 0)", qtdGratis],
            ] as const
          ).map(([id, label, qtd]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setTipoPreco(id);
                setAba("ativos");
              }}
              className={`px-3 py-1.5 rounded-full text-sm font-semibold shrink-0 ${
                tipoPreco === id
                  ? "bg-cookie-primary text-white"
                  : "bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300"
              }`}
            >
              {label}
              <span
                className={`ml-1.5 text-xs font-bold ${
                  tipoPreco === id ? "opacity-80" : "text-gray-400"
                }`}
              >
                ({qtd})
              </span>
            </button>
          ))}
        </div>

        <div className="flex gap-1 overflow-x-auto">
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
                <TableHead>Preço</TableHead>
                <TableHead>Modo</TableHead>
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
                    colSpan={5}
                    className="h-24 text-center text-gray-500"
                  >
                    {termoBusca.trim()
                      ? "Nenhum adicional encontrado com esse filtro."
                      : tipoPreco === "pagos"
                        ? aba === "ativos"
                          ? "Nenhum adicional pago ativo."
                          : "Nenhum adicional pago desativado."
                        : aba === "ativos"
                          ? "Nenhuma opção grátis ativa."
                          : "Nenhuma opção grátis desativada."}
                  </TableCell>
                </TableRow>
              ) : (
                adicionaisFiltrados.map((item) => (
                  <TableRow
                    key={item.id}
                    className={
                      editandoId === item.id
                        ? "ring-2 ring-inset ring-cookie-primary/40"
                        : ""
                    }
                  >
                    <TableCell className="font-medium text-gray-900 dark:text-gray-100">
                      {item.nome}
                    </TableCell>
                    <TableCell className="text-cookie-accent font-semibold">
                      {ehAdicionalGratis(item.preco)
                        ? "Grátis"
                        : `+ R$ ${item.preco.toFixed(2).replace(".", ",")}`}
                    </TableCell>
                    <TableCell className="text-sm text-gray-600 dark:text-gray-300">
                      {rotuloDisponibilidadeCurto(
                        normalizarDisponibilidade(item.disponibilidade),
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-3">
                        <span className="text-sm text-gray-500 font-medium w-24 text-right">
                          {item.disponivel ? "Disponível" : "Desativado"}
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
