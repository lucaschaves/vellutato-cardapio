import { Menu } from "lucide-react";
import { Fragment } from "react";
import { Link, useLocation } from "react-router-dom";
import { resolverBreadcrumbAdmin } from "../lib/adminNavegacao";
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

export function AdminBreadcrumbHeader({ onAbrirMenu }: Props) {
  const { pathname } = useLocation();
  const crumbs = resolverBreadcrumbAdmin(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-surface-dark/95 backdrop-blur px-4 lg:px-6">
      {onAbrirMenu && (
        <button
          type="button"
          onClick={onAbrirMenu}
          className="lg:hidden p-2 -ml-1 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
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
                          ? "font-semibold text-gray-900 dark:text-white truncate max-w-[12rem] sm:max-w-none"
                          : "text-muted-foreground"
                      }
                    >
                      {crumb.rotulo}
                    </BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link
                        to={crumb.to}
                        className="truncate max-w-[8rem] sm:max-w-none hover:text-cookie-primary"
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
    </header>
  );
}
