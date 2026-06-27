// src/main.tsx
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import "./index.css";
import { inicializarCapturaErros } from "./lib/errorLogger";
import { aplicarPreferenciasExibicaoSalvas } from "./lib/preferenciasExibicao";
import { AppRoutes } from "./routes/AppRoutes";

registerSW({ immediate: true });

inicializarCapturaErros();
aplicarPreferenciasExibicaoSalvas();

const rootElement = document.getElementById("root");

if (!rootElement) {
  console.error(
    "Falha crítica: Elemento root não encontrado no documento HTML.",
  );
  throw new Error("Falha ao inicializar a aplicação.");
}

ReactDOM.createRoot(rootElement).render(<AppRoutes />);
