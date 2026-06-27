import { Loader2, Pencil, PlusCircle, Search, Ticket, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
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
import { formatarTelefoneDeSalvo } from "../../lib/telefone";
import { supabase } from "../../lib/supabase";

interface ClienteOpcao {
  id: string;
  nome: string;
  celular: string;
}

interface Cupom {
  id: string;
  codigo: string;
  tipo: string;
  valor: number;
  valor_minimo: number | null;
  validade: string | null;
  limite_uso: number | null;
  usos: number | null;
  ativo: boolean | null;
  cliente_id: string | null;
  clientes: { nome: string; celular: string } | null;
}

export function GerenciamentoCupons() {
  const [cupons, setCupons] = useState<Cupom[]>([]);
  const [clientes, setClientes] = useState<ClienteOpcao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [termoBusca, setTermoBusca] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);

  const [codigo, setCodigo] = useState("");
  const [tipo, setTipo] = useState<"percentual" | "fixo">("percentual");
  const [valor, setValor] = useState("");
  const [valorMinimo, setValorMinimo] = useState("");
  const [validade, setValidade] = useState("");
  const [limiteUso, setLimiteUso] = useState("");
  const [clienteId, setClienteId] = useState("");

  useEffect(() => {
    void carregarDados();
  }, []);

  const carregarDados = async () => {
    try {
      setCarregando(true);

      const [resCupons, resClientes] = await Promise.all([
        supabase
          .from("cupons")
          .select("*, clientes ( nome, celular )")
          .order("created_at", { ascending: false }),
        supabase
          .from("clientes")
          .select("id, nome, celular")
          .order("nome", { ascending: true }),
      ]);

      if (resCupons.error) throw resCupons.error;
      if (resClientes.error) throw resClientes.error;

      setCupons((resCupons.data as unknown as Cupom[]) || []);
      setClientes((resClientes.data as ClienteOpcao[]) || []);
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error("[ERRO - CUPONS]", mensagem);
      toast.error("Falha ao carregar cupons.");
    } finally {
      setCarregando(false);
    }
  };

  const limparFormulario = () => {
    setEditandoId(null);
    setCodigo("");
    setTipo("percentual");
    setValor("");
    setValorMinimo("");
    setValidade("");
    setLimiteUso("");
    setClienteId("");
  };

  const iniciarEdicao = (cupom: Cupom) => {
    setEditandoId(cupom.id);
    setCodigo(cupom.codigo);
    setTipo(cupom.tipo as "percentual" | "fixo");
    setValor(String(cupom.valor));
    setValorMinimo(
      cupom.valor_minimo != null ? String(cupom.valor_minimo) : "",
    );
    setValidade(
      cupom.validade ? cupom.validade.slice(0, 10) : "",
    );
    setLimiteUso(
      cupom.limite_uso != null ? String(cupom.limite_uso) : "",
    );
    setClienteId(cupom.cliente_id || "");
  };

  const salvarCupom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codigo.trim() || !valor) {
      toast.warning("Preencha código e valor.");
      return;
    }

    const payload = {
      codigo: codigo.trim().toUpperCase(),
      tipo,
      valor: parseFloat(valor.replace(",", ".")),
      valor_minimo: valorMinimo
        ? parseFloat(valorMinimo.replace(",", "."))
        : null,
      validade: validade || null,
      limite_uso: limiteUso ? parseInt(limiteUso, 10) : null,
      cliente_id: clienteId || null,
    };

    try {
      setSalvando(true);

      if (editandoId) {
        const { data, error } = await supabase
          .from("cupons")
          .update(payload)
          .eq("id", editandoId)
          .select("*, clientes ( nome, celular )")
          .single();

        if (error) throw error;

        setCupons((prev) =>
          prev.map((c) =>
            c.id === editandoId ? (data as unknown as Cupom) : c,
          ),
        );
        toast.success("Cupom atualizado!");
      } else {
        const { data, error } = await supabase
          .from("cupons")
          .insert({ ...payload, ativo: true, usos: 0 })
          .select("*, clientes ( nome, celular )")
          .single();

        if (error) throw error;

        setCupons((prev) => [data as unknown as Cupom, ...prev]);
        toast.success("Cupom criado!");
      }

      limparFormulario();
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error("[ERRO - CUPONS]", mensagem);
      toast.error("Erro ao salvar cupom.");
    } finally {
      setSalvando(false);
    }
  };

  const alternarAtivo = async (id: string, ativo: boolean | null) => {
    const novoStatus = !ativo;
    const { error } = await supabase
      .from("cupons")
      .update({ ativo: novoStatus })
      .eq("id", id);

    if (error) {
      toast.error("Erro ao atualizar cupom.");
      return;
    }

    setCupons((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ativo: novoStatus } : c)),
    );
  };

  const excluirCupom = async (id: string, codigoCupom: string) => {
    const { count, error: erroCount } = await supabase
      .from("pedidos")
      .select("id", { count: "exact", head: true })
      .eq("cupom_id", id);

    if (erroCount) {
      toast.error("Não foi possível verificar uso do cupom.");
      return;
    }

    if (count && count > 0) {
      toast.error(
        `O cupom ${codigoCupom} já foi usado em ${count} pedido(s) e não pode ser excluído.`,
      );
      return;
    }

    if (!window.confirm(`Excluir o cupom ${codigoCupom}?`)) return;

    const { error } = await supabase.from("cupons").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir cupom.");
      return;
    }

    setCupons((prev) => prev.filter((c) => c.id !== id));
    if (editandoId === id) limparFormulario();
    toast.success("Cupom excluído.");
  };

  const cuponsFiltrados = cupons.filter((c) => {
    const termo = termoBusca.toLowerCase();
    if (!termo) return true;
    return (
      c.codigo.toLowerCase().includes(termo) ||
      (c.clientes?.nome || "").toLowerCase().includes(termo)
    );
  });

  const rotuloCliente = (cupom: Cupom) => {
    if (!cupom.cliente_id || !cupom.clientes) return "Público";
    return `${cupom.clientes.nome} (${formatarTelefoneDeSalvo(cupom.clientes.celular)})`;
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
          <Ticket size={28} className="text-cookie-primary" />
          Cupons
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Crie, edite e exclua códigos promocionais públicos ou exclusivos.
        </p>
      </div>

      <form
        onSubmit={salvarCupom}
        className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-4"
      >
        <h2 className="font-bold text-gray-900 dark:text-white">
          {editandoId ? "Editar cupom" : "Novo cupom"}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Input
            placeholder="Código (ex: VERAO10)"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            className="uppercase"
          />
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as "percentual" | "fixo")}
            className="h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1815] px-3 text-sm text-gray-900 dark:text-white"
          >
            <option value="percentual">Percentual (%)</option>
            <option value="fixo">Valor fixo (R$)</option>
          </select>
          <Input
            placeholder={tipo === "percentual" ? "Valor (%)" : "Valor (R$)"}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
          />
          <Input
            placeholder="Pedido mínimo (opcional)"
            value={valorMinimo}
            onChange={(e) => setValorMinimo(e.target.value)}
          />
          <Input
            type="date"
            value={validade}
            onChange={(e) => setValidade(e.target.value)}
          />
          <Input
            placeholder="Limite de usos (opcional)"
            value={limiteUso}
            onChange={(e) => setLimiteUso(e.target.value)}
          />
          <select
            value={clienteId}
            onChange={(e) => setClienteId(e.target.value)}
            className="h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1815] px-3 text-sm text-gray-900 dark:text-white lg:col-span-3"
          >
            <option value="">Cliente: todos (público)</option>
            {clientes.map((cliente) => (
              <option key={cliente.id} value={cliente.id}>
                {cliente.nome} — {formatarTelefoneDeSalvo(cliente.celular)}
              </option>
            ))}
          </select>
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
                <PlusCircle size={18} className="mr-2" /> Criar cupom
              </>
            )}
          </Button>
          {editandoId && (
            <Button type="button" variant="outline" onClick={limparFormulario}>
              Cancelar
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
          placeholder="Buscar cupom ou cliente..."
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
                <TableHead>Código</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Usos</TableHead>
                <TableHead>Validade</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cuponsFiltrados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-gray-500">
                    Nenhum cupom cadastrado.
                  </TableCell>
                </TableRow>
              ) : (
                cuponsFiltrados.map((cupom) => (
                  <TableRow key={cupom.id}>
                    <TableCell className="font-bold">{cupom.codigo}</TableCell>
                    <TableCell className="text-sm max-w-[160px] truncate">
                      {cupom.cliente_id ? (
                        <span className="text-purple-700 dark:text-purple-300 font-medium">
                          {rotuloCliente(cupom)}
                        </span>
                      ) : (
                        <span className="text-gray-500">Público</span>
                      )}
                    </TableCell>
                    <TableCell className="capitalize">{cupom.tipo}</TableCell>
                    <TableCell>
                      {cupom.tipo === "percentual"
                        ? `${cupom.valor}%`
                        : `R$ ${cupom.valor.toFixed(2)}`}
                    </TableCell>
                    <TableCell>
                      {cupom.usos || 0}
                      {cupom.limite_uso != null ? ` / ${cupom.limite_uso}` : ""}
                    </TableCell>
                    <TableCell>
                      {cupom.validade
                        ? new Date(cupom.validade).toLocaleDateString("pt-BR")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={cupom.ativo !== false}
                        onCheckedChange={() =>
                          alternarAtivo(cupom.id, cupom.ativo)
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => iniciarEdicao(cupom)}
                        >
                          <Pencil size={16} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-red-600"
                          onClick={() =>
                            void excluirCupom(cupom.id, cupom.codigo)
                          }
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
        </div>
      )}
    </div>
  );
}
