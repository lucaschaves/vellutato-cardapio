import { Loader2, Search, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { formatarMoeda } from "../../lib/pedidosAdmin";
import { formatarTelefoneDeSalvo } from "../../lib/telefone";
import { supabase } from "../../lib/supabase";
import { Input } from "../../components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";

interface Cliente {
  id: string;
  nome: string;
  celular: string;
  total_pedidos: number | null;
  valor_gasto: number | null;
  ultimo_pedido: string | null;
  created_at: string | null;
}

export function GerenciamentoClientes() {
  const navigate = useNavigate();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [termoBusca, setTermoBusca] = useState("");

  useEffect(() => {
    void carregarClientes();
  }, []);

  const carregarClientes = async () => {
    try {
      setCarregando(true);
      const { data, error } = await supabase
        .from("clientes")
        .select("*")
        .order("ultimo_pedido", { ascending: false, nullsFirst: false });

      if (error) throw error;
      setClientes((data as Cliente[]) || []);
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error("[ERRO - CLIENTES]", mensagem);
      toast.error("Falha ao carregar clientes.");
    } finally {
      setCarregando(false);
    }
  };

  const clientesFiltrados = clientes.filter((cliente) => {
    const termo = termoBusca.trim().toLowerCase();
    if (!termo) return true;
    return (
      cliente.nome.toLowerCase().includes(termo) ||
      cliente.celular.includes(termo.replace(/\D/g, "")) ||
      formatarTelefoneDeSalvo(cliente.celular).includes(termo)
    );
  });

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <Users size={28} className="text-cookie-primary" />
            Clientes
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Base de clientes identificados pelo celular. Clique para ver o
            histórico de pedidos.
          </p>
        </div>
        <div className="relative w-full md:w-80">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            size={16}
          />
          <Input
            placeholder="Buscar por nome ou celular..."
            value={termoBusca}
            onChange={(e) => setTermoBusca(e.target.value)}
            className="pl-9 dark:bg-[#1a1815]"
          />
        </div>
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
                <TableHead>Nome</TableHead>
                <TableHead>Celular</TableHead>
                <TableHead>Pedidos</TableHead>
                <TableHead>Total gasto</TableHead>
                <TableHead>Último pedido</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientesFiltrados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-gray-500">
                    Nenhum cliente cadastrado ainda.
                  </TableCell>
                </TableRow>
              ) : (
                clientesFiltrados.map((cliente) => (
                  <TableRow
                    key={cliente.id}
                    className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    onClick={() => navigate(`/admin/clientes/${cliente.id}`)}
                  >
                    <TableCell className="font-semibold text-cookie-primary">
                      {cliente.nome}
                    </TableCell>
                    <TableCell>{formatarTelefoneDeSalvo(cliente.celular)}</TableCell>
                    <TableCell>{cliente.total_pedidos || 0}</TableCell>
                    <TableCell>{formatarMoeda(cliente.valor_gasto)}</TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {cliente.ultimo_pedido
                        ? new Date(cliente.ultimo_pedido).toLocaleString("pt-BR")
                        : "—"}
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
