import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";

type MesaCarrinhoContextValue = {
  aberto: boolean;
  abrir: () => void;
  fechar: () => void;
};

const MesaCarrinhoContext = createContext<MesaCarrinhoContextValue | null>(
  null,
);

export function MesaCarrinhoProvider({ children }: { children: ReactNode }) {
  const [aberto, setAberto] = useState(false);

  return (
    <MesaCarrinhoContext.Provider
      value={{
        aberto,
        abrir: () => setAberto(true),
        fechar: () => setAberto(false),
      }}
    >
      {children}
    </MesaCarrinhoContext.Provider>
  );
}

export function useMesaCarrinho() {
  const ctx = useContext(MesaCarrinhoContext);
  if (!ctx) {
    throw new Error("useMesaCarrinho deve ser usado dentro de MesaLayout");
  }
  return ctx;
}

export function useMesaCarrinhoOpcional() {
  return useContext(MesaCarrinhoContext);
}
