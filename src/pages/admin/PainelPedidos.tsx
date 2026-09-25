import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  ChefHat,
  Clock,
  MessageCircle,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AdminPageShell } from "../../components/AdminPageShell";
import {
  CardPedidoKds,
  listaPedidosEquivalente,
  type PedidoKds,
} from "../../components/admin/CardPedidoKds";
import { useImpressaoAdmin } from "../../context/ImpressaoAdminContext";
import { usePedidosRealtime } from "../../context/PedidosRealtimeContext";
import {
  buscarMensagensWhatsapp,
  MENSAGEM_WHATSAPP_PADRAO,
  montarLinkWhatsapp,
  preencherMensagemWhatsapp,
  type DadosMensagemPedido,
  type MensagemWhatsapp,
} from "../../lib/mensagensWhatsapp";
import { MINUTOS_EXPIRA_PAGAMENTO_DELIVERY } from "../../lib/deliveryPedido";
import { obterOuCriarConversa } from "../../lib/deliveryChat";
import { dispararNotificacaoStatusPedido } from "../../lib/notificacoesPedido";
import {
  ifoodCancelarPedido,
  ifoodMotivosCancelamento,
  type IfoodMotivoCancel,
} from "../../lib/ifoodAdmin";
import { compararPedidosKds } from "../../lib/pedidoAgendado";
import { supabase } from "../../lib/supabase";

// Tipagens
interface EscolhaComboPedido {
  nome_grupo: string;
  nome_produto: string;
  delta_preco: number;
}

interface ItemPedido {
  id: string;
  quantidade: number;
  preco_unitario: number;
  observacoes: string;
  modo_consumo?: string | null;
  produtos: { nome: string };
  pedido_item_adicionais?: Array<{ preco_aplicado: number }>;
  pedido_item_combo_escolhas?: EscolhaComboPedido[];
}

interface Pedido {
  id: string;
  sequencia_pedido: number;
  origem: "mesa" | "balcao" | "totem" | "delivery" | "ifood" | "evento";
  modalidade?: "entrega" | "retirada" | null;
  status_pagamento?: string | null;
  identificador: string;
  cliente_id?: string | null;
  cliente_nome: string;
  cliente_celular: string | null;
  total: number | null;
  taxa_entrega?: number | null;
  desconto_aplicado?: number | null;
  desconto_frete?: number | null;
  acrescimo_clima?: number | null;
  status:
    | "pendente"
    | "em_producao"
    | "pronto"
    | "entregue"
    | "cancelado"
    | "aguardando_pagamento";
  criado_em: string;
  agendado_para?: string | null;
  ifood_order_id?: string | null;
  voa_order_id?: string | null;
  tracking_url?: string | null;
  endereco_json?: EnderecoPedido | null;
  pedido_itens: ItemPedido[];
}

interface EnderecoPedido {
  cep?: string | null;
  rua?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  complemento?: string | null;
  referencia?: string | null;
}

function formatarEnderecoEntrega(
  endereco: EnderecoPedido | null | undefined,
): string | null {
  if (!endereco?.rua) return null;
  const linha1 = [endereco.rua, endereco.numero].filter(Boolean).join(", ");
  const linha2 = [endereco.bairro, endereco.cidade, endereco.uf]
    .filter(Boolean)
    .join(" - ");
  const cepDigits = endereco.cep ? String(endereco.cep).replace(/\D/g, "") : "";
  const cepFmt =
    cepDigits.length === 8
      ? `CEP ${cepDigits.slice(0, 5)}-${cepDigits.slice(5)}`
      : endereco.cep
        ? `CEP ${endereco.cep}`
        : null;
  // Sem complemento: o KDS tem botão separado para copiar apto/casa.
  return [
    linha1,
    endereco.referencia ? `Ref.: ${endereco.referencia}` : null,
    linha2 || null,
    cepFmt,
  ]
    .filter(Boolean)
    .join("\n");
}

