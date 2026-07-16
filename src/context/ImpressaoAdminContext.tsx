import { createContext, useContext, type ReactNode } from "react";
import { useImpressaoAutomatica } from "../hooks/useImpressaoAutomatica";

interface ImpressaoAdminContextValue {
  impressoraOffline: boolean;
  imprimirPedido: (
    pedidoId: string,
    opts?: { manual?: boolean },
  ) => Promise<boolean>;
}

const ImpressaoAdminContext = createContext<ImpressaoAdminContextValue | null>(
  null,
);

/** Mantém o listener de impressão ativo em qualquer tela do admin logado. */
export function ImpressaoAdminProvider({ children }: { children: ReactNode }) {
  const impressao = useImpressaoAutomatica();

  return (
    <ImpressaoAdminContext.Provider value={impressao}>
      {children}
    </ImpressaoAdminContext.Provider>
  );
}

export function useImpressaoAdmin() {
  const ctx = useContext(ImpressaoAdminContext);
  if (!ctx) {
    throw new Error(
      "useImpressaoAdmin deve ser usado dentro de ImpressaoAdminProvider",
    );
  }
  return ctx;
}
