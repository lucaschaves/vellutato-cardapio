/** Sons de alerta do admin (WAV gerado em memória — sem arquivos em public/). */

function escreverString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

function codificarWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  escreverString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  escreverString(view, 8, "WAVE");
  escreverString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  escreverString(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

type Tom = { freq: number; start: number; dur: number };

function sintetizar(beeps: Tom[], totalDur: number, sampleRate = 22050): string {
  const n = Math.floor(sampleRate * totalDur);
  const samples = new Float32Array(n);

  for (const b of beeps) {
    const i0 = Math.floor(b.start * sampleRate);
    const len = Math.floor(b.dur * sampleRate);
    const attack = Math.floor(0.015 * sampleRate);
    const release = Math.floor(0.05 * sampleRate);
    for (let i = 0; i < len && i0 + i < n; i++) {
      const t = i / sampleRate;
      const envA = Math.min(1, i / Math.max(1, attack));
      const envR = Math.min(1, (len - i) / Math.max(1, release));
      samples[i0 + i] +=
        Math.sin(2 * Math.PI * b.freq * t) * 0.55 * envA * envR;
    }
  }

  return URL.createObjectURL(codificarWav(samples, sampleRate));
}

/** Sequência ascendente de 1 ciclo (~1s). */
function cicloNovoPedido(offset = 0): Tom[] {
  return [
    { freq: 880, start: offset + 0, dur: 0.2 },
    { freq: 1175, start: offset + 0.28, dur: 0.2 },
    { freq: 1397, start: offset + 0.56, dur: 0.32 },
  ];
}

/** Novo pedido: a sequência toca 2 vezes (com pausa no meio). */
export function criarUrlSomNovoPedido(): string {
  return sintetizar(
    [...cicloNovoPedido(0), ...cicloNovoPedido(1.2)],
    2.25,
  );
}

/**
 * Impressora offline: tons graves descendentes (bem diferente do “novo pedido”).
 * Soa como alerta de falha / buzzer.
 */
export function criarUrlSomImpressoraOffline(): string {
  return sintetizar(
    [
      { freq: 520, start: 0, dur: 0.35 },
      { freq: 390, start: 0.4, dur: 0.35 },
      { freq: 280, start: 0.8, dur: 0.45 },
      { freq: 520, start: 1.4, dur: 0.35 },
      { freq: 390, start: 1.8, dur: 0.35 },
      { freq: 280, start: 2.2, dur: 0.45 },
    ],
    2.8,
  );
}

/** WAV silencioso (keepalive) — mantém a aba “com áudio” no Chrome em background. */
export function criarUrlSilencioLoop(): string {
  const sampleRate = 8000;
  const samples = new Float32Array(sampleRate);
  return URL.createObjectURL(codificarWav(samples, sampleRate));
}

/** Toca um Object URL / data URL (clone evita cortar som anterior). */
export function tocarUrlAudio(url: string, volume = 1): void {
  const audio = new Audio(url);
  audio.volume = volume;
  void audio.play().catch((err) => {
    console.warn("[SOM] Falha ao tocar alerta:", err);
  });
}
