import { useEffect, useState } from "react";

/** Tablet (ou maior) em retrato — layout empilhado do item, sem o split landscape. */
const CONSULTA_TABLET_EMPILHADO =
  "(min-width: 768px) and (orientation: portrait)";

export function useTabletEmpilhado() {
  const [ativo, setAtivo] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia(CONSULTA_TABLET_EMPILHADO).matches
      : false,
  );

  useEffect(() => {
    const media = window.matchMedia(CONSULTA_TABLET_EMPILHADO);
    const atualizar = () => setAtivo(media.matches);

    atualizar();
    media.addEventListener("change", atualizar);
    return () => media.removeEventListener("change", atualizar);
  }, []);

  return ativo;
}
