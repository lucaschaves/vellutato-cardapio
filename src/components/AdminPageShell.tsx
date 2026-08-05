import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type AdminPageShellProps = {
  children: ReactNode;
  /** Título opcional no topo da página (abaixo do breadcrumb). */
  title?: ReactNode;
  description?: ReactNode;
  /** Ações à direita do título (filtros, busca, etc.). */
  actions?: ReactNode;
  /** Footer fixo (Salvar / Cancelar). */
  footer?: ReactNode;
  /** Classes extras no root. */
  className?: string;
  /** Classes extras na área de scroll. */
  contentClassName?: string;
  /** Sem padding horizontal no conteúdo (ex.: painéis full-bleed internos). */
  flush?: boolean;
  /**
   * false = miolo sem scroll próprio (útil p/ KDS/Estoque/Chat com scroll interno).
   * default true.
   */
  scroll?: boolean;
};

/**
 * Shell padrão das telas admin:
 * - sem max-width
 * - padding uniforme
 * - scroll só no miolo
 * - footer opcional sempre visível
 */
export function AdminPageShell({
  children,
  title,
  description,
  actions,
  footer,
  className,
  contentClassName,
  flush = false,
  scroll = true,
}: AdminPageShellProps) {
  const temCabecalho = title != null || description != null || actions != null;
  const padX = flush ? "" : "px-4 lg:px-6";

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col bg-gray-50 dark:bg-background-dark",
        className,
      )}
    >
      {temCabecalho && (
        <div
          className={cn(
            "shrink-0 flex flex-col gap-3 border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-surface-dark/80 backdrop-blur py-4 sm:flex-row sm:items-end sm:justify-between",
            padX,
          )}
        >
          <div className="min-w-0 space-y-1">
            {title != null && (
              <div className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:tracking-tight">
                {title}
              </div>
            )}
            {description != null && (
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {description}
              </div>
            )}
          </div>
          {actions != null && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {actions}
            </div>
          )}
        </div>
      )}

      <div
        className={cn(
          "flex-1 min-h-0",
          scroll ? "overflow-y-auto overflow-x-hidden" : "overflow-hidden flex flex-col",
          padX,
          "py-4",
          contentClassName,
        )}
      >
        {children}
      </div>

      {footer != null && (
        <div
          className={cn(
            "shrink-0 flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-surface-dark/95 backdrop-blur py-3",
            padX,
          )}
        >
          {footer}
        </div>
      )}
    </div>
  );
}
