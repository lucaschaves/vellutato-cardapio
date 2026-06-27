import { useCallback, useEffect, useState } from "react";
import {
  aplicarManifestPwa,
  inscreverPromptPwa,
  limparPromptPwa,
  obterPromptPwa,
  pwaInstalada,
  type TipoPwa,
} from "../lib/pwaInstalacao";

export function useInstalarPwa(tipo: TipoPwa) {
  const [instalado, setInstalado] = useState(() => pwaInstalada(tipo));
  const [promptInstalacao, setPromptInstalacao] = useState(() =>
    obterPromptPwa(tipo),
  );
  const [instalando, setInstalando] = useState(false);

  useEffect(() => {
    aplicarManifestPwa(tipo);

    const sincronizar = (tipoAtualizado: TipoPwa) => {
      if (tipoAtualizado === tipo) {
        setPromptInstalacao(obterPromptPwa(tipo));
      }
      setInstalado(pwaInstalada(tipo));
    };

    const cancelarInscricao = inscreverPromptPwa(sincronizar);
    setPromptInstalacao(obterPromptPwa(tipo));
    setInstalado(pwaInstalada(tipo));

    return cancelarInscricao;
  }, [tipo]);

  const podeInstalar = !instalado && promptInstalacao !== null;

  const instalar = useCallback(async () => {
    if (!promptInstalacao) return false;

    setInstalando(true);
    try {
      await promptInstalacao.prompt();
      const { outcome } = await promptInstalacao.userChoice;
      if (outcome === "accepted") {
        setInstalado(true);
        limparPromptPwa(tipo);
        setPromptInstalacao(null);
        return true;
      }
      return false;
    } finally {
      setInstalando(false);
    }
  }, [promptInstalacao, tipo]);

  return { podeInstalar, instalado, instalando, instalar };
}
