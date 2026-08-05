import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  Bike,
  Building2,
  CheckCircle2,
  ChefHat,
  Clock,
  MapPin,
  MessageCircle,
  Phone,
  Printer,
  Trash2,
  User,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AdminPageShell } from "../../components/AdminPageShell";
import { useAlertaNovoPedidoAdmin } from "../../context/AlertaNovoPedidoContext";
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
import { dispararNotificacaoStatusPedido } from "../../lib/notificacoesPedido";
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
  observacoes: string;
  modo_consumo?: string | null;
  produtos: { nome: string };
  pedido_item_combo_escolhas?: EscolhaComboPedido[];
}

interface Pedido {
  id: string;
  sequencia_pedido: number;
  origem: "mesa" | "balcao" | "totem" | "delivery";
  modalidade?: "entrega" | "retirada" | null;
  status_pagamento?: string | null;
  identificador: string;
  cliente_nome: string;
  cliente_celular: string | null;
  total: number | null;
  status:
    | "pendente"
    | "em_producao"
    | "pronto"
    | "entregue"
    | "cancelado"
    | "aguardando_pagamento";
  criado_em: string;
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
  return [linha1, endereco.referencia ? `Ref.: ${endereco.referencia}` : null, linha2 || null, cepFmt]
    .filter(Boolean)
    .join("\n");
}

function complementoPedido(
  endereco: EnderecoPedido | null | undefined,
): string | null {
  const texto = endereco?.complemento?.trim();
  return texto || null;
}

const STATUS_MENSAGEM_WHATSAPP: Record<Pedido["status"], string> = {
  pendente: "Recebemos o seu pedido e em breve ele entra no preparo.",
  em_producao: "Seu pedido já está sendo preparado!",
  pronto: "Seu pedido está pronto!",
  entregue: "Seu pedido foi entregue.",
  cancelado: "Seu pedido foi cancelado.",
  aguardando_pagamento: "Aguardando a confirmação do pagamento.",
};

function fraseStatusWhatsapp(pedido: Pedido): string {
  if (pedido.status === "pronto") {
    if (pedido.origem === "delivery" && pedido.modalidade === "entrega") {
      return pedido.voa_order_id
        ? "Seu pedido saiu para entrega! Acompanhe pelo rastreio."
        : "Seu pedido está pronto e em breve sai para entrega!";
    }
    if (pedido.origem === "delivery" && pedido.modalidade === "retirada") {
      return "Seu pedido está pronto para retirada!";
    }
    return "Seu pedido está pronto! Pode vir buscar.";
  }
  return STATUS_MENSAGEM_WHATSAPP[pedido.status];
}

