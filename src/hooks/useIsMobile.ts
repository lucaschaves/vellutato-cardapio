import { useEffect, useState } from "react";

export function useIsMobile(larguraMaxima = 767) {
  const consulta = `(max-width: ${larguraMaxima}px)`;

  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia(consulta).matches
      : false,
  );

  useEffect(() => {
    const media = window.matchMedia(consulta);
    const atualizar = () => setIsMobile(media.matches);

    atualizar();
    media.addEventListener("change", atualizar);
    return () => media.removeEventListener("change", atualizar);
  }, [consulta]);

  return isMobile;
}
