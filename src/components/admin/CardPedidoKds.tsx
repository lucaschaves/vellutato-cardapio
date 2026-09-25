import { motion } from "framer-motion";
import {
  Bike,
  Building2,
  CheckCircle2,
  ChefHat,
  MapPin,
  MessageCircle,
  MessagesSquare,
  MoreVertical,
  Phone,
  Printer,
  Trash2,
  User,
} from "lucide-react";
import { memo, type ReactNode } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../ui/popover";
import {
  minutosAteAgendado,
  pedidoAgendadoEmAlerta,
  rotuloHoraAgendada,
} from "../../lib/pedidoAgendado";

export interface EscolhaComboPedidoKds {
  nome_grupo: string;
  nome_produto: string;
  delta_preco: number;
}

export interface ItemPedidoKds {
  id: string;
  quantidade: number;
  preco_unitario: number;
  observacoes: string;
  modo_consumo?: string | null;
  produtos: { nome: string };
  pedido_item_adicionais?: Array<{ preco_aplicado: number }>;
  pedido_item_combo_escolhas?: EscolhaComboPedidoKds[];
}

export interface EnderecoPedidoKds {
  cep?: string | null;
  rua?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  complemento?: string | null;
  referencia?: string | null;
}

export interface PedidoKds {
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
  agendado_para?: string | null;
  ifood_order_id?: string | null;
  voa_order_id?: string | null;
  tracking_url?: string | null;
  endereco_json?: EnderecoPedidoKds | null;
  pedido_itens: ItemPedidoKds[];
}

export type StatusAtualizavelKds =
  | "pendente"
  | "em_producao"
  | "pronto"
  | "entregue"
  | "cancelado";

function formatarEnderecoEntrega(
  endereco: EnderecoPedidoKds | null | undefined,
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
  endereco: EnderecoPedidoKds | null | undefined,
): string | null {
  const texto = endereco?.complemento?.trim();
  return texto || null;
}

function formatarMoedaKds(valor: number): string {
  return `R$ ${Number(valor).toFixed(2).replace(".", ",")}`;
}

