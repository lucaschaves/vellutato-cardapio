import { Outlet, useLocation } from "react-router-dom";
import { lerContextoCardapio } from "../../lib/modoCardapio";
import { MesaLayout } from "./MesaLayout";

export function CardapioShell() {
  const location = useLocation();
  const ehMesa = lerContextoCardapio(location.search).tipo === "mesa";

  if (ehMesa) {
    return (
      <MesaLayout>
        <Outlet />
      </MesaLayout>
    );
  }

  return <Outlet />;
}
