import {
  ChevronDown,
  ChevronUp,
  History,
  Loader2,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, Fragment } from "react";
import { toast } from "sonner";
import { Badge } from "../../components/ui/badge";
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
import {
  formatarDataHora,
  formatarMoeda,
  obterClasseStatus,
  obterInicioPeriodo,
  obterValorPedido,
  STATUS_PEDIDO_LABEL,
  type PeriodoRelatorio,
} from "../../lib/pedidosAdmin";
import { supabase } from "../../lib/supabase";

interface ItemHistorico {
  id: string;
  quantidade: number;
  preco_unitario: number;
  observacoes: string | null;
  produtos: { nome: string } | null;
  pedido_item_adicionais: Array<{
    preco_aplicado: number;
    adicionais: { nome: string } | null;
  }>;
}

interface PedidoHistorico {
  id: string;
  sequencia_pedido: number;
  cliente_nome: string;
  cliente_celular: string | null;
  cliente_id: string | null;
  identificador: string;
  origem: string;
  status: string;
  total: number | null;
  valor_total: number | null;
  desconto_aplicado: number | null;
  criado_em: string;
  cupons: { codigo: string; tipo: string; valor: number } | null;
  pedido_itens: ItemHistorico[];
}

const PERIODOS: { id: PeriodoRelatorio; label: string }[] = [
  { id: "hoje", label: "Hoje" },
  { id: "7dias", label: "7 dias" },
  { id: "30dias", label: "30 dias" },
  { id: "todos", label: "Todos" },
];

const FILTROS_STATUS = [
  { id: "todos", label: "Todos os status" },
  { id: "pendente", label: "Pendente" },
  { id: "em_producao", label: "Em produção" },
  { id: "pronto", label: "Pronto" },
  { id: "entregue", label: "Entregue" },
  { id: "pago", label: "Pago" },
  { id: "cancelado", label: "Cancelado" },
];

const ITENS_POR_PAGINA = 10;

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

