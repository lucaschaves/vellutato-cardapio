import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { usePedidosRealtime } from "../context/PedidosRealtimeContext";
import {
  criarUrlSomImpressoraOffline,
  tocarUrlAudio,
} from "../lib/alertaPedidoSom";
import {
  enviarParaImpressoraLocal,
  gerarComandaPdf,
  impressoraEmModoPdf,
  obterUrlImpressoraLocal,
  verificarImpressoraOnline,
} from "../lib/impressoraLocal";
import {
  buscarConfigImpressao,
  obterConfigImpressaoCache,
} from "../lib/impressaoConfig";
import {
  podeImprimirPedidoAgora,
  instanteImpressaoAgendada,
} from "../lib/pedidoAgendado";
import { supabase } from "../lib/supabase";

/** Intervalo do health-check da impressora (ms). */
const INTERVALO_HEALTHCHECK_MS = 20000;
/** Revarre pedidos agendados pendentes de impressão. */
const INTERVALO_AGENDADOS_MS = 60000;

const SELECT_PEDIDO_IMPRESSAO = `
  id, sequencia_pedido, origem, modalidade, identificador, cliente_nome, cliente_celular,
  status, criado_em, total, valor_total, desconto_aplicado, impresso,
  status_pagamento, taxa_entrega, endereco_json, agendado_para,
  pedido_itens (
    id, quantidade, observacoes, preco_unitario, modo_consumo,
    produtos ( nome ),
    pedido_item_adicionais (
      preco_aplicado,
      adicionais ( nome )
    ),
    pedido_item_combo_escolhas (
      nome_grupo, nome_produto, delta_preco
    )
  )
`;

function pagamentoLiberaImpressao(statusPagamento: string | null | undefined) {
  // Delivery online: só imprime após pago ou pagar-na-loja.
  // Demais origens: nao_aplicavel / null.
  if (!statusPagamento || statusPagamento === "nao_aplicavel") return true;
  return statusPagamento === "pago" || statusPagamento === "na_loja";
}

const MAX_TENTATIVAS_ITENS = 6;
const INTERVALO_TENTATIVA_MS = 400;

