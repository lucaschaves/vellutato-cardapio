import { ChevronDown, ExternalLink, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { IdentificarTelefoneDelivery } from "../../components/IdentificarTelefoneDelivery";
import { ModalConfirmacao } from "../../components/ModalConfirmacao";
import { useClienteDeliverySessao } from "../../hooks/useClienteDeliverySessao";
import {
  cancelarPedidoDeliveryAguardando,
  cancelarPedidosDeliveryExpirados,
  iniciarCheckoutAsaas,
  type ItemPedidoDelivery,
} from "../../lib/deliveryPedido";
import { lerGuestDeliveryLocal } from "../../lib/deliveryGuestStorage";
import {
  pedirDeNovo,
  type ItemPedidoParaRecompra,
} from "../../lib/pedirDeNovo";
import { obterClasseStatus } from "../../lib/pedidosAdmin";
import {
  pedidoEmAndamento,
  rotuloStatusCliente,
} from "../../lib/pedidoStatusCliente";
import { supabase } from "../../lib/supabase";
import { urlDelivery } from "../../lib/urlDelivery";

interface PedidoLista {
  id: string;
  sequencia_pedido: number;
  status: string;
  status_pagamento: string | null;
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

function CardPedido({
  p,
  aberto,
  onToggle,
  onCancelado,
}: {
  p: PedidoLista;
  aberto: boolean;
  onToggle: () => void;
  onCancelado: (id: string) => void;
}) {
  const navigate = useNavigate();
  const itens = p.pedido_itens || [];
  const rotulo = rotuloStatusCliente(p);
  const precisaPagar =
    p.status_pagamento === "aguardando" ||
    p.status === "aguardando_pagamento";
  const [pagando, setPagando] = useState(false);
  const [confirmarCancelar, setConfirmarCancelar] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [repedindo, setRepedindo] = useState(false);
  const classeStatus =
    rotulo === "Em rota"
      ? "bg-violet-100 text-violet-800"
      : rotulo === "Aguardando pagamento"
        ? "bg-amber-100 text-amber-800"
        : obterClasseStatus(p.status);

  const pagarAgora = async () => {
    if (pagando) return;
    setPagando(true);
    try {
      const email = lerGuestDeliveryLocal()?.email?.trim() || null;
      if (!email || !email.includes("@")) {
        toast.error(
          "Abra o pedido e use Pagar agora — precisamos do e-mail do checkout.",
        );
        setPagando(false);
        return;
      }
      toast.message("Abrindo pagamento seguro…");
      const checkout = await iniciarCheckoutAsaas(p.id, {
        email,
        forcarNovo: true,
      });
      window.location.assign(checkout.checkout_url);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg || "Não foi possível gerar o pagamento");
      setPagando(false);
    }
  };

  const cancelar = async () => {
    if (cancelando) return;
    setCancelando(true);
    try {
      const ok = await cancelarPedidoDeliveryAguardando(p.id);
      if (!ok) {
        toast.error("Não foi possível cancelar este pedido.");
        setConfirmarCancelar(false);
        return;
      }
      toast.success("Pedido cancelado.");
      setConfirmarCancelar(false);
      onCancelado(p.id);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg || "Falha ao cancelar");
    } finally {
      setCancelando(false);
    }
  };

  const repedir = async () => {
    if (repedindo) return;
    setRepedindo(true);
    try {
      const { adicionados } = await pedirDeNovo(
        itens as ItemPedidoParaRecompra[],
      );
      if (adicionados > 0) navigate(urlDelivery("/checkout"));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao montar sacola");
    } finally {
      setRepedindo(false);
    }
  };

  return (
    <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full p-4 text-left flex items-start gap-3"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-bold">#{p.sequencia_pedido}</span>
            <span
              className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${classeStatus}`}
            >
              {rotulo}
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
            <p className="text-sm text-zinc-500">Nenhum item neste pedido.</p>
          ) : (
            <ul className="space-y-3">
              {itens.map((item) => (
                <li key={item.id} className="text-sm">
                  <div className="flex justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {item.quantidade}x {item.produtos?.nome || "Item"}
                      </p>
                      {(item.pedido_item_adicionais || []).map((a, idx) => (
                        <p
                          key={`${item.id}-adc-${idx}`}
                          className="text-xs text-zinc-500"
                        >
                          + {a.adicionais?.nome || "Adicional"}
                        </p>
                      ))}
                      {(item.pedido_item_combo_escolhas || []).map((e, idx) => (
                        <p
                          key={`${item.id}-combo-${idx}`}
                          className="text-xs text-zinc-500"
                        >
                          {e.nome_grupo}: {e.nome_produto}
                        </p>
                      ))}
                      {item.observacoes && (
                        <p className="text-xs text-cookie-primary mt-0.5">
                          Obs: {item.observacoes}
                        </p>
                      )}
                    </div>
                    <span className="font-bold shrink-0">
                      R$ {totalLinhaItem(item).toFixed(2).replace(".", ",")}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-2 pt-1 items-center">
            {precisaPagar && (
              <>
                <button
                  type="button"
                  disabled={pagando || cancelando}
                  onClick={() => void pagarAgora()}
                  className="text-xs font-bold px-3 py-1.5 rounded-full bg-cookie-primary text-white disabled:opacity-60"
                >
                  {pagando ? "Abrindo…" : "Pagar agora"}
                </button>
                <button
                  type="button"
                  disabled={pagando || cancelando}
                  onClick={() => setConfirmarCancelar(true)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-full border border-zinc-200 text-zinc-600 disabled:opacity-60"
                >
                  Cancelar
                </button>
              </>
            )}
            {!precisaPagar && itens.length > 0 && (
              <button
                type="button"
                disabled={repedindo}
                onClick={() => void repedir()}
                className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full bg-zinc-900 text-white disabled:opacity-60"
              >
                <RotateCcw size={12} />
                {repedindo ? "Montando…" : "Pedir de novo"}
              </button>
            )}
            <Link
              to={`/pedido/${p.id}`}
              className="text-xs font-semibold text-cookie-primary"
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

      <ModalConfirmacao
        aberto={confirmarCancelar}
        titulo="Cancelar pedido?"
        mensagem={`O pedido #${p.sequencia_pedido} será cancelado e o estoque liberado.`}
        textoConfirmar="Sim, cancelar"
        textoCancelar="Manter pedido"
        carregando={cancelando}
        aoCancelar={() => setConfirmarCancelar(false)}
        aoConfirmar={() => void cancelar()}
      />
    </div>
  );
}