export function HistoricoPedidos() {
  const [pedidos, setPedidos] = useState<PedidoHistorico[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [termoBusca, setTermoBusca] = useState("");
  const [periodo, setPeriodo] = useState<PeriodoRelatorio>("30dias");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [expandidoId, setExpandidoId] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);

  const carregarHistorico = useCallback(async () => {
    try {
      setCarregando(true);

      let query = supabase
        .from("pedidos")
        .select(
          `
          id, sequencia_pedido, cliente_nome, cliente_celular, cliente_id,
          identificador, origem, status, total, valor_total, desconto_aplicado,
          criado_em,
          cupons ( codigo, tipo, valor ),
          pedido_itens (
            id, quantidade, preco_unitario, observacoes,
            produtos ( nome ),
            pedido_item_adicionais (
              preco_aplicado,
              adicionais ( nome )
            )
          )
        `,
        )
        .order("criado_em", { ascending: false })
        .limit(500);

      const inicio = obterInicioPeriodo(periodo);
      if (inicio) {
        query = query.gte("criado_em", inicio);
      }

      if (filtroStatus !== "todos") {
        query = query.eq("status", filtroStatus);
      }

      const { data, error } = await query;
      if (error) throw error;

      setPedidos((data as unknown as PedidoHistorico[]) || []);
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error("[ERRO - HISTÓRICO]", mensagem);
      toast.error("Falha ao carregar o histórico de pedidos.");
    } finally {
      setCarregando(false);
    }
  }, [filtroStatus, periodo]);

  useEffect(() => {
    void carregarHistorico();
  }, [carregarHistorico]);

  useEffect(() => {
    setPagina(1);
    setExpandidoId(null);
  }, [termoBusca, periodo, filtroStatus]);

  const pedidosFiltrados = useMemo(() => {
    const termo = termoBusca.trim().toLowerCase();
    // Já vem do banco do mais recente para o mais antigo
    if (!termo) return pedidos;

    return pedidos.filter((pedido) => {
      const campos = [
        pedido.cliente_nome,
        pedido.cliente_celular || "",
        pedido.identificador,
        String(pedido.sequencia_pedido),
        pedido.cupons?.codigo || "",
        pedido.pedido_itens
          .map((item) => item.produtos?.nome || "")
          .join(" "),
      ];

      return campos.some((campo) => campo.toLowerCase().includes(termo));
    });
  }, [pedidos, termoBusca]);

  const totalPaginas = Math.max(
    1,
    Math.ceil(pedidosFiltrados.length / ITENS_POR_PAGINA),
  );

  useEffect(() => {
    if (pagina > totalPaginas) setPagina(totalPaginas);
  }, [pagina, totalPaginas]);

  const pedidosPagina = useMemo(() => {
    const inicio = (pagina - 1) * ITENS_POR_PAGINA;
    return pedidosFiltrados.slice(inicio, inicio + ITENS_POR_PAGINA);
  }, [pedidosFiltrados, pagina]);

  const paginasVisiveis = useMemo(
    () => gerarPaginasVisiveis(pagina, totalPaginas),
    [pagina, totalPaginas],
  );

  const irParaPagina = (nova: number) => {
    setPagina(Math.min(totalPaginas, Math.max(1, nova)));
    setExpandidoId(null);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <History size={28} className="text-cookie-primary" />
            Histórico de Pedidos
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Consulte pedidos finalizados, pagos e em andamento — do mais recente
            ao mais antigo.
          </p>
        </div>

        <div className="relative w-full lg:w-80">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            size={16}
          />
          <Input
            placeholder="Buscar cliente, mesa ou produto..."
            value={termoBusca}
            onChange={(evento) => setTermoBusca(evento.target.value)}
            className="pl-9 dark:bg-[#1a1815]"
          />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {PERIODOS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setPeriodo(item.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                periodo === item.id
                  ? "bg-cookie-primary text-white border-cookie-primary"
                  : "bg-white dark:bg-surface-dark border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <select
          value={filtroStatus}
          onChange={(evento) => setFiltroStatus(evento.target.value)}
          className="h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1815] px-3 text-sm text-gray-900 dark:text-white"
        >
          {FILTROS_STATUS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      {carregando ? (
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-cookie-primary" size={40} />
        </div>
      ) : pedidosFiltrados.length === 0 ? (
        <div className="text-center py-20 text-gray-500 bg-white dark:bg-surface-dark rounded-xl border border-dashed dark:border-gray-800">
          <History size={48} className="mx-auto mb-3 opacity-20" />
          <p className="text-lg font-medium">Nenhum pedido encontrado.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="border rounded-xl dark:border-gray-800 bg-white dark:bg-surface-dark shadow-sm overflow-hidden">
            <Table>
              <TableHeader className="bg-gray-50/80 dark:bg-gray-900/40">
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Pedido</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Itens</TableHead>
                  <TableHead className="text-right pr-4">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pedidosPagina.map((pedido) => {
                  const expandido = expandidoId === pedido.id;
                  const totalItens = pedido.pedido_itens.reduce(
                    (acc, item) => acc + item.quantidade,
                    0,
                  );

                  return (
                    <Fragment key={pedido.id}>
                      <TableRow
                        className="cursor-pointer"
                        onClick={() =>
                          setExpandidoId(expandido ? null : pedido.id)
                        }
                      >
                        <TableCell className="w-10 text-gray-400">
                          {expandido ? (
                            <ChevronUp size={16} />
                          ) : (
                            <ChevronDown size={16} />
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span className="font-black text-gray-900 dark:text-white">
                              #{pedido.sequencia_pedido}
                            </span>
                            <div className="flex flex-wrap gap-1">
                              <Badge variant="outline" className="text-[10px]">
                                {pedido.identificador}
                              </Badge>
                              {pedido.cupons && (
                                <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 border-0 text-[10px]">
                                  {pedido.cupons.codigo}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900 dark:text-white truncate max-w-[180px]">
                              {pedido.cliente_nome}
                            </p>
                            {pedido.cliente_celular && (
                              <p className="text-xs text-gray-500">
                                {pedido.cliente_celular}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${obterClasseStatus(pedido.status)}`}
                          >
                            {STATUS_PEDIDO_LABEL[pedido.status] ||
                              pedido.status}
                          </span>
                        </TableCell>
                        <TableCell className="capitalize text-gray-600 dark:text-gray-300">
                          {pedido.origem}
                        </TableCell>
                        <TableCell className="text-gray-600 dark:text-gray-300 whitespace-nowrap">
                          {formatarDataHora(pedido.criado_em)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-gray-600 dark:text-gray-300">
                          {totalItens}
                        </TableCell>
                        <TableCell className="text-right pr-4 font-black text-cookie-accent tabular-nums whitespace-nowrap">
                          {formatarMoeda(obterValorPedido(pedido))}
                        </TableCell>
                      </TableRow>

                      {expandido && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell
                            colSpan={8}
                            className="bg-gray-50/80 dark:bg-[#1a1815] p-4"
                          >
                            <div className="space-y-3">
                              {(Number(pedido.desconto_aplicado || 0) > 0 ||
                                pedido.valor_total != null) && (
                                <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-surface-dark p-3">
                                  {pedido.valor_total != null && (
                                    <p>
                                      Subtotal:{" "}
                                      {formatarMoeda(pedido.valor_total)}
                                    </p>
                                  )}
                                  {Number(pedido.desconto_aplicado || 0) >
                                    0 && (
                                    <p className="text-green-600 dark:text-green-400 font-medium">
                                      Desconto
                                      {pedido.cupons
                                        ? ` (${pedido.cupons.codigo})`
                                        : ""}
                                      : -
                                      {formatarMoeda(pedido.desconto_aplicado)}
                                    </p>
                                  )}
                                  <p className="font-bold text-gray-900 dark:text-white">
                                    Total:{" "}
                                    {formatarMoeda(obterValorPedido(pedido))}
                                  </p>
                                </div>
                              )}

                              {pedido.pedido_itens.map((item) => (
                                <div
                                  key={item.id}
                                  className="flex justify-between gap-4 text-sm rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-surface-dark p-3"
                                >
                                  <div>
                                    <p className="font-semibold text-gray-900 dark:text-white">
                                      {item.quantidade}x{" "}
                                      {item.produtos?.nome || "Produto"}
                                    </p>
                                    {item.observacoes && (
                                      <p className="text-xs text-gray-500 mt-1">
                                        Obs: {item.observacoes}
                                      </p>
                                    )}
                                    {item.pedido_item_adicionais.length > 0 && (
                                      <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                                        {item.pedido_item_adicionais.map(
                                          (adicional, idx) => (
                                            <p key={idx}>
                                              + {adicional.adicionais?.nome} (
                                              {formatarMoeda(
                                                adicional.preco_aplicado,
                                              )}
                                              )
                                            </p>
                                          ),
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  <span className="font-bold text-gray-900 dark:text-white shrink-0">
                                    {formatarMoeda(
                                      item.preco_unitario * item.quantidade,
                                    )}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-gray-500 text-center sm:text-left">
              {pedidosFiltrados.length}{" "}
              {pedidosFiltrados.length === 1 ? "pedido" : "pedidos"} · página{" "}
              {pagina} de {totalPaginas}
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
        </div>
      )}
    </div>
  );
}
