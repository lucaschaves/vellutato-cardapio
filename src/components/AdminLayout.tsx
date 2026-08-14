import { LogOut, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AlertaNovoPedidoProvider } from "../context/AlertaNovoPedidoContext";
import { useAuth } from "../context/AuthContext";
import { ChatAdminProvider } from "../context/ChatAdminContext";
import { ImpressaoAdminProvider } from "../context/ImpressaoAdminContext";
import { PedidosRealtimeProvider } from "../context/PedidosRealtimeContext";
import {
  ATALHOS_NAV_ADMIN,
  itensNavAdminFlat,
  resolverSecaoPorPath,
  SECOES_NAVEGACAO_ADMIN,
  type ItemNavAdmin,
} from "../lib/adminNavegacao";
import { cn } from "../lib/utils";
import { AdminBreadcrumbHeader } from "./AdminBreadcrumbHeader";
import { BotaoInstalarPwa } from "./BotaoInstalarPwa";
import { LogoMarca } from "./LogoMarca";

function LinkNav({
  item,
  onNavigate,
  ativoExtra,
}: {
  item: ItemNavAdmin;
  onNavigate?: () => void;
  ativoExtra?: boolean;
}) {
  const Icone = item.icone;
  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
          isActive || ativoExtra
            ? "bg-cookie-primary text-white shadow-sm"
            : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800/80",
        )
      }
    >
      <Icone size={17} className="shrink-0 opacity-90" />
      <span className="truncate">{item.rotulo}</span>
    </NavLink>
  );
}

export function AdminLayout() {
  const { sair } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [menuMobileAberto, setMenuMobileAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [secaoId, setSecaoId] = useState(() => resolverSecaoPorPath(pathname));

  useEffect(() => {
    setSecaoId(resolverSecaoPorPath(pathname));
    setBusca("");
  }, [pathname]);

  const secaoAtiva =
    SECOES_NAVEGACAO_ADMIN.find((s) => s.id === secaoId) ??
    SECOES_NAVEGACAO_ADMIN[0];

  const resultadosBusca = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return null;
    return itensNavAdminFlat().filter((item) =>
      item.rotulo.toLowerCase().includes(termo),
    );
  }, [busca]);

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

  const fecharMenuMobile = () => setMenuMobileAberto(false);

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
                  onClick={fecharMenuMobile}
                />
              )}

              <aside
                className={cn(
                  "fixed inset-y-0 left-0 z-50 flex border-r border-gray-200 bg-white transition-transform duration-300 dark:border-gray-800 dark:bg-surface-dark lg:static lg:translate-x-0",
                  menuMobileAberto ? "translate-x-0" : "-translate-x-full",
                )}
              >
                {/* Rail de seções */}
                <div className="flex w-14 shrink-0 flex-col items-center border-r border-gray-200 py-3 dark:border-gray-800">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center">
                    <LogoMarca size={32} semTexto />
                  </div>

                  <nav className="flex flex-1 flex-col items-center gap-1 overflow-y-auto px-1.5 hide-scrollbar">
                    {SECOES_NAVEGACAO_ADMIN.map((secao) => {
                      const Icone = secao.icone;
                      const ativa = secao.id === secaoId && !resultadosBusca;
                      return (
                        <button
                          key={secao.id}
                          type="button"
                          title={secao.rotulo}
                          onClick={() => {
                            setSecaoId(secao.id);
                            setBusca("");
                          }}
                          className={cn(
                            "flex h-10 w-10 flex-col items-center justify-center rounded-xl transition-colors",
                            ativa
                              ? "bg-cookie-primary/15 text-cookie-primary"
                              : "text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200",
                          )}
                        >
                          <Icone size={20} strokeWidth={ativa ? 2.25 : 1.75} />
                        </button>
                      );
                    })}
                  </nav>

                  <div className="mt-2 flex flex-col items-center gap-1 border-t border-gray-200 pt-2 dark:border-gray-800">
                    <button
                      type="button"
                      onClick={() => void handleLogout()}
                      title="Sair"
                      className="flex h-10 w-10 items-center justify-center rounded-xl text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                    >
                      <LogOut size={18} />
                    </button>
                    <p
                      className="px-0.5 pb-1 text-center text-[9px] leading-tight text-gray-400 dark:text-gray-500"
                      title={`Versão ${__APP_VERSION__}`}
                    >
                      v{__APP_VERSION__}
                    </p>
                  </div>
                </div>

                {/* Painel da seção */}
                <div className="flex w-56 flex-col">
                  <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-gray-200 px-3 dark:border-gray-800">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                        {resultadosBusca ? "Busca" : secaoAtiva.rotulo}
                      </p>
                      <p className="truncate text-[11px] text-gray-400">
                        Admin
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={fecharMenuMobile}
                      className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 lg:hidden dark:hover:bg-gray-800"
                      aria-label="Fechar navegação"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <div className="shrink-0 space-y-3 border-b border-gray-100 p-3 dark:border-gray-800/80">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                      <input
                        type="search"
                        value={busca}
                        onChange={(e) => setBusca(e.target.value)}
                        placeholder="Buscar tela…"
                        className="h-9 w-full rounded-lg border border-gray-200 bg-gray-50 pl-8 pr-3 text-sm outline-none ring-cookie-primary/30 placeholder:text-gray-400 focus:border-cookie-primary focus:ring-2 dark:border-gray-700 dark:bg-gray-900/50"
                      />
                    </div>

                    {!resultadosBusca && (
                      <div className="grid grid-cols-2 gap-1.5">
                        {ATALHOS_NAV_ADMIN.map((item) => {
                          const Icone = item.icone;
                          return (
                            <NavLink
                              key={item.to}
                              to={item.to}
                              onClick={fecharMenuMobile}
                              className={({ isActive }) =>
                                cn(
                                  "flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors",
                                  isActive
                                    ? "bg-cookie-primary text-white"
                                    : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700",
                                )
                              }
                            >
                              <Icone size={14} className="shrink-0" />
                              <span className="truncate">{item.rotulo}</span>
                            </NavLink>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <nav className="flex-1 space-y-0.5 overflow-y-auto p-2 hide-scrollbar">
                    {resultadosBusca ? (
                      resultadosBusca.length === 0 ? (
                        <p className="px-2.5 py-6 text-center text-xs text-gray-400">
                          Nenhuma tela encontrada
                        </p>
                      ) : (
                        resultadosBusca.map((item) => (
                          <LinkNav
                            key={item.to}
                            item={item}
                            onNavigate={fecharMenuMobile}
                          />
                        ))
                      )
                    ) : (
                      secaoAtiva.itens.map((item) => (
                        <LinkNav
                          key={item.to}
                          item={item}
                          onNavigate={fecharMenuMobile}
                        />
                      ))
                    )}
                  </nav>

                  <div className="shrink-0 space-y-1 border-t border-gray-200 p-2 dark:border-gray-800">
                    <BotaoInstalarPwa tipo="admin" />
                  </div>
                </div>
              </aside>

              <div className="flex min-w-0 flex-1 flex-col">
                <AdminBreadcrumbHeader
                  onAbrirMenu={() => setMenuMobileAberto(true)}
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
