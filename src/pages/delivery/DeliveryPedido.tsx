import { Bell, MessageCircle, RotateCcw, Ticket } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { BotaoInstalarPwa } from "../../components/BotaoInstalarPwa";
import { ModalConfirmacao } from "../../components/ModalConfirmacao";
import { TimelinePedido } from "../../components/TimelinePedido";
import { track } from "../../lib/analytics";
import { buscarDeliveryConfig } from "../../lib/deliveryConfig";
import {
  buscarCupomRetornoDoPedido,
  buscarPedidoDelivery,
  cancelarPedidoDeliveryAguardando,
  cancelarPedidosDeliveryExpirados,
  confirmarPagamentoAsaas,
  iniciarCheckoutAsaas,
  type ItemPedidoDelivery,
} from "../../lib/deliveryPedido";
import { lerGuestDeliveryLocal } from "../../lib/deliveryGuestStorage";
import { textoPrevisaoPedido } from "../../lib/pedidoEta";
import {
  montarLinkWhatsappLoja,
  textoWhatsappAcompanhamentoPedido,
} from "../../lib/notificacoesPedido";
import {
  pedirDeNovo,
  type ItemPedidoParaRecompra,
} from "../../lib/pedirDeNovo";
import {
  montarTimelinePedido,
  rotuloStatusCliente,
} from "../../lib/pedidoStatusCliente";
import { formatarTelefoneDeSalvo } from "../../lib/telefone";
import { supabase } from "../../lib/supabase";
import { ativarPushPedido, pushSuportado } from "../../lib/webPush";
import { useCartStore } from "../../store/useCartStore";
import { urlDelivery, urlDeliveryAbsoluta } from "../../lib/urlDelivery";

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
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const limparCarrinho = useCartStore((s) => s.limparCarrinho);
  const [pedido, setPedido] = useState<PedidoDelivery | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [confirmandoPagamento, setConfirmandoPagamento] = useState(false);
  const [whatsappNumero, setWhatsappNumero] = useState<string | null>(null);
  const [tempoEstimadoMin, setTempoEstimadoMin] = useState<number | null>(null);
  const [pushAtivo, setPushAtivo] = useState(false);
  const [ativandoPush, setAtivandoPush] = useState(false);
  const [pagandoNovamente, setPagandoNovamente] = useState(false);
  const [confirmarCancelar, setConfirmarCancelar] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [repedindo, setRepedindo] = useState(false);
  const [cupomRetorno, setCupomRetorno] = useState<{
    codigo: string;
    validade: string | null;
    ativo: boolean;
  } | null>(null);
  const syncFeitoRef = useRef(false);

  useEffect(() => {
    void cancelarPedidosDeliveryExpirados(30);
    void buscarDeliveryConfig().then((cfg) => {
      setWhatsappNumero(cfg.whatsapp_numero);
      setTempoEstimadoMin(cfg.tempo_estimado_min ?? null);
    });
  }, []);

  useEffect(() => {
    if (params.get("cancelado") === "1") {
      toast.message("Pagamento cancelado. Você pode tentar novamente.");
    }
    if (params.get("expirado") === "1") {
      toast.message("O link de pagamento expirou. Gere um novo para continuar.");
    }
  }, [params]);

  useEffect(() => {
    if (!id) return;
    let cancelado = false;

    const carregar = async () => {
      try {
        const p = await buscarPedidoDelivery(id);
        if (cancelado) return;
        setPedido(p);
        if (p.status === "entregue") {
          void buscarCupomRetornoDoPedido(p.id).then(setCupomRetorno);
        } else {
          setCupomRetorno(null);
        }
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
          track("payment_ok", {
            canal: "delivery",
            pedidoId: id,
            props: { metodo: "asaas" },
          });
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

  const pagarNovamente = async () => {
    if (!pedido || pagandoNovamente) return;
    setPagandoNovamente(true);
    try {
      const clientesRel = (
        pedido as {
          clientes?: { email?: string | null } | { email?: string | null }[];
        }
      ).clientes;
      const emailCliente = Array.isArray(clientesRel)
        ? clientesRel[0]?.email
        : clientesRel?.email;
      const email =
        emailCliente?.trim() ||
        lerGuestDeliveryLocal()?.email?.trim() ||
        null;

      if (!email || !email.includes("@")) {
        toast.error(
          "Informe um e-mail válido na conta ou no checkout para pagar.",
        );
        return;
      }

      toast.message("Abrindo pagamento seguro…");
      const checkout = await iniciarCheckoutAsaas(pedido.id, {
        email,
        forcarNovo: true,
      });
      window.location.assign(checkout.checkout_url);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg || "Não foi possível gerar o pagamento");
      setPagandoNovamente(false);
    }
  };

  const cancelarPedido = async () => {
    if (!pedido || cancelando) return;
    setCancelando(true);
    try {
      const ok = await cancelarPedidoDeliveryAguardando(pedido.id);
      if (!ok) {
        toast.error("Não foi possível cancelar este pedido.");
        setConfirmarCancelar(false);
        return;
      }
      toast.success("Pedido cancelado.");
      setConfirmarCancelar(false);
      navigate(urlDelivery("/pedidos"), { replace: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg || "Falha ao cancelar");
    } finally {
      setCancelando(false);
    }
  };

  const repedir = async () => {
    if (!pedido || repedindo) return;
    setRepedindo(true);
    try {
      const { adicionados } = await pedirDeNovo(
        (pedido.pedido_itens || []) as ItemPedidoParaRecompra[],
      );
      if (adicionados > 0) navigate(urlDelivery("/checkout"));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao montar sacola");
    } finally {
      setRepedindo(false);
    }
  };

  if (carregando) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-cookie-primary border-t-transparent rounded-full" />
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

  const statusExibido = aguardandoConfirmacao
    ? "Confirmando pagamento…"
    : rotuloStatusCliente(pedido);

  const timeline = montarTimelinePedido(pedido);
  const precisaPagar =
    !aguardandoConfirmacao &&
    (pedido.status_pagamento === "aguardando" ||
      pedido.status === "aguardando_pagamento");

  const endereco = pedido.endereco_json as
    | {
        rua?: string | null;
        numero?: string | null;
        bairro?: string | null;
        cidade?: string | null;
        uf?: string | null;
        complemento?: string | null;
      }
    | null
    | undefined;
  const enderecoLinha = endereco?.rua
    ? [
        [endereco.rua, endereco.numero].filter(Boolean).join(", "),
        endereco.complemento,
        [endereco.bairro, endereco.cidade, endereco.uf]
          .filter(Boolean)
          .join(" - "),
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  const itensResumo = itens.map((item) => {
    const extras = [
      ...(item.pedido_item_adicionais || []).map(
        (a) => a.adicionais?.nome || "Adicional",
      ),
      ...(item.pedido_item_combo_escolhas || []).map(
        (e) => `${e.nome_grupo}: ${e.nome_produto}`,
      ),
    ];
    const base = `${item.quantidade}x ${item.produtos?.nome || "Item"}`;
    return extras.length > 0 ? `${base} (${extras.join(", ")})` : base;
  });

  const linkWhatsapp = montarLinkWhatsappLoja(
    whatsappNumero,
    textoWhatsappAcompanhamentoPedido({
      sequencia: pedido.sequencia_pedido,
      pedidoId: pedido.id,
      clienteNome: pedido.cliente_nome,
      clienteCelular: formatarTelefoneDeSalvo(pedido.cliente_celular),
      modalidade: pedido.modalidade,
      statusRotulo: statusExibido,
      total: Number(pedido.valor_total || pedido.total || 0),
      enderecoLinha,
      itensResumo,
      passosTimeline: timeline.map((p) => ({
        titulo: p.titulo,
        estado: p.estado,
      })),
      urlAcompanhar: urlDeliveryAbsoluta(`/pedido/${pedido.id}`),
    }),
  );

  return (
    <div className="space-y-4">
      <div className="bg-white border rounded-3xl p-5 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs uppercase tracking-widest text-zinc-500">
            Pedido #{pedido.sequencia_pedido}
          </p>
          {linkWhatsapp ? (
            <a
              href={linkWhatsapp}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-[#25D366] px-3 py-1.5 text-xs font-bold text-white"
              title="Acompanhar no WhatsApp"
            >
              <MessageCircle size={14} />
              WhatsApp
            </a>
          ) : null}
        </div>
        <h1 className="text-2xl font-black">{statusExibido}</h1>
        <p className="text-sm text-zinc-500 capitalize">
          {pedido.modalidade} · pagamento:{" "}
          {pagamentoConfirmado ? "pago" : pedido.status_pagamento}
        </p>
        {(() => {
          const previsao = textoPrevisaoPedido({
            status: pedido.status,
            agendadoPara: pedido.agendado_para,
            criadoEm: pedido.criado_em,
            tempoEstimadoMin,
            modalidade: pedido.modalidade,
          });
          if (!previsao) return null;
          return (
            <p
              className={`text-sm font-semibold rounded-xl px-3 py-2 ${
                pedido.agendado_para
                  ? "text-sky-800 bg-sky-50"
                  : "text-zinc-800 bg-zinc-50"
              }`}
            >
              {previsao}
            </p>
          );
        })()}
        {aguardandoConfirmacao && (
          <p className="text-sm text-amber-700 bg-amber-50 rounded-xl p-3">
            Pagamento recebido pelo Asaas — confirmando no sistema…
          </p>
        )}
        {precisaPagar && (
          <div className="space-y-3 pt-1">
            <p className="text-sm text-amber-800 bg-amber-50 rounded-xl p-3">
              Seu pedido está reservado. Escolha Pix ou cartão para concluir o
              pagamento, ou cancele se quiser corrigir algo.
            </p>
            <button
              type="button"
              disabled={pagandoNovamente || cancelando}
              onClick={() => void pagarNovamente()}
              className="w-full h-12 rounded-2xl bg-cookie-primary text-white font-bold disabled:opacity-60"
            >
              {pagandoNovamente ? "Abrindo pagamento…" : "Pagar agora"}
            </button>
            <button
              type="button"
              disabled={pagandoNovamente || cancelando}
              onClick={() => setConfirmarCancelar(true)}
              className="w-full h-11 rounded-2xl border border-zinc-200 text-zinc-600 font-semibold text-sm disabled:opacity-60"
            >
              Cancelar pedido
            </button>
          </div>
        )}
        {pagamentoConfirmado && pedido.status !== "cancelado" && (
          <p className="text-sm text-emerald-700 bg-emerald-50 rounded-xl p-3">
            Pagamento confirmado! A cozinha já recebeu seu pedido.
          </p>
        )}
      </div>

      <section className="bg-white border rounded-3xl p-5 space-y-4">
        <h2 className="font-bold text-sm text-zinc-500 uppercase tracking-wider">
          Acompanhe seu pedido
        </h2>
        <TimelinePedido passos={timeline} />
      </section>

      <section className="bg-white border rounded-3xl p-5 space-y-3">
        <h2 className="font-bold text-sm text-zinc-500 uppercase tracking-wider">
          Dúvidas ou atualizações
        </h2>
        <p className="text-sm text-zinc-600">
          Fale conosco pelo chat ou WhatsApp com o resumo do pedido.
        </p>

        <Link
          to={`/chat?pedido=${pedido.id}`}
          className="w-full flex items-center justify-center gap-2 border-2 border-cookie-primary text-cookie-primary rounded-2xl py-3 text-sm font-bold"
        >
          <MessageCircle size={18} />
          Abrir chat do pedido
        </Link>

        {linkWhatsapp ? (
          <a
            href={linkWhatsapp}
            target="_blank"
            rel="noreferrer"
            className="w-full flex items-center justify-center gap-2 bg-[#25D366] text-white rounded-2xl py-3.5 text-sm font-bold shadow-sm"
          >
            <MessageCircle size={18} />
            WhatsApp da loja (com resumo)
          </a>
        ) : (
          <p className="text-xs text-zinc-400">
            Configure o número da loja em Admin → Delivery para habilitar o
            WhatsApp.
          </p>
        )}

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

        <BotaoInstalarPwa
          tipo="cardapio"
          label="Adicionar à tela inicial"
          className="w-full flex items-center justify-center gap-2 border border-zinc-200 rounded-2xl py-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
        />

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

      {cupomRetorno?.ativo && (
        <section className="bg-emerald-50 border border-emerald-200 rounded-3xl p-5 space-y-2">
          <h2 className="font-bold text-sm text-emerald-800 uppercase tracking-wider flex items-center gap-2">
            <Ticket size={16} /> Cupom de retorno
          </h2>
          <p className="text-sm text-emerald-900">
            10% no próximo pedido. Use o código:
          </p>
          <p className="font-mono text-xl font-black tracking-wider text-emerald-950">
            {cupomRetorno.codigo}
          </p>
          {cupomRetorno.validade && (
            <p className="text-xs text-emerald-700">
              Válido até{" "}
              {new Date(cupomRetorno.validade).toLocaleDateString("pt-BR")}
            </p>
          )}
          <p className="text-xs text-emerald-700">
            Também disponível em Conta → Seus cupons.
          </p>
        </section>
      )}

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
                      <p className="text-xs text-cookie-primary mt-1">
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

      <div className="flex flex-col gap-2">
        {!precisaPagar && itens.length > 0 && (
          <button
            type="button"
            disabled={repedindo}
            onClick={() => void repedir()}
            className="w-full flex items-center justify-center gap-2 bg-zinc-900 text-white rounded-2xl py-3 text-sm font-bold disabled:opacity-60"
          >
            <RotateCcw size={16} />
            {repedindo ? "Montando sacola…" : "Pedir de novo"}
          </button>
        )}
        <div className="flex gap-2">
          <Link
            to={`/chat?pedido=${pedido.id}`}
            className="flex-1 text-center border border-zinc-200 rounded-2xl py-3 text-sm font-semibold"
          >
            Chat
          </Link>
          <Link
            to="/"
            className="flex-1 text-center bg-cookie-primary text-white rounded-2xl py-3 text-sm font-bold"
          >
            Cardápio
          </Link>
        </div>
      </div>

      <ModalConfirmacao
        aberto={confirmarCancelar}
        titulo="Cancelar pedido?"
        mensagem="O pedido será cancelado e o estoque liberado. Você poderá montar um novo pedido depois."
        textoConfirmar="Sim, cancelar"
        textoCancelar="Manter pedido"
        carregando={cancelando}
        aoCancelar={() => setConfirmarCancelar(false)}
        aoConfirmar={() => void cancelarPedido()}
      />
    </div>
  );
}
