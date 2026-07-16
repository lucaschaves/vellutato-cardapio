import { supabase } from "./supabase";

export const TIPOS_VENDA_CRUZADA = [
  "desconto_fixo",
  "desconto_percentual",
  "brinde",
] as const;

export type TipoVendaCruzada = (typeof TIPOS_VENDA_CRUZADA)[number];

export const ROTULOS_TIPO_VENDA_CRUZADA: Record<TipoVendaCruzada, string> = {
  desconto_fixo: "Desconto fixo (R$)",
  desconto_percentual: "Desconto percentual (%)",
  brinde: "Brinde",
};

export interface ProdutoOferta {
  id: string;
  nome: string;
  descricao?: string | null;
  preco: number;
  preco_promocional: number | null;
  em_promocao: boolean;
  imagem_url: string | null;
  controlar_estoque?: boolean;
  quantidade_estoque?: number;
  disponibilidade?: string | null;
}

export interface OfertaVendaCruzada {
  id: string;
  tipo: TipoVendaCruzada | string;
  valor_desconto: number | null;
  mensagem_oferta: string | null;
  produto_alvo: ProdutoOferta;
}

export function tipoVendaCruzadaRequerValor(tipo: string): boolean {
  return tipo === "desconto_fixo" || tipo === "desconto_percentual";
}

export function calcularPrecoComDescontoVendaCruzada(
  precoBase: number,
  tipo: string,
  valorDesconto: number | null,
): number {
  if (tipo === "brinde") return 0;

  if (!valorDesconto || valorDesconto <= 0) return precoBase;

  if (tipo === "desconto_percentual" || tipo === "percentual") {
    return Math.max(precoBase - precoBase * (valorDesconto / 100), 0);
  }

  if (tipo === "desconto_fixo" || tipo === "fixo") {
    return Math.max(precoBase - valorDesconto, 0);
  }

  return precoBase;
}

export function formatarDescontoVendaCruzada(
  tipo: string,
  valorDesconto: number | null,
): string {
  if (tipo === "brinde") return "Grátis";

  if (valorDesconto == null) return "—";

  if (tipo === "desconto_percentual" || tipo === "percentual") {
    return `${valorDesconto}%`;
  }

  if (tipo === "desconto_fixo" || tipo === "fixo") {
    return `R$ ${valorDesconto.toFixed(2)}`;
  }

  return "—";
}

export function rotuloTipoVendaCruzada(tipo: string): string {
  if (tipo in ROTULOS_TIPO_VENDA_CRUZADA) {
    return ROTULOS_TIPO_VENDA_CRUZADA[tipo as TipoVendaCruzada];
  }
  return tipo;
}

export async function buscarOfertasVendaCruzada(
  produtoGatilhoId: string,
): Promise<OfertaVendaCruzada[]> {
  const { data, error } = await supabase
    .from("vendas_cruzadas")
    .select(
      `
      id, tipo, valor_desconto, mensagem_oferta, alvo_produto_id,
      produtos!vendas_cruzadas_alvo_produto_id_fkey (
        id, nome, descricao, preco, preco_promocional, em_promocao, imagem_url,
        controlar_estoque, quantidade_estoque, disponibilidade
      )
    `,
    )
    .eq("gatilho_produto_id", produtoGatilhoId)
    .eq("ativo", true);

  if (error) throw new Error(error.message);

  return (data || [])
    .map((linha) => {
      const produto = linha.produtos as unknown as ProdutoOferta | null;
      if (!produto) return null;

      return {
        id: linha.id,
        tipo: linha.tipo,
        valor_desconto: linha.valor_desconto,
        mensagem_oferta: linha.mensagem_oferta,
        produto_alvo: produto,
      };
    })
    .filter((item): item is OfertaVendaCruzada => item !== null);
}
