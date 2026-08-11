/** Comanda térmica Bematech MP-4200 TH — tipicamente 48 colunas (fonte A). */

import type {
  BlocoImpressao,
  CampoImpressaoId,
  EstiloBloco,
  ImpressaoConfig,
  ViaImpressaoConfig,
} from "./impressaoConfig";

export const COLUNAS_COMANDA = 48;

/** Marcador de linha substituído por imagem QR no PDF (e por texto no servidor). */
export const MARCADOR_QR = "\uE000QR\uE000";

export type ModoConsumoComanda = "loja" | "levar";
export type TipoViaComanda = "cozinha" | "cliente";

export interface ItemComandaImpressao {
  quantidade: number;
  nome: string;
  modo_consumo: ModoConsumoComanda;
  modo_rotulo: string;
  para_levar: boolean;
  preco_unitario: number;
  preco_linha: number;
  observacoes: string | null;
  adicionais: { nome: string; preco: number }[];
  combo_escolhas: {
    grupo: string;
    produto: string;
    delta_preco: number;
  }[];
}

/** Estilo visual de uma linha renderizada (para preview/PDF/servidor). */
export type EstiloLinha = "normal" | "invertido";

export interface LinhaComanda {
  texto: string;
  estilo: EstiloLinha;
  /** Duas colunas (início/fim) — usado no invertido para não centralizar. */
  colunas?: { esquerda: string; direita: string };
}

export interface ViaComandaImpressao {
  tipo: TipoViaComanda;
  titulo: string;
  /** Sempre true: cortar papel ao final desta via */
  cortar: true;
  linhas: string[];
  texto: string;
  /** Linhas com estilo (invertido/normal) para preview, PDF e servidor. */
  linhasRender: LinhaComanda[];
  /** Número de cópias desta via a imprimir. */
  copias: number;
}

export interface ComandaImpressao {
  /** Versão do payload para o servidor local */
  versao: 4;
  impressora: {
    modelo: "MP-4200 TH";
    colunas: number;
  };
  pedido_id: string;
  numero: number | null;
  criado_em: string;
  criado_em_formatado: string;
  cliente_nome: string;
  cliente_telefone: string | null;
  origem: string;
  origem_rotulo: string;
  modalidade: string | null;
  modalidade_rotulo: string | null;
  status_pagamento: string | null;
  pagamento_rotulo: string;
  pagamento_destaque: string;
  local: string;
  identificador: string;
  resumo_consumo: {
    tem_loja: boolean;
    tem_levar: boolean;
    qtd_loja: number;
    qtd_levar: number;
    rotulo: string;
  };
  itens: ItemComandaImpressao[];
  subtotal_itens: number;
  desconto: number;
  total: number;
  /**
   * Vias a imprimir em sequência (cada uma com cut).
   * 1) cozinha — fica no preparo
   * 2) cliente — vai junto (obrigatória quando há item para levar)
   */
  vias: ViaComandaImpressao[];
  /** true quando há item para levar (via cliente deve ir na sacola) */
  via_cliente_obrigatoria: boolean;
  /** Compat: texto da via cozinha */
  texto: string;
  linhas: string[];
  texto_comanda: string;
}

type PedidoBrutoImpressao = {
  id: string;
  sequencia_pedido?: number | null;
  origem?: string | null;
  modalidade?: string | null;
  status_pagamento?: string | null;
  identificador?: string | null;
  cliente_nome?: string | null;
  cliente_celular?: string | null;
  criado_em?: string | null;
  total?: number | null;
  valor_total?: number | null;
  desconto_aplicado?: number | null;
  taxa_entrega?: number | null;
  endereco_json?: {
    cep?: string | null;
    rua?: string | null;
    numero?: string | null;
    bairro?: string | null;
    cidade?: string | null;
    uf?: string | null;
    complemento?: string | null;
    referencia?: string | null;
  } | null;
  pedido_itens?: Array<{
    quantidade?: number | null;
    observacoes?: string | null;
    preco_unitario?: number | null;
    modo_consumo?: string | null;
    produtos?: { nome?: string | null } | null;
    pedido_item_adicionais?: Array<{
      preco_aplicado?: number | null;
      adicionais?: { nome?: string | null } | null;
    }> | null;
    pedido_item_combo_escolhas?: Array<{
      nome_grupo?: string | null;
      nome_produto?: string | null;
      delta_preco?: number | null;
    }> | null;
  }> | null;
};

function repetir(char: string, n = COLUNAS_COMANDA): string {
  return char.repeat(n);
}

