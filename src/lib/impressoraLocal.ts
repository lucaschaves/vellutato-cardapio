const URL_IMPRESSORA =
  import.meta.env.VITE_IMPRESSORA_URL ||
  "http://localhost:8080/imprimir-comanda";

export async function enviarParaImpressoraLocal(
  pedido: unknown,
): Promise<boolean> {
  try {
    const resposta = await fetch(URL_IMPRESSORA, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pedido),
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
