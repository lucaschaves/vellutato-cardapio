import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { usePedidosRealtime } from "../context/PedidosRealtimeContext";
import {
  criarUrlSomImpressoraOffline,
  tocarUrlAudio,
} from "../lib/alertaPedidoSom";
import {
  enviarParaImpressoraLocal,
  obterUrlImpressoraLocal,
} from "../lib/impressoraLocal";
import { supabase } from "../lib/supabase";

const SELECT_PEDIDO_IMPRESSAO = `
  id, sequencia_pedido, origem, modalidade, identificador, cliente_nome, cliente_celular,
  status, criado_em, total, valor_total, desconto_aplicado, impresso,
  status_pagamento,
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
  const impressoraOfflineRef = useRef(false);
  const somOfflineUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (somOfflineUrlRef.current) {
        URL.revokeObjectURL(somOfflineUrlRef.current);
        somOfflineUrlRef.current = null;
      }
    };
  }, []);

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

      const sucesso = await enviarParaImpressoraLocal(pedido);

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
      };
      if (!pedido.id || pedido.impresso) return;
      if (pedido.status !== "pendente") return;
      if (!pagamentoLiberaImpressao(pedido.status_pagamento)) return;

      console.info(
        "[IMPRESSÃO] Pedido liberado para a cozinha, agendando impressão:",
        pedido.id,
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
        .select("id, status, status_pagamento, impresso")
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

  return {
    impressoraOffline,
    imprimirPedido,
  };
}
