/** URLs do canal delivery — fica na raiz do site (`/`). */
export function urlDelivery(subcaminho = ""): string {
  const caminho = subcaminho.startsWith("/")
    ? subcaminho
    : subcaminho
      ? `/${subcaminho}`
      : "";
  return caminho || "/";
}

export function urlDeliveryAbsoluta(subcaminho = ""): string {
  const relative = urlDelivery(subcaminho);
  if (typeof window === "undefined") return relative;
  return `${window.location.origin}${relative}`;
}
