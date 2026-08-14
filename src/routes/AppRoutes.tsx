import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
  useLocation,
} from "react-router-dom";
import { Toaster } from "sonner";
import { TecladoVirtualHost } from "../components/TecladoVirtual";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { useIsMobile } from "../hooks/useIsMobile";
import { modoTotenConfigurado } from "../lib/modoCardapio";
import { estaEmModoStandalone } from "../lib/pwaInstalacao";

// Páginas
import { AdminNovoPedido } from "@/pages/admin/AdminNovoPedido";
import { Dashboard } from "@/pages/admin/Dashboard";
import { DetalheCliente } from "@/pages/admin/DetalheCliente";
import { GerenciamentoAdicionais } from "@/pages/admin/GerenciamentoAdicionais";
import { GerenciamentoCategorias } from "@/pages/admin/GerenciamentoCategorias";
import { GerenciamentoChatDelivery } from "@/pages/admin/GerenciamentoChatDelivery";
import { GerenciamentoClientes } from "@/pages/admin/GerenciamentoClientes";
import { GerenciamentoCombos } from "@/pages/admin/GerenciamentoCombos";
import { GerenciamentoCupons } from "@/pages/admin/GerenciamentoCupons";
import { GerenciamentoDelivery } from "@/pages/admin/GerenciamentoDelivery";
import { GerenciamentoFuncionamento } from "@/pages/admin/GerenciamentoFuncionamento";
import { GerenciamentoImpressao } from "@/pages/admin/GerenciamentoImpressao";
import { GerenciamentoIntegracoes } from "@/pages/admin/GerenciamentoIntegracoes";
import { GerenciamentoMensagens } from "@/pages/admin/GerenciamentoMensagens";
import { GerenciamentoMesas } from "@/pages/admin/GerenciamentoMesas";
import { GerenciamentoVendasCruzadas } from "@/pages/admin/GerenciamentoVendasCruzadas";
import { GestaoCaixa } from "@/pages/admin/GestaoCaixa";
import { HistoricoPedidos } from "@/pages/admin/HistoricoPedidos";
import { BemVindo } from "@/pages/client/BemVindo";
import { AdminLayout } from "../components/AdminLayout";
import { GerenciamentoCatalogo } from "../pages/admin/GerenciamentoCatalogo";
import { GerenciamentoEstoque } from "../pages/admin/GerenciamentoEstoque";
import { GerenciamentoFichasTecnicas } from "../pages/admin/GerenciamentoFichasTecnicas";
import { EditorFichaTecnica } from "../pages/admin/EditorFichaTecnica";
import { GerenciamentoInsumos } from "../pages/admin/GerenciamentoInsumos";
import { ListaCompras } from "../pages/admin/ListaCompras";
import { PainelPedidos } from "../pages/admin/PainelPedidos";
import { ConfirmacaoPedido } from "../pages/client/ConfirmacaoPedido";
import { FeedProdutos } from "../pages/client/FeedProdutos";
import { ListaErros } from "../pages/client/ListaErros";
import { MeusPedidos } from "../pages/client/MeusPedidos";
import { Perfil } from "../pages/client/Perfil";
import { VisualizadorReels } from "../pages/client/VisualizadorReels";
import { DeliveryAuthCallback } from "../pages/delivery/DeliveryAuthCallback";
import { DeliveryCadastro } from "../pages/delivery/DeliveryCadastro";
import { DeliveryChat } from "../pages/delivery/DeliveryChat";
import { DeliveryCheckout } from "../pages/delivery/DeliveryCheckout";
import { DeliveryConta } from "../pages/delivery/DeliveryConta";
import { DeliveryEndereco } from "../pages/delivery/DeliveryEndereco";
import { DeliveryHome } from "../pages/delivery/DeliveryHome";
import { DeliveryItem } from "../pages/delivery/DeliveryItem";
import { DeliveryLayout } from "../pages/delivery/DeliveryLayout";
import { DeliveryPedido } from "../pages/delivery/DeliveryPedido";
import { DeliveryPedidos } from "../pages/delivery/DeliveryPedidos";
import { Login } from "../pages/Login";

/** /cardapio-toten/* → /totem/* */
function RedirecionarTotenLegado() {
  const location = useLocation();
  const rest = location.pathname.replace(/^\/cardapio-toten/, "") || "";
  return <Navigate to={`/totem${rest}${location.search}`} replace />;
}

/**
 * Aparelho de totem instalado antes do manifest próprio abre em "/" (delivery).
 * Enquanto estiver em standalone com o modo totem ligado, volta para /totem.
 */
function InicioDelivery() {
  if (estaEmModoStandalone() && modoTotenConfigurado()) {
    return <Navigate to="/totem" replace />;
  }
  return <DeliveryHome />;
}

/** /delivery/* → /* (delivery agora é a raiz) */
function RedirecionarDeliveryLegado() {
  const location = useLocation();
  const rest = location.pathname.replace(/^\/delivery/, "") || "/";
  const destino = rest.startsWith("/") ? rest : `/${rest}`;
  return <Navigate to={`${destino}${location.search}`} replace />;
}

