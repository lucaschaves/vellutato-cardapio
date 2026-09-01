import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AlertaNovoPedidoProvider } from "../context/AlertaNovoPedidoContext";
import { useAuth } from "../context/AuthContext";
import { ChatAdminProvider } from "../context/ChatAdminContext";
import { ImpressaoAdminProvider } from "../context/ImpressaoAdminContext";
import { PedidosRealtimeProvider } from "../context/PedidosRealtimeContext";
import { AdminBreadcrumbHeader } from "./AdminBreadcrumbHeader";
import { AdminSidebar } from "./admin/AdminSidebar";

const LS_SIDEBAR_RECOLHIDO = "admin-sidebar-recolhido";

function lerSidebarRecolhido(): boolean {
  try {
    return localStorage.getItem(LS_SIDEBAR_RECOLHIDO) === "1";
  } catch {
    return false;
  }
}

export function AdminLayout() {
  const { sair } = useAuth();
  const navigate = useNavigate();
  const [menuMobileAberto, setMenuMobileAberto] = useState(false);
  const [sidebarRecolhido, setSidebarRecolhido] = useState(lerSidebarRecolhido);

  useEffect(() => {
    try {
      localStorage.setItem(
        LS_SIDEBAR_RECOLHIDO,
        sidebarRecolhido ? "1" : "0",
      );
    } catch {
      /* ignore */
    }
  }, [sidebarRecolhido]);

  const abrirSidebar = () => {
    setMenuMobileAberto(true);
    setSidebarRecolhido(false);
  };

  const recolherSidebar = () => {
    setSidebarRecolhido(true);
    setMenuMobileAberto(false);
  };

  const handleLogout = async () => {
    try {
      await sair();
      navigate("/login");
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error(
        "[ERRO - LAYOUT ADMIN] Falha no processo de desconexão:",
        mensagem,
      );
      toast.error("Erro ao sair do sistema. Tente novamente.");
    }
  };

  return (
    <PedidosRealtimeProvider>
      <ImpressaoAdminProvider>
        <AlertaNovoPedidoProvider>
          <ChatAdminProvider>
            <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-background-dark">
              {menuMobileAberto && (
                <button
                  type="button"
                  aria-label="Fechar menu"
                  className="fixed inset-0 z-40 bg-black/50 lg:hidden"
                  onClick={() => setMenuMobileAberto(false)}
                />
              )}

              {(!sidebarRecolhido || menuMobileAberto) && (
                <AdminSidebar
                  abertoMobile={menuMobileAberto}
                  onFecharMobile={() => setMenuMobileAberto(false)}
                  onRecolherDesktop={recolherSidebar}
                  onLogout={() => void handleLogout()}
                />
              )}

              <div className="flex min-w-0 flex-1 flex-col">
                <AdminBreadcrumbHeader
                  onAbrirMenu={abrirSidebar}
                  menuSempreVisivel={sidebarRecolhido}
                />

                <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <Outlet />
                </main>
              </div>
            </div>
          </ChatAdminProvider>
        </AlertaNovoPedidoProvider>
      </ImpressaoAdminProvider>
    </PedidosRealtimeProvider>
  );
}
