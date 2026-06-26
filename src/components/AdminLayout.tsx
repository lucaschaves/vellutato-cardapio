import {
  BarChart3,
  Calculator,
  ChefHat,
  History,
  IceCream,
  LayoutGrid,
  LogOut,
  Package,
} from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";

export function AdminLayout() {
  const { sair } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await sair();
      navigate("/login");
    } catch (erro: any) {
      console.error(
        "[ERRO - LAYOUT ADMIN] Falha no processo de desconexão:",
        erro.message || erro,
      );
      toast.error("Erro ao sair do sistema. Tente novamente.");
    }
  };

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? "bg-cookie-primary text-white"
        : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
    }`;

  return (
    <div className="h-full min-h-screen bg-gray-50 dark:bg-background-dark flex flex-col">
      {/* Cabeçalho de Navegação Superior */}
      <header className="sticky top-0 z-40 bg-white dark:bg-surface-dark border-b border-gray-200 dark:border-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            {/* Marca / Logo */}
            <div className="flex items-center gap-2 text-cookie-primary">
              <ChefHat size={24} />
              <span className="font-bold text-lg hidden sm:block tracking-tight text-gray-900 dark:text-white">
                Vellutato Admin
              </span>
            </div>

            {/* Menu Principal */}
            <nav className="flex items-center gap-2 overflow-x-auto hide-scrollbar">
              <NavLink to="/admin/dashboard" className={navClass}>
                <BarChart3 size={18} />
                <span className="hidden sm:inline">Dashboard</span>
              </NavLink>

              <NavLink to="/admin/pedidos" className={navClass}>
                <LayoutGrid size={18} />
                <span className="hidden sm:inline">KDS / Fila</span>
              </NavLink>

              <NavLink to="/admin/historico" className={navClass}>
                <History size={18} />
                <span className="hidden sm:inline">Histórico</span>
              </NavLink>

              <NavLink to="/admin/estoque" className={navClass}>
                <Package size={18} />
                <span className="hidden sm:inline">Estoque</span>
              </NavLink>

              <NavLink to="/admin/adicionais" className={navClass}>
                <IceCream size={18} />
                <span className="hidden sm:inline">Adicionais</span>
              </NavLink>

              <NavLink to="/admin/catalogo" className={navClass}>
                <ChefHat size={18} />
                <span className="hidden sm:inline">Catálogo</span>
              </NavLink>
              <NavLink to="/admin/caixa" className={navClass}>
                <Calculator size={18} />
                <span className="hidden sm:inline">Caixa</span>
              </NavLink>
            </nav>
          </div>

          {/* Área de Ação do Usuário */}
          <div className="flex items-center">
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 text-sm font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 px-3 py-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              title="Sair do sistema"
            >
              <LogOut size={18} />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>
      </header>

      {/* Área onde as páginas filhas serão renderizadas */}
      <main className="flex-1 w-full max-w-7xl mx-auto">
        <Outlet />
      </main>
    </div>
  );
}
