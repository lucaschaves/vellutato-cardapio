import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bike,
  Calculator,
  ChefHat,
  ClipboardList,
  Clock,
  FolderTree,
  GitBranch,
  History,
  IceCream,
  KeyRound,
  Layers,
  LayoutGrid,
  MessageCircle,
  Package,
  PlusCircle,
  Printer,
  QrCode,
  Settings2,
  ShoppingCart,
  Ticket,
  Users,
  Warehouse,
} from "lucide-react";

export type ItemNavAdmin = {
  to: string;
  rotulo: string;
  icone: LucideIcon;
};

export type SecaoNavAdmin = {
  id: string;
  rotulo: string;
  icone: LucideIcon;
  itens: readonly ItemNavAdmin[];
};

/** Atalhos sempre visíveis no topo do painel. */
export const ATALHOS_NAV_ADMIN: readonly ItemNavAdmin[] = [
  { to: "/admin/pedidos", rotulo: "KDS", icone: LayoutGrid },
  { to: "/admin/novo-pedido", rotulo: "Novo", icone: PlusCircle },
  { to: "/admin/caixa", rotulo: "Caixa", icone: Calculator },
  { to: "/admin/lista-compras", rotulo: "Compras", icone: ShoppingCart },
] as const;

/**
 * Navegação por seções (rail de ícones).
 * Cada seção mostra só os itens dela — menos scroll, mais fácil de achar.
 */
export const SECOES_NAVEGACAO_ADMIN: readonly SecaoNavAdmin[] = [
  {
    id: "inicio",
    rotulo: "Início",
    icone: BarChart3,
    itens: [
      { to: "/admin/dashboard", rotulo: "Dashboard", icone: BarChart3 },
    ],
  },
  {
    id: "operacao",
    rotulo: "Operação",
    icone: LayoutGrid,
    itens: [
      { to: "/admin/pedidos", rotulo: "KDS / Fila", icone: LayoutGrid },
      { to: "/admin/novo-pedido", rotulo: "Novo pedido", icone: PlusCircle },
      { to: "/admin/historico", rotulo: "Histórico", icone: History },
      { to: "/admin/caixa", rotulo: "Caixa", icone: Calculator },
      { to: "/admin/funcionamento", rotulo: "Funcionamento", icone: Clock },
      { to: "/admin/delivery", rotulo: "Delivery", icone: Bike },
      { to: "/admin/chat", rotulo: "Chat", icone: MessageCircle },
    ],
  },
  {
    id: "cardapio",
    rotulo: "Cardápio",
    icone: ChefHat,
    itens: [
      { to: "/admin/catalogo", rotulo: "Catálogo", icone: ChefHat },
      { to: "/admin/categorias", rotulo: "Categorias", icone: FolderTree },
      { to: "/admin/adicionais", rotulo: "Adicionais", icone: IceCream },
      { to: "/admin/combos", rotulo: "Combos", icone: Layers },
      { to: "/admin/estoque", rotulo: "Estoque cardápio", icone: Package },
      { to: "/admin/mesas", rotulo: "Mesas", icone: QrCode },
    ],
  },
  {
    id: "estoque",
    rotulo: "Estoque",
    icone: Warehouse,
    itens: [
      { to: "/admin/insumos", rotulo: "Insumos", icone: Warehouse },
      {
        to: "/admin/fichas-tecnicas",
        rotulo: "Fichas técnicas",
        icone: ClipboardList,
      },
      {
        to: "/admin/lista-compras",
        rotulo: "Lista de compras",
        icone: ShoppingCart,
      },
    ],
  },
  {
    id: "clientes",
    rotulo: "Clientes",
    icone: Users,
    itens: [
      { to: "/admin/clientes", rotulo: "Clientes", icone: Users },
      { to: "/admin/mensagens", rotulo: "Mensagens", icone: MessageCircle },
      { to: "/admin/cupons", rotulo: "Cupons", icone: Ticket },
      {
        to: "/admin/vendas-cruzadas",
        rotulo: "Vendas cruzadas",
        icone: GitBranch,
      },
    ],
  },
  {
    id: "sistema",
    rotulo: "Sistema",
    icone: Settings2,
    itens: [
      { to: "/admin/integracoes", rotulo: "Integrações", icone: KeyRound },
      { to: "/admin/impressao", rotulo: "Cupom de impressão", icone: Printer },
    ],
  },
] as const;

/** @deprecated use SECOES_NAVEGACAO_ADMIN — mantido para compatibilidade de breadcrumb. */
export type GrupoNavAdmin = {
  titulo: string;
  itens: readonly ItemNavAdmin[];
};

export const GRUPOS_NAVEGACAO_ADMIN: readonly GrupoNavAdmin[] =
  SECOES_NAVEGACAO_ADMIN.map((s) => ({
    titulo: s.rotulo,
    itens: s.itens,
  }));

export function itensNavAdminFlat(): ItemNavAdmin[] {
  const mapa = new Map<string, ItemNavAdmin>();
  for (const secao of SECOES_NAVEGACAO_ADMIN) {
    for (const item of secao.itens) {
      mapa.set(item.to, item);
    }
  }
  return [...mapa.values()];
}

export function resolverSecaoPorPath(pathname: string): string {
  const path = pathname.replace(/\/+$/, "") || "/admin";
  let melhor: { id: string; len: number } | null = null;

  for (const secao of SECOES_NAVEGACAO_ADMIN) {
    for (const item of secao.itens) {
      if (path === item.to || path.startsWith(`${item.to}/`)) {
        if (!melhor || item.to.length > melhor.len) {
          melhor = { id: secao.id, len: item.to.length };
        }
      }
    }
  }

  return melhor?.id ?? SECOES_NAVEGACAO_ADMIN[0].id;
}

export type CrumbAdmin = {
  rotulo: string;
  to?: string;
};

/** Resolve trilha Admin › seção › página [› detalhe]. */
export function resolverBreadcrumbAdmin(pathname: string): CrumbAdmin[] {
  const path = pathname.replace(/\/+$/, "") || "/admin";
  const crumbs: CrumbAdmin[] = [{ rotulo: "Admin", to: "/admin/dashboard" }];

  let melhor: {
    secao: SecaoNavAdmin;
    item: ItemNavAdmin;
  } | null = null;

  for (const secao of SECOES_NAVEGACAO_ADMIN) {
    for (const item of secao.itens) {
      if (path === item.to || path.startsWith(`${item.to}/`)) {
        if (!melhor || item.to.length > melhor.item.to.length) {
          melhor = { secao, item };
        }
      }
    }
  }

  if (!melhor) {
    crumbs.push({ rotulo: "Painel" });
    return crumbs;
  }

  crumbs.push({ rotulo: melhor.secao.rotulo });

  const ehFilho =
    path !== melhor.item.to && path.startsWith(`${melhor.item.to}/`);
  if (ehFilho) {
    crumbs.push({ rotulo: melhor.item.rotulo, to: melhor.item.to });
    crumbs.push({
      rotulo: rotuloDetalhe(melhor.item.to, path),
    });
  } else {
    crumbs.push({ rotulo: melhor.item.rotulo });
  }

  return crumbs;
}

function rotuloDetalhe(base: string, path: string): string {
  if (base === "/admin/clientes") return "Detalhe";
  const resto = path.slice(base.length + 1);
  return resto ? resto.split("/")[0] : "Detalhe";
}