function centralizar(texto: string, largura = COLUNAS_COMANDA): string {
  const t = texto.slice(0, largura);
  const espaco = Math.max(largura - t.length, 0);
  const esq = Math.floor(espaco / 2);
  return `${" ".repeat(esq)}${t}${" ".repeat(espaco - esq)}`;
}

function linhaDoisLados(
  esquerda: string,
  direita: string,
  largura = COLUNAS_COMANDA,
): string {
  const gap = 1;
  const maxEsq = Math.max(largura - direita.length - gap, 0);
  const esq =
    esquerda.length > maxEsq
      ? `${esquerda.slice(0, Math.max(maxEsq - 1, 0))}…`
      : esquerda;
  const espacos = Math.max(largura - esq.length - direita.length, gap);
  return `${esq}${" ".repeat(espacos)}${direita}`;
}

function envolver(
  texto: string,
  prefixo = "",
  largura = COLUNAS_COMANDA,
): string[] {
  const disponivel = Math.max(largura - prefixo.length, 8);
  const palavras = texto.trim().split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return [];

  const linhas: string[] = [];
  let atual = "";

  for (const palavra of palavras) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (tentativa.length <= disponivel) {
      atual = tentativa;
      continue;
    }
    if (atual) linhas.push(`${prefixo}${atual}`);
    if (palavra.length > disponivel) {
      let resto = palavra;
      while (resto.length > disponivel) {
        linhas.push(`${prefixo}${resto.slice(0, disponivel)}`);
        resto = resto.slice(disponivel);
      }
      atual = resto;
    } else {
      atual = palavra;
    }
  }
  if (atual) linhas.push(`${prefixo}${atual}`);
  return linhas;
}

function formatarMoeda(valor: number): string {
  return `R$ ${valor.toFixed(2).replace(".", ",")}`;
}

function formatarDataHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function normalizarModo(modo: string | null | undefined): ModoConsumoComanda {
  return modo === "levar" ? "levar" : "loja";
}

function rotuloLocal(
  identificador: string | null | undefined,
  origem: string | null | undefined,
): string {
  const id = (identificador || "").trim();
  if (id) return id;
  if (origem === "balcao") return "Balcão";
  if (origem === "totem") return "Totem";
  if (origem === "mesa") return "Mesa";
  if (origem === "delivery") return "Delivery";
  return "Balcão";
}

export function rotuloOrigemComanda(
  origem: string | null | undefined,
): string {
  switch (origem) {
    case "mesa":
      return "MESA";
    case "balcao":
      return "BALCAO";
    case "totem":
      return "TOTEM";
    case "delivery":
      return "DELIVERY";
    default:
      return (origem || "BALCAO").toUpperCase();
  }
}

/** Entrega vs retirada (só faz sentido no delivery). */
export function rotuloModalidadeComanda(
  origem: string | null | undefined,
  modalidade: string | null | undefined,
): string | null {
  if (origem !== "delivery") return null;
  if (modalidade === "retirada") return "RETIRADA NA LOJA";
  if (modalidade === "entrega") return "ENTREGA";
  return "DELIVERY";
}

export function rotuloPagamentoComanda(
  statusPagamento: string | null | undefined,
): { rotulo: string; destaque: string; pago: boolean } {
  switch (statusPagamento) {
    case "pago":
      return {
        rotulo: "JA PAGO",
        destaque: ">>> JA PAGO <<<",
        pago: true,
      };
    case "na_loja":
      return {
        rotulo: "PAGAR NA LOJA",
        destaque: ">>> PAGAR NA LOJA <<<",
        pago: false,
      };
    case "aguardando":
      return {
        rotulo: "AGUARDANDO PAGAMENTO",
        destaque: ">>> AGUARDANDO PAG. <<<",
        pago: false,
      };
    case "expirado":
      return {
        rotulo: "PAGAMENTO EXPIRADO",
        destaque: ">>> PAG. EXPIRADO <<<",
        pago: false,
      };
    case "cancelado":
      return {
        rotulo: "PAGAMENTO CANCELADO",
        destaque: ">>> PAG. CANCELADO <<<",
        pago: false,
      };
    case "nao_aplicavel":
    default:
      return {
        rotulo: "PAGAR NO CAIXA",
        destaque: ">>> PAGAR NO CAIXA <<<",
        pago: false,
      };
  }
}

/** Faixa visual com asteriscos — destaca no papel térmico. */
function faixaDestaque(texto: string, largura = COLUNAS_COMANDA): string[] {
  const t = texto.trim().toUpperCase().slice(0, Math.max(largura - 6, 8));
  return [repetir("*", largura), centralizar(t, largura), repetir("*", largura)];
}

