export type TipoDescontoEvento = "percentual" | "fixo";

export type FaixaDescontoEvento = {
  qtd_min_caixas: number;
  tipo: TipoDescontoEvento;
  valor: number;
};

export type SaborEvento = string;

export type ProdutoEvento = {
  id: string;
  nome: string;
  descricao: string | null;
  imagem_url: string | null;
  preco: number;
  evento_unidades_caixa: number;
  evento_sabores: string[];
  evento_min_sabores: number;
  evento_max_sabores: number;
  evento_descontos: FaixaDescontoEvento[];
  evento_limite_caixas_dia: number | null;
  evento_dias_antecedencia: number;
};

export function normalizarFaixasEvento(raw: unknown): FaixaDescontoEvento[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const o = item as Record<string, unknown>;
      const qtd = Number(o.qtd_min_caixas);
      const tipo: TipoDescontoEvento =
        o.tipo === "fixo" ? "fixo" : "percentual";
      const valor = Number(o.valor);
      return {
        qtd_min_caixas: Number.isFinite(qtd) ? Math.max(1, Math.floor(qtd)) : 0,
        tipo,
        valor: Number.isFinite(valor) ? Math.max(0, valor) : 0,
      };
    })
    .filter((f) => f.qtd_min_caixas >= 1)
    .sort((a, b) => a.qtd_min_caixas - b.qtd_min_caixas);
}

export function normalizarSabores(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) => String(s || "").trim())
    .filter(Boolean);
}

/** Faixa vigente: a de maior quantidade mínima que o pedido atinge. */
export function faixaDescontoEvento(
  qtdCaixas: number,
  faixas: FaixaDescontoEvento[],
): FaixaDescontoEvento | null {
  const elegiveis = faixas.filter((f) => qtdCaixas >= f.qtd_min_caixas);
  if (!elegiveis.length) return null;
  return elegiveis[elegiveis.length - 1];
}

export function descontoCaixasEvento(
  precoCaixa: number,
  qtdCaixas: number,
  faixas: FaixaDescontoEvento[],
): number {
  const faixa = faixaDescontoEvento(qtdCaixas, faixas);
  if (!faixa || qtdCaixas <= 0) return 0;
  const bruto = precoCaixa * qtdCaixas;
  const desconto =
    faixa.tipo === "percentual"
      ? (bruto * faixa.valor) / 100
      : faixa.valor;
  return Math.min(bruto, Math.max(0, Number(desconto.toFixed(2))));
}

export function hojeLoja(agora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(agora);
}

export function somarDiasIso(iso: string, dias: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + dias));
  return dt.toISOString().slice(0, 10);
}

export function dataMinimaRetirada(diasAntecedencia: number, agora = new Date()): string {
  const dias = Math.max(0, Math.floor(diasAntecedencia));
  return somarDiasIso(hojeLoja(agora), dias);
}

export function saboresValidos(
  escolhidos: string[],
  min: number,
  max: number,
  catalogo: string[],
): string | null {
  const unicos = [...new Set(escolhidos.map((s) => s.trim()).filter(Boolean))];
  if (unicos.length < min) {
    return `Escolha pelo menos ${min} sabor${min === 1 ? "" : "es"}.`;
  }
  if (unicos.length > max) {
    return `No máximo ${max} sabor${max === 1 ? "" : "es"} por caixa.`;
  }
  if (unicos.some((s) => !catalogo.includes(s))) {
    return "Há um sabor que não está disponível nesta caixa.";
  }
  return null;
}
