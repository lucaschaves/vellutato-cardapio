import { toast } from "sonner";
import type { ItemPedidoDelivery } from "./deliveryPedido";
import { produtoEstaEsgotado } from "./estoque";
import { supabase } from "./supabase";
import {
  useCartStore,
  type AdicionalSelecionado,
} from "../store/useCartStore";
import type { EscolhaCombo } from "./combos";
import {
  normalizarDisponibilidade,
  type ModoConsumoItem,
} from "./disponibilidadeProduto";

export type ItemPedidoParaRecompra = ItemPedidoDelivery & {
  produto_id: string;
  modo_consumo?: string | null;
  produtos: {
    nome: string;
    imagem_url?: string | null;
    preco?: number;
    preco_promocional?: number | null;
    em_promocao?: boolean | null;
    disponibilidade?: string | null;
    controlar_estoque?: boolean | null;
    quantidade_estoque?: number | null;
  } | null;
  pedido_item_adicionais: Array<{
    adicional_id?: string | null;
    preco_aplicado: number;
    adicionais: { nome: string } | null;
  }>;
  pedido_item_combo_escolhas: Array<{
    grupo_id?: string | null;
    produto_escolhido_id?: string | null;
    nome_grupo: string;
    nome_produto: string;
    delta_preco: number;
  }>;
};

const SELECT_ITENS_RECOMPRA = `
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
`;

export async function buscarItensPedidoParaRecompra(
  pedidoId: string,
): Promise<ItemPedidoParaRecompra[]> {
  const { data, error } = await supabase
    .from("pedidos")
    .select(`pedido_itens ( ${SELECT_ITENS_RECOMPRA} )`)
    .eq("id", pedidoId)
    .single();
  if (error) throw new Error(error.message);
  const itens = (
    data as unknown as { pedido_itens?: ItemPedidoParaRecompra[] } | null
  )?.pedido_itens;
  return itens ?? [];
}

/** Reconstrói a sacola a partir dos itens de um pedido anterior. */
export async function pedirDeNovo(
  itens: ItemPedidoParaRecompra[],
): Promise<{ adicionados: number; pulados: number }> {
  const limpar = useCartStore.getState().limparCarrinho;
  const adicionar = useCartStore.getState().adicionarItem;
  limpar();

  let adicionados = 0;
  let pulados = 0;

  for (const item of itens) {
    const produtoId = item.produto_id;
    const produto = item.produtos;
    if (!produtoId || !produto) {
      pulados += 1;
      continue;
    }
    if (produtoEstaEsgotado(produto)) {
      pulados += 1;
      continue;
    }

    const adicionais: AdicionalSelecionado[] = (
      item.pedido_item_adicionais || []
    )
      .filter((a) => a.adicional_id)
      .map((a) => ({
        id: a.adicional_id as string,
        nome: a.adicionais?.nome || "Adicional",
        preco: Number(a.preco_aplicado || 0),
      }));

    const escolhasCombo: EscolhaCombo[] = (
      item.pedido_item_combo_escolhas || []
    )
      .filter((e) => e.grupo_id && e.produto_escolhido_id)
      .map((e) => ({
        grupoId: e.grupo_id as string,
        grupoNome: e.nome_grupo,
        opcaoId: e.produto_escolhido_id as string,
        produtoId: e.produto_escolhido_id as string,
        produtoNome: e.nome_produto,
        deltaPreco: Number(e.delta_preco || 0),
      }));

    const precoBase = Number(item.preco_unitario);
    const original =
      produto.em_promocao && produto.preco_promocional != null
        ? Number(produto.preco)
        : Number(produto.preco ?? precoBase);

    const modo: ModoConsumoItem =
      item.modo_consumo === "loja" || item.modo_consumo === "local"
        ? "loja"
        : "levar";

    adicionar({
      produtoId,
      nome: produto.nome,
      precoBase,
      originalPrice: original,
      quantidade: item.quantidade,
      adicionais,
      escolhasCombo: escolhasCombo.length > 0 ? escolhasCombo : undefined,
      observacoes: item.observacoes || undefined,
      imagem: produto.imagem_url || undefined,
      disponibilidade: normalizarDisponibilidade(produto.disponibilidade),
      modoConsumo: modo,
    });
    adicionados += 1;
  }

  if (adicionados === 0) {
    toast.error(
      pulados > 0
        ? "Nenhum item disponível para pedir de novo."
        : "Não foi possível montar a sacola.",
    );
  } else if (pulados > 0) {
    toast.message(
      `${adicionados} item(ns) na sacola. ${pulados} indisponível(is) foram pulados.`,
    );
  } else {
    toast.success("Itens adicionados à sacola");
  }

  return { adicionados, pulados };
}

export { SELECT_ITENS_RECOMPRA };
