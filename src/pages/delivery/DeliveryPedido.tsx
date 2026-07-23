import { Bell, MessageCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { buscarDeliveryConfig } from "../../lib/deliveryConfig";
import {
  buscarPedidoDelivery,
  cancelarPedidosDeliveryExpirados,
  confirmarPagamentoAsaas,
  type ItemPedidoDelivery,
} from "../../lib/deliveryPedido";
import {
  montarLinkWhatsappLoja,
  textoInicioWhatsappAcompanhamento,
} from "../../lib/notificacoesPedido";
import { supabase } from "../../lib/supabase";
import {
  ativarPushPedido,
  pushSuportado,
} from "../../lib/webPush";
import { useCartStore } from "../../store/useCartStore";

const LABEL_STATUS: Record<string, string> = {
  pendente: "Recebido",
  em_producao: "Em preparo",
  pronto: "Pronto",
  entregue: "Entregue",
  cancelado: "Cancelado",
  pago: "Aguardando",
  aguardando_pagamento: "Aguardando pagamento",
};

function totalLinhaItem(item: ItemPedidoDelivery): number {
  const adicionais = (item.pedido_item_adicionais || []).reduce(
    (s, a) => s + Number(a.preco_aplicado || 0),
    0,
  );
  const combos = (item.pedido_item_combo_escolhas || []).reduce(
    (s, c) => s + Number(c.delta_preco || 0),
    0,
  );
  return (Number(item.preco_unitario) + adicionais + combos) * item.quantidade;
}

type PedidoDelivery = Awaited<ReturnType<typeof buscarPedidoDelivery>>;

export function DeliveryPedido() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const limparCarrinho = useCartStore((s) => s.limparCarrinho);
  const [pedido, setPedido] = useState<PedidoDelivery | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [confirmandoPagamento, setConfirmandoPagamento] = useState(false);
  const [whatsappNumero, setWhatsappNumero] = useState<string | null>(null);
  const [pushAtivo, setPushAtivo] = useState(false);
  const [ativandoPush, setAtivandoPush] = useState(false);
  const syncFeitoRef = useRef(false);

  useEffect(() => {
    void cancelarPedidosDeliveryExpirados(30);
    void buscarDeliveryConfig().then((cfg) =>
      setWhatsappNumero(cfg.whatsapp_numero),
    );
  }, []);

  useEffect(() => {
    if (!id) return;
    let cancelado = false;

    const carregar = async () => {
      try {
        const p = await buscarPedidoDelivery(id);
        if (cancelado) return;
        setPedido(p);
        if (
          p.status_pagamento === "pago" ||
          p.status_pagamento === "na_loja"
        ) {
          limparCarrinho();
        }
        return p;
      } catch (e) {
        console.error(e);
        return null;
      } finally {
        if (!cancelado) setCarregando(false);
      }
    };

    void carregar();

    const canal = supabase
      .channel(`pedido_delivery_${id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "pedidos",
          filter: `id=eq.${id}`,
        },
        () => void carregar(),
      )
      .subscribe();

    return () => {
      cancelado = true;
      supabase.removeChannel(canal);
    };
  }, [id, limparCarrinho]);

  // Retorno do Asaas (?pago=1): sync imediato + polling até confirmar
  useEffect(() => {
    if (!id || params.get("pago") !== "1") return;
    if (pedido?.status_pagamento === "pago") return;

    let cancelado = false;
    let tentativas = 0;

    const sincronizar = async () => {
      if (cancelado || syncFeitoRef.current) return;
      try {
        setConfirmandoPagamento(true);
        const res = await confirmarPagamentoAsaas(id);
        if (cancelado) return;
        if (res.status_pagamento === "pago") {
          syncFeitoRef.current = true;
          const p = await buscarPedidoDelivery(id);
          if (!cancelado) {
            setPedido(p);
            limparCarrinho();
            toast.success("Pagamento confirmado!");
          }
          return true;
        }
      } catch (e) {
        console.error("[PAGAMENTO SYNC]", e);
      } finally {
        if (!cancelado) setConfirmandoPagamento(false);
      }
      return false;
    };

    void sincronizar();

    const intervalo = window.setInterval(() => {
      tentativas += 1;
      if (tentativas > 15 || syncFeitoRef.current) {
        window.clearInterval(intervalo);
        return;
      }
      void (async () => {
        const ok = await sincronizar();
        if (!ok) {
          try {
            const p = await buscarPedidoDelivery(id);
            if (cancelado) return;
            setPedido(p);
            if (p.status_pagamento === "pago") {
              syncFeitoRef.current = true;
              limparCarrinho();
              window.clearInterval(intervalo);
            }
          } catch (e) {
            console.error(e);
          }
        } else {
          window.clearInterval(intervalo);
        }
      })();
    }, 2500);

    return () => {
      cancelado = true;
      window.clearInterval(intervalo);
    };
  }, [id, params, pedido?.status_pagamento, limparCarrinho]);

  const ativarNotificacoes = async () => {
    if (!pedido || ativandoPush) return;
    setAtivandoPush(true);
    try {
      const res = await ativarPushPedido({
        pedidoId: pedido.id,
        clienteId: pedido.cliente_id,
      });
      if (!res.ok) {
        toast.error(res.motivo);
        return;
      }
      setPushAtivo(true);
      toast.success("Notificações ativadas para este pedido!");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[PUSH]", msg);
      toast.error("Não foi possível ativar as notificações.");
    } finally {
      setAtivandoPush(false);
    }
  };

  if (carregando) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-red-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!pedido) {
    return <p className="text-center py-16">Pedido não encontrado.</p>;
  }

  const pagamentoConfirmado = pedido.status_pagamento === "pago";
  const aguardandoConfirmacao =
    params.get("pago") === "1" &&
    !pagamentoConfirmado &&
    (confirmandoPagamento || pedido.status_pagamento === "aguardando");

  const itens = (pedido.pedido_itens || []) as ItemPedidoDelivery[];
  const taxa = Number(pedido.taxa_entrega || 0);
  const desconto = Number(pedido.desconto_aplicado || 0);

  const linkWhatsapp = montarLinkWhatsappLoja(
    whatsappNumero,
    textoInicioWhatsappAcompanhamento(pedido.sequencia_pedido, pedido.id),
  );

  const statusExibido = aguardandoConfirmacao
    ? "Confirmando pagamento…"
    : LABEL_STATUS[pedido.status] || pedido.status;

  return (
    <div className="space-y-4">
      <div className="bg-white border rounded-3xl p-5 space-y-2">
        <p className="text-xs uppercase tracking-widest text-zinc-500">
          Pedido #{pedido.sequencia_pedido}
        </p>
        <h1 className="text-2xl font-black">{statusExibido}</h1>
        <p className="text-sm text-zinc-500 capitalize">
          {pedido.modalidade} · pagamento:{" "}
          {pagamentoConfirmado ? "pago" : pedido.status_pagamento}
        </p>
        {aguardandoConfirmacao && (
          <p className="text-sm text-amber-700 bg-amber-50 rounded-xl p-3">
            Pagamento recebido pelo Asaas — confirmando no sistema…
          </p>
        )}
        {pagamentoConfirmado && (
          <p className="text-sm text-emerald-700 bg-emerald-50 rounded-xl p-3">
            Pagamento confirmado! A cozinha já recebeu seu pedido.
          </p>
        )}
      </div>

      <section className="bg-white border rounded-3xl p-5 space-y-3">
        <h2 className="font-bold text-sm text-zinc-500 uppercase tracking-wider">
          Acompanhar pedido
        </h2>
        <p className="text-sm text-zinc-600">
          Ative as notificações e/ou abra o WhatsApp para falar conosco sobre
          este pedido.
        </p>

        {pushSuportado() && (
          <button
            type="button"
            disabled={pushAtivo || ativandoPush}
            onClick={() => void ativarNotificacoes()}
            className="w-full flex items-center justify-center gap-2 border border-zinc-200 rounded-2xl py-3 text-sm font-semibold disabled:opacity-70"
          >
            <Bell size={18} className={pushAtivo ? "text-emerald-600" : ""} />
            {pushAtivo
              ? "Notificações ativas"
              : ativandoPush
                ? "Ativando…"
                : "Ativar notificações no celular"}
          </button>
        )}

        {linkWhatsapp ? (
          <a
            href={linkWhatsapp}
            target="_blank"
            rel="noreferrer"
            className="w-full flex items-center justify-center gap-2 bg-[#25D366] text-white rounded-2xl py-3 text-sm font-bold"
          >
            <MessageCircle size={18} />
            Acompanhar no WhatsApp
          </a>
        ) : (
          <p className="text-xs text-zinc-400">
            Configure o número da loja em Admin → Delivery para habilitar o
            WhatsApp.
          </p>
        )}

        {pedido.tracking_url && (
          <a
            href={pedido.tracking_url}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 bg-violet-600 text-white rounded-2xl py-3 text-sm font-bold"
          >
            Rastrear entrega
          </a>
        )}
      </section>

      <section className="bg-white border rounded-3xl p-5 space-y-3">
        <h2 className="font-bold text-sm text-zinc-500 uppercase tracking-wider">
          Itens do pedido
        </h2>
        {itens.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhum item encontrado.</p>
        ) : (
          <ul className="space-y-3">
            {itens.map((item) => (
              <li
                key={item.id}
                className="border-b border-zinc-100 last:border-0 pb-3 last:pb-0"
              >
                <div className="flex justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm">
                      {item.quantidade}x {item.produtos?.nome || "Item"}
                    </p>
                    {(item.pedido_item_adicionais || []).length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {item.pedido_item_adicionais.map((a, idx) => (
                          <li
                            key={`${item.id}-adc-${idx}`}
                            className="text-xs text-zinc-500"
                          >
                            + {a.adicionais?.nome || "Adicional"}
                            {Number(a.preco_aplicado) > 0
                              ? ` (R$ ${Number(a.preco_aplicado).toFixed(2).replace(".", ",")})`
                              : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                    {(item.pedido_item_combo_escolhas || []).length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {item.pedido_item_combo_escolhas.map((e, idx) => (
                          <li
                            key={`${item.id}-combo-${idx}`}
                            className="text-xs text-zinc-500"
                          >
                            {e.nome_grupo}: {e.nome_produto}
                            {Number(e.delta_preco) > 0
                              ? ` (+R$ ${Number(e.delta_preco).toFixed(2).replace(".", ",")})`
                              : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                    {item.observacoes && (
                      <p className="text-xs text-red-600 mt-1">
                        Obs: {item.observacoes}
                      </p>
                    )}
                  </div>
                  <p className="text-sm font-bold shrink-0">
                    R$ {totalLinhaItem(item).toFixed(2).replace(".", ",")}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-zinc-100 pt-3 space-y-1 text-sm">
          {desconto > 0 && (
            <div className="flex justify-between text-emerald-700">
              <span>Desconto</span>
              <span>- R$ {desconto.toFixed(2).replace(".", ",")}</span>
            </div>
          )}
          {taxa > 0 && (
            <div className="flex justify-between text-zinc-600">
              <span>Frete</span>
              <span>R$ {taxa.toFixed(2).replace(".", ",")}</span>
            </div>
          )}
          <div className="flex justify-between font-black text-base pt-1">
            <span>Total</span>
            <span>
              R${" "}
              {Number(pedido.valor_total || pedido.total || 0)
                .toFixed(2)
                .replace(".", ",")}
            </span>
          </div>
        </div>
      </section>

      <div className="flex gap-2">
        <Link
          to={`/delivery/chat?pedido=${pedido.id}`}
          className="flex-1 text-center border border-zinc-200 rounded-2xl py-3 text-sm font-semibold"
        >
          Falar conosco
        </Link>
        <Link
          to="/delivery"
          className="flex-1 text-center bg-red-600 text-white rounded-2xl py-3 text-sm font-bold"
        >
          Novo pedido
        </Link>
      </div>
    </div>
  );
}