function precoLinhaItem(
  item: NonNullable<PedidoBrutoImpressao["pedido_itens"]>[number],
): number {
  const qtd = Number(item.quantidade || 1);
  const unit = Number(item.preco_unitario || 0);
  const adc = (item.pedido_item_adicionais || []).reduce(
    (s, a) => s + Number(a.preco_aplicado || 0),
    0,
  );
  const deltas = (item.pedido_item_combo_escolhas || []).reduce(
    (s, c) => s + Number(c.delta_preco || 0),
    0,
  );
  return (unit + adc + deltas) * qtd;
}

function cabecalhoComum(opts: {
  tituloVia: string;
  numero: number | null;
  criadoEm: string | null | undefined;
  cliente: string;
  telefone: string | null;
  local: string;
  origemRotulo: string;
  modalidadeRotulo: string | null;
  pagamentoDestaque: string;
  rotuloResumo: string;
  temLevar: boolean;
  qtdLevar: number;
}): string[] {
  const linhas: string[] = [];
  linhas.push(centralizar("VELLUTATO"));
  linhas.push(centralizar(opts.tituloVia));
  linhas.push(repetir("="));
  linhas.push(
    linhaDoisLados(
      opts.numero != null ? `PEDIDO #${opts.numero}` : "PEDIDO",
      formatarDataHora(opts.criadoEm),
    ),
  );
  linhas.push(repetir("="));

  // Origem + retirada/entrega — o que a cozinha precisa ver primeiro
  linhas.push(...faixaDestaque(`ORIGEM: ${opts.origemRotulo}`));
  if (opts.modalidadeRotulo) {
    linhas.push(...faixaDestaque(opts.modalidadeRotulo));
  }
  linhas.push(...faixaDestaque(opts.pagamentoDestaque));

  linhas.push(repetir("-"));
  linhas.push(...envolver(`Cliente: ${opts.cliente}`));
  if (opts.telefone) linhas.push(...envolver(`Tel: ${opts.telefone}`));
  linhas.push(...envolver(`Local: ${opts.local}`));
  linhas.push(repetir("="));
  linhas.push(centralizar(opts.rotuloResumo));
  if (opts.temLevar) {
    linhas.push(centralizar(`ITENS PARA LEVAR: ${opts.qtdLevar}`));
  }
  linhas.push(repetir("="));
  return linhas;
}

function linhasDeUmItem(
  item: ItemComandaImpressao,
  { destacarPreco }: { destacarPreco: boolean },
): string[] {
  const linhas: string[] = [];

  linhas.push(...envolver(`${item.quantidade}x ${item.nome.toUpperCase()}`));

  for (const escolha of item.combo_escolhas) {
    const delta =
      escolha.delta_preco > 0
        ? ` (+${formatarMoeda(escolha.delta_preco)})`
        : "";
    linhas.push(...envolver(`  ${escolha.grupo}: ${escolha.produto}${delta}`));
  }

  for (const adc of item.adicionais) {
    const preco = adc.preco > 0 ? ` (+${formatarMoeda(adc.preco)})` : "";
    linhas.push(...envolver(`  + ${adc.nome}${preco}`));
  }

  if (item.observacoes) {
    linhas.push(...envolver(`  OBS: ${item.observacoes.toUpperCase()}`));
  }

  if (destacarPreco) {
    linhas.push(linhaDoisLados("  ", formatarMoeda(item.preco_linha)));
  }

  return linhas;
}

function linhasDosItens(
  itens: ItemComandaImpressao[],
  { destacarPreco }: { destacarPreco: boolean },
): string[] {
  const linhas: string[] = [];
  const grupos: Array<{
    paraLevar: boolean;
    titulo: string[];
    itens: ItemComandaImpressao[];
  }> = [
    {
      paraLevar: true,
      titulo: [
        repetir("*"),
        centralizar(">>> PARA LEVAR <<<"),
        repetir("*"),
      ],
      itens: itens.filter((i) => i.para_levar),
    },
    {
      paraLevar: false,
      titulo: [centralizar("-- COMER NA LOJA --"), repetir("-")],
      itens: itens.filter((i) => !i.para_levar),
    },
  ];

  for (const grupo of grupos) {
    if (grupo.itens.length === 0) continue;

    linhas.push(...grupo.titulo);

    grupo.itens.forEach((item, indice) => {
      linhas.push(...linhasDeUmItem(item, { destacarPreco }));
      if (indice < grupo.itens.length - 1) {
        linhas.push(repetir("."));
      }
    });

    linhas.push(repetir("-"));
  }

  return linhas;
}