const RotaProtegida = () => {
  const { sessao, carregando, ehAdmin } = useAuth();

  if (carregando) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-background-dark">
        <div className="animate-spin h-8 w-8 border-4 border-cookie-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!sessao) {
    console.warn(
      "[AVISO DE SEGURANÇA] Tentativa de acesso bloqueada. Redirecionando para login.",
    );
    return <Navigate to="/login" replace />;
  }

  if (!ehAdmin) {
    return <Navigate to="/" replace />;
  }

  return <AdminLayout />;
};

const rotasFilhasCardapio = [
  { path: "item/:id", element: <VisualizadorReels /> },
  { path: "pedido-enviado", element: <ConfirmacaoPedido /> },
  { path: "meus-pedidos", element: <MeusPedidos /> },
  { path: "perfil", element: <Perfil /> },
  { path: "erros", element: <ListaErros /> },
];

const router = createBrowserRouter([
  // Legados (mantêm links antigos funcionando)
  { path: "/cardapio-toten/*", element: <RedirecionarTotenLegado /> },
  { path: "/delivery/*", element: <RedirecionarDeliveryLegado /> },

  // Totem
  { path: "/totem", element: <BemVindo /> },
  {
    path: "/totem/cardapio",
    element: <FeedProdutos />,
    children: rotasFilhasCardapio,
  },

  // Cardápio loja / mesa (boas-vindas sem forçar totem)
  { path: "/inicio", element: <BemVindo /> },
  {
    path: "/cardapio",
    element: <FeedProdutos />,
    children: rotasFilhasCardapio,
  },

  // Delivery na raiz
  {
    path: "/",
    element: <DeliveryLayout />,
    children: [
      { index: true, element: <InicioDelivery /> },
      { path: "item/:id", element: <DeliveryItem /> },
      { path: "checkout", element: <DeliveryCheckout /> },
      { path: "conta", element: <DeliveryConta /> },
      { path: "pedidos", element: <DeliveryPedidos /> },
      { path: "pedido/:id", element: <DeliveryPedido /> },
      { path: "chat", element: <DeliveryChat /> },
      { path: "auth/callback", element: <DeliveryAuthCallback /> },
      { path: "cadastro", element: <DeliveryCadastro /> },
      { path: "endereco", element: <DeliveryEndereco /> },
    ],
  },

  { path: "/login", element: <Login /> },
  {
    element: <RotaProtegida />,
    children: [
      { path: "/admin/dashboard", element: <Dashboard /> },
      {
        path: "/admin/analytics",
        element: <Navigate to="/admin/dashboard" replace />,
      },
      { path: "/admin/historico", element: <HistoricoPedidos /> },
      { path: "/admin/pedidos", element: <PainelPedidos /> },
      { path: "/admin/novo-pedido", element: <AdminNovoPedido /> },
      { path: "/admin/catalogo", element: <GerenciamentoCatalogo /> },
      { path: "/admin/categorias", element: <GerenciamentoCategorias /> },
      { path: "/admin/mesas", element: <GerenciamentoMesas /> },
      { path: "/admin/estoque", element: <GerenciamentoEstoque /> },
      { path: "/admin/insumos", element: <GerenciamentoInsumos /> },
      { path: "/admin/fichas-tecnicas", element: <GerenciamentoFichasTecnicas /> },
      { path: "/admin/fichas-tecnicas/nova", element: <EditorFichaTecnica /> },
      { path: "/admin/fichas-tecnicas/:id", element: <EditorFichaTecnica /> },
      { path: "/admin/lista-compras", element: <ListaCompras /> },
      { path: "/admin/adicionais", element: <GerenciamentoAdicionais /> },
      { path: "/admin/combos", element: <GerenciamentoCombos /> },
      { path: "/admin/clientes", element: <GerenciamentoClientes /> },
      { path: "/admin/clientes/:clienteId", element: <DetalheCliente /> },
      { path: "/admin/cupons", element: <GerenciamentoCupons /> },
      { path: "/admin/mensagens", element: <GerenciamentoMensagens /> },
      {
        path: "/admin/funcionamento",
        element: <GerenciamentoFuncionamento />,
      },
      { path: "/admin/delivery", element: <GerenciamentoDelivery /> },
      { path: "/admin/integracoes", element: <GerenciamentoIntegracoes /> },
      { path: "/admin/impressao", element: <GerenciamentoImpressao /> },
      { path: "/admin/chat", element: <GerenciamentoChatDelivery /> },
      {
        path: "/admin/vendas-cruzadas",
        element: <GerenciamentoVendasCruzadas />,
      },
      { path: "/admin/caixa", element: <GestaoCaixa /> },
      { path: "/admin", element: <Navigate to="/admin/dashboard" replace /> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);

export function AppRoutes() {
  const isMobile = useIsMobile();

  return (
    <AuthProvider>
      <RouterProvider router={router} />
      <Toaster
        richColors
        position={isMobile ? "top-center" : "top-right"}
        expand={false}
        closeButton
        toastOptions={{ style: { fontFamily: "inherit" } }}
        duration={isMobile ? 1000 : 3000}
      />
      <TecladoVirtualHost />
    </AuthProvider>
  );
}
