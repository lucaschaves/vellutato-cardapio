import { useEffect, useState } from "react";
import { useClienteDeliverySessao } from "./useClienteDeliverySessao";
import { pedidoEmAndamento } from "../lib/pedidoStatusCliente";
import { supabase } from "../lib/supabase";

/** Contagem de pedidos em andamento do cliente (badge do header). */
export function usePedidosDeliveryAtivosCount() {
  const { cliente, carregando } = useClienteDeliverySessao();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (carregando) return;
    if (!cliente?.id) {
      setCount(0);
      return;
    }

    let ativo = true;

    const carregar = async () => {
      const { data, error } = await supabase
        .from("pedidos")
        .select("id, status, status_pagamento, tracking_url")
        .eq("cliente_id", cliente.id)
        .eq("origem", "delivery")
        .order("criado_em", { ascending: false })
        .limit(40);

      if (!ativo) return;
      if (error) {
        console.error("[PEDIDOS ATIVOS]", error.message);
        return;
      }
      const n = (data || []).filter((p) =>
        pedidoEmAndamento({
          status: p.status,
          status_pagamento: p.status_pagamento,
          tracking_url: p.tracking_url,
        }),
      ).length;
      setCount(n);
    };

    void carregar();

    const canal = supabase
      .channel(`pedidos_ativos_${cliente.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pedidos",
          filter: `cliente_id=eq.${cliente.id}`,
        },
        () => void carregar(),
      )
      .subscribe();

    return () => {
      ativo = false;
      void supabase.removeChannel(canal);
    };
  }, [cliente?.id, carregando]);

  return count;
}