function plainLinhas(linhas: string[]): LinhaComanda[] {
  return linhas.map((texto) => ({ texto, estilo: "normal" as const }));
}

function montarVia(opts: {
  tipo: TipoViaComanda;
  titulo: string;
  linhasRender: LinhaComanda[];
  copias?: number;
}): ViaComandaImpressao {
  const linhas = opts.linhasRender.map((l) => l.texto);
  return {
    tipo: opts.tipo,
    titulo: opts.titulo,
    cortar: true,
    linhas,
    texto: linhas.join("\n"),
    linhasRender: opts.linhasRender,
    copias: opts.copias ?? 1,
  };
}

interface DadosComanda {
  itens: ItemComandaImpressao[];
  qtdLoja: number;
  qtdLevar: number;
  temLoja: boolean;
  temLevar: boolean;
  rotuloResumo: string;
  subtotalItens: number;
  desconto: number;
  total: number;
  local: string;
  numero: number | null;
  criadoEm: string | null | undefined;
  cliente: string;
  telefone: string | null;
  origemRotulo: string;
  modalidadeRotulo: string | null;
  pagamento: ReturnType<typeof rotuloPagamentoComanda>;
  ehEntrega: boolean;
  endereco: PedidoBrutoImpressao["endereco_json"];
  taxaEntrega: number;
}

function derivarDadosComanda(pedido: PedidoBrutoImpressao): DadosComanda {
  const itensBrutos = pedido.pedido_itens || [];
  const itens: ItemComandaImpressao[] = itensBrutos.map((item) => {
    const modo = normalizarModo(item.modo_consumo);
    const qtd = Number(item.quantidade || 1);
    const unit = Number(item.preco_unitario || 0);
    const adicionais = (item.pedido_item_adicionais || []).map((a) => ({
      nome: a.adicionais?.nome || "Adicional",
      preco: Number(a.preco_aplicado || 0),
    }));
    const combo_escolhas = (item.pedido_item_combo_escolhas || []).map((c) => ({
      grupo: c.nome_grupo || "Grupo",
      produto: c.nome_produto || "Item",
      delta_preco: Number(c.delta_preco || 0),
    }));

    return {
      quantidade: qtd,
      nome: item.produtos?.nome || "Produto",
      modo_consumo: modo,
      modo_rotulo: modo === "levar" ? "PARA LEVAR" : "COMER NA LOJA",
      para_levar: modo === "levar",
      preco_unitario: unit,
      preco_linha: precoLinhaItem(item),
      observacoes: item.observacoes?.trim() || null,
      adicionais,
      combo_escolhas,
    };
  });

  const qtdLoja = itens.filter((i) => !i.para_levar).length;
  const qtdLevar = itens.filter((i) => i.para_levar).length;
  const temLoja = qtdLoja > 0;
  const temLevar = qtdLevar > 0;

  let rotuloResumo = "SOMENTE LOJA";
  if (temLoja && temLevar) rotuloResumo = "MISTO: LOJA + LEVAR";
  else if (temLevar) rotuloResumo = "*** SOMENTE PARA LEVAR ***";

  const subtotalItens = itens.reduce((s, i) => s + i.preco_linha, 0);
  const desconto = Number(pedido.desconto_aplicado || 0);
  const total =
    pedido.total != null
      ? Number(pedido.total)
      : Math.max(subtotalItens - desconto, 0);

  return {
    itens,
    qtdLoja,
    qtdLevar,
    temLoja,
    temLevar,
    rotuloResumo,
    subtotalItens,
    desconto,
    total,
    local: rotuloLocal(pedido.identificador, pedido.origem),
    numero: pedido.sequencia_pedido ?? null,
    criadoEm: pedido.criado_em,
    cliente: (pedido.cliente_nome || "Cliente").trim(),
    telefone: pedido.cliente_celular?.trim() || null,
    origemRotulo: rotuloOrigemComanda(pedido.origem),
    modalidadeRotulo: rotuloModalidadeComanda(pedido.origem, pedido.modalidade),
    pagamento: rotuloPagamentoComanda(pedido.status_pagamento),
    ehEntrega: pedido.origem === "delivery" && pedido.modalidade === "entrega",
    endereco: pedido.endereco_json ?? null,
    taxaEntrega: Number(pedido.taxa_entrega || 0),
  };
}

