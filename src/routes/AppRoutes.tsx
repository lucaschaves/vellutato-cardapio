import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from "react-router-dom";
import { Toaster } from "sonner";
import { TecladoVirtualHost } from "../components/TecladoVirtual";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { useIsMobile } from "../hooks/useIsMobile";

// Páginas
import { DashboardVendas } from "@/pages/admin/DashboardVendas";
import { DetalheCliente } from "@/pages/admin/DetalheCliente";
import { GerenciamentoAdicionais } from "@/pages/admin/GerenciamentoAdicionais";
import { GerenciamentoCategorias } from "@/pages/admin/GerenciamentoCategorias";
import { GerenciamentoClientes } from "@/pages/admin/GerenciamentoClientes";
import { GerenciamentoCombos } from "@/pages/admin/GerenciamentoCombos";
import { GerenciamentoCupons } from "@/pages/admin/GerenciamentoCupons";
import { GerenciamentoFuncionamento } from "@/pages/admin/GerenciamentoFuncionamento";
import { GerenciamentoMensagens } from "@/pages/admin/GerenciamentoMensagens";
import { GerenciamentoMesas } from "@/pages/admin/GerenciamentoMesas";
import { GerenciamentoVendasCruzadas } from "@/pages/admin/GerenciamentoVendasCruzadas";
import { GestaoCaixa } from "@/pages/admin/GestaoCaixa";
import { HistoricoPedidos } from "@/pages/admin/HistoricoPedidos";
import { BemVindo } from "@/pages/client/BemVindo";
import { AdminLayout } from "../components/AdminLayout"; // NOVO IMPORT
import { GerenciamentoCatalogo } from "../pages/admin/GerenciamentoCatalogo";
import { GerenciamentoEstoque } from "../pages/admin/GerenciamentoEstoque";
import { PainelPedidos } from "../pages/admin/PainelPedidos";
import { ConfirmacaoPedido } from "../pages/client/ConfirmacaoPedido";
import { FeedProdutos } from "../pages/client/FeedProdutos";
import { ListaErros } from "../pages/client/ListaErros";
import { MeusPedidos } from "../pages/client/MeusPedidos";
import { VisualizadorReels } from "../pages/client/VisualizadorReels";
import { Login } from "../pages/Login";

const RotaProtegida = () => {
  const { sessao, carregando } = useAuth();

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

  // AGORA RETORNAMOS O LAYOUT EM VEZ DO OUTLET DIRETO
  return <AdminLayout />;
};

const rotasFilhasCardapio = [
  { path: "item/:id", element: <VisualizadorReels /> },
  { path: "pedido-enviado", element: <ConfirmacaoPedido /> },
  { path: "meus-pedidos", element: <MeusPedidos /> },
  { path: "erros", element: <ListaErros /> },
];

const router = createBrowserRouter([
  {
    path: "/",
    element: <BemVindo />,
  },
  {
    path: "/cardapio-toten",
    element: <BemVindo />,
  },
  {
    path: "/cardapio",
    element: <FeedProdutos />,
    children: rotasFilhasCardapio,
  },
  {
    path: "/cardapio-toten/cardapio",
    element: <FeedProdutos />,
    children: rotasFilhasCardapio,
  },
  {
    path: "/login",
    element: <Login />,
  },
  {
    element: <RotaProtegida />,
    children: [
      { path: "/admin/dashboard", element: <DashboardVendas /> },
      { path: "/admin/historico", element: <HistoricoPedidos /> },
      { path: "/admin/pedidos", element: <PainelPedidos /> },
      { path: "/admin/catalogo", element: <GerenciamentoCatalogo /> },
      { path: "/admin/categorias", element: <GerenciamentoCategorias /> },
      { path: "/admin/mesas", element: <GerenciamentoMesas /> },
      { path: "/admin/estoque", element: <GerenciamentoEstoque /> },
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
        position={isMobile ? "top-center" : "top-left"}
        expand={false}
        closeButton
        toastOptions={{ style: { fontFamily: "inherit" } }}
        duration={isMobile ? 1500 : 3000}
      />
      <TecladoVirtualHost />
    </AuthProvider>
  );
}
