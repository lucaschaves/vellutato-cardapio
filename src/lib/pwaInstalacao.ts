export type TipoPwa = "cardapio" | "admin";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const MANIFESTS: Record<TipoPwa, string> = {
  cardapio: "/manifest-cardapio.webmanifest",
  admin: "/manifest-admin.webmanifest",
};

let manifestAtivo: TipoPwa | null = null;
let promptPorTipo: Partial<Record<TipoPwa, BeforeInstallPromptEvent>> = {};
const ouvintes = new Set<(tipo: TipoPwa) => void>();

export function tipoPwaPorPath(path: string): TipoPwa {
  if (path.startsWith("/admin") || path === "/login") return "admin";
  return "cardapio";
}

export function aplicarManifestPwa(tipo: TipoPwa) {
  if (manifestAtivo === tipo) return;
  manifestAtivo = tipo;

  let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "manifest";
    document.head.appendChild(link);
  }
  link.href = MANIFESTS[tipo];
}

export function estaEmModoStandalone(): boolean {
  if (typeof window === "undefined") return false;

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true
  );
}

/** Fullscreen API só faz sentido no desktop; no tablet/celular use o PWA. */
export function deveUsarFullscreenApi(): boolean {
  if (typeof window === "undefined") return false;
  if (estaEmModoStandalone()) return false;

  const pointerFino = window.matchMedia("(pointer: fine)").matches;
  const semToque = navigator.maxTouchPoints === 0;
  return pointerFino && semToque;
}

export function pwaInstalada(tipo: TipoPwa): boolean {
  if (!estaEmModoStandalone()) return false;

  const path = window.location.pathname;
  if (tipo === "admin") return path.startsWith("/admin");
  return !path.startsWith("/admin") && path !== "/login";
}

export function inicializarPwaInstalacao() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    const tipo = manifestAtivo ?? tipoPwaPorPath(window.location.pathname);
    promptPorTipo[tipo] = event as BeforeInstallPromptEvent;
    ouvintes.forEach((fn) => fn(tipo));
  });

  window.addEventListener("appinstalled", () => {
    promptPorTipo = {};
    ouvintes.forEach((fn) => fn(manifestAtivo ?? "cardapio"));
  });
}

export function inscreverPromptPwa(callback: (tipo: TipoPwa) => void) {
  ouvintes.add(callback);
  return () => {
    ouvintes.delete(callback);
  };
}

export function obterPromptPwa(tipo: TipoPwa) {
  return promptPorTipo[tipo] ?? null;
}

export function limparPromptPwa(tipo: TipoPwa) {
  delete promptPorTipo[tipo];
}

export type { BeforeInstallPromptEvent };
