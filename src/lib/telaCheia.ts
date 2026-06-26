const CHAVE_PREFERENCIA = "preferencia_tela_cheia";

let restaurandoTelaCheia = false;

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

export async function restaurarTelaCheiaSeNecessario(): Promise<void> {
  if (!preferenciaTelaCheiaAtiva() || document.fullscreenElement || restaurandoTelaCheia) {
    return;
  }

  restaurandoTelaCheia = true;

  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

  try {
    await document.documentElement.requestFullscreen();
  } catch {
    marcarPreferenciaTelaCheia(false);
  } finally {
    restaurandoTelaCheia = false;
  }
}

export async function prepararNavegacaoComTelaCheia(): Promise<void> {
  if (document.fullscreenElement) {
    marcarPreferenciaTelaCheia(true);
  }

  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }

  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 80);
  });
}

export function sincronizarPreferenciaTelaCheia() {
  if (document.fullscreenElement) {
    marcarPreferenciaTelaCheia(true);
    return;
  }

  if (restaurandoTelaCheia || !preferenciaTelaCheiaAtiva()) {
    return;
  }

  void restaurarTelaCheiaSeNecessario();
}
