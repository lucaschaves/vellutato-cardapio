export type PeriodoRelatorio = "hoje" | "7dias" | "30dias" | "todos";

export const STATUS_PEDIDO_LABEL: Record<string, string> = {
  pendente: "Pendente",
  em_producao: "Em produção",
  pronto: "Pronto",
  entregue: "Entregue",
  pago: "Pago",
  cancelado: "Cancelado",
};

export const STATUS_VENDA_CONCLUIDA = new Set(["pago", "entregue"]);

export function formatarMoeda(valor: number | null | undefined): string {
  return `R$ ${Number(valor || 0).toFixed(2).replace(".", ",")}`;
}

export function formatarDataHora(dataIso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dataIso));
}

export function obterInicioPeriodo(periodo: PeriodoRelatorio): string | null {
  if (periodo === "todos") return null;

  const inicio = new Date();

  if (periodo === "hoje") {
    inicio.setHours(0, 0, 0, 0);
    return inicio.toISOString();
  }

  if (periodo === "7dias") {
    inicio.setDate(inicio.getDate() - 6);
    inicio.setHours(0, 0, 0, 0);
    return inicio.toISOString();
  }

  inicio.setDate(inicio.getDate() - 29);
  inicio.setHours(0, 0, 0, 0);
  return inicio.toISOString();
}

export function obterClasseStatus(status: string): string {
  switch (status) {
    case "pendente":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
    case "em_producao":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
    case "pronto":
      return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300";
    case "entregue":
    case "pago":
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
    case "cancelado":
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    case "aguardando_pagamento":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
    default:
      return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
  }
}

export function obterValorPedido(pedido: { total?: number | null }): number {
  return Number(pedido.total || 0);
}

export function pedidoContaComoVenda(status: string): boolean {
  return STATUS_VENDA_CONCLUIDA.has(status);
}