function complementoPedido(
  endereco: EnderecoPedido | null | undefined,
): string | null {
  const texto = endereco?.complemento?.trim();
  return texto || null;
}


const STATUS_MENSAGEM_WHATSAPP: Record<PedidoKds["status"], string> = {
  pendente: "Recebemos o seu pedido e em breve ele entra no preparo.",
  em_producao: "Seu pedido já está sendo preparado!",
  pronto: "Seu pedido está pronto!",
  entregue: "Seu pedido foi entregue.",
  cancelado: "Seu pedido foi cancelado.",
  aguardando_pagamento: "Aguardando a confirmação do pagamento.",
};

function fraseStatusWhatsapp(pedido: PedidoKds): string {
  const canalEntrega =
    pedido.origem === "delivery" || pedido.origem === "ifood";
  if (pedido.status === "pronto") {
    if (canalEntrega && pedido.modalidade === "entrega") {
      return pedido.voa_order_id
        ? "Seu pedido saiu para entrega! Acompanhe pelo rastreio."
        : "Seu pedido está pronto e em breve sai para entrega!";
    }
    if (canalEntrega && pedido.modalidade === "retirada") {
      return "Seu pedido está pronto para retirada!";
    }
    return "Seu pedido está pronto! Pode vir buscar.";
  }
  return STATUS_MENSAGEM_WHATSAPP[pedido.status];
}

function dadosMensagemDoPedido(pedido: PedidoKds): DadosMensagemPedido {
  const produtos = pedido.pedido_itens
    .map((item) => {
      const modo =
        item.modo_consumo === "levar"
          ? " (para levar)"
          : item.modo_consumo === "loja"
            ? " (na loja)"
            : "";
      const combos = (item.pedido_item_combo_escolhas || [])
        .map((e) => `\n   • ${e.nome_grupo}: ${e.nome_produto}`)
        .join("");
      return `- ${item.quantidade}x ${item.produtos.nome}${modo}${combos}`;
    })
    .join("\n");

  return {
    nome: (pedido.cliente_nome || "").trim().split(" ")[0] || "cliente",
    pedido: pedido.sequencia_pedido ?? null,
    produtos,
    total: `R$ ${Number(pedido.total || 0)
      .toFixed(2)
      .replace(".", ",")}`,
    status: fraseStatusWhatsapp(pedido),
    local: pedido.identificador || "Balcão",
  };
}

