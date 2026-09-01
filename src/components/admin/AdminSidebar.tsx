import {
  ChevronDown,
  LogOut,
  PanelLeftClose,
  Search,
  Star,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { toast } from "sonner";
import {
  alternarFavoritoNavAdmin,
  ehFavoritoNavAdmin,
  itensNavAdminFlat,
  lerFavoritosNavAdmin,
  lerSecaoAbertaNav,
  MAX_FAVORITOS_NAV_ADMIN,
  resolverItensFavoritos,
  resolverSecaoPorPath,
  salvarSecaoAbertaNav,
  SECOES_NAVEGACAO_ADMIN,
  type ItemNavAdmin,
} from "../../lib/adminNavegacao";
import { cn } from "../../lib/utils";
import { LogoMarca } from "../LogoMarca";

function LinkItem({
  item,
  favoritos,
  onToggleFavorito,
  onNavigate,
  aninhado,
}: {
  item: ItemNavAdmin;
  favoritos: string[];
  onToggleFavorito: (path: string) => void;
  onNavigate?: () => void;
  aninhado?: boolean;
}) {
  const Icone = item.icone;
  const favorito = ehFavoritoNavAdmin(item.to, favoritos);

  return (
    <div
      className={cn(
        "group flex items-center gap-0.5 rounded-lg",
        aninhado ? "pl-7 pr-1" : "pl-1 pr-1",
      )}
    >
      <NavLink
        to={item.to}
        onClick={onNavigate}
        title={item.rotulo}
        className={({ isActive }) =>
          cn(
            "flex min-w-0 flex-1 items-center gap-2 rounded-lg py-2 pl-2 pr-1 text-sm font-medium transition-colors",
            isActive
              ? "bg-cookie-primary text-white shadow-sm"
              : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800/80",
          )
        }
      >
        <Icone size={16} className="shrink-0 opacity-90" />
        <span className="truncate">{item.rotulo}</span>
      </NavLink>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggleFavorito(item.to);
        }}
        title={
          favorito
            ? "Remover dos atalhos"
            : `Adicionar aos atalhos (máx. ${MAX_FAVORITOS_NAV_ADMIN})`
        }
        aria-label={
          favorito
            ? `Remover ${item.rotulo} dos atalhos`
            : `Favoritar ${item.rotulo}`
        }
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
          favorito
            ? "text-amber-500 hover:bg-amber-500/10"
            : "text-gray-300 opacity-0 hover:bg-gray-100 hover:text-amber-500 group-hover:opacity-100 dark:text-gray-600 dark:hover:bg-gray-800",
          favorito && "opacity-100",
        )}
      >
        <Star
          size={15}
          fill={favorito ? "currentColor" : "none"}
          strokeWidth={2}
        />
      </button>
    </div>
  );
}

type Props = {
  abertoMobile: boolean;
  onFecharMobile: () => void;
  onRecolherDesktop: () => void;
  onLogout: () => void;
};

