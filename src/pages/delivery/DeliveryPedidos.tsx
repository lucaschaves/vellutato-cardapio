import { ChevronDown, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { IconeGoogle } from "../../components/IconeGoogle";
import { useDeliveryCliente } from "../../hooks/useDeliveryCliente";
import type { ItemPedidoDelivery } from "../../lib/deliveryPedido";
import { cancelarPedidosDeliveryExpirados } from "../../lib/deliveryPedido";
import { obterClasseStatus } from "../../lib/pedidosAdmin";
import { supabase } from "../../lib/supabase";

const LABEL_STATUS: Record<string, string> = {
  pendente: "Recebido",
  em_producao: "Em preparo",
  pronto: "Pronto",
  entregue: "Entregue",
  cancelado: "Cancelado",
  pago: "Aguardando",
  aguardando_pagamento: "Aguardando pagamento",
};

interface PedidoLista {
  id: string;
  sequencia_pedido: number;
  status: string;
  modalidade: string | null;
  total: number | null;
  criado_em: string;
  tracking_url: string | null;
  pedido_itens: ItemPedidoDelivery[];
}

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

export function DeliveryPedidos() {
  const navigate = useNavigate();
  const {
    logado,
    cliente,
    carregando,
    entrarComGoogle,
    cadastroCompleto,
  } = useDeliveryCliente();
  const [pedidos, setPedidos] = useState<PedidoLista[]>([]);
  const [pedidoAbertoId, setPedidoAbertoId] = useState<string | null>(null);
  const [carregandoLista, setCarregandoLista] = useState(false);

  useEffect(() => {
    if (!cliente?.id) return;
    void (async () => {
      setCarregandoLista(true);
      try {
        await cancelarPedidosDeliveryExpirados(30);
        const { data } = await supabase
          .from("pedidos")
          .select(
            `
            id, sequencia_pedido, status, modalidade, total, criado_em, tracking_url,
            status_pagamento,
            pedido_itens (
              id, quantidade, preco_unitario, observacoes,
              produtos ( nome ),
              pedido_item_adicionais (
                preco_aplicado,
                adicionais ( nome )
              ),
              pedido_item_combo_escolhas (
                nome_grupo, nome_produto, delta_preco
              )
            )
          `,
          )
          .eq("cliente_id", cliente.id)
          .eq("origem", "delivery")
          .neq("status", "aguardando_pagamento")
          .not("status_pagamento", "eq", "aguardando")
          .order("criado_em", { ascending: false })
          .limit(30);
        setPedidos((data as unknown as PedidoLista[]) || []);
      } finally {
        setCarregandoLista(false);
      }
    })();
  }, [cliente?.id]);

  if (carregando) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-red-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!logado) {
    return (
      <div className="text-center py-16 space-y-4">
        <h1 className="text-2xl font-black">Meus pedidos</h1>
        <p className="text-sm text-zinc-500">
          Entre com Google para ver seus pedidos.
        </p>
        <Button
          className="bg-red-600 hover:bg-red-700"
          onClick={() =>
            void entrarComGoogle(
              `${window.location.origin}/delivery/auth/callback`,
            )
          }
        >
          <IconeGoogle className="h-5 w-5 mr-2" />
          Entrar com Google
        </Button>
      </div>
    );
  }

  if (!cadastroCompleto) {
    return (
      <div className="text-center py-16 space-y-3">
        <p>Complete seu cadastro para continuar.</p>
        <Button onClick={() => navigate("/delivery/cadastro")}>
          Completar cadastro
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">Meus pedidos</h1>

      {carregandoLista && (
        <div className="flex justify-center py-10">
          <div className="animate-spin h-8 w-8 border-4 border-red-600 border-t-transparent rounded-full" />
        </div>
      )}

      {!carregandoLista && pedidos.length === 0 && (
        <p className="text-sm text-zinc-500">Nenhum pedido ainda.</p>
      )}

      <div className="space-y-2">
        {pedidos.map((p) => {
          const aberto = pedidoAbertoId === p.id;
          const itens = p.pedido_itens || [];
          return (
            <div
              key={p.id}
              className="bg-white border border-zinc-200 rounded-2xl overflow-hidden"
            >
              <button
                type="button"
                onClick={() =>
                  setPedidoAbertoId((atual) => (atual === p.id ? null : p.id))
                }
                className="w-full p-4 text-left flex items-start gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold">#{p.sequencia_pedido}</span>
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${obterClasseStatus(p.status)}`}
                    >
                      {LABEL_STATUS[p.status] || p.status}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 capitalize mt-1.5">
                    {p.modalidade || "—"}
                  </p>
                  <p className="text-sm mt-1 font-semibold">
                    R$ {Number(p.total || 0).toFixed(2).replace(".", ",")}
                  </p>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    {new Date(p.criado_em).toLocaleString("pt-BR")}
                    {itens.length > 0
                      ? ` · ${itens.length} ${itens.length === 1 ? "item" : "itens"}`
                      : ""}
                  </p>
                </div>
                <ChevronDown
                  size={18}
                  className={`shrink-0 text-zinc-400 mt-1 transition-transform ${
                    aberto ? "rotate-180" : ""
                  }`}
                />
              </button>

              {aberto && (
                <div className="px-4 pb-4 border-t border-zinc-100 pt-3 space-y-3">
                  {itens.length === 0 ? (
                    <p className="text-sm text-zinc-500">
                      Nenhum item neste pedido.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {itens.map((item) => (
                        <li key={item.id} className="text-sm">
                          <div className="flex justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-semibold">
                                {item.quantidade}x{" "}
                                {item.produtos?.nome || "Item"}
                              </p>
                              {(item.pedido_item_adicionais || []).map(
                                (a, idx) => (
                                  <p
                                    key={`${item.id}-adc-${idx}`}
                                    className="text-xs text-zinc-500"
                                  >
                                    + {a.adicionais?.nome || "Adicional"}
                                  </p>
                                ),
                              )}
                              {(item.pedido_item_combo_escolhas || []).map(
                                (e, idx) => (
                                  <p
                                    key={`${item.id}-combo-${idx}`}
                                    className="text-xs text-zinc-500"
                                  >
                                    {e.nome_grupo}: {e.nome_produto}
                                  </p>
                                ),
                              )}
                              {item.observacoes && (
                                <p className="text-xs text-red-600 mt-0.5">
                                  Obs: {item.observacoes}
                                </p>
                              )}
                            </div>
                            <span className="font-bold shrink-0">
                              R${" "}
                              {totalLinhaItem(item)
                                .toFixed(2)
                                .replace(".", ",")}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="flex flex-wrap gap-2 pt-1">
                    <Link
                      to={`/delivery/pedido/${p.id}`}
                      className="text-xs font-semibold text-red-600"
                    >
                      Ver detalhes
                    </Link>
                    {p.tracking_url && (
                      <a
                        href={p.tracking_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-bold text-violet-700"
                      >
                        <ExternalLink size={12} /> Rastrear entrega
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
