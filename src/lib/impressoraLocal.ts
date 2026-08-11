import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import {
  MARCADOR_QR,
  montarComandaImpressao,
  type ComandaImpressao,
  type LinhaComanda,
} from "./comandaImpressao";
import type { ImpressaoConfig } from "./impressaoConfig";

const URL_IMPRESSORA =
  import.meta.env.VITE_IMPRESSORA_URL ||
  "http://localhost:8080/imprimir-comanda";

/**
 * Modo de saída da impressão:
 * - "servidor": envia POST para o servidor local (produção).
 * - "pdf": gera um PDF da comanda no navegador (facilita o desenvolvimento).
 *
 * Padrão: "pdf" em dev, "servidor" em produção. Sobrescreva com
 * VITE_IMPRESSORA_MODO=servidor|pdf.
 */
const MODO_IMPRESSAO =
  import.meta.env.VITE_IMPRESSORA_MODO ||
  (import.meta.env.DEV ? "pdf" : "servidor");

export function impressoraEmModoPdf(): boolean {
  return MODO_IMPRESSAO === "pdf";
}

/**
 * Envia comanda com 2 vias (cozinha + cliente) para a MP-4200 TH.
 * Server deve imprimir `vias[]` em sequência, com cut ao final de cada uma.
 */
export async function enviarParaImpressoraLocal(
  pedidoBruto: unknown,
  config?: ImpressaoConfig,
): Promise<boolean> {
  try {
    const comandaOriginal = montarComandaImpressao(
      pedidoBruto as Parameters<typeof montarComandaImpressao>[0],
      config,
    );
    // O servidor imprime texto: substitui o marcador de QR por rótulo legível.
    const comanda = sanitizarMarcadoresComanda(comandaOriginal);
    const qrConteudo = conteudoQrPedido(comandaOriginal, config);

    const payload = {
      ...comanda,
      pedido: pedidoBruto,
      texto_comanda: comanda.texto,
      colunas: comanda.impressora.colunas,
      qr_conteudo: qrConteudo,
      // Atalhos explícitos para o server
      via_cozinha: comanda.vias.find((v) => v.tipo === "cozinha") || null,
      via_cliente: comanda.vias.find((v) => v.tipo === "cliente") || null,
      quantidade_vias: comanda.vias.length,
    };

    console.info("[IMPRESSÃO] Enviando comanda:", {
      numero: comanda.numero,
      cliente: comanda.cliente_nome,
      origem: comanda.origem_rotulo,
      modalidade: comanda.modalidade_rotulo,
      pagamento: comanda.pagamento_rotulo,
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

/** Origem (host:porta) do servidor de impressão, para health-check. */
export function obterUrlBaseImpressora(): string {
  try {
    return new URL(URL_IMPRESSORA).origin;
  } catch {
    return URL_IMPRESSORA;
  }
}

/**
 * Ping tolerante ao servidor local de impressão.
 * Usa `no-cors` para não depender de headers CORS nem de endpoint dedicado:
 * se o servidor estiver acessível a promise resolve (resposta opaca);
 * se estiver fora do ar (conexão recusada) ou não responder no tempo, rejeita.
 */
export async function verificarImpressoraOnline(
  timeoutMs = 4000,
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(obterUrlBaseImpressora(), {
      method: "GET",
      mode: "no-cors",
      cache: "no-store",
      signal: controller.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function preVisualizarComanda(
  pedidoBruto: unknown,
  config?: ImpressaoConfig,
): ComandaImpressao {
  return montarComandaImpressao(
    pedidoBruto as Parameters<typeof montarComandaImpressao>[0],
    config,
  );
}

/** Conteúdo do QR do pedido (URL de rastreio, ou o número quando não há base). */
export function conteudoQrPedido(
  comanda: ComandaImpressao,
  config?: ImpressaoConfig,
): string {
  const base = config?.loja.qrUrlBase?.trim() || "";
  if (base) return `${base}${comanda.pedido_id}`;
  return comanda.numero != null
    ? `Pedido #${comanda.numero}`
    : comanda.pedido_id;
}

function sanitizarLinha(linha: string): string {
  return linha === MARCADOR_QR ? "[QR do pedido]" : linha;
}

function sanitizarRender(l: LinhaComanda): LinhaComanda {
  return l.texto === MARCADOR_QR
    ? { texto: "[QR do pedido]", estilo: "normal" }
    : l;
}

/** Substitui o marcador de QR por texto legível (para o servidor / preview texto). */
function sanitizarMarcadoresComanda(
  comanda: ComandaImpressao,
): ComandaImpressao {
  const vias = comanda.vias.map((via) => {
    const linhas = via.linhas.map(sanitizarLinha);
    const linhasRender = via.linhasRender.map(sanitizarRender);
    return { ...via, linhas, texto: linhas.join("\n"), linhasRender };
  });
  const linhas = comanda.linhas.map(sanitizarLinha);
  const texto = linhas.join("\n");
  return { ...comanda, vias, linhas, texto, texto_comanda: texto };
}

/** Sequência de linhas (com estilo) do PDF, aplicando cópias e cortes. */
function sequenciaRenderPdf(comanda: ComandaImpressao): LinhaComanda[] {
  const seq: LinhaComanda[] = [];
  const traco = "-".repeat(comanda.impressora.colunas);
  const corte: LinhaComanda[] = [
    { texto: "", estilo: "normal" },
    { texto: traco, estilo: "normal" },
    { texto: ">>> CORTAR <<<", estilo: "normal" },
    { texto: traco, estilo: "normal" },
    { texto: "", estilo: "normal" },
  ];
  comanda.vias.forEach((via, vi) => {
    const copias = Math.max(via.copias || 1, 1);
    for (let c = 0; c < copias; c++) {
      seq.push(...via.linhasRender);
      const ultima = vi === comanda.vias.length - 1 && c === copias - 1;
      if (!ultima) seq.push(...corte);
    }
  });
  return seq;
}

/**
 * Gera um PDF da comanda (todas as vias, respeitando cópias e QR) e faz o
 * download. Usado no modo dev para visualizar a comanda sem impressora física.
 * Layout imita papel térmico: fonte monoespaçada (courier), largura ~80mm.
 */
export async function gerarComandaPdf(
  pedidoBruto: unknown,
  config?: ImpressaoConfig,
): Promise<ComandaImpressao> {
  const comanda = montarComandaImpressao(
    pedidoBruto as Parameters<typeof montarComandaImpressao>[0],
    config,
  );

  const seq = sequenciaRenderPdf(comanda);

  const precisaQr = seq.some((l) => l.texto === MARCADOR_QR);
  const qrDataUrl = precisaQr
    ? await QRCode.toDataURL(conteudoQrPedido(comanda, config), {
        margin: 1,
        width: 240,
      })
    : null;

  const fontSize = 9;
  const lineHeight = 3.6; // mm por linha
  // Invertido: fonte maior (pixels claros somem no papel térmico se pequenos).
  const fontSizeInvertido = 13;
  const lineHeightInvertido = 5.4; // mm por linha invertida
  const margemX = 4;
  const margemY = 6;
  const largura = 80; // mm (bobina térmica)
  const qrTam = 28; // mm

  const alturaLinha = (l: LinhaComanda) => {
    if (l.texto === MARCADOR_QR) return qrTam + 2;
    return l.estilo === "invertido" ? lineHeightInvertido : lineHeight;
  };

  let altura = margemY * 2;
  for (const linha of seq) altura += alturaLinha(linha);
  altura = Math.max(altura, 40);

  const doc = new jsPDF({ unit: "mm", format: [largura, altura] });
  doc.setFont("courier", "normal");
  doc.setFontSize(fontSize);

  let y = margemY;
  for (const linha of seq) {
    if (linha.texto === MARCADOR_QR) {
      if (qrDataUrl) {
        doc.addImage(qrDataUrl, "PNG", (largura - qrTam) / 2, y, qrTam, qrTam);
        y += qrTam + 2;
      } else {
        y += lineHeight;
      }
      continue;
    }
    if (linha.estilo === "invertido") {
      doc.setFontSize(fontSizeInvertido);
      doc.setFont("courier", "bold");
      doc.setFillColor(0, 0, 0);
      doc.rect(0, y - 3.9, largura, lineHeightInvertido, "F");
      doc.setTextColor(255, 255, 255);
      if (linha.colunas) {
        // Duas colunas: uma no início e outra no fim (space-between).
        const { esquerda, direita } = linha.colunas;
        if (esquerda) doc.text(esquerda, margemX, y);
        if (direita) {
          doc.text(direita, largura - margemX, y, { align: "right" });
        }
      } else {
        // Centraliza pelo alinhamento real (não estoura a largura em fonte grande).
        const texto = linha.texto.trim();
        doc.text(texto.length > 0 ? texto : " ", largura / 2, y, {
          align: "center",
        });
      }
      doc.setTextColor(0, 0, 0);
      doc.setFont("courier", "normal");
      doc.setFontSize(fontSize);
      y += lineHeightInvertido;
      continue;
    }
    doc.text(linha.texto.length > 0 ? linha.texto : " ", margemX, y);
    y += lineHeight;
  }

  const nome = `comanda-${comanda.numero ?? comanda.pedido_id}.pdf`;
  doc.save(nome);

  return comanda;
}