function dadosMensagemDoPedido(pedido: Pedido): DadosMensagemPedido {
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
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [carregando, setCarregando] = useState(true);
  const {
    status: statusConexao,
    versaoConexao,
    assinar: assinarPedidos,
    reconectar,
  } = usePedidosRealtime();
  const { impressoraOffline, imprimirPedido } = useImpressaoAdmin();
  const {
    ativo: alertaSonoroAtivo,
    precisaReativar,
    ativar: ativarAlertaSonoro,
    desativar: desativarAlertaSonoro,
  } = useAlertaNovoPedidoAdmin();

  const [mensagensWhatsapp, setMensagensWhatsapp] = useState<
    MensagemWhatsapp[]
  >([]);
  const [pedidoWhatsApp, setPedidoWhatsApp] = useState<Pedido | null>(null);
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
            id, sequencia_pedido, origem, modalidade, status_pagamento, identificador, cliente_nome, cliente_celular, total, status, criado_em, voa_order_id, tracking_url, endereco_json,
            pedido_itens (
              id, quantidade, observacoes, modo_consumo,
              produtos ( nome ),
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
        setPedidos(lista);
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
      { p_minutos: 30 },
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

  const cancelarPedido = async (pedidoId: string) => {
    try {
      // Chamada da função que criamos no SQL
      const { error } = await supabase.rpc("cancelar_pedido_com_estoque", {
        p_pedido_id: pedidoId,
      });

      if (error) throw error;

      toast.success("Pedido cancelado e estoque atualizado!");
      carregarPedidosAtivos(); // Recarrega a lista
    } catch (erro: any) {
      console.error("Erro ao cancelar:", erro);
      toast.error("Falha ao cancelar pedido.");
    }
  };

  // No seu PainelPedidos.tsx, garanta que o valor é enviado limpo:
  // Exemplo de como deve estar o seu disparador de status:
  const atualizarStatus = async (
    pedidoId: string,
    novoStatus: "pendente" | "em_producao" | "pronto" | "entregue" | "cancelado",
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

  const chamarMotoboy = async (pedido: Pedido) => {
    if (pedido.voa_order_id) {
      toast.message("Motoboy já foi chamado para este pedido.");
      return;
    }
    try {
      const { data, error: voaErr } = await supabase.functions.invoke(
        "voa-enviar-pedido",
        { body: { pedido_id: pedido.id } },
      );
      if (voaErr) throw voaErr;
      if (data?.erro) throw new Error(String(data.erro));
      toast.success("Motoboy chamado (VOA Delivery)!");
      void carregarPedidosAtivos();
      void dispararNotificacaoStatusPedido(pedido.id, "pronto");
    } catch (e: unknown) {
      console.error("[VOA]", e);
      toast.error(
        e instanceof Error
          ? `VOA: ${e.message}`
          : "Falha ao chamar motoboy na VOA",
      );
    }
  };

  const abrirModalWhatsApp = (pedido: Pedido) => {
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

  const enviarWhatsApp = (pedido: Pedido, modelo: string) => {
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

  const enviarParaImpressora = async (pedido: Pedido) => {
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

  const copiarNomeCliente = (pedido: Pedido) =>
    void copiarTexto(
      pedido.cliente_nome || "",
      "Nome copiado!",
      "Não foi possível copiar o nome.",
    );

  const copiarTelefoneCliente = (pedido: Pedido) =>
    void copiarTexto(
      pedido.cliente_celular || "",
      "Telefone copiado!",
      "Não foi possível copiar o telefone.",
    );

  const copiarEnderecoEntrega = (pedido: Pedido) =>
    void copiarTexto(
      formatarEnderecoEntrega(pedido.endereco_json) || "",
      "Endereço copiado!",
      pedido.endereco_json
        ? "Não foi possível copiar o endereço."
        : "Este pedido não tem endereço de entrega.",
    );

  const copiarComplementoEntrega = (pedido: Pedido) =>
    void copiarTexto(
      complementoPedido(pedido.endereco_json) || "",
      "Complemento copiado!",
      complementoPedido(pedido.endereco_json)
        ? "Não foi possível copiar o complemento."
        : "Este pedido não tem complemento.",
    );

  // Separação em colunas (Kanban)
  const pendentes = pedidos.filter((p) => p.status === "pendente");
  const emProducao = pedidos.filter((p) => p.status === "em_producao");
  const prontos = pedidos.filter((p) => p.status === "pronto");

  // Subcomponente para renderizar o Card do Pedido
  const CardPedido = ({
    pedido,
    corBorder,
  }: {
    pedido: Pedido;
    corBorder: string;
  }) => (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className={`bg-white dark:bg-surface-dark border-l-4 ${corBorder} shadow-sm p-4 rounded-lg flex flex-col gap-3`}
    >
      <div className="flex justify-between items-start border-b border-gray-100 dark:border-gray-800 pb-2">
        <div>
          <h3 className="font-bold text-lg">
            #{pedido.sequencia_pedido} - {pedido.identificador}
          </h3>
          <p className="text-sm text-gray-500">{pedido.cliente_nome}</p>
          {pedido.origem === "delivery" && (
            <span
              className={`inline-block mt-1 text-[0.625rem] font-black uppercase tracking-wide px-1.5 py-0.5 rounded ${
                pedido.modalidade === "retirada"
                  ? "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300"
                  : "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300"
              }`}
            >
              {pedido.modalidade === "retirada" ? "Retirada" : "Delivery"}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-end justify-end gap-3">
          {(pedido.status === "pendente" || pedido.status === "em_producao") && (
            <div className="flex flex-col items-center gap-1">
              <span className="text-[0.625rem] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                Excluir
              </span>
              <div className="flex gap-1.5">
                <button
                  onClick={() => cancelarPedido(pedido.id)}
                  className="p-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors flex justify-center items-center"
                  title="Excluir pedido"
                >
                  <Trash2 size={18} className="text-white" />
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col items-center gap-1 pl-3 border-l border-gray-200 dark:border-gray-700">
            <span className="text-[0.625rem] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              Ações
            </span>
            <div className="flex gap-1.5">
              {pedido.cliente_celular && (
                <button
                  onClick={() => abrirModalWhatsApp(pedido)}
                  className="p-2 bg-[#25D366] text-white rounded-md hover:bg-[#1ebe5b] transition-colors"
                  title="Enviar mensagem no WhatsApp"
                >
                  <MessageCircle size={20} />
                </button>
              )}
              <button
                onClick={() => enviarParaImpressora(pedido)}
                className="p-2 bg-gray-100 dark:bg-gray-800 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                title="Imprimir Cupom"
              >
                <Printer
                  size={20}
                  className="text-gray-700 dark:text-gray-300"
                />
              </button>
            </div>
          </div>

          {(pedido.cliente_nome?.trim() ||
            pedido.cliente_celular?.trim() ||
            (pedido.origem === "delivery" &&
              pedido.modalidade === "entrega" &&
              formatarEnderecoEntrega(pedido.endereco_json))) && (
            <div className="flex flex-col items-center gap-1 pl-3 border-l border-gray-200 dark:border-gray-700">
              <span className="text-[0.625rem] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                Copiar
              </span>
              <div className="flex gap-1.5">
                {pedido.cliente_nome?.trim() && (
                  <button
                    type="button"
                    onClick={() => copiarNomeCliente(pedido)}
                    className="p-2 bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 rounded-md hover:bg-sky-200 dark:hover:bg-sky-900 transition-colors"
                    title="Copiar nome do cliente"
                  >
                    <User size={20} />
                  </button>
                )}
                {pedido.cliente_celular?.trim() && (
                  <button
                    type="button"
                    onClick={() => copiarTelefoneCliente(pedido)}
                    className="p-2 bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 rounded-md hover:bg-emerald-200 dark:hover:bg-emerald-900 transition-colors"
                    title="Copiar telefone do cliente"
                  >
                    <Phone size={20} />
                  </button>
                )}
                {pedido.origem === "delivery" &&
                  pedido.modalidade === "entrega" &&
                  formatarEnderecoEntrega(pedido.endereco_json) && (
                    <button
                      type="button"
                      onClick={() => copiarEnderecoEntrega(pedido)}
                      className="p-2 bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 rounded-md hover:bg-violet-200 dark:hover:bg-violet-900 transition-colors"
                      title="Copiar endereço de entrega"
                    >
                      <MapPin size={20} />
                    </button>
                  )}
                {pedido.origem === "delivery" &&
                  pedido.modalidade === "entrega" &&
                  complementoPedido(pedido.endereco_json) && (
                    <button
                      type="button"
                      onClick={() => copiarComplementoEntrega(pedido)}
                      className="p-2 bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 rounded-md hover:bg-amber-200 dark:hover:bg-amber-900 transition-colors"
                      title="Copiar complemento (apto, casa…)"
                    >
                      <Building2 size={20} />
                    </button>
                  )}
              </div>
            </div>
          )}
        </div>
      </div>

      <ul className="flex-1 space-y-2">
        {pedido.pedido_itens.map((item) => (
          <li key={item.id} className="text-sm">
            <span className="font-bold">{item.quantidade}x</span>{" "}
            {item.produtos.nome}
            {item.modo_consumo === "levar" && (
              <span className="ml-1 text-[0.625rem] font-black uppercase tracking-wide text-orange-600 dark:text-orange-400">
                · LEVAR
              </span>
            )}
            {item.modo_consumo === "loja" && (
              <span className="ml-1 text-[0.625rem] font-black uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                · LOJA
              </span>
            )}
            {item.pedido_item_combo_escolhas &&
              item.pedido_item_combo_escolhas.length > 0 && (
                <ul className="ml-4 mt-0.5 space-y-0.5">
                  {item.pedido_item_combo_escolhas.map((escolha, idx) => (
                    <li
                      key={`${item.id}-combo-${idx}`}
                      className="text-xs text-gray-600 dark:text-gray-400"
                    >
                      {escolha.nome_grupo}: {escolha.nome_produto}
                      {Number(escolha.delta_preco) > 0 &&
                        ` (+R$ ${Number(escolha.delta_preco).toFixed(2)})`}
                    </li>
                  ))}
                </ul>
              )}
            {item.observacoes && (
              <p className="text-xs text-red-500 font-medium ml-4">
                Obs: {item.observacoes}
              </p>
            )}
          </li>
        ))}
      </ul>

      <div className="pt-2 flex gap-2 flex-col">
        {pedido.status === "pendente" && (
          <button
            onClick={() => atualizarStatus(pedido.id, "em_producao")}
            className="flex-1 bg-yellow-500 text-white py-2 rounded font-bold flex justify-center items-center gap-2"
          >
            <ChefHat size={18} /> Preparar
          </button>
        )}
        {pedido.status === "em_producao" && (
          <button
            onClick={() => atualizarStatus(pedido.id, "pronto")}
            className="flex-1 bg-green-500 text-white py-2 rounded font-bold flex justify-center items-center gap-2"
          >
            <CheckCircle2 size={18} /> Finalizar (pronto)
          </button>
        )}
        {pedido.status === "pronto" && (
          <>
            {pedido.origem === "delivery" &&
              pedido.modalidade === "entrega" &&
              !pedido.voa_order_id && (
                <button
                  type="button"
                  onClick={() => void chamarMotoboy(pedido)}
                  className="flex-1 bg-violet-600 text-white py-2 rounded font-bold flex justify-center items-center gap-2"
                >
                  <Bike size={18} /> Chamar motoboy
                </button>
              )}
            {pedido.origem === "delivery" &&
              pedido.modalidade === "entrega" &&
              pedido.voa_order_id && (
                <div className="rounded-lg bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800 px-3 py-2 text-xs font-semibold text-violet-800 dark:text-violet-200 flex items-center gap-2">
                  <Bike size={14} />
                  Motoboy chamado
                  {pedido.tracking_url && (
                    <a
                      href={pedido.tracking_url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline ml-auto"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Rastrear
                    </a>
                  )}
                </div>
              )}
            <button
              type="button"
              onClick={() => atualizarStatus(pedido.id, "entregue")}
              className="flex-1 bg-gray-800 text-white py-2 rounded font-bold"
            >
              {pedido.origem === "delivery" && pedido.modalidade === "retirada"
                ? "Cliente retirou"
                : pedido.origem === "delivery" &&
                    pedido.modalidade === "entrega"
                  ? "Entrega concluída"
                  : "Entregue"}
            </button>
          </>
        )}
      </div>
    </motion.div>
  );

  return (
    <AdminPageShell
      title="Fila de Produção"
      actions={
        <>
          {impressoraOffline && (
            <span className="flex items-center gap-1 text-orange-600 font-bold text-sm bg-orange-100 dark:bg-orange-900/30 px-3 py-1 rounded-full">
              <Printer size={16} /> Impressora offline
            </span>
          )}
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
          {alertaSonoroAtivo ? (
            <button
              type="button"
              onClick={desativarAlertaSonoro}
              title="Desligar alertas sonoros"
              className="flex items-center gap-1.5 text-sm font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 px-3 py-2 rounded-lg hover:bg-emerald-200 dark:hover:bg-emerald-900/60 transition-colors"
            >
              <Volume2 size={16} /> Som ativo
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void ativarAlertaSonoro()}
              title="O Chrome exige um clique para liberar o som (funciona com a aba em segundo plano)"
              className={`flex items-center gap-1.5 text-sm font-bold px-3 py-2 rounded-lg transition-colors ${
                precisaReativar
                  ? "bg-amber-500 text-white hover:bg-amber-600 animate-pulse"
                  : "bg-red-600 text-white hover:bg-red-700"
              }`}
            >
              <VolumeX size={16} />
              {precisaReativar ? "Reativar som" : "Ativar som"}
            </button>
          )}
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1 overflow-hidden">
          {/* Coluna PENDENTE */}
          <div className="flex flex-col bg-gray-100 dark:bg-[#1a1815] rounded-xl p-4 overflow-y-auto hide-scrollbar">
            <h2 className="font-bold text-lg mb-4 flex items-center gap-2 text-red-600">
              <Clock size={20} /> Novos ({pendentes.length})
            </h2>
            <div className="flex flex-col gap-4">
              <AnimatePresence>
                {pendentes.map((p) => (
                  <CardPedido
                    key={p.id}
                    pedido={p}
                    corBorder="border-red-500"
                  />
                ))}
              </AnimatePresence>
            </div>
          </div>

          {/* Coluna EM PRODUÇÃO */}
          <div className="flex flex-col bg-gray-100 dark:bg-[#1a1815] rounded-xl p-4 overflow-y-auto hide-scrollbar">
            <h2 className="font-bold text-lg mb-4 flex items-center gap-2 text-yellow-600">
              <ChefHat size={20} /> Preparando ({emProducao.length})
            </h2>
            <div className="flex flex-col gap-4">
              <AnimatePresence>
                {emProducao.map((p) => (
                  <CardPedido
                    key={p.id}
                    pedido={p}
                    corBorder="border-yellow-500"
                  />
                ))}
              </AnimatePresence>
            </div>
          </div>

          {/* Coluna PRONTO */}
          <div className="flex flex-col bg-gray-100 dark:bg-[#1a1815] rounded-xl p-4 overflow-y-auto hide-scrollbar">
            <h2 className="font-bold text-lg mb-1 flex items-center gap-2 text-green-600">
              <CheckCircle2 size={20} /> Prontos ({prontos.length})
            </h2>
            <p className="text-xs text-gray-500 mb-4">
              Delivery: chame o motoboy aqui. Retirada: aguarde o cliente.
            </p>
            <div className="flex flex-col gap-4">
              <AnimatePresence>
                {prontos.map((p) => (
                  <CardPedido
                    key={p.id}
                    pedido={p}
                    corBorder="border-green-500"
                  />
                ))}
              </AnimatePresence>
            </div>
          </div>
        </div>
      )}

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
