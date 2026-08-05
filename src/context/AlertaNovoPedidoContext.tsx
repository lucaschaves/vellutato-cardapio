import {
  createContext,
  useCallback,
  useContext,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { useAlertaNovoPedido } from "../hooks/useAlertaNovoPedido";

interface AlertaNovoPedidoContextValue {
  ativo: boolean;
  precisaReativar: boolean;
  ativar: () => Promise<void>;
  desativar: () => void;
  testarSom: () => void;
}

const AlertaNovoPedidoContext =
  createContext<AlertaNovoPedidoContextValue | null>(null);

/** Mantém listener + som ativos em qualquer tela do admin logado. */
export function AlertaNovoPedidoProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const onIrParaKds = useCallback(() => {
    navigate("/admin/pedidos");
  }, [navigate]);

  const alerta = useAlertaNovoPedido({ onIrParaKds });

  return (
    <AlertaNovoPedidoContext.Provider value={alerta}>
      {children}
    </AlertaNovoPedidoContext.Provider>
  );
}

export function useAlertaNovoPedidoAdmin() {
  const ctx = useContext(AlertaNovoPedidoContext);
  if (!ctx) {
    throw new Error(
      "useAlertaNovoPedidoAdmin deve ser usado dentro de AlertaNovoPedidoProvider",
    );
  }
  return ctx;
}