export function DeliveryPedidos() {
  const { cliente, carregando, precisaIdentificar, identificarPorTelefone } =
    useClienteDeliverySessao();
  const [pedidos, setPedidos] = useState<PedidoLista[]>([]);
  const [pedidoAbertoId, setPedidoAbertoId] = useState<string | null>(null);
  const [carregandoLista, setCarregandoLista] = useState(false);

  useEffect(() => {
    if (!cliente?.id) return;
    let ativo = true;

    const carregar = async () => {
      setCarregandoLista(true);
      try {
        await cancelarPedidosDeliveryExpirados();
        const { data } = await supabase
          .from("pedidos")
          .select(
            `
            id, sequencia_pedido, status, modalidade, total, criado_em, tracking_url,
            status_pagamento,
            pedido_itens (
              id, produto_id, quantidade, preco_unitario, observacoes, modo_consumo,
              produtos (
                nome, imagem_url, preco, preco_promocional, em_promocao,
                disponibilidade, controlar_estoque, quantidade_estoque
              ),
              pedido_item_adicionais (
                adicional_id, preco_aplicado,
                adicionais ( nome )
              ),
              pedido_item_combo_escolhas (
                grupo_id, produto_escolhido_id, nome_grupo, nome_produto, delta_preco
              )
            )
          `,
          )
          .eq("cliente_id", cliente.id)
          .eq("origem", "delivery")
          .order("criado_em", { ascending: false })
          .limit(40);
        if (!ativo) return;
        // Expirados são apagados no RPC; filtra resíduos antigos sem pagamento.
        const lista = ((data as unknown as PedidoLista[]) || []).filter(
          (p) =>
            !(
              p.status === "cancelado" &&
              (p.status_pagamento === "expirado" ||
                p.status_pagamento === "aguardando" ||
                p.status_pagamento === "cancelado")
            ),
        );
        setPedidos(lista);
      } finally {
        if (ativo) setCarregandoLista(false);
      }
    };

    void carregar();

    const canal = supabase
      .channel(`meus_pedidos_${cliente.id}`)
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
  }, [cliente?.id]);

  const { emAndamento, historico } = useMemo(() => {
    const ativos: PedidoLista[] = [];
    const finais: PedidoLista[] = [];
    for (const p of pedidos) {
      if (pedidoEmAndamento(p)) ativos.push(p);
      else finais.push(p);
    }
    return { emAndamento: ativos, historico: finais };
  }, [pedidos]);

  if (carregando) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-cookie-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (precisaIdentificar) {
    return (
      <IdentificarTelefoneDelivery
        titulo="Meus pedidos"
        descricao="Informe o celular usado no pedido (11 dígitos com DDD)."
        onIdentificar={identificarPorTelefone}
      />
    );
  }

  return (
    <div className="space-y-6 pb-4">
      <h1 className="text-2xl font-black">Meus pedidos</h1>

      {carregandoLista && pedidos.length === 0 && (
        <div className="flex justify-center py-10">
          <div className="animate-spin h-8 w-8 border-4 border-cookie-primary border-t-transparent rounded-full" />
        </div>
      )}

      {!carregandoLista && pedidos.length === 0 && (
        <p className="text-sm text-zinc-500">Nenhum pedido ainda.</p>
      )}

      {emAndamento.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-cookie-primary">
            Em andamento ({emAndamento.length})
          </h2>
          <div className="space-y-2">
            {emAndamento.map((p) => (
              <CardPedido
                key={p.id}
                p={p}
                aberto={pedidoAbertoId === p.id}
                onToggle={() =>
                  setPedidoAbertoId((atual) => (atual === p.id ? null : p.id))
                }
                onCancelado={(id) => {
                  setPedidos((lista) =>
                    lista.map((item) =>
                      item.id === id
                        ? {
                            ...item,
                            status: "cancelado",
                            status_pagamento: "cancelado",
                          }
                        : item,
                    ),
                  );
                  setPedidoAbertoId(null);
                }}
              />
            ))}
          </div>
        </section>
      )}

      {historico.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
            Histórico ({historico.length})
          </h2>
          <div className="space-y-2">
            {historico.map((p) => (
              <CardPedido
                key={p.id}
                p={p}
                aberto={pedidoAbertoId === p.id}
                onToggle={() =>
                  setPedidoAbertoId((atual) => (atual === p.id ? null : p.id))
                }
                onCancelado={() => undefined}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