function finalizarComanda(
  pedido: PedidoBrutoImpressao,
  dados: DadosComanda,
  vias: ViaComandaImpressao[],
  colunas: number,
): ComandaImpressao {
  const principal = vias.find((v) => v.tipo === "cozinha") ?? vias[0];
  return {
    versao: 4,
    impressora: { modelo: "MP-4200 TH", colunas },
    pedido_id: pedido.id,
    numero: dados.numero,
    criado_em: pedido.criado_em || new Date().toISOString(),
    criado_em_formatado: formatarDataHora(pedido.criado_em),
    cliente_nome: dados.cliente,
    cliente_telefone: dados.telefone,
    origem: pedido.origem || "balcao",
    origem_rotulo: dados.origemRotulo,
    modalidade: pedido.modalidade ?? null,
    modalidade_rotulo: dados.modalidadeRotulo,
    status_pagamento: pedido.status_pagamento ?? null,
    pagamento_rotulo: dados.pagamento.rotulo,
    pagamento_destaque: dados.pagamento.destaque,
    local: dados.local,
    identificador: dados.local,
    resumo_consumo: {
      tem_loja: dados.temLoja,
      tem_levar: dados.temLevar,
      qtd_loja: dados.qtdLoja,
      qtd_levar: dados.qtdLevar,
      rotulo: dados.rotuloResumo,
    },
    itens: dados.itens,
    subtotal_itens: dados.subtotalItens,
    desconto: dados.desconto,
    total: dados.total,
    vias,
    via_cliente_obrigatoria: dados.temLevar,
    texto: principal?.texto ?? "",
    linhas: principal?.linhas ?? [],
    texto_comanda: principal?.texto ?? "",
  };
}

function montarComandaPadrao(
  pedido: PedidoBrutoImpressao,
  dados: DadosComanda,
): ComandaImpressao {
  const { itens, subtotalItens, desconto, total, temLevar, pagamento } = dados;

  const cabecaBase = {
    numero: dados.numero,
    criadoEm: dados.criadoEm,
    cliente: dados.cliente,
    telefone: dados.telefone,
    local: dados.local,
    origemRotulo: dados.origemRotulo,
    modalidadeRotulo: dados.modalidadeRotulo,
    pagamentoDestaque: pagamento.destaque,
    rotuloResumo: dados.rotuloResumo,
    temLevar,
    qtdLevar: dados.qtdLevar,
  };

  // ----- VIA COZINHA -----
  const linhasCozinha: string[] = [
    ...cabecalhoComum({ ...cabecaBase, tituloVia: "VIA COZINHA" }),
    ...linhasDosItens(itens, { destacarPreco: true }),
  ];
  if (desconto > 0) {
    linhasCozinha.push(linhaDoisLados("Subtotal", formatarMoeda(subtotalItens)));
    linhasCozinha.push(
      linhaDoisLados("Desconto", `- ${formatarMoeda(desconto)}`),
    );
  }
  linhasCozinha.push(repetir("="));
  linhasCozinha.push(linhaDoisLados("TOTAL", formatarMoeda(total)));
  linhasCozinha.push(repetir("="));
  linhasCozinha.push(...faixaDestaque(pagamento.destaque));
  if (temLevar) {
    linhasCozinha.push(centralizar("ATENCAO: HA ITENS PARA LEVAR"));
    linhasCozinha.push(centralizar("IMPRIMIR VIA DO CLIENTE"));
  }
  linhasCozinha.push(centralizar("Bom preparo!"));
  linhasCozinha.push("");
  linhasCozinha.push("");

  const viaCozinha = montarVia({
    tipo: "cozinha",
    titulo: "VIA COZINHA",
    linhasRender: plainLinhas(linhasCozinha),
  });

  // ----- VIA CLIENTE -----
  const linhasCliente: string[] = [
    ...cabecalhoComum({
      ...cabecaBase,
      tituloVia: temLevar ? "VIA CLIENTE - LEVAR JUNTO" : "VIA CLIENTE",
    }),
  ];

  if (temLevar) {
    linhasCliente.push(centralizar("*** ENTREGUE COM O PEDIDO ***"));
    linhasCliente.push(repetir("="));
  }

  linhasCliente.push(...linhasDosItens(itens, { destacarPreco: true }));

  if (desconto > 0) {
    linhasCliente.push(linhaDoisLados("Subtotal", formatarMoeda(subtotalItens)));
    linhasCliente.push(
      linhaDoisLados("Desconto", `- ${formatarMoeda(desconto)}`),
    );
  }
  linhasCliente.push(repetir("="));
  linhasCliente.push(linhaDoisLados("TOTAL", formatarMoeda(total)));
  linhasCliente.push(repetir("="));
  linhasCliente.push(...faixaDestaque(pagamento.destaque));
  if (temLevar) {
    linhasCliente.push(centralizar("Confira os itens PARA LEVAR"));
  }
  linhasCliente.push(centralizar("Obrigado!"));
  linhasCliente.push("");
  linhasCliente.push("");

  const viaCliente = montarVia({
    tipo: "cliente",
    titulo: temLevar ? "VIA CLIENTE - LEVAR JUNTO" : "VIA CLIENTE",
    linhasRender: plainLinhas(linhasCliente),
  });

  return finalizarComanda(
    pedido,
    dados,
    [viaCozinha, viaCliente],
    COLUNAS_COMANDA,
  );
}

