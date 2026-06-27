import { useCallback, useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function appJaInstalada(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true
  );
}

export function useInstalarPwa() {
  const [promptInstalacao, setPromptInstalacao] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [instalado, setInstalado] = useState(appJaInstalada);
  const [instalando, setInstalando] = useState(false);

  useEffect(() => {
    const aoBeforeInstall = (event: Event) => {
      event.preventDefault();
      setPromptInstalacao(event as BeforeInstallPromptEvent);
    };

    const aoAppInstalled = () => {
      setInstalado(true);
      setPromptInstalacao(null);
    };

    window.addEventListener("beforeinstallprompt", aoBeforeInstall);
    window.addEventListener("appinstalled", aoAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", aoBeforeInstall);
      window.removeEventListener("appinstalled", aoAppInstalled);
    };
  }, []);

  const podeInstalar = !instalado && promptInstalacao !== null;

  const instalar = useCallback(async () => {
    if (!promptInstalacao) return false;

    setInstalando(true);
    try {
      await promptInstalacao.prompt();
      const { outcome } = await promptInstalacao.userChoice;
      if (outcome === "accepted") {
        setInstalado(true);
        setPromptInstalacao(null);
        return true;
      }
      return false;
    } finally {
      setInstalando(false);
    }
  }, [promptInstalacao]);

  return { podeInstalar, instalado, instalando, instalar };
}
