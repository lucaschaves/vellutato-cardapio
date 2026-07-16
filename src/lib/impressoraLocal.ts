import {
  montarComandaImpressao,
  type ComandaImpressao,
} from "./comandaImpressao";

const URL_IMPRESSORA =
  import.meta.env.VITE_IMPRESSORA_URL ||
  "http://localhost:8080/imprimir-comanda";

/**
 * Envia comanda com 2 vias (cozinha + cliente) para a MP-4200 TH.
 * Server deve imprimir `vias[]` em sequência, com cut ao final de cada uma.
 */
export async function enviarParaImpressoraLocal(
  pedidoBruto: unknown,
): Promise<boolean> {
  try {
    const comanda = montarComandaImpressao(
      pedidoBruto as Parameters<typeof montarComandaImpressao>[0],
    );

    const payload = {
      ...comanda,
      pedido: pedidoBruto,
      texto_comanda: comanda.texto,
      colunas: comanda.impressora.colunas,
      // Atalhos explícitos para o server
      via_cozinha: comanda.vias.find((v) => v.tipo === "cozinha") || null,
      via_cliente: comanda.vias.find((v) => v.tipo === "cliente") || null,
      quantidade_vias: comanda.vias.length,
    };

    console.info("[IMPRESSÃO] Enviando comanda:", {
      numero: comanda.numero,
      cliente: comanda.cliente_nome,
      local: comanda.local,
      resumo: comanda.resumo_consumo.rotulo,
      vias: comanda.vias.map((v) => v.tipo),
      via_cliente_obrigatoria: comanda.via_cliente_obrigatoria,
      total: comanda.total,
    });

    const resposta = await fetch(URL_IMPRESSORA, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!resposta.ok) {
      throw new Error(`Servidor retornou HTTP ${resposta.status}`);
    }

    return true;
  } catch (erro: unknown) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error("[ERRO DE IMPRESSÃO]", mensagem);
    return false;
  }
}

export function obterUrlImpressoraLocal(): string {
  return URL_IMPRESSORA;
}

export function preVisualizarComanda(
  pedidoBruto: unknown,
): ComandaImpressao {
  return montarComandaImpressao(
    pedidoBruto as Parameters<typeof montarComandaImpressao>[0],
  );
}