// ---------- Builder dirigido por configuração ----------

type CtxConfig = {
  dados: DadosComanda;
  fmt: ImpressaoConfig["formatacao"];
  loja: ImpressaoConfig["loja"];
  largura: number;
  cfg: ViaImpressaoConfig;
};

function centralizarBloco(texto: string, largura: number): string[] {
  return envolver(texto, "", largura).map((l) => centralizar(l.trim(), largura));
}

function linhasDeUmItemLargura(
  item: ItemComandaImpressao,
  destacarPreco: boolean,
  largura: number,
): string[] {
  const linhas: string[] = [];
  linhas.push(
    ...envolver(`${item.quantidade}x ${item.nome.toUpperCase()}`, "", largura),
  );
  for (const escolha of item.combo_escolhas) {
    const delta =
      escolha.delta_preco > 0
        ? ` (+${formatarMoeda(escolha.delta_preco)})`
        : "";
    linhas.push(
      ...envolver(`  ${escolha.grupo}: ${escolha.produto}${delta}`, "", largura),
    );
  }
  for (const adc of item.adicionais) {
    const preco = adc.preco > 0 ? ` (+${formatarMoeda(adc.preco)})` : "";
    linhas.push(...envolver(`  + ${adc.nome}${preco}`, "", largura));
  }
  if (item.observacoes) {
    linhas.push(...envolver(`  OBS: ${item.observacoes.toUpperCase()}`, "", largura));
  }
  if (destacarPreco) {
    linhas.push(linhaDoisLados("  ", formatarMoeda(item.preco_linha), largura));
  }
  return linhas;
}

function renderItensConfig(
  itens: ItemComandaImpressao[],
  opts: { largura: number; precoPorItem: boolean; linhaEntre: boolean },
): string[] {
  const { largura, precoPorItem, linhaEntre } = opts;
  const linhas: string[] = [];
  const grupos = [
    {
      titulo: [
        repetir("*", largura),
        centralizar(">>> PARA LEVAR <<<", largura),
        repetir("*", largura),
      ],
      itens: itens.filter((i) => i.para_levar),
    },
    {
      titulo: [centralizar("-- COMER NA LOJA --", largura), repetir("-", largura)],
      itens: itens.filter((i) => !i.para_levar),
    },
  ];

  for (const grupo of grupos) {
    if (grupo.itens.length === 0) continue;
    linhas.push(...grupo.titulo);
    grupo.itens.forEach((item, indice) => {
      linhas.push(...linhasDeUmItemLargura(item, precoPorItem, largura));
      if (indice < grupo.itens.length - 1 && linhaEntre) {
        linhas.push(repetir(".", largura));
      }
    });
    linhas.push(repetir("-", largura));
  }
  return linhas;
}

