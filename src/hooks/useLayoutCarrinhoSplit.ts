import { useEffect, useState } from "react";

const CONSULTA_LAYOUT_SPLIT = "(min-width: 768px) and (orientation: landscape)";

export function useLayoutCarrinhoSplit() {
  const [layoutSplit, setLayoutSplit] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia(CONSULTA_LAYOUT_SPLIT).matches
      : false,
  );

  useEffect(() => {
    const media = window.matchMedia(CONSULTA_LAYOUT_SPLIT);
    const atualizar = () => setLayoutSplit(media.matches);

    atualizar();
    media.addEventListener("change", atualizar);
    return () => media.removeEventListener("change", atualizar);
  }, []);

  return layoutSplit;
}
