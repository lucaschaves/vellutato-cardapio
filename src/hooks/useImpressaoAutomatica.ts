import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  enviarParaImpressoraLocal,
  obterUrlImpressoraLocal,
} from "../lib/impressoraLocal";
import { supabase } from "../lib/supabase";

const SELECT_PEDIDO_IMPRESSAO = `
  id, sequencia_pedido, origem, identificador, cliente_nome, cliente_celular,
  status, criado_em, total, impresso,
  pedido_itens (
    id, quantidade, observacoes, preco_unitario,
    produtos ( nome ),
    pedido_item_adicionais (
      preco_aplicado,
      adicionais ( nome )
    )
  )
`;

const MAX_TENTATIVAS_ITENS = 6;
const INTERVALO_TENTATIVA_MS = 400;

export function useImpressaoAutomatica() {
  const [impressoraOffline, setImpressoraOffline] = useState(false);
  const pedidosEmProcessamentoRef = useRef<Set<string>>(new Set());
  const pedidosImpressosRef = useRef<Set<string>>(new Set());

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

      if (
        !manual &&
        (pedido.impresso || pedidosImpressosRef.current.has(pedidoId))
      ) {
        return false;
      }

      const sucesso = await enviarParaImpressoraLocal(pedido);

      if (sucesso) {
        setImpressoraOffline(false);
        pedidosImpressosRef.current.add(pedidoId);
        await supabase
          .from("pedidos")
          .update({ impresso: true })
          .eq("id", pedidoId);
        return true;
      }

      setImpressoraOffline(true);
      toast.error(
        "Impressora local offline. Verifique o servidor em " +
          obterUrlImpressoraLocal(),
        { duration: 6000 },
      );
      return false;
    } finally {
      pedidosEmProcessamentoRef.current.delete(pedidoId);
    }
  };

  const agendarImpressaoPedido = (pedidoId: string, tentativa = 0) => {
    window.setTimeout(async () => {
      const pedido = await buscarPedidoParaImpressao(pedidoId);

      if (!pedido) return;

      const itensPendentes =
        pedido.pedido_itens.length === 0 && tentativa < MAX_TENTATIVAS_ITENS;

      if (itensPendentes) {
        agendarImpressaoPedido(pedidoId, tentativa + 1);
        return;
      }

      await imprimirPedido(pedidoId);
    }, tentativa === 0 ? INTERVALO_TENTATIVA_MS : INTERVALO_TENTATIVA_MS);
  };

  useEffect(() => {
    const canalImpressao = supabase
      .channel("impressao_automatica")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "pedidos" },
        (payload) => {
          const novoPedido = payload.new as { id?: string; status?: string };
          if (!novoPedido.id || novoPedido.status !== "pendente") return;

          console.info(
            "[IMPRESSÃO] Novo pedido detectado, agendando impressão:",
            novoPedido.id,
          );
          agendarImpressaoPedido(novoPedido.id);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canalImpressao);
    };
  }, []);

  return {
    impressoraOffline,
    imprimirPedido,
  };
}
