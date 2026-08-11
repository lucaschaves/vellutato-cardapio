import { FileText, Loader2, Menu, Printer, Volume2, VolumeX } from "lucide-react";
import { Fragment, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { useAlertaNovoPedidoAdmin } from "../context/AlertaNovoPedidoContext";
import { useImpressaoAdmin } from "../context/ImpressaoAdminContext";
import { impressoraEmModoPdf } from "../lib/impressoraLocal";
import { resolverBreadcrumbAdmin } from "../lib/adminNavegacao";
import { cn } from "../lib/utils";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./ui/breadcrumb";

type Props = {
  onAbrirMenu?: () => void;
};

function StatusSom() {
  const { ativo, precisaReativar, ativar, desativar } =
    useAlertaNovoPedidoAdmin();

  if (ativo) {
    return (
      <button
        type="button"
        onClick={desativar}
        title="Som ativo — clique para desligar"
        className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-400"
      >
        <Volume2 size={15} className="shrink-0" />
        <span className="hidden sm:inline">Som ativo</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void ativar()}
      title={
        precisaReativar
          ? "Reative o som dos novos pedidos"
          : "Ative o som dos novos pedidos"
      }
      className={cn(
        "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
        precisaReativar
          ? "animate-pulse bg-amber-500 text-white shadow-sm hover:bg-amber-600"
          : "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400",
      )}
    >
      <VolumeX size={15} className="shrink-0" />
      <span className="hidden sm:inline">
        {precisaReativar ? "Reativar som" : "Ativar som"}
      </span>
    </button>
  );
}

function StatusImpressora() {
  const { impressoraOffline, verificarImpressora } = useImpressaoAdmin();
  const [testando, setTestando] = useState(false);

  // Modo dev: impressão gera PDF em vez de enviar para o servidor.
  if (impressoraEmModoPdf()) {
    return (
      <span
        title="Modo desenvolvimento: imprimir gera um PDF da comanda"
        className="flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:border-blue-900/50 dark:bg-blue-900/20 dark:text-blue-400"
      >
        <FileText size={15} className="shrink-0" />
        <span className="hidden sm:inline">Impressão: PDF</span>
      </span>
    );
  }

  const testar = async () => {
    if (testando) return;
    setTestando(true);
    try {
      const online = await verificarImpressora();
      if (online) {
        toast.success("Impressora conectada.");
      } else {
        toast.error(
          "Impressora offline. Verifique o servidor de impressão.",
        );
      }
    } finally {
      setTestando(false);
    }
  };

  const Icone = testando ? Loader2 : Printer;

  if (!impressoraOffline) {
    return (
      <button
        type="button"
        onClick={() => void testar()}
        title="Impressora online — clique para testar a conexão"
        className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-400"
      >
        <Icone
          size={15}
          className={cn("shrink-0", testando && "animate-spin")}
        />
        <span className="hidden sm:inline">Impressora ok</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void testar()}
      title="Impressora offline — clique para testar a conexão"
      className="flex animate-pulse items-center gap-1.5 rounded-full bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-orange-600"
    >
      <Icone size={15} className={cn("shrink-0", testando && "animate-spin")} />
      <span className="hidden sm:inline">Impressora offline</span>
    </button>
  );
}

export function AdminBreadcrumbHeader({ onAbrirMenu }: Props) {
  const { pathname } = useLocation();
  const crumbs = resolverBreadcrumbAdmin(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-gray-200 bg-white/95 px-4 backdrop-blur dark:border-gray-800 dark:bg-surface-dark/95 lg:px-6">
      {onAbrirMenu && (
        <button
          type="button"
          onClick={onAbrirMenu}
          className="-ml-1 rounded-lg p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 lg:hidden"
          aria-label="Abrir menu"
        >
          <Menu size={22} />
        </button>
      )}

      <Breadcrumb className="min-w-0">
        <BreadcrumbList className="sm:gap-1.5">
          {crumbs.map((crumb, i) => {
            const ultimo = i === crumbs.length - 1;
            return (
              <Fragment key={`${crumb.rotulo}-${i}`}>
                {i > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  {ultimo || !crumb.to ? (
                    <BreadcrumbPage
                      className={
                        ultimo
                          ? "max-w-48 truncate font-semibold text-gray-900 dark:text-white sm:max-w-none"
                          : "text-muted-foreground"
                      }
                    >
                      {crumb.rotulo}
                    </BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link
                        to={crumb.to}
                        className="max-w-32 truncate hover:text-cookie-primary sm:max-w-none"
                      >
                        {crumb.rotulo}
                      </Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <StatusSom />
        <StatusImpressora />
      </div>
    </header>
  );
}
