import { supabase } from "./supabase";
import { produtoEstaEsgotado } from "./estoque";

export interface ComboOpcao {
  id: string;
  grupo_id: string;
  produto_id: string;
  delta_preco: number | null;
  ordem: number;
  ativo: boolean;
  produto: {
    id: string;
    nome: string;
    preco: number;
    preco_promocional: number | null;
    em_promocao: boolean;
    imagem_url: string | null;
    ativo: boolean;
    controlar_estoque?: boolean;
    quantidade_estoque?: number;
  };
}

export interface ComboGrupo {
  id: string;
  combo_produto_id: string;
  nome: string;
  descricao: string | null;
  min_escolhas: number;
  max_escolhas: number;
  preco_referencia: number;
  ordem: number;
  opcoes: ComboOpcao[];
}

export interface EscolhaCombo {
  grupoId: string;
  grupoNome: string;
  opcaoId: string;
  produtoId: string;
  produtoNome: string;
  deltaPreco: number;
}

function precoEfetivoProduto(produto: {
  preco: number;
  preco_promocional: number | null;
  em_promocao: boolean;
}): number {
  if (
    produto.em_promocao &&
    produto.preco_promocional != null &&
    produto.preco_promocional > 0
  ) {
    return Number(produto.preco_promocional);
  }
  return Number(produto.preco);
}

export function calcularDeltaOpcao(
  opcao: Pick<ComboOpcao, "delta_preco" | "produto">,
  precoReferencia: number,
): number {
  if (opcao.delta_preco != null) {
    return Number(opcao.delta_preco);
  }
  return Math.max(precoEfetivoProduto(opcao.produto) - Number(precoReferencia), 0);
}

export function somarDeltasCombo(escolhas: EscolhaCombo[]): number {
  return escolhas.reduce((acc, e) => acc + Number(e.deltaPreco || 0), 0);
}

export function validarEscolhasCombo(
  grupos: ComboGrupo[],
  escolhas: EscolhaCombo[],
): string | null {
  for (const grupo of grupos) {
    const qtd = escolhas.filter((e) => e.grupoId === grupo.id).length;
    if (qtd < grupo.min_escolhas) {
      return `Escolha ${grupo.min_escolhas === 1 ? "uma opção" : `${grupo.min_escolhas} opções`} em "${grupo.nome}".`;
    }
    if (qtd > grupo.max_escolhas) {
      return `No máximo ${grupo.max_escolhas} opção(ões) em "${grupo.nome}".`;
    }
  }
  return null;
}

export async function buscarEstruturaCombo(
  comboProdutoId: string,
): Promise<ComboGrupo[]> {
  const { data: grupos, error: errGrupos } = await supabase
    .from("combo_grupos")
    .select(
      `
      id, combo_produto_id, nome, descricao, min_escolhas, max_escolhas,
      preco_referencia, ordem,
      combo_opcoes (
        id, grupo_id, produto_id, delta_preco, ordem, ativo,
        produtos (
          id, nome, preco, preco_promocional, em_promocao, imagem_url, ativo,
          controlar_estoque, quantidade_estoque
        )
      )
    `,
    )
    .eq("combo_produto_id", comboProdutoId)
    .order("ordem");

  if (errGrupos) throw new Error(errGrupos.message);

  return (grupos || []).map((grupo) => {
    const opcoesRaw = (grupo.combo_opcoes || []) as unknown as Array<{
      id: string;
      grupo_id: string;
      produto_id: string;
      delta_preco: number | null;
      ordem: number;
      ativo: boolean;
      produtos: ComboOpcao["produto"] | ComboOpcao["produto"][] | null;
    }>;

    const opcoes: ComboOpcao[] = opcoesRaw
      .filter((o) => o.ativo)
      .map((o) => {
        const produto = Array.isArray(o.produtos) ? o.produtos[0] : o.produtos;
        if (!produto) return null;
        return {
          id: o.id,
          grupo_id: o.grupo_id,
          produto_id: o.produto_id,
          delta_preco: o.delta_preco,
          ordem: o.ordem,
          ativo: o.ativo,
          produto,
        };
      })
      .filter((o): o is ComboOpcao => o != null)
      .filter(
        (o) =>
          o.produto.ativo &&
          !produtoEstaEsgotado({
            controlar_estoque: o.produto.controlar_estoque,
            quantidade_estoque: o.produto.quantidade_estoque,
          }),
      )
      .sort((a, b) => a.ordem - b.ordem || a.produto.nome.localeCompare(b.produto.nome));

    return {
      id: grupo.id,
      combo_produto_id: grupo.combo_produto_id,
      nome: grupo.nome,
      descricao: grupo.descricao,
      min_escolhas: grupo.min_escolhas,
      max_escolhas: grupo.max_escolhas,
      preco_referencia: Number(grupo.preco_referencia),
      ordem: grupo.ordem,
      opcoes,
    };
  });
}

export async function listarProdutosParaOpcaoCombo(): Promise<
  { id: string; nome: string; preco: number }[]
> {
  const { data, error } = await supabase
    .from("produtos")
    .select("id, nome, preco, tipo")
    .eq("ativo", true)
    .eq("tipo", "simples")
    .order("nome");

  if (error) throw new Error(error.message);
  return (data || []).map((p) => ({
    id: p.id,
    nome: p.nome,
    preco: Number(p.preco),
  }));
}
