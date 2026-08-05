import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  Bike,
  Calculator,
  ChefHat,
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
  QrCode,
  Ticket,
  Users,
} from "lucide-react";

export type ItemNavAdmin = {
  to: string;
  rotulo: string;
  icone: LucideIcon;
};

export type GrupoNavAdmin = {
  titulo: string;
  itens: readonly ItemNavAdmin[];
};

export const GRUPOS_NAVEGACAO_ADMIN: readonly GrupoNavAdmin[] = [
  {
    titulo: "Visão geral",
    itens: [
      { to: "/admin/dashboard", rotulo: "Dashboard", icone: BarChart3 },
      { to: "/admin/analytics", rotulo: "Analytics", icone: Activity },
    ],
  },
  {
    titulo: "Produção",
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
    titulo: "Cadastro",
    itens: [
      { to: "/admin/catalogo", rotulo: "Catálogo", icone: ChefHat },
      { to: "/admin/categorias", rotulo: "Categorias", icone: FolderTree },
      { to: "/admin/adicionais", rotulo: "Adicionais", icone: IceCream },
      { to: "/admin/combos", rotulo: "Combos", icone: Layers },
      { to: "/admin/estoque", rotulo: "Estoque", icone: Package },
      { to: "/admin/mesas", rotulo: "Mesas", icone: QrCode },
    ],
  },
  {
    titulo: "Clientes",
    itens: [
      { to: "/admin/clientes", rotulo: "Clientes", icone: Users },
      { to: "/admin/mensagens", rotulo: "Mensagens", icone: MessageCircle },
    ],
  },
  {
    titulo: "Promoções",
    itens: [
      { to: "/admin/cupons", rotulo: "Cupons", icone: Ticket },
      {
        to: "/admin/vendas-cruzadas",
        rotulo: "Vendas cruzadas",
        icone: GitBranch,
      },
    ],
  },
  {
    titulo: "Sistema",
    itens: [
      { to: "/admin/integracoes", rotulo: "Integrações", icone: KeyRound },
    ],
  },
] as const;

export type CrumbAdmin = {
  rotulo: string;
  to?: string;
};

/** Resolve trilha Admin › grupo › página [› detalhe]. */
export function resolverBreadcrumbAdmin(pathname: string): CrumbAdmin[] {
  const path = pathname.replace(/\/+$/, "") || "/admin";
  const crumbs: CrumbAdmin[] = [{ rotulo: "Admin", to: "/admin/dashboard" }];

  let melhor: {
    grupo: string;
    item: ItemNavAdmin;
  } | null = null;

  for (const grupo of GRUPOS_NAVEGACAO_ADMIN) {
    for (const item of grupo.itens) {
      if (
        path === item.to ||
        path.startsWith(`${item.to}/`)
      ) {
        if (!melhor || item.to.length > melhor.item.to.length) {
          melhor = { grupo: grupo.titulo, item };
        }
      }
    }
  }

  if (!melhor) {
    crumbs.push({ rotulo: "Painel" });
    return crumbs;
  }

  crumbs.push({ rotulo: melhor.grupo });

  const ehFilho = path !== melhor.item.to && path.startsWith(`${melhor.item.to}/`);
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
