import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import {
  entrarTelaCheia,
  estaEmTelaCheia,
  restaurarTelaCheiaSeNecessario,
  sairTelaCheia,
  sincronizarPreferenciaTelaCheia,
} from "../lib/telaCheia";

export function useTelaCheia() {
  const location = useLocation();
  const [telaCheia, setTelaCheia] = useState(() => estaEmTelaCheia());

  useEffect(() => {
    const onFullScreenChange = () => {
      setTelaCheia(estaEmTelaCheia());
      sincronizarPreferenciaTelaCheia();
    };

    document.addEventListener("fullscreenchange", onFullScreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullScreenChange);
  }, []);

  useEffect(() => {
    void restaurarTelaCheiaSeNecessario();
  }, [location.pathname]);

  const alternarTelaCheia = async () => {
    try {
      if (!document.fullscreenElement) {
        await entrarTelaCheia();
      } else {
        await sairTelaCheia();
      }
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error(
        "[ERRO DE INTERFACE - FALHA AO ATIVAR TELA CHEIA]",
        mensagem,
      );
      toast.error(
        "Não foi possível ativar a tela cheia neste dispositivo ou navegador.",
      );
    }
  };

  return { telaCheia, alternarTelaCheia };
}
