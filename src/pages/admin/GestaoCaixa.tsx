import {
  Calculator,
  CheckCircle2,
  Loader2,
  Receipt,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AdminPageShell } from "../../components/AdminPageShell";
import { supabase } from "../../lib/supabase";

import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";

const ORDEM_CANAIS = [
  "mesa",
  "balcao",
  "totem",
  "delivery",
  "ifood",
] as const;

const ROTULO_CANAL: Record<string, string> = {
  mesa: "Mesa",
  balcao: "Balcão",
  totem: "Totem",
  delivery: "Delivery",
  ifood: "iFood",
};

const FUSO_LOJA = "America/Sao_Paulo";

interface PedidoCaixa {
  id: string;
  origem: string;
  identificador: string;
  cliente_nome: string | null;
  total: number;
  status: string;
}

interface GrupoIdentificador {
  identificador: string;
  pedidos: PedidoCaixa[];
  totalGeral: number;
}

interface ContaCanal {
  origem: string;
  label: string;
  grupos: GrupoIdentificador[];
  totalGeral: number;
  qtdPedidos: number;
}

function rotuloCanal(origem: string): string {
  return ROTULO_CANAL[origem] ?? origem;
}

function horaMinutoSp(ref = new Date()): { hora: number; minuto: number } {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: FUSO_LOJA,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(ref);
  return {
    hora: Number(partes.find((p) => p.type === "hour")?.value ?? 0),
    minuto: Number(partes.find((p) => p.type === "minute")?.value ?? 0),
  };
}

function agruparPorCanal(pedidos: PedidoCaixa[]): ContaCanal[] {
  const porCanal = pedidos.reduce(
    (acc: Record<string, Record<string, GrupoIdentificador>>, pedido) => {
      const origem = pedido.origem || "balcao";
      const chaveId = pedido.identificador?.trim() || rotuloCanal(origem);

      if (!acc[origem]) acc[origem] = {};
      if (!acc[origem][chaveId]) {
        acc[origem][chaveId] = {
          identificador: chaveId,
          pedidos: [],
          totalGeral: 0,
        };
      }

      acc[origem][chaveId].pedidos.push(pedido);
      acc[origem][chaveId].totalGeral += Number(pedido.total);
      return acc;
    },
    {},
  );

  const extras = Object.keys(porCanal).filter(
    (c) => !ORDEM_CANAIS.includes(c as (typeof ORDEM_CANAIS)[number]),
  );
  return [...ORDEM_CANAIS.filter((c) => porCanal[c]), ...extras].map(
    (origem) => {
      const grupos = Object.values(porCanal[origem]).sort(
        (a, b) => b.totalGeral - a.totalGeral,
      );
      const qtdPedidos = grupos.reduce((s, g) => s + g.pedidos.length, 0);
      return {
        origem,
        label: rotuloCanal(origem),
        grupos,
        totalGeral: grupos.reduce((s, g) => s + g.totalGeral, 0),
        qtdPedidos,
      };
    });
}