function totalLinhaItemKds(item: ItemPedidoKds): number {
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

export function fingerprintPedidoKds(p: PedidoKds): string {
  return JSON.stringify({
    id: p.id,
    status: p.status,
    sequencia: p.sequencia_pedido,
    total: p.total,
    agendado: p.agendado_para,
    voa: p.voa_order_id,
    tracking: p.tracking_url,
    itens: p.pedido_itens.map((i) => ({
      id: i.id,
      q: i.quantidade,
      preco: i.preco_unitario,
      obs: i.observacoes,
    })),
  });
}

export function listaPedidosEquivalente(
  a: PedidoKds[],
  b: PedidoKds[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (fingerprintPedidoKds(a[i]) !== fingerprintPedidoKds(b[i])) return false;
  }
  return true;
}

function ehCanalIfoodOuDelivery(pedido: PedidoKds): boolean {
  return pedido.origem === "delivery" || pedido.origem === "ifood";
}

function TagsPedidoKds({ pedido }: { pedido: PedidoKds }) {
  const tags: ReactNode[] = [];

  if (pedido.origem === "evento") {
    tags.push(
      <span
        key="evento"
        className="shrink-0 text-[0.625rem] font-black uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-900"
      >
        Evento
      </span>,
    );
  }

  if (pedido.status_pagamento === "sinal") {
    tags.push(
      <span
        key="sinal"
        className="shrink-0 text-[0.625rem] font-black uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800"
      >
        Sinal 50%
      </span>,
    );
  }

  if (ehCanalIfoodOuDelivery(pedido)) {
    tags.push(
      <span
        key="canal"
        className={`shrink-0 text-[0.625rem] font-black uppercase tracking-wide px-1.5 py-0.5 rounded ${
          pedido.origem === "ifood"
            ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
            : pedido.modalidade === "retirada"
              ? "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300"
              : "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300"
        }`}
      >
        {pedido.origem === "ifood"
          ? "iFood"
          : pedido.modalidade === "retirada"
            ? "Retirada"
            : "Delivery"}
      </span>,
    );
  }

  if (pedido.agendado_para) {
    tags.push(
      <span
        key="agendado"
        className="shrink-0 text-[0.625rem] font-black uppercase tracking-wide px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300"
      >
        Agendado
      </span>,
    );
  }

  if (
    ehCanalIfoodOuDelivery(pedido) &&
    pedido.modalidade === "entrega" &&
    Number(pedido.taxa_entrega || 0) > 0
  ) {
    tags.push(
      <span
        key="frete"
        className="shrink-0 text-[0.625rem] font-black uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
      >
        Frete R$ {Number(pedido.taxa_entrega).toFixed(2).replace(".", ",")}
      </span>,
    );
  }

  if (
    ehCanalIfoodOuDelivery(pedido) &&
    Number(pedido.desconto_frete || 0) > 0
  ) {
    tags.push(
      <span
        key="desc-frete"
        className="shrink-0 text-[0.625rem] font-black uppercase tracking-wide px-1.5 py-0.5 rounded bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300"
      >
        Frete -R$ {Number(pedido.desconto_frete).toFixed(2).replace(".", ",")}
      </span>,
    );
  }

  if (
    ehCanalIfoodOuDelivery(pedido) &&
    Number(pedido.acrescimo_clima || 0) > 0
  ) {
    tags.push(
      <span
        key="chuva"
        className="shrink-0 text-[0.625rem] font-black uppercase tracking-wide px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300"
      >
        Chuva +R${" "}
        {Number(pedido.acrescimo_clima).toFixed(2).replace(".", ",")}
      </span>,
    );
  }

  if (Number(pedido.desconto_aplicado || 0) > 0) {
    tags.push(
      <span
        key="desconto"
        className="shrink-0 text-[0.625rem] font-black uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
      >
        Desconto -R${" "}
        {Number(pedido.desconto_aplicado).toFixed(2).replace(".", ",")}
      </span>,
    );
  }

  if (tags.length === 0) return null;

  return (
    <div className="flex w-full items-center gap-1 overflow-x-auto hide-scrollbar">
      {tags}
    </div>
  );
}

export type CardPedidoKdsProps = {
  pedido: PedidoKds;
  corBorder: string;
  agoraTick: number;
  abrindoChatId: string | null;
  onImprimir: (pedido: PedidoKds) => void | Promise<void>;
  onWhatsApp: (pedido: PedidoKds) => void | Promise<void>;
  onChat: (pedido: PedidoKds) => void | Promise<void>;
  onCancelar: (pedido: PedidoKds) => void | Promise<void>;
  onAtualizarStatus: (
    id: string,
    status: StatusAtualizavelKds,
  ) => void | Promise<void>;
  onCopiarNome: (pedido: PedidoKds) => void | Promise<void>;
  onCopiarTelefone: (pedido: PedidoKds) => void | Promise<void>;
  onCopiarEndereco: (pedido: PedidoKds) => void | Promise<void>;
  onCopiarComplemento: (pedido: PedidoKds) => void | Promise<void>;
};

export const CardPedidoKds = memo(function CardPedidoKds({
  pedido,
  corBorder,
  agoraTick,
  abrindoChatId,
  onImprimir,
  onWhatsApp,
  onChat,
  onCancelar,
  onAtualizarStatus,
  onCopiarNome,
  onCopiarTelefone,
  onCopiarEndereco,
  onCopiarComplemento,
}: CardPedidoKdsProps) {
  const emAlerta = pedidoAgendadoEmAlerta(pedido.agendado_para, agoraTick);
  const minAte = minutosAteAgendado(pedido.agendado_para, agoraTick);
  const ehDeliveryEntrega =
    pedido.origem === "delivery" && pedido.modalidade === "entrega";
  const mostrarCopiarFora =
    ehDeliveryEntrega &&
    (Boolean(pedido.cliente_nome?.trim()) ||
      Boolean(pedido.cliente_celular?.trim()) ||
      Boolean(formatarEnderecoEntrega(pedido.endereco_json)) ||
      Boolean(complementoPedido(pedido.endereco_json)));

  return (
    <motion.div
      layout="position"
      initial={false}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      className={`bg-white dark:bg-surface-dark border-l-4 ${corBorder} shadow-sm p-3 rounded-lg flex flex-col gap-2 ${
        emAlerta
          ? "ring-2 ring-amber-400 animate-pulse shadow-amber-200/50 dark:shadow-amber-900/30"
          : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2 border-b border-gray-100 dark:border-gray-800 pb-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 truncate">
            #{pedido.sequencia_pedido} · {pedido.identificador}
          </p>
          <p className="text-base font-bold text-gray-900 dark:text-white leading-tight truncate">
            {pedido.cliente_nome || "Cliente"}
          </p>
          {pedido.agendado_para && (
            <p
              className={`mt-0.5 text-xs font-bold ${
                emAlerta
                  ? "text-amber-700 dark:text-amber-300"
                  : "text-sky-700 dark:text-sky-300"
              }`}
            >
              {pedido.modalidade === "retirada" ? "Retirada" : "Entrega"} às{" "}
              {rotuloHoraAgendada(pedido.agendado_para)}
              {emAlerta && minAte != null
                ? minAte <= 0
                  ? " · agora!"
                  : ` · em ${minAte} min`
                : ""}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => onImprimir(pedido)}
            className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="Imprimir comanda"
          >
            <Printer size={16} className="text-gray-600 dark:text-gray-300" />
          </button>

          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title="Mais ações"
              >
                <MoreVertical
                  size={16}
                  className="text-gray-600 dark:text-gray-300"
                />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-52 p-1">
              {pedido.cliente_celular && (
                <button
                  type="button"
                  onClick={() => onWhatsApp(pedido)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <MessageCircle size={15} className="text-[#25D366]" />
                  WhatsApp
                </button>
              )}
              {(pedido.cliente_id || pedido.cliente_celular) && (
                <button
                  type="button"
                  onClick={() => void onChat(pedido)}
                  disabled={abrindoChatId === pedido.id}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted disabled:opacity-60"
                >
                  <MessagesSquare size={15} />
                  Mensagens
                </button>
              )}
              {(pedido.status === "pendente" ||
                pedido.status === "em_producao") && (
                <button
                  type="button"
                  onClick={() => onCancelar(pedido)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                >
                  <Trash2 size={15} />
                  Excluir pedido
                </button>
              )}
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <TagsPedidoKds pedido={pedido} />

      {mostrarCopiarFora && (
        <div className="flex w-full items-center gap-1">
          {pedido.cliente_nome?.trim() && (
            <button
              type="button"
              onClick={() => onCopiarNome(pedido)}
              className="flex flex-1 min-w-0 items-center justify-center gap-1 rounded-md bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 px-2 py-1.5 text-[10px] font-bold uppercase hover:bg-sky-200 dark:hover:bg-sky-900 transition-colors"
              title="Copiar nome"
            >
              <User size={14} className="shrink-0" />
              Nome
            </button>
          )}
          {pedido.cliente_celular?.trim() && (
            <button
              type="button"
              onClick={() => onCopiarTelefone(pedido)}
              className="flex flex-1 min-w-0 items-center justify-center gap-1 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 px-2 py-1.5 text-[10px] font-bold uppercase hover:bg-emerald-200 dark:hover:bg-emerald-900 transition-colors"
              title="Copiar telefone"
            >
              <Phone size={14} className="shrink-0" />
              Tel
            </button>
          )}
          {formatarEnderecoEntrega(pedido.endereco_json) && (
            <button
              type="button"
              onClick={() => onCopiarEndereco(pedido)}
              className="flex flex-1 min-w-0 items-center justify-center gap-1 rounded-md bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 px-2 py-1.5 text-[10px] font-bold uppercase hover:bg-violet-200 dark:hover:bg-violet-900 transition-colors"
              title="Copiar endereço"
            >
              <MapPin size={14} className="shrink-0" />
              End.
            </button>
          )}
          {complementoPedido(pedido.endereco_json) && (
            <button
              type="button"
              onClick={() => onCopiarComplemento(pedido)}
              className="flex flex-1 min-w-0 items-center justify-center gap-1 rounded-md bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 px-2 py-1.5 text-[10px] font-bold uppercase hover:bg-amber-200 dark:hover:bg-amber-900 transition-colors"
              title="Copiar complemento"
            >
              <Building2 size={14} className="shrink-0" />
              Apto
            </button>
          )}
        </div>
      )}

      <ul className="flex-1 space-y-1.5">
        {pedido.pedido_itens.map((item) => (
          <li
            key={item.id}
            className="flex items-start justify-between gap-2 text-sm"
          >
            <div className="min-w-0 flex-1">
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
                          ` (+${formatarMoedaKds(Number(escolha.delta_preco))})`}
                      </li>
                    ))}
                  </ul>
                )}
              {item.observacoes && (
                <p className="text-xs text-red-500 font-medium ml-4">
                  Obs: {item.observacoes}
                </p>
              )}
            </div>
            <span className="shrink-0 text-xs font-bold tabular-nums text-gray-700 dark:text-gray-300">
              {formatarMoedaKds(totalLinhaItemKds(item))}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between border-t border-gray-100 dark:border-gray-800 pt-2">
        <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
          Total
        </span>
        <span className="text-base font-black tabular-nums text-cookie-accent">
          {formatarMoedaKds(Number(pedido.total || 0))}
        </span>
      </div>

      <div className="pt-1 flex gap-2 flex-col">
        {pedido.status === "pendente" && (
          <button
            onClick={() => onAtualizarStatus(pedido.id, "em_producao")}
            className="flex-1 bg-yellow-500 text-white py-1.5 rounded text-sm font-bold flex justify-center items-center gap-1.5"
          >
            <ChefHat size={15} /> Preparar
          </button>
        )}
        {pedido.status === "em_producao" && (
          <button
            onClick={() => onAtualizarStatus(pedido.id, "pronto")}
            className="flex-1 bg-green-500 text-white py-1.5 rounded text-sm font-bold flex justify-center items-center gap-1.5"
          >
            <CheckCircle2 size={15} /> Pronto
          </button>
        )}
        {pedido.status === "pronto" && (
          <>
            {pedido.origem === "delivery" &&
              pedido.modalidade === "entrega" &&
              pedido.voa_order_id && (
                <div className="rounded-lg bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800 px-2 py-1.5 text-[11px] font-semibold text-violet-800 dark:text-violet-200 flex items-center gap-2">
                  <Bike size={13} />
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
              onClick={() => onAtualizarStatus(pedido.id, "entregue")}
              className="flex-1 bg-gray-800 text-white py-1.5 rounded text-sm font-bold"
            >
              {ehCanalIfoodOuDelivery(pedido) &&
              pedido.modalidade === "retirada"
                ? "Cliente retirou"
                : ehCanalIfoodOuDelivery(pedido) &&
                    pedido.modalidade === "entrega"
                  ? "Entrega concluída"
                  : "Entregue"}
            </button>
          </>
        )}
      </div>
    </motion.div>
  );
}, (prev, next) =>
  prev.corBorder === next.corBorder &&
  prev.agoraTick === next.agoraTick &&
  prev.abrindoChatId === next.abrindoChatId &&
  fingerprintPedidoKds(prev.pedido) === fingerprintPedidoKds(next.pedido),
);
