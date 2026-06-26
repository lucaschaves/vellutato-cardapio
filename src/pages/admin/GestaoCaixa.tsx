import {
  Calculator,
  CheckCircle2,
  Loader2,
  Receipt,
  Search,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";

// Componentes UI (Ajuste os caminhos se necessário)
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";

interface PedidoCaixa {
  id: string;
  cliente_nome: string;
  cliente_celular: string;
  identificador: string;
  total: number;
  status: string;
}

interface ContaAgrupada {
  identificador: string;
  cliente_nome: string;
  cliente_celular: string;
  pedidos: PedidoCaixa[];
  totalGeral: number;
}

export function GestaoCaixa() {
  const [contas, setContas] = useState<ContaAgrupada[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [termoBusca, setTermoBusca] = useState("");
  const [processandoMesa, setProcessandoMesa] = useState<string | null>(null);

  useEffect(() => {
    carregarContasAbertas();
  }, []);

  const carregarContasAbertas = async () => {
    try {
      setCarregando(true);
      // Busca todos os pedidos que AINDA NÃO FORAM PAGOS nem CANCELADOS
      const { data, error } = await supabase
        .from("pedidos")
        .select(
          "id, cliente_nome, cliente_celular, identificador, total, status",
        )
        .not("status", "in", '("pago","cancelado")');

      if (error) throw error;

      // Lógica de Agrupamento (Reduce) - Agrupa pela Mesa (identificador)
      const agrupamento = (data || []).reduce(
        (acc: Record<string, ContaAgrupada>, pedido) => {
          const chave = pedido.identificador || "Balcão";

          if (!acc[chave]) {
            acc[chave] = {
              identificador: chave,
              cliente_nome: pedido.cliente_nome,
              cliente_celular: pedido.cliente_celular,
              pedidos: [],
              totalGeral: 0,
            };
          }

          acc[chave].pedidos.push(pedido);
          acc[chave].totalGeral += Number(pedido.total);
          return acc;
        },
        {},
      );

      // Converte o objeto em array e ordena pelo total (maiores contas primeiro)
      const arrayContas = Object.values(agrupamento).sort(
        (a, b) => b.totalGeral - a.totalGeral,
      );
      setContas(arrayContas);
    } catch (erro: any) {
      console.error("[ERRO - CAIXA]", erro.message);
      toast.error("Falha ao carregar as contas em aberto.");
    } finally {
      setCarregando(false);
    }
  };

  // Função para "Baixar a Conta" (Muda todos os pedidos daquela mesa para 'pago')
  const fecharConta = async (
    identificador: string,
    pedidosDaConta: PedidoCaixa[],
  ) => {
    try {
      setProcessandoMesa(identificador);
      const idsParaAtualizar = pedidosDaConta.map((p) => p.id);

      const { error } = await supabase
        .from("pedidos")
        .update({ status: "pago" })
        .in("id", idsParaAtualizar);

      if (error) throw error;

      toast.success(`Conta da ${identificador} fechada com sucesso!`);
      // Remove a conta da tela
      setContas((prev) =>
        prev.filter((c) => c.identificador !== identificador),
      );
    } catch (erro: any) {
      console.error("[ERRO - FECHAMENTO]", erro.message);
      toast.error("Erro ao fechar a conta. Tente novamente.");
    } finally {
      setProcessandoMesa(null);
    }
  };

  // Filtro de busca (pode buscar por mesa ou nome do cliente)
  const contasFiltradas = contas.filter(
    (c) =>
      c.identificador.toLowerCase().includes(termoBusca.toLowerCase()) ||
      c.cliente_nome?.toLowerCase().includes(termoBusca.toLowerCase()),
  );

  return (
    <div className="p-6 max-w-6xl mx-auto h-full space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <Calculator size={28} className="text-cookie-primary" /> Caixa e
            Comandas
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Fechamento de contas por mesa ou cliente.
          </p>
        </div>

        <div className="relative w-full md:w-80">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            size={16}
          />
          <Input
            placeholder="Buscar por mesa ou nome..."
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
      ) : contasFiltradas.length === 0 ? (
        <div className="text-center py-20 text-gray-500 bg-white dark:bg-surface-dark rounded-xl border border-dashed dark:border-gray-800">
          <Receipt size={48} className="mx-auto mb-3 opacity-20" />
          <p className="text-lg font-medium">
            Nenhuma conta em aberto no momento.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {contasFiltradas.map((conta) => (
            <div
              key={conta.identificador}
              className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm flex flex-col h-full"
            >
              {/* Header do Card */}
              <div className="flex justify-between items-start border-b border-gray-100 dark:border-gray-800 pb-4 mb-4">
                <div>
                  <h2 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight">
                    {conta.identificador}
                  </h2>
                  <p className="text-sm text-gray-500 font-medium">
                    {conta.cliente_nome}
                  </p>
                  {conta.cliente_celular && (
                    <p className="text-xs text-gray-400 mt-1">
                      {conta.cliente_celular}
                    </p>
                  )}
                </div>
                <div className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 text-xs font-bold px-2.5 py-1 rounded-md">
                  {conta.pedidos.length}{" "}
                  {conta.pedidos.length === 1 ? "pedido" : "pedidos"}
                </div>
              </div>

              {/* Lista Resumida de Pedidos */}
              <div className="flex-1 overflow-y-auto mb-4 space-y-2">
                {conta.pedidos.map((p) => (
                  <div
                    key={p.id}
                    className="flex justify-between text-sm items-center"
                  >
                    <span className="text-gray-600 dark:text-gray-400 flex items-center gap-1.5">
                      <span
                        className={`w-2 h-2 rounded-full ${p.status === "entregue" ? "bg-green-500" : "bg-yellow-500"}`}
                      ></span>
                      Pedido #{p.id.slice(0, 4)}
                    </span>
                    <span className="font-semibold text-gray-900 dark:text-gray-200">
                      R$ {Number(p.total).toFixed(2).replace(".", ",")}
                    </span>
                  </div>
                ))}
              </div>

              {/* Rodapé e Fechamento */}
              <div className="pt-4 border-t border-gray-100 dark:border-gray-800 mt-auto">
                <div className="flex justify-between items-end mb-4">
                  <span className="text-sm font-medium text-gray-500">
                    Total a Pagar
                  </span>
                  <span className="text-2xl font-black text-cookie-accent">
                    R$ {conta.totalGeral.toFixed(2).replace(".", ",")}
                  </span>
                </div>

                <Button
                  onClick={() =>
                    fecharConta(conta.identificador, conta.pedidos)
                  }
                  disabled={processandoMesa === conta.identificador}
                  className="w-full bg-green-600 hover:bg-green-700 text-white h-12 text-base font-bold"
                >
                  {processandoMesa === conta.identificador ? (
                    <Loader2 className="animate-spin" size={20} />
                  ) : (
                    <>
                      {" "}
                      <CheckCircle2 className="mr-2" size={20} /> Fechar
                      Conta{" "}
                    </>
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