export function PainelPedidos() {
  const navigate = useNavigate();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [carregando, setCarregando] = useState(true);
  const {
    status: statusConexao,
    versaoConexao,
    assinar: assinarPedidos,
    reconectar,
  } = usePedidosRealtime();
  const { imprimirPedido } = useImpressaoAdmin();

  const [mensagensWhatsapp, setMensagensWhatsapp] = useState<
    MensagemWhatsapp[]
  >([]);
  const [pedidoWhatsApp, setPedidoWhatsApp] = useState<PedidoKds | null>(null);
  const [pedidoCancelIfood, setPedidoCancelIfood] = useState<PedidoKds | null>(
    null,
  );
  const [motivosIfood, setMotivosIfood] = useState<IfoodMotivoCancel[]>([]);
  const [carregandoMotivos, setCarregandoMotivos] = useState(false);
  const [cancelandoIfood, setCancelandoIfood] = useState(false);
  const [abrindoChatId, setAbrindoChatId] = useState<string | null>(null);
  const requisicaoAtualRef = useRef(0);
  const debounceRef = useRef<number | null>(null);

  const carregarPedidosAtivos = useCallback(
    async (mostrarCarregamento = false) => {
      const requisicao = ++requisicaoAtualRef.current;
      if (mostrarCarregamento) setCarregando(true);

      try {
        const { data, error } = await supabase
          .from("pedidos")
          .select(
            `
            id, sequencia_pedido, origem, modalidade, status_pagamento, identificador, cliente_id, cliente_nome, cliente_celular, total, taxa_entrega, desconto_aplicado, desconto_frete, acrescimo_clima, status, criado_em, voa_order_id, tracking_url, endereco_json, agendado_para, ifood_order_id,
            pedido_itens (
              id, quantidade, preco_unitario, observacoes, modo_consumo,
              produtos ( nome ),
              pedido_item_adicionais ( preco_aplicado ),
              pedido_item_combo_escolhas (
                nome_grupo, nome_produto, delta_preco
              )
            )
          `,
          )
          .not(
            "status",
            "in",
            '("entregue","cancelado","pago","aguardando_pagamento")',
          )
          .order("criado_em", { ascending: false });

        if (error) throw new Error(error.message);
        // Uma resposta antiga nunca pode sobrescrever uma consulta mais nova.
        if (requisicao !== requisicaoAtualRef.current) return;

        const lista = ((data || []) as unknown as Pedido[]).filter(
          (p) =>
            p.status_pagamento !== "aguardando" &&
            p.status !== "aguardando_pagamento",
        );
        setPedidos((prev) =>
          listaPedidosEquivalente(prev, lista) ? prev : lista,
        );
      } catch (erro: unknown) {
        const mensagem = erro instanceof Error ? erro.message : String(erro);
        console.error("[ERRO - PAINEL] Falha ao carregar:", mensagem);
      } finally {
        if (requisicao === requisicaoAtualRef.current) {
          setCarregando(false);
        }
      }
    },
    [],
  );

  const agendarAtualizacao = useCallback(() => {
    if (debounceRef.current != null) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null;
      void carregarPedidosAtivos();
    }, 300);
  }, [carregarPedidosAtivos]);

  const expirarPedidosSemPagamento = useCallback(async () => {
    const { data, error } = await supabase.rpc(
      "cancelar_pedidos_delivery_sem_pagamento",
      { p_minutos: MINUTOS_EXPIRA_PAGAMENTO_DELIVERY },
    );
    if (error) {
      console.warn("[KDS] Falha ao expirar pedidos:", error.message);
      return;
    }
    if (Number(data ?? 0) > 0) agendarAtualizacao();
  }, [agendarAtualizacao]);

  useEffect(() => {
    buscarMensagensWhatsapp()
      .then(setMensagensWhatsapp)
      .catch((erro: unknown) => {
        const mensagem = erro instanceof Error ? erro.message : String(erro);
        console.error("[WHATSAPP] Falha ao carregar mensagens:", mensagem);
      });
  }, []);

  // Consulta inicial e expiração fora do callback do Realtime (evita loop UPDATE).
  useEffect(() => {
    void carregarPedidosAtivos(true);
    void expirarPedidosSemPagamento();
    const desassinar = assinarPedidos(() => agendarAtualizacao());
    return () => {
      desassinar();
      if (debounceRef.current != null) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [
    agendarAtualizacao,
    assinarPedidos,
    carregarPedidosAtivos,
    expirarPedidosSemPagamento,
  ]);

  // Postgres Changes não faz replay: refaz a consulta após cada reconexão.
  useEffect(() => {
    if (versaoConexao > 0) void carregarPedidosAtivos();
  }, [carregarPedidosAtivos, versaoConexao]);

  // Rede de segurança caso um evento seja perdido silenciosamente.
  useEffect(() => {
    const polling = window.setInterval(() => {
      void carregarPedidosAtivos();
    }, 30_000);
    const expiracao = window.setInterval(() => {
      void expirarPedidosSemPagamento();
    }, 5 * 60_000);

    const atualizarAoRetomar = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void carregarPedidosAtivos();
      }
    };
    document.addEventListener("visibilitychange", atualizarAoRetomar);
    window.addEventListener("focus", atualizarAoRetomar);

    return () => {
      window.clearInterval(polling);
      window.clearInterval(expiracao);
      document.removeEventListener("visibilitychange", atualizarAoRetomar);
      window.removeEventListener("focus", atualizarAoRetomar);
    };
  }, [carregarPedidosAtivos, expirarPedidosSemPagamento]);

  const cancelarPedidoLocal = async (pedidoId: string) => {
    const { error } = await supabase.rpc("cancelar_pedido_com_estoque", {
      p_pedido_id: pedidoId,
    });
    if (error) throw error;
    toast.success("Pedido cancelado e estoque atualizado!");
    void carregarPedidosAtivos();
  };

  const confirmarCancelamentoIfood = async (motivo: IfoodMotivoCancel) => {
    if (!pedidoCancelIfood?.ifood_order_id) return;
    const codigo = motivo.code ?? motivo.cancelCodeId;
    if (!codigo) {
      toast.error("Motivo sem código");
      return;
    }
    setCancelandoIfood(true);
    try {
      await ifoodCancelarPedido({
        orderId: pedidoCancelIfood.ifood_order_id,
        cancellationCode: String(codigo),
        reason:
          typeof motivo.description === "string"
            ? motivo.description
            : undefined,
      });
      await cancelarPedidoLocal(pedidoCancelIfood.id);
      setPedidoCancelIfood(null);
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error("[IFOOD] Cancelar pedido:", mensagem);
      toast.error("Falha ao cancelar pedido no iFood.");
    } finally {
      setCancelandoIfood(false);
    }
  };

  const cancelarPedido = async (pedido: PedidoKds) => {
    if (pedido.origem === "ifood" && pedido.ifood_order_id) {
      setPedidoCancelIfood(pedido);
      setMotivosIfood([]);
      setCarregandoMotivos(true);
      try {
        const motivos = await ifoodMotivosCancelamento(pedido.ifood_order_id);
        setMotivosIfood(motivos);
      } catch (erro: unknown) {
        const mensagem = erro instanceof Error ? erro.message : String(erro);
        console.error("[IFOOD] Motivos cancelamento:", mensagem);
        toast.error("Não foi possível carregar motivos do iFood.");
        setPedidoCancelIfood(null);
      } finally {
        setCarregandoMotivos(false);
      }
      return;
    }

    if (!window.confirm("Cancelar este pedido e devolver estoque?")) return;
    try {
      await cancelarPedidoLocal(pedido.id);
    } catch (erro: unknown) {
      console.error("Erro ao cancelar:", erro);
      toast.error("Falha ao cancelar pedido.");
    }
  };

  // No seu PainelPedidos.tsx, garanta que o valor é enviado limpo:
  // Exemplo de como deve estar o seu disparador de status:
  const atualizarStatus = async (
    pedidoId: string,
    novoStatus:
      | "pendente"
      | "em_producao"
      | "pronto"
      | "entregue"
      | "cancelado",
  ) => {
    console.log("novoStatus", novoStatus);
    const { error } = await supabase
      .from("pedidos")
      .update({ status: novoStatus })
      .eq("id", pedidoId);

    if (error) {
      toast.error(`Erro ao atualizar: ${error.message}`);
      return;
    }
    toast.success("Status atualizado!");

    void dispararNotificacaoStatusPedido(pedidoId, novoStatus);
  };

  const abrirModalWhatsApp = (pedido: PedidoKds) => {
    if (!montarLinkWhatsapp(pedido.cliente_celular, "x")) {
      toast.error("Este pedido não tem celular do cliente cadastrado.");
      return;
    }
    if (mensagensWhatsapp.length === 0) {
      // Sem modelos cadastrados: envia direto a mensagem padrão do sistema
      enviarWhatsApp(pedido, MENSAGEM_WHATSAPP_PADRAO);
      return;
    }
    setPedidoWhatsApp(pedido);
  };

  const abrirChatCliente = async (pedido: PedidoKds) => {
    if (abrindoChatId) return;
    setAbrindoChatId(pedido.id);
    try {
      let clienteId = pedido.cliente_id || null;
      if (!clienteId && pedido.cliente_celular) {
        const digitos = pedido.cliente_celular.replace(/\D/g, "");
        const { data } = await supabase
          .from("clientes")
          .select("id")
          .or(`celular.eq.${pedido.cliente_celular},celular.eq.${digitos}`)
          .limit(1)
          .maybeSingle();
        clienteId = data?.id ?? null;
      }
      if (!clienteId) {
        toast.error(
          "Este pedido não tem cliente vinculado para abrir o chat.",
        );
        return;
      }
      const conversaId = await obterOuCriarConversa({
        clienteId,
        pedidoId: pedido.id,
      });
      navigate(`/admin/chat?conversa=${conversaId}`);
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error("[CHAT] Abrir do KDS:", mensagem);
      toast.error("Não foi possível abrir o chat deste cliente.");
    } finally {
      setAbrindoChatId(null);
    }
  };

  const enviarWhatsApp = (pedido: PedidoKds, modelo: string) => {
    const mensagem = preencherMensagemWhatsapp(
      modelo,
      dadosMensagemDoPedido(pedido),
    );
    const link = montarLinkWhatsapp(pedido.cliente_celular, mensagem);
    if (!link) {
      toast.error("Este pedido não tem celular do cliente cadastrado.");
      return;
    }
    setPedidoWhatsApp(null);
    window.open(link, "_blank", "noopener,noreferrer");
  };

  const enviarParaImpressora = async (pedido: PedidoKds) => {
    const sucesso = await imprimirPedido(pedido.id, { manual: true });
    if (sucesso) {
      console.info(
        `[IMPRESSÃO] Pedido #${pedido.sequencia_pedido} reenviado para a impressora.`,
      );
    }
  };

  const copiarTexto = async (texto: string, sucesso: string, erro: string) => {
    const valor = texto.trim();
    if (!valor) {
      toast.error(erro);
      return;
    }
    try {
      await navigator.clipboard.writeText(valor);
      toast.success(sucesso);
    } catch {
      toast.error(erro);
    }
  };

  const copiarNomeCliente = (pedido: PedidoKds) =>
    void copiarTexto(
      pedido.cliente_nome || "",
      "Nome copiado!",
      "Não foi possível copiar o nome.",
    );

  const copiarTelefoneCliente = (pedido: PedidoKds) =>
    void copiarTexto(
      pedido.cliente_celular || "",
      "Telefone copiado!",
      "Não foi possível copiar o telefone.",
    );

  const copiarEnderecoEntrega = (pedido: PedidoKds) =>
    void copiarTexto(
      formatarEnderecoEntrega(pedido.endereco_json) || "",
      "Endereço copiado!",
      pedido.endereco_json
        ? "Não foi possível copiar o endereço."
        : "Este pedido não tem endereço de entrega.",
    );

  const copiarComplementoEntrega = (pedido: PedidoKds) =>
    void copiarTexto(
      complementoPedido(pedido.endereco_json) || "",
      "Complemento copiado!",
      complementoPedido(pedido.endereco_json)
        ? "Não foi possível copiar o complemento."
        : "Este pedido não tem complemento.",
    );

  // Separação em colunas (Kanban) — agendados primeiro, por horário
  const [agoraTick, setAgoraTick] = useState(() => Date.now());
  const [fila, setFila] = useState<"operacao" | "eventos">("operacao");
  useEffect(() => {
    const id = window.setInterval(() => setAgoraTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const pedidosFila = pedidos.filter((p) =>
    fila === "eventos" ? p.origem === "evento" : p.origem !== "evento",
  );
  const pendentes = pedidosFila
    .filter((p) => p.status === "pendente" && p.agendado_para)
    .slice()
    .sort(compararPedidosKds);
  const emProducao = pedidosFila
    .filter((p) => p.status === "em_producao")
    .slice()
    .sort(compararPedidosKds);
  const prontos = pedidosFila
    .filter((p) => p.status === "pronto")
    .slice()
    .sort(compararPedidosKds);

  const cardPropsCompartilhadas = {
    agoraTick,
    abrindoChatId,
    onImprimir: enviarParaImpressora,
    onWhatsApp: abrirModalWhatsApp,
    onChat: abrirChatCliente,
    onCancelar: cancelarPedido,
    onAtualizarStatus: atualizarStatus,
    onCopiarNome: copiarNomeCliente,
    onCopiarTelefone: copiarTelefoneCliente,
    onCopiarEndereco: copiarEnderecoEntrega,
    onCopiarComplemento: copiarComplementoEntrega,
  };

  return (
    <AdminPageShell
      title="Fila de Produção"
      actions={
        <>
          {statusConexao !== "conectado" && (
            <button
              type="button"
              onClick={reconectar}
              className="flex items-center gap-1 text-red-600 font-bold text-sm bg-red-100 dark:bg-red-900/30 px-3 py-1.5 rounded-full hover:bg-red-200"
              title="Tentar reconectar agora"
            >
              <AlertCircle size={16} />
              {statusConexao === "reconectando"
                ? "Reconectando..."
                : "Realtime desconectado"}
            </button>
          )}
          <div className="flex rounded-lg overflow-hidden border border-amber-200 text-sm font-semibold">
            <button
              type="button"
              className={`px-3 py-2 ${fila === "operacao" ? "bg-zinc-900 text-white" : "bg-white"}`}
              onClick={() => setFila("operacao")}
            >
              Produção
            </button>
            <button
              type="button"
              className={`px-3 py-2 ${fila === "eventos" ? "bg-amber-500 text-white" : "bg-white"}`}
              onClick={() => setFila("eventos")}
            >
              Eventos
            </button>
          </div>
          <span className="text-sm bg-cookie-primary text-white px-4 py-2 rounded-lg font-medium">
            Total Ativos: {pedidos.length}
          </span>
        </>
      }
      scroll={false}
      contentClassName="overflow-hidden"
    >
      {carregando && pedidos.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin h-10 w-10 border-4 border-cookie-accent border-t-transparent rounded-full"></div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden md:flex-row md:gap-6">
          {/* Coluna PENDENTE — aba recolhida à esquerda quando vazia */}
          {pendentes.length > 0 ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto rounded-xl bg-gray-100 p-4 hide-scrollbar dark:bg-[#1a1815]">
              <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-red-600">
                <Clock size={20} /> Agendados ({pendentes.length})
              </h2>
              <p className="mb-4 text-[11px] leading-snug text-gray-500">
                Só pedidos programados. Impressão e preparo 30 min antes do
                horário (ou ao clicar Preparar). Pedidos imediatos entram direto
                em Preparando.
              </p>
              <div className="flex flex-col gap-4">
                <AnimatePresence>
                  {pendentes.map((p) => (
                    <CardPedidoKds
                      key={p.id}
                      pedido={p}
                      corBorder="border-red-500"
                      {...cardPropsCompartilhadas}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </div>
          ) : (
            <div
              className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gray-100 px-3 py-3 text-red-600 dark:bg-[#1a1815] md:w-12 md:flex-col md:gap-3 md:px-2 md:py-4"
              title="Nenhum pedido agendado"
              aria-label="Agendados: nenhum pedido"
            >
              <Clock size={18} className="shrink-0" />
              <span className="text-sm font-bold md:[writing-mode:vertical-rl] md:rotate-180">
                Agendados
              </span>
              <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-black tabular-nums text-red-700 dark:bg-red-950/50 dark:text-red-300">
                0
              </span>
            </div>
          )}

          {/* Coluna EM PRODUÇÃO */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto rounded-xl bg-gray-100 p-4 hide-scrollbar dark:bg-[#1a1815]">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-yellow-600">
              <ChefHat size={20} /> Preparando ({emProducao.length})
            </h2>
            <div className="flex flex-col gap-4">
              <AnimatePresence>
                {emProducao.map((p) => (
                  <CardPedidoKds
                    key={p.id}
                    pedido={p}
                    corBorder="border-yellow-500"
                    {...cardPropsCompartilhadas}
                  />
                ))}
              </AnimatePresence>
            </div>
          </div>

          {/* Coluna PRONTO */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto rounded-xl bg-gray-100 p-4 hide-scrollbar dark:bg-[#1a1815]">
            <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-green-600">
              <CheckCircle2 size={20} /> Prontos ({prontos.length})
            </h2>
            <p className="mb-4 text-xs text-gray-500">
              Delivery: chame o motoboy aqui. Retirada: aguarde o cliente.
            </p>
            <div className="flex flex-col gap-4">
              <AnimatePresence>
                {prontos.map((p) => (
                  <CardPedidoKds
                    key={p.id}
                    pedido={p}
                    corBorder="border-green-500"
                    {...cardPropsCompartilhadas}
                  />
                ))}
              </AnimatePresence>
            </div>
          </div>
        </div>
      )}

      {/* Modal: cancelamento iFood */}
      <AnimatePresence>
        {pedidoCancelIfood && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !cancelandoIfood && setPedidoCancelIfood(null)}
              className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white dark:bg-surface-dark rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-900/20">
                <div>
                  <h3 className="font-bold text-lg dark:text-white">
                    Cancelar pedido iFood
                  </h3>
                  <p className="text-sm text-gray-500">
                    #{pedidoCancelIfood.sequencia_pedido} ·{" "}
                    {pedidoCancelIfood.cliente_nome}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => !cancelandoIfood && setPedidoCancelIfood(null)}
                  className="p-2 bg-white dark:bg-gray-800 rounded-full border dark:border-gray-700 active:scale-95"
                  aria-label="Fechar"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="p-5 overflow-y-auto flex-1 space-y-2">
                {carregandoMotivos ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin h-8 w-8 border-4 border-cookie-accent border-t-transparent rounded-full" />
                  </div>
                ) : motivosIfood.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">
                    Nenhum motivo disponível.
                  </p>
                ) : (
                  motivosIfood.map((motivo, idx) => (
                    <button
                      key={String(motivo.code ?? motivo.cancelCodeId ?? idx)}
                      type="button"
                      disabled={cancelandoIfood}
                      onClick={() => void confirmarCancelamentoIfood(motivo)}
                      className="w-full text-left p-4 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-60 transition-all"
                    >
                      <p className="font-bold text-sm text-gray-900 dark:text-white">
                        {motivo.description || "Motivo"}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Modal: escolher qual mensagem de WhatsApp enviar */}
      <AnimatePresence>
        {pedidoWhatsApp && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPedidoWhatsApp(null)}
              className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white dark:bg-surface-dark rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-900/20">
                <div>
                  <h3 className="font-bold text-lg dark:text-white flex items-center gap-2">
                    <MessageCircle size={20} className="text-[#25D366]" />
                    Enviar WhatsApp
                  </h3>
                  <p className="text-sm text-gray-500">
                    Pedido #{pedidoWhatsApp.sequencia_pedido} ·{" "}
                    {pedidoWhatsApp.cliente_nome}
                  </p>
                </div>
                <button
                  onClick={() => setPedidoWhatsApp(null)}
                  className="p-2 bg-white dark:bg-gray-800 rounded-full border dark:border-gray-700 active:scale-95"
                  aria-label="Fechar"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-5 overflow-y-auto flex-1 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">
                  Qual mensagem enviar?
                </p>
                {mensagensWhatsapp.map((mensagem) => (
                  <button
                    key={mensagem.id}
                    onClick={() =>
                      enviarWhatsApp(pedidoWhatsApp, mensagem.conteudo)
                    }
                    className="w-full text-left p-4 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-[#25D366] hover:bg-[#25D366]/5 active:scale-[0.99] transition-all"
                  >
                    <p className="font-bold text-sm text-gray-900 dark:text-white mb-1">
                      {mensagem.titulo}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 whitespace-pre-line">
                      {preencherMensagemWhatsapp(
                        mensagem.conteudo,
                        dadosMensagemDoPedido(pedidoWhatsApp),
                      )}
                    </p>
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </AdminPageShell>
  );
}