/** Conteúdo "puro" de um campo (sem faixa/inverso); alinhamento próprio. */
function conteudoCampo(id: CampoImpressaoId, ctx: CtxConfig): string[] {
  const { dados, fmt, loja, largura, cfg } = ctx;
  const alta = (t: string) => (fmt.caixaAltaTitulos ? t.toUpperCase() : t);

  switch (id) {
    case "logo_nome":
      return loja.nome.trim()
        ? [centralizar(alta(loja.nome.trim()), largura)]
        : [];
    case "titulo_via":
      return cfg.titulo.trim()
        ? [centralizar(alta(cfg.titulo.trim()), largura)]
        : [];
    case "numero_pedido":
      return [dados.numero != null ? `PEDIDO #${dados.numero}` : "PEDIDO"];
    case "data_hora":
      return [formatarDataHora(dados.criadoEm)];
    case "origem":
      return [`ORIGEM: ${dados.origemRotulo}`];
    case "modalidade":
      return dados.modalidadeRotulo ? [dados.modalidadeRotulo] : [];
    case "pagamento_destaque":
      return [dados.pagamento.destaque];
    case "cliente_nome":
      return envolver(`Cliente: ${dados.cliente}`, "", largura);
    case "cliente_telefone":
      return dados.telefone
        ? envolver(`Tel: ${dados.telefone}`, "", largura)
        : [];
    case "local":
      return envolver(`Local: ${dados.local}`, "", largura);
    case "endereco_entrega": {
      if (!dados.ehEntrega || !dados.endereco) return [];
      const e = dados.endereco;
      const linhas: string[] = ["ENDERECO DE ENTREGA:"];
      const ruaNumero = [e.rua, e.numero].filter(Boolean).join(", ");
      if (ruaNumero) linhas.push(...envolver(ruaNumero, "", largura));
      if (e.bairro) linhas.push(...envolver(`Bairro: ${e.bairro}`, "", largura));
      const cidadeUf = [e.cidade, e.uf].filter(Boolean).join("/");
      const cidadeLinha = [cidadeUf, e.cep].filter(Boolean).join("  ");
      if (cidadeLinha) linhas.push(...envolver(cidadeLinha, "", largura));
      if (e.complemento) {
        linhas.push(...envolver(`Compl: ${e.complemento}`, "", largura));
      }
      if (e.referencia) {
        linhas.push(...envolver(`Ref: ${e.referencia}`, "", largura));
      }
      return linhas;
    }
    case "taxa_entrega":
      return dados.ehEntrega && dados.taxaEntrega > 0
        ? [
            linhaDoisLados(
              "Taxa de entrega",
              formatarMoeda(dados.taxaEntrega),
              largura,
            ),
          ]
        : [];
    case "resumo_consumo": {
      const l = [centralizar(dados.rotuloResumo, largura)];
      if (dados.temLevar) {
        l.push(centralizar(`ITENS PARA LEVAR: ${dados.qtdLevar}`, largura));
      }
      return l;
    }
    case "itens":
      return renderItensConfig(dados.itens, {
        largura,
        precoPorItem: fmt.precoPorItem,
        linhaEntre: fmt.linhaEntreItens,
      });
    case "subtotal":
      return [
        linhaDoisLados("Subtotal", formatarMoeda(dados.subtotalItens), largura),
      ];
    case "desconto":
      return dados.desconto > 0
        ? [
            linhaDoisLados(
              "Desconto",
              `- ${formatarMoeda(dados.desconto)}`,
              largura,
            ),
          ]
        : [];
    case "total":
      return [linhaDoisLados("TOTAL", formatarMoeda(dados.total), largura)];
    case "endereco_loja":
      return loja.endereco.trim()
        ? centralizarBloco(loja.endereco.trim(), largura)
        : [];
    case "cnpj":
      return loja.cnpj.trim()
        ? [centralizar(`CNPJ: ${loja.cnpj.trim()}`, largura)]
        : [];
    case "instagram":
      return loja.instagram.trim()
        ? [centralizar(loja.instagram.trim(), largura)]
        : [];
    case "wifi":
      return loja.wifi.trim()
        ? [centralizar(`WiFi: ${loja.wifi.trim()}`, largura)]
        : [];
    case "mensagem_agradecimento":
      return loja.agradecimento.trim()
        ? centralizarBloco(loja.agradecimento.trim(), largura)
        : [];
    case "qr_pedido":
      return [MARCADOR_QR];
    default:
      return [];
  }
}

/** Aplica um estilo (normal/faixa/invertido) a um conjunto de linhas de texto. */
function aplicarEstilo(
  linhas: string[],
  estilo: EstiloBloco,
  largura: number,
): LinhaComanda[] {
  if (estilo === "invertido") {
    return linhas.map((l) =>
      l === MARCADOR_QR
        ? { texto: MARCADOR_QR, estilo: "normal" as const }
        : { texto: centralizar(l.trim(), largura), estilo: "invertido" as const },
    );
  }
  if (estilo === "faixa") {
    const out: LinhaComanda[] = [{ texto: repetir("*", largura), estilo: "normal" }];
    for (const l of linhas) {
      out.push(
        l === MARCADOR_QR
          ? { texto: MARCADOR_QR, estilo: "normal" }
          : { texto: centralizar(l.trim(), largura), estilo: "normal" },
      );
    }
    out.push({ texto: repetir("*", largura), estilo: "normal" });
    return out;
  }
  return linhas.map((texto) => ({ texto, estilo: "normal" as const }));
}

