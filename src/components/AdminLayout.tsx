import {
  BarChart3,
  Calculator,
  ChefHat,
  FolderTree,
  GitBranch,
  History,
  IceCream,
  LayoutGrid,
  LogOut,
  Menu,
  Package,
  Ticket,
  QrCode,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";
import { BotaoInstalarPwa } from "./BotaoInstalarPwa";

const ITENS_NAVEGACAO = [
  { to: "/admin/dashboard", rotulo: "Dashboard", icone: BarChart3 },
  { to: "/admin/pedidos", rotulo: "KDS / Fila", icone: LayoutGrid },
  { to: "/admin/historico", rotulo: "Histórico", icone: History },
  { to: "/admin/caixa", rotulo: "Caixa", icone: Calculator },
  { to: "/admin/estoque", rotulo: "Estoque", icone: Package },
  { to: "/admin/catalogo", rotulo: "Catálogo", icone: ChefHat },
  { to: "/admin/categorias", rotulo: "Categorias", icone: FolderTree },
  { to: "/admin/mesas", rotulo: "Mesas", icone: QrCode },
  { to: "/admin/adicionais", rotulo: "Adicionais", icone: IceCream },
  { to: "/admin/clientes", rotulo: "Clientes", icone: Users },
  { to: "/admin/cupons", rotulo: "Cupons", icone: Ticket },
  { to: "/admin/vendas-cruzadas", rotulo: "Vendas cruzadas", icone: GitBranch },
] as const;

export function AdminLayout() {
  const { sair } = useAuth();
  const navigate = useNavigate();
  const [menuMobileAberto, setMenuMobileAberto] = useState(false);

  const handleLogout = async () => {
    try {
      await sair();
      navigate("/login");
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error("[ERRO - LAYOUT ADMIN] Falha no processo de desconexão:", mensagem);
      toast.error("Erro ao sair do sistema. Tente novamente.");
    }
  };

  const classeLink = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors w-full ${
      isActive
        ? "bg-cookie-primary text-white shadow-sm"
        : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/80"
    }`;

  const fecharMenuMobile = () => setMenuMobileAberto(false);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background-dark flex">
      {menuMobileAberto && (
        <button
          type="button"
          aria-label="Fechar menu"
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={fecharMenuMobile}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-surface-dark transition-transform duration-300 lg:static lg:translate-x-0 ${
          menuMobileAberto ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between gap-2 border-b border-gray-200 dark:border-gray-800 px-4 shrink-0">
          <div className="flex items-center gap-2 text-cookie-primary min-w-0">
            <ChefHat size={24} className="shrink-0" />
            <span className="font-bold text-base tracking-tight text-gray-900 dark:text-white truncate">
              Vellutato Admin
            </span>
          </div>
          <button
            type="button"
            onClick={fecharMenuMobile}
            className="lg:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Fechar navegação"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1 hide-scrollbar">
          {ITENS_NAVEGACAO.map(({ to, rotulo, icone: Icone }) => (
            <NavLink
              key={to}
              to={to}
              className={classeLink}
              onClick={fecharMenuMobile}
            >
              <Icone size={18} className="shrink-0" />
              <span>{rotulo}</span>
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-gray-200 dark:border-gray-800 p-3 shrink-0 space-y-1">
          <p className="px-3 pb-1 text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            Configurações
          </p>
          <BotaoInstalarPwa tipo="admin" />
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 transition-colors"
          >
            <LogOut size={18} />
            <span>Sair</span>
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-surface-dark/95 backdrop-blur px-4 lg:hidden shrink-0">
          <button
            type="button"
            onClick={() => setMenuMobileAberto(true)}
            className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Abrir menu"
          >
            <Menu size={22} />
          </button>
          <span className="font-bold text-gray-900 dark:text-white">
            Painel Admin
          </span>
        </header>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
