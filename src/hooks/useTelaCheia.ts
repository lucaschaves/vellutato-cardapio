import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  entrarTelaCheia,
  estaEmTelaCheia,
  sairTelaCheia,
  sincronizarPreferenciaTelaCheia,
} from "../lib/telaCheia";

export function useTelaCheia() {
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

  const alternarTelaCheia = async () => {
    try {
      if (!document.fullscreenElement) {
        const ok = await entrarTelaCheia();
        if (!ok) {
          toast.error(
            "Não foi possível ativar a tela cheia neste dispositivo ou navegador.",
          );
        }
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

  return {
    telaCheia,
    alternarTelaCheia,
    /** Sempre disponível — em fullscreen usamos teclado virtual nos inputs. */
    telaCheiaDisponivel: true,
  };
}

export function useEmTelaCheia() {
  const [ativo, setAtivo] = useState(() => estaEmTelaCheia());

  useEffect(() => {
    const atualizar = () => setAtivo(estaEmTelaCheia());
    document.addEventListener("fullscreenchange", atualizar);
    return () => document.removeEventListener("fullscreenchange", atualizar);
  }, []);

  return ativo;
}