export function useImpressaoAutomatica() {
  const { assinar, versaoConexao } = usePedidosRealtime();
  const [impressoraOffline, setImpressoraOffline] = useState(false);
  const pedidosEmProcessamentoRef = useRef<Set<string>>(new Set());
  const pedidosImpressosRef = useRef<Set<string>>(new Set());
  const timeoutsAgendadosRef = useRef<Map<string, number>>(new Map());
  const impressoraOfflineRef = useRef(false);
  const somOfflineUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (somOfflineUrlRef.current) {
        URL.revokeObjectURL(somOfflineUrlRef.current);
        somOfflineUrlRef.current = null;
      }
      for (const id of timeoutsAgendadosRef.current.values()) {
        window.clearTimeout(id);
      }
      timeoutsAgendadosRef.current.clear();
    };
  }, []);

  // Carrega a configuração de impressão uma vez (fica em cache do módulo).
  useEffect(() => {
    void buscarConfigImpressao();
  }, []);

  const verificarImpressora = useCallback(async () => {
    // No modo PDF (dev) não há servidor: considera sempre "online".
    if (impressoraEmModoPdf()) {
      impressoraOfflineRef.current = false;
      setImpressoraOffline(false);
      return true;
    }
    const online = await verificarImpressoraOnline();
    impressoraOfflineRef.current = !online;
    setImpressoraOffline(!online);
    return online;
  }, []);

  // Health-check periódico: reflete o status real mesmo com a loja ociosa
  // e auto-recupera para "online" quando o servidor volta.
  useEffect(() => {
    void verificarImpressora();
    const id = window.setInterval(() => {
      void verificarImpressora();
    }, INTERVALO_HEALTHCHECK_MS);
    return () => window.clearInterval(id);
  }, [verificarImpressora]);

  const alertarImpressoraOffline = () => {
    // Só toca na transição online → offline (evita spam a cada pedido).
    if (impressoraOfflineRef.current) return;
    impressoraOfflineRef.current = true;
    setImpressoraOffline(true);

    if (!somOfflineUrlRef.current) {
      somOfflineUrlRef.current = criarUrlSomImpressoraOffline();
    }
    tocarUrlAudio(somOfflineUrlRef.current);

    toast.error(
      "Impressora local offline. Verifique o servidor em " +
        obterUrlImpressoraLocal(),
      { duration: 8000, id: "impressora-offline" },
    );
  };

  const buscarPedidoParaImpressao = async (pedidoId: string) => {
    const { data, error } = await supabase
      .from("pedidos")
      .select(SELECT_PEDIDO_IMPRESSAO)
      .eq("id", pedidoId)
      .single();

    if (error) {
      console.error("[IMPRESSÃO] Falha ao buscar pedido:", error.message);
      return null;
    }

    return data;
  };

  const imprimirPedido = async (
    pedidoId: string,
    { manual = false }: { manual?: boolean } = {},
  ) => {
    if (pedidosEmProcessamentoRef.current.has(pedidoId)) return false;

    pedidosEmProcessamentoRef.current.add(pedidoId);

    try {
      const pedido = await buscarPedidoParaImpressao(pedidoId);
      if (!pedido) return false;

      if (pedido.status !== "pendente") return false;

      const statusPagamento = (
        pedido as { status_pagamento?: string | null }
      ).status_pagamento;
      if (!pagamentoLiberaImpressao(statusPagamento)) return false;

      if (
        !manual &&
        (pedido.impresso || pedidosImpressosRef.current.has(pedidoId))
      ) {
        return false;
      }

      const agendadoPara = (
        pedido as { agendado_para?: string | null }
      ).agendado_para;
      if (!manual && !podeImprimirPedidoAgora(agendadoPara)) {
        return false;
      }

      // Modo dev: gera PDF em vez de enviar para o servidor de impressão.
      // Só no clique manual, para não abrir vários downloads automaticamente.
      if (impressoraEmModoPdf()) {
        if (!manual) return false;
        await gerarComandaPdf(pedido, obterConfigImpressaoCache());
        impressoraOfflineRef.current = false;
        setImpressoraOffline(false);
        pedidosImpressosRef.current.add(pedidoId);
        await supabase
          .from("pedidos")
          .update({ impresso: true })
          .eq("id", pedidoId);
        return true;
      }

      const sucesso = await enviarParaImpressoraLocal(
        pedido,
        obterConfigImpressaoCache(),
      );

      if (sucesso) {
        impressoraOfflineRef.current = false;
        setImpressoraOffline(false);
        pedidosImpressosRef.current.add(pedidoId);
        await supabase
          .from("pedidos")
          .update({ impresso: true })
          .eq("id", pedidoId);
        return true;
      }

      alertarImpressoraOffline();
      return false;
    } finally {
      pedidosEmProcessamentoRef.current.delete(pedidoId);
    }
  };

  const agendarImpressaoPedido = (pedidoId: string, tentativa = 0) => {
    const existente = timeoutsAgendadosRef.current.get(pedidoId);
    if (existente) {
      window.clearTimeout(existente);
      timeoutsAgendadosRef.current.delete(pedidoId);
    }

    window.setTimeout(async () => {
      const pedido = await buscarPedidoParaImpressao(pedidoId);

      if (!pedido) return;

      // Aguarda itens + escolhas de combo (checkout grava em sequência)
      const itensPendentes =
        (pedido.pedido_itens?.length ?? 0) === 0 &&
        tentativa < MAX_TENTATIVAS_ITENS;

      if (itensPendentes) {
        agendarImpressaoPedido(pedidoId, tentativa + 1);
        return;
      }

      const agendadoPara = (
        pedido as { agendado_para?: string | null }
      ).agendado_para;
      const alvo = instanteImpressaoAgendada(agendadoPara);
      if (alvo != null && Date.now() < alvo) {
        // Acorda no horário (ou a cada 5 min, o que for menor) até poder imprimir.
        const delay = Math.min(Math.max(alvo - Date.now(), 1000), 5 * 60 * 1000);
        console.info(
          "[IMPRESSÃO] Pedido agendado — impressão em",
          new Date(alvo).toLocaleTimeString("pt-BR"),
          pedidoId,
        );
        const tid = window.setTimeout(
          () => agendarImpressaoPedido(pedidoId, 0),
          delay,
        );
        timeoutsAgendadosRef.current.set(pedidoId, tid);
        return;
      }

      await imprimirPedido(pedidoId);
    }, tentativa === 0 ? INTERVALO_TENTATIVA_MS : INTERVALO_TENTATIVA_MS);
  };

  useEffect(() => {
    return assinar((payload) => {
      if (payload.eventType !== "INSERT" && payload.eventType !== "UPDATE") {
        return;
      }

      const pedido = payload.new as {
        id?: string;
        status?: string;
        status_pagamento?: string | null;
        impresso?: boolean;
        agendado_para?: string | null;
      };
      if (!pedido.id || pedido.impresso) return;
      if (pedido.status !== "pendente") return;
      if (!pagamentoLiberaImpressao(pedido.status_pagamento)) return;

      console.info(
        "[IMPRESSÃO] Pedido liberado para a cozinha, agendando impressão:",
        pedido.id,
        pedido.agendado_para
          ? `(agendado → imprime às ${new Date(instanteImpressaoAgendada(pedido.agendado_para)!).toLocaleTimeString("pt-BR")})`
          : "",
      );
      agendarImpressaoPedido(pedido.id);
    });
  }, [assinar]);

  // Recupera impressões perdidas enquanto o websocket esteve desconectado
  // (inclui reinício do navegador/servidor da impressora).
  useEffect(() => {
    if (versaoConexao === 0) return;
    let cancelado = false;
    void (async () => {
      const { data, error } = await supabase
        .from("pedidos")
        .select("id, status, status_pagamento, impresso, agendado_para")
        .eq("status", "pendente")
        .or("impresso.eq.false,impresso.is.null");
      if (cancelado || error || !data) return;

      for (const pedido of data) {
        if (
          pedido.id &&
          pagamentoLiberaImpressao(pedido.status_pagamento)
        ) {
          agendarImpressaoPedido(pedido.id);
        }
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [versaoConexao]);

  // Varredura periódica: pega agendados que chegaram na janela de impressão.
  useEffect(() => {
    const id = window.setInterval(() => {
      void (async () => {
        const { data, error } = await supabase
          .from("pedidos")
          .select("id, status_pagamento, impresso, agendado_para")
          .eq("status", "pendente")
          .or("impresso.eq.false,impresso.is.null")
          .not("agendado_para", "is", null);
        if (error || !data) return;
        for (const pedido of data) {
          if (
            !pedido.id ||
            !pagamentoLiberaImpressao(pedido.status_pagamento)
          ) {
            continue;
          }
          if (podeImprimirPedidoAgora(pedido.agendado_para)) {
            agendarImpressaoPedido(pedido.id);
          }
        }
      })();
    }, INTERVALO_AGENDADOS_MS);
    return () => window.clearInterval(id);
  }, []);

  return {
    impressoraOffline,
    imprimirPedido,
    verificarImpressora,
  };
}
