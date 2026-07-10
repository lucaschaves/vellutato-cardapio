const CHAVE_PREFERENCIA = "preferencia_tela_cheia";

export function marcarPreferenciaTelaCheia(ativa: boolean) {
  if (ativa) {
    sessionStorage.setItem(CHAVE_PREFERENCIA, "1");
    return;
  }
  sessionStorage.removeItem(CHAVE_PREFERENCIA);
}

export function preferenciaTelaCheiaAtiva(): boolean {
  return sessionStorage.getItem(CHAVE_PREFERENCIA) === "1";
}

export function estaEmTelaCheia(): boolean {
  return !!document.fullscreenElement;
}

export async function entrarTelaCheia(): Promise<boolean> {
  if (document.fullscreenElement) {
    marcarPreferenciaTelaCheia(true);
    return true;
  }

  try {
    await document.documentElement.requestFullscreen();
    marcarPreferenciaTelaCheia(true);
    return true;
  } catch {
    return false;
  }
}

export async function sairTelaCheia(): Promise<void> {
  marcarPreferenciaTelaCheia(false);

  if (document.fullscreenElement && document.exitFullscreen) {
    await document.exitFullscreen();
  }
}

export async function prepararNavegacaoComTelaCheia(): Promise<void> {
  if (document.fullscreenElement) {
    marcarPreferenciaTelaCheia(true);
  }
}

export function sincronizarPreferenciaTelaCheia() {
  if (document.fullscreenElement) {
    marcarPreferenciaTelaCheia(true);
  }
}

/** Teclado do sistema em fullscreen causa flash preto — use teclado virtual. */
export function deveUsarTecladoVirtual(): boolean {
  return estaEmTelaCheia();
}
