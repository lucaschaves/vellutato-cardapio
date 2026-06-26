// src/main.tsx
import ReactDOM from "react-dom/client";
import "./index.css";
import { inicializarCapturaErros } from "./lib/errorLogger";
import { aplicarPreferenciasExibicaoSalvas } from "./lib/preferenciasExibicao";
import { AppRoutes } from "./routes/AppRoutes";

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