/** Desenha uma moldura ASCII em volta de um bloco de linhas. */
function moldura(inner: LinhaComanda[], largura: number): LinhaComanda[] {
  const w = largura - 4;
  const borda = `+${repetir("-", largura - 2)}+`;
  const out: LinhaComanda[] = [{ texto: borda, estilo: "normal" }];
  for (const l of inner) {
    const t =
      l.texto.length > w ? l.texto.slice(0, w) : l.texto.padEnd(w, " ");
    out.push({ texto: `| ${t} |`, estilo: "normal" });
  }
  out.push({ texto: borda, estilo: "normal" });
  return out;
}

function renderBloco(bloco: BlocoImpressao, ctx: CtxConfig): LinhaComanda[] {
  if (!bloco.ativo) return [];
  const { largura, fmt } = ctx;

  switch (bloco.tipo) {
    case "campo": {
      if (!bloco.campo) return [];
      const linhas = conteudoCampo(bloco.campo, ctx);
      return linhas.length ? aplicarEstilo(linhas, bloco.estilo, largura) : [];
    }
    case "colunas": {
      const e = bloco.esquerda ? conteudoCampo(bloco.esquerda, ctx)[0] ?? "" : "";
      const d = bloco.direita ? conteudoCampo(bloco.direita, ctx)[0] ?? "" : "";
      if (!e.trim() && !d.trim()) return [];
      const linha = linhaDoisLados(e.trim(), d.trim(), largura);
      if (bloco.estilo === "invertido") {
        return [
          {
            texto: linha,
            estilo: "invertido",
            colunas: { esquerda: e.trim(), direita: d.trim() },
          },
        ];
      }
      if (bloco.estilo === "faixa") {
        return [
          { texto: repetir("*", largura), estilo: "normal" },
          { texto: linha, estilo: "normal" },
          { texto: repetir("*", largura), estilo: "normal" },
        ];
      }
      return [{ texto: linha, estilo: "normal" }];
    }
    case "texto": {
      const t = (bloco.texto || "").trim();
      if (!t) return [];
      return aplicarEstilo(envolver(t, "", largura), bloco.estilo, largura);
    }
    case "separador": {
      const ch = (bloco.separadorChar || fmt.separador).slice(0, 1) || "=";
      return [{ texto: repetir(ch, largura), estilo: "normal" }];
    }
    case "espaco":
      return [{ texto: "", estilo: "normal" }];
    case "grupo": {
      const inner: LinhaComanda[] = [];
      if ((bloco.titulo || "").trim()) {
        inner.push(
          ...aplicarEstilo(
            [bloco.titulo!.trim()],
            bloco.estilo || "invertido",
            largura,
          ),
        );
      }
      for (const filho of bloco.filhos || []) {
        inner.push(...renderBloco(filho, ctx));
      }
      if (inner.length === 0) return [];
      return bloco.moldura ? moldura(inner, largura) : inner;
    }
    default:
      return [];
  }
}

function montarViaConfig(
  cfg: ViaImpressaoConfig,
  tipo: TipoViaComanda,
  base: Omit<CtxConfig, "cfg">,
): ViaComandaImpressao | null {
  if (!cfg.ativa) return null;
  const ctx: CtxConfig = { ...base, cfg };

  const linhasRender: LinhaComanda[] = [];
  for (const bloco of cfg.blocos) {
    linhasRender.push(...renderBloco(bloco, ctx));
  }
  linhasRender.push({ texto: "", estilo: "normal" });
  linhasRender.push({ texto: "", estilo: "normal" });

  return montarVia({ tipo, titulo: cfg.titulo, linhasRender, copias: cfg.copias });
}

function montarComandaComConfig(
  pedido: PedidoBrutoImpressao,
  dados: DadosComanda,
  config: ImpressaoConfig,
): ComandaImpressao {
  const largura = config.formatacao.colunas === 32 ? 32 : 48;
  const base: Omit<CtxConfig, "cfg"> = {
    dados,
    fmt: config.formatacao,
    loja: config.loja,
    largura,
  };

  const vias: ViaComandaImpressao[] = [];
  const cozinha = montarViaConfig(config.via_cozinha, "cozinha", base);
  if (cozinha) vias.push(cozinha);
  const cliente = montarViaConfig(config.via_cliente, "cliente", base);
  if (cliente) vias.push(cliente);

  return finalizarComanda(pedido, dados, vias, largura);
}

export function montarComandaImpressao(
  pedido: PedidoBrutoImpressao,
  config?: ImpressaoConfig,
): ComandaImpressao {
  const dados = derivarDadosComanda(pedido);
  return config
    ? montarComandaComConfig(pedido, dados, config)
    : montarComandaPadrao(pedido, dados);
}