export function GestaoCaixa() {
  const [contas, setContas] = useState<ContaCanal[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [termoBusca, setTermoBusca] = useState("");
  const [processandoChave, setProcessandoChave] = useState<string | null>(null);
  const [fechandoAutomatico, setFechandoAutomatico] = useState(false);
  const fechamentoDiarioRef = useRef<string | null>(null);

  const carregarContasAbertas = useCallback(async () => {
    try {
      setCarregando(true);
      const { data, error } = await supabase
        .from("pedidos")
        .select("id, origem, identificador, cliente_nome, total, status")
        .not("status", "in", '("pago","cancelado")');

      if (error) throw error;

      setContas(agruparPorCanal(data || []));
    } catch (erro: unknown) {
      const msg = erro instanceof Error ? erro.message : "Erro desconhecido";
      console.error("[ERRO - CAIXA]", msg);
      toast.error("Falha ao carregar as contas em aberto.");
    } finally {
      setCarregando(false);
    }
  }, []);

  const fecharPedidos = useCallback(
    async (pedidos: PedidoCaixa[], mensagemSucesso: string) => {
      const ids = pedidos.map((p) => p.id);
      const { error } = await supabase
        .from("pedidos")
        .update({ status: "pago" })
        .in("id", ids);

      if (error) throw error;
      toast.success(mensagemSucesso);
      await carregarContasAbertas();
    },
    [carregarContasAbertas],
  );

  const fecharGrupo = async (
    origem: string,
    identificador: string,
    pedidos: PedidoCaixa[],
  ) => {
    const chave = `${origem}:${identificador}`;
    try {
      setProcessandoChave(chave);
      await fecharPedidos(
        pedidos,
        `Conta ${identificador} (${rotuloCanal(origem)}) fechada!`,
      );
    } catch (erro: unknown) {
      const msg = erro instanceof Error ? erro.message : "Erro desconhecido";
      console.error("[ERRO - FECHAMENTO]", msg);
      toast.error("Erro ao fechar a conta. Tente novamente.");
    } finally {
      setProcessandoChave(null);
    }
  };

  const fecharCanalInteiro = async (conta: ContaCanal) => {
    const chave = `canal:${conta.origem}`;
    const todosPedidos = conta.grupos.flatMap((g) => g.pedidos);
    try {
      setProcessandoChave(chave);
      await fecharPedidos(
        todosPedidos,
        `Canal ${conta.label}: todas as contas fechadas!`,
      );
    } catch (erro: unknown) {
      const msg = erro instanceof Error ? erro.message : "Erro desconhecido";
      console.error("[ERRO - FECHAMENTO CANAL]", msg);
      toast.error("Erro ao fechar o canal. Tente novamente.");
    } finally {
      setProcessandoChave(null);
    }
  };

  const fecharTodasContas = useCallback(async () => {
    const hoje = new Intl.DateTimeFormat("sv-SE", {
      timeZone: FUSO_LOJA,
    }).format(new Date());
    if (fechamentoDiarioRef.current === hoje) return;

    try {
      setFechandoAutomatico(true);
      fechamentoDiarioRef.current = hoje;

      const { data, error } = await supabase
        .from("pedidos")
        .select("id")
        .not("status", "in", '("pago","cancelado")');

      if (error) throw error;
      if (!data?.length) return;

      const { error: updErr } = await supabase
        .from("pedidos")
        .update({ status: "pago" })
        .in(
          "id",
          data.map((p) => p.id),
        );

      if (updErr) throw updErr;

      toast.info("Fechamento automático: todas as contas foram encerradas.");
      setContas([]);
    } catch (erro: unknown) {
      fechamentoDiarioRef.current = null;
      const msg = erro instanceof Error ? erro.message : "Erro desconhecido";
      console.error("[ERRO - FECHAMENTO AUTOMÁTICO]", msg);
    } finally {
      setFechandoAutomatico(false);
    }
  }, []);

  useEffect(() => {
    void carregarContasAbertas();
  }, [carregarContasAbertas]);

  useEffect(() => {
    const verificarHorarioFechamento = () => {
      const { hora, minuto } = horaMinutoSp();
      if (hora === 23 && minuto === 59) {
        void fecharTodasContas();
      }
    };

    verificarHorarioFechamento();
    const id = window.setInterval(verificarHorarioFechamento, 30_000);
    return () => window.clearInterval(id);
  }, [fecharTodasContas]);

  const contasFiltradas = contas.filter((c) => {
    const termo = termoBusca.toLowerCase();
    if (!termo) return true;
    if (c.label.toLowerCase().includes(termo)) return true;
    return c.grupos.some(
      (g) =>
        g.identificador.toLowerCase().includes(termo) ||
        g.pedidos.some((p) =>
          p.cliente_nome?.toLowerCase().includes(termo),
        ),
    );
  });

  return (
    <AdminPageShell
      title={
        <h1 className="flex items-center gap-2">
          <Calculator size={28} className="text-cookie-primary" /> Caixa e
          Comandas
        </h1>
      }
      description="Fechamento de contas por canal de venda. Encerramento automático às 23:59."
      actions={
        <div className="relative w-full sm:w-80">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            size={16}
          />
          <Input
            placeholder="Buscar por canal, mesa ou cliente..."
            value={termoBusca}
            onChange={(e) => setTermoBusca(e.target.value)}
            className="pl-9 dark:bg-[#1a1815]"
          />
        </div>
      }
      contentClassName="space-y-6"
    >
      {fechandoAutomatico && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          <Loader2 className="animate-spin" size={16} />
          Fechamento automático do dia em andamento…
        </div>
      )}

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
              key={conta.origem}
              className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm flex flex-col h-full"
            >
              <div className="flex justify-between items-start border-b border-gray-100 dark:border-gray-800 pb-4 mb-4">
                <div>
                  <h2 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight">
                    {conta.label}
                  </h2>
                  <p className="text-sm text-gray-500 font-medium">
                    Canal de venda
                  </p>
                </div>
                <div className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 text-xs font-bold px-2.5 py-1 rounded-md">
                  {conta.qtdPedidos}{" "}
                  {conta.qtdPedidos === 1 ? "pedido" : "pedidos"}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto mb-4 space-y-4">
                {conta.grupos.map((grupo) => {
                  const chaveGrupo = `${conta.origem}:${grupo.identificador}`;
                  return (
                    <div
                      key={chaveGrupo}
                      className="rounded-xl border border-gray-100 dark:border-gray-800 p-3 space-y-2"
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-bold text-gray-800 dark:text-gray-200">
                          {grupo.identificador}
                        </span>
                        <span className="text-xs font-semibold text-gray-500">
                          R${" "}
                          {grupo.totalGeral.toFixed(2).replace(".", ",")}
                        </span>
                      </div>

                      {grupo.pedidos.map((p) => (
                        <div
                          key={p.id}
                          className="flex justify-between text-sm items-center"
                        >
                          <span className="text-gray-600 dark:text-gray-400 flex items-center gap-1.5">
                            <span
                              className={`w-2 h-2 rounded-full ${p.status === "entregue" ? "bg-green-500" : "bg-yellow-500"}`}
                            />
                            {p.cliente_nome?.trim() || "Cliente"}
                          </span>
                          <span className="font-semibold text-gray-900 dark:text-gray-200">
                            R${" "}
                            {Number(p.total).toFixed(2).replace(".", ",")}
                          </span>
                        </div>
                      ))}

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          fecharGrupo(
                            conta.origem,
                            grupo.identificador,
                            grupo.pedidos,
                          )
                        }
                        disabled={processandoChave === chaveGrupo}
                        className="w-full mt-1 h-9 text-xs font-bold"
                      >
                        {processandoChave === chaveGrupo ? (
                          <Loader2 className="animate-spin" size={14} />
                        ) : (
                          <>
                            <CheckCircle2 className="mr-1.5" size={14} />
                            Fechar {grupo.identificador}
                          </>
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>

              <div className="pt-4 border-t border-gray-100 dark:border-gray-800 mt-auto">
                <div className="flex justify-between items-end mb-4">
                  <span className="text-sm font-medium text-gray-500">
                    Total do canal
                  </span>
                  <span className="text-2xl font-black text-cookie-accent">
                    R$ {conta.totalGeral.toFixed(2).replace(".", ",")}
                  </span>
                </div>

                <Button
                  onClick={() => fecharCanalInteiro(conta)}
                  disabled={processandoChave === `canal:${conta.origem}`}
                  className="w-full bg-green-600 hover:bg-green-700 text-white h-12 text-base font-bold"
                >
                  {processandoChave === `canal:${conta.origem}` ? (
                    <Loader2 className="animate-spin" size={20} />
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2" size={20} />
                      Fechar canal {conta.label}
                    </>
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminPageShell>
  );
}
