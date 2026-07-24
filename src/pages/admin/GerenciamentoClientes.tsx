import { Loader2, Search, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Input } from "../../components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "../../components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { formatarMoeda } from "../../lib/pedidosAdmin";
import { formatarTelefoneDeSalvo } from "../../lib/telefone";
import { supabase } from "../../lib/supabase";

interface Cliente {
  id: string;
  nome: string;
  celular: string;
  total_pedidos: number | null;
  valor_gasto: number | null;
  ultimo_pedido: string | null;
  created_at: string | null;
}

const ITENS_POR_PAGINA = 15;

function gerarPaginasVisiveis(
  paginaAtual: number,
  totalPaginas: number,
): Array<number | "ellipsis"> {
  if (totalPaginas <= 7) {
    return Array.from({ length: totalPaginas }, (_, i) => i + 1);
  }

  const paginas: Array<number | "ellipsis"> = [1];
  if (paginaAtual > 3) paginas.push("ellipsis");

  const inicio = Math.max(2, paginaAtual - 1);
  const fim = Math.min(totalPaginas - 1, paginaAtual + 1);
  for (let p = inicio; p <= fim; p++) paginas.push(p);

  if (paginaAtual < totalPaginas - 2) paginas.push("ellipsis");
  paginas.push(totalPaginas);
  return paginas;
}

export function GerenciamentoClientes() {
  const navigate = useNavigate();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [termoBusca, setTermoBusca] = useState("");
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    void carregarClientes();
  }, []);

  useEffect(() => {
    setPagina(1);
  }, [termoBusca]);

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

  const clientesFiltrados = useMemo(() => {
    const termo = termoBusca.trim().toLowerCase();
    if (!termo) return clientes;

    return clientes.filter((cliente) => {
      return (
        cliente.nome.toLowerCase().includes(termo) ||
        cliente.celular.includes(termo.replace(/\D/g, "")) ||
        formatarTelefoneDeSalvo(cliente.celular).includes(termo)
      );
    });
  }, [clientes, termoBusca]);

  const totalPaginas = Math.max(
    1,
    Math.ceil(clientesFiltrados.length / ITENS_POR_PAGINA),
  );

  useEffect(() => {
    if (pagina > totalPaginas) setPagina(totalPaginas);
  }, [pagina, totalPaginas]);

  const clientesPagina = useMemo(() => {
    const inicio = (pagina - 1) * ITENS_POR_PAGINA;
    return clientesFiltrados.slice(inicio, inicio + ITENS_POR_PAGINA);
  }, [clientesFiltrados, pagina]);

  const paginasVisiveis = useMemo(
    () => gerarPaginasVisiveis(pagina, totalPaginas),
    [pagina, totalPaginas],
  );

  const irParaPagina = (nova: number) => {
    setPagina(Math.min(totalPaginas, Math.max(1, nova)));
  };

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
        <div className="space-y-4">
          <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-sm">
            <Table>
              <TableHeader className="bg-gray-50/80 dark:bg-gray-900/40">
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Celular</TableHead>
                  <TableHead className="text-right">Pedidos</TableHead>
                  <TableHead className="text-right">Total gasto</TableHead>
                  <TableHead className="text-right pr-4">Último pedido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientesFiltrados.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center py-10 text-gray-500"
                    >
                      Nenhum cliente encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  clientesPagina.map((cliente) => (
                    <TableRow
                      key={cliente.id}
                      className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      onClick={() => navigate(`/admin/clientes/${cliente.id}`)}
                    >
                      <TableCell className="font-semibold text-cookie-primary">
                        {cliente.nome}
                      </TableCell>
                      <TableCell>
                        {formatarTelefoneDeSalvo(cliente.celular)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {cliente.total_pedidos || 0}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatarMoeda(cliente.valor_gasto)}
                      </TableCell>
                      <TableCell className="text-right pr-4 text-sm text-gray-500 whitespace-nowrap">
                        {cliente.ultimo_pedido
                          ? new Date(cliente.ultimo_pedido).toLocaleString(
                              "pt-BR",
                            )
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {clientesFiltrados.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-sm text-gray-500 text-center sm:text-left">
                {clientesFiltrados.length}{" "}
                {clientesFiltrados.length === 1 ? "cliente" : "clientes"} ·
                página {pagina} de {totalPaginas}
              </p>

              {totalPaginas > 1 && (
                <Pagination className="mx-0 w-auto justify-center sm:justify-end">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        text="Anterior"
                        href="#"
                        aria-disabled={pagina <= 1}
                        className={
                          pagina <= 1 ? "pointer-events-none opacity-50" : ""
                        }
                        onClick={(e) => {
                          e.preventDefault();
                          irParaPagina(pagina - 1);
                        }}
                      />
                    </PaginationItem>

                    {paginasVisiveis.map((item, idx) =>
                      item === "ellipsis" ? (
                        <PaginationItem key={`e-${idx}`}>
                          <PaginationEllipsis />
                        </PaginationItem>
                      ) : (
                        <PaginationItem key={item}>
                          <PaginationLink
                            href="#"
                            isActive={item === pagina}
                            onClick={(e) => {
                              e.preventDefault();
                              irParaPagina(item);
                            }}
                          >
                            {item}
                          </PaginationLink>
                        </PaginationItem>
                      ),
                    )}

                    <PaginationItem>
                      <PaginationNext
                        text="Próxima"
                        href="#"
                        aria-disabled={pagina >= totalPaginas}
                        className={
                          pagina >= totalPaginas
                            ? "pointer-events-none opacity-50"
                            : ""
                        }
                        onClick={(e) => {
                          e.preventDefault();
                          irParaPagina(pagina + 1);
                        }}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
