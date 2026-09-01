import { useLocation } from "react-router-dom";
import { DeliveryItem } from "../delivery/DeliveryItem";
import { lerContextoCardapio } from "../../lib/modoCardapio";
import { VisualizadorReels } from "./VisualizadorReels";

export function CardapioItem() {
  const location = useLocation();
  const ehMesa = lerContextoCardapio(location.search).tipo === "mesa";

  if (ehMesa) {
    return <DeliveryItem />;
  }

  return <VisualizadorReels />;
}
