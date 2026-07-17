/** Comanda térmica Bematech MP-4200 TH — tipicamente 48 colunas (fonte A). */

export const COLUNAS_COMANDA = 48;

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

export interface ViaComandaImpressao {
  tipo: TipoViaComanda;
  titulo: string;
  /** Sempre true: cortar papel ao final desta via */
  cortar: true;
  linhas: string[];
  texto: string;
}

export interface ComandaImpressao {
  /** Versão do payload para o servidor local */
  versao: 3;
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
  identificador?: string | null;
  cliente_nome?: string | null;
  cliente_celular?: string | null;
  criado_em?: string | null;
  total?: number | null;
  valor_total?: number | null;
  desconto_aplicado?: number | null;
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
  if (origem === "mesa") return "Mesa";
  return "Balcão";
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
  origem: string | null | undefined;
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
  linhas.push(repetir("-"));
  linhas.push(...envolver(`Cliente: ${opts.cliente}`));
  if (opts.telefone) linhas.push(...envolver(`Tel: ${opts.telefone}`));
  linhas.push(...envolver(`Local: ${opts.local}`));
  if (opts.origem) {
    linhas.push(
      ...envolver(
        `Origem: ${
          opts.origem === "mesa"
            ? "Mesa"
            : opts.origem === "balcao"
              ? "Balcão"
              : opts.origem
        }`,
      ),
    );
  }
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

function montarVia(opts: {
  tipo: TipoViaComanda;
  titulo: string;
  linhas: string[];
}): ViaComandaImpressao {
  return {
    tipo: opts.tipo,
    titulo: opts.titulo,
    cortar: true,
    linhas: opts.linhas,
    texto: opts.linhas.join("\n"),
  };
}

export function montarComandaImpressao(
  pedido: PedidoBrutoImpressao,
): ComandaImpressao {
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

  const local = rotuloLocal(pedido.identificador, pedido.origem);
  const numero = pedido.sequencia_pedido ?? null;
  const cliente = (pedido.cliente_nome || "Cliente").trim();
  const telefone = pedido.cliente_celular?.trim() || null;

  const cabecaBase = {
    numero,
    criadoEm: pedido.criado_em,
    cliente,
    telefone,
    local,
    origem: pedido.origem,
    rotuloResumo,
    temLevar,
    qtdLevar,
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
    linhas: linhasCozinha,
  });

  // ----- VIA CLIENTE (sempre; obrigatória na sacola se houver levar) -----
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
  linhasCliente.push(centralizar("Pagamento no balcao/caixa"));
  if (temLevar) {
    linhasCliente.push(centralizar("Confira os itens PARA LEVAR"));
  }
  linhasCliente.push(centralizar("Obrigado!"));
  linhasCliente.push("");
  linhasCliente.push("");

  const viaCliente = montarVia({
    tipo: "cliente",
    titulo: temLevar ? "VIA CLIENTE - LEVAR JUNTO" : "VIA CLIENTE",
    linhas: linhasCliente,
  });

  // Sempre 2 vias: cozinha fica; cliente vai junto (essencial no levar)
  const vias = [viaCozinha, viaCliente];

  return {
    versao: 3,
    impressora: {
      modelo: "MP-4200 TH",
      colunas: COLUNAS_COMANDA,
    },
    pedido_id: pedido.id,
    numero,
    criado_em: pedido.criado_em || new Date().toISOString(),
    criado_em_formatado: formatarDataHora(pedido.criado_em),
    cliente_nome: cliente,
    cliente_telefone: telefone,
    origem: pedido.origem || "balcao",
    local,
    identificador: local,
    resumo_consumo: {
      tem_loja: temLoja,
      tem_levar: temLevar,
      qtd_loja: qtdLoja,
      qtd_levar: qtdLevar,
      rotulo: rotuloResumo,
    },
    itens,
    subtotal_itens: subtotalItens,
    desconto,
    total,
    vias,
    via_cliente_obrigatoria: temLevar,
    texto: viaCozinha.texto,
    linhas: viaCozinha.linhas,
    texto_comanda: viaCozinha.texto,
  };
}