export function AdminSidebar({
  abertoMobile,
  onFecharMobile,
  onRecolherDesktop,
  onLogout,
}: Props) {
  const { pathname } = useLocation();
  const [busca, setBusca] = useState("");
  const secaoAtual = resolverSecaoPorPath(pathname);
  const [secaoAberta, setSecaoAberta] = useState<string | null>(
    () => lerSecaoAbertaNav() ?? secaoAtual,
  );
  const [favoritos, setFavoritos] = useState(lerFavoritosNavAdmin);

  useEffect(() => {
    setBusca("");
  }, [pathname]);

  useEffect(() => {
    setSecaoAberta(secaoAtual);
    salvarSecaoAbertaNav(secaoAtual);
  }, [secaoAtual]);

  const itensFavoritos = useMemo(
    () => resolverItensFavoritos(favoritos),
    [favoritos],
  );

  const resultadosBusca = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return null;
    return itensNavAdminFlat().filter((item) =>
      item.rotulo.toLowerCase().includes(termo),
    );
  }, [busca]);

  const alternarSecao = (id: string) => {
    setSecaoAberta((atual) => {
      const next = atual === id ? null : id;
      salvarSecaoAbertaNav(next);
      return next;
    });
  };

  const toggleFavorito = (path: string) => {
    const res = alternarFavoritoNavAdmin(path);
    setFavoritos(res.favoritos);
    if (res.limiteAtingido) {
      toast.message(
        `Máximo de ${MAX_FAVORITOS_NAV_ADMIN} atalhos. Remova um para adicionar outro.`,
      );
      return;
    }
    const item = itensNavAdminFlat().find((i) => i.to === path);
    if (res.adicionado) {
      toast.success(`${item?.rotulo ?? "Tela"} nos atalhos`);
    }
  };

  const fecharNav = () => onFecharMobile();

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-50 flex w-[17.5rem] flex-col border-r border-gray-200 bg-white transition-transform duration-300 dark:border-gray-800 dark:bg-surface-dark lg:static lg:translate-x-0",
        abertoMobile ? "translate-x-0" : "-translate-x-full",
      )}
    >
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-gray-200 px-3 dark:border-gray-800">
        <div className="flex min-w-0 items-center gap-2.5">
          <LogoMarca size={28} semTexto />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-gray-900 dark:text-white">
              Painel
            </p>
            <p className="truncate text-[11px] text-gray-400">Admin</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={onRecolherDesktop}
            className="hidden rounded-lg p-2 text-gray-500 hover:bg-gray-100 lg:inline-flex dark:hover:bg-gray-800"
            aria-label="Recolher menu"
            title="Recolher menu"
          >
            <PanelLeftClose size={18} />
          </button>
          <button
            type="button"
            onClick={onFecharMobile}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 lg:hidden dark:hover:bg-gray-800"
            aria-label="Fechar navegação"
          >
            <X size={18} />
          </button>
        </div>
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
          <div>
            <div className="mb-1.5 flex items-center justify-between px-0.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                Atalhos
              </p>
              <p className="text-[10px] text-gray-400">
                {favoritos.length}/{MAX_FAVORITOS_NAV_ADMIN}
              </p>
            </div>
            {itensFavoritos.length === 0 ? (
              <p className="px-0.5 text-[11px] leading-snug text-gray-400">
                Toque na estrela ao lado de uma tela para fixar aqui (até{" "}
                {MAX_FAVORITOS_NAV_ADMIN}).
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-1">
                {itensFavoritos.map((item) => {
                  const Icone = item.icone;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={fecharNav}
                      title={item.rotulo}
                      className={({ isActive }) =>
                        cn(
                          "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
                          isActive
                            ? "bg-cookie-primary text-white shadow-sm"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700",
                        )
                      }
                    >
                      <Icone size={18} strokeWidth={2} />
                    </NavLink>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto p-2 hide-scrollbar">
        {resultadosBusca ? (
          resultadosBusca.length === 0 ? (
            <p className="px-2.5 py-8 text-center text-xs text-gray-400">
              Nenhuma tela encontrada
            </p>
          ) : (
            <div className="space-y-0.5">
              <p className="px-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                Resultados
              </p>
              {resultadosBusca.map((item) => (
                <LinkItem
                  key={item.to}
                  item={item}
                  favoritos={favoritos}
                  onToggleFavorito={toggleFavorito}
                  onNavigate={fecharNav}
                />
              ))}
            </div>
          )
        ) : (
          <div className="space-y-1">
            {SECOES_NAVEGACAO_ADMIN.map((secao) => {
              const IconeSecao = secao.icone;
              const aberta = secaoAberta === secao.id;
              const secaoAtiva = secao.id === secaoAtual;
              const itemAtivoNaSecao = secao.itens.some(
                (item) =>
                  pathname === item.to || pathname.startsWith(`${item.to}/`),
              );

              return (
                <div
                  key={secao.id}
                  className={cn(
                    "rounded-xl",
                    secaoAtiva && "bg-gray-50/80 dark:bg-gray-900/30",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => alternarSecao(secao.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-xl px-2.5 py-2.5 text-left transition-colors",
                      itemAtivoNaSecao
                        ? "text-cookie-primary"
                        : "text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800/60",
                    )}
                  >
                    <IconeSecao
                      size={18}
                      className="shrink-0"
                      strokeWidth={itemAtivoNaSecao ? 2.25 : 1.75}
                    />
                    <span className="flex-1 truncate text-sm font-semibold">
                      {secao.rotulo}
                    </span>
                    <span className="text-[11px] tabular-nums text-gray-400">
                      {secao.itens.length}
                    </span>
                    <ChevronDown
                      size={16}
                      className={cn(
                        "shrink-0 text-gray-400 transition-transform duration-200",
                        aberta && "rotate-180",
                      )}
                    />
                  </button>

                  {aberta && (
                    <div className="space-y-0.5 pb-1.5">
                      {secao.itens.map((item) => (
                        <LinkItem
                          key={item.to}
                          item={item}
                          favoritos={favoritos}
                          onToggleFavorito={toggleFavorito}
                          aninhado
                          onNavigate={fecharNav}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </nav>

      <div className="shrink-0 space-y-1 border-t border-gray-200 p-2 dark:border-gray-800">
        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
        >
          <LogOut size={16} />
          Sair
        </button>
        <p
          className="px-2.5 pb-1 text-center text-[10px] text-gray-400"
          title={`Versão ${__APP_VERSION__}`}
        >
          v{__APP_VERSION__}
        </p>
      </div>
    </aside>
  );
}
