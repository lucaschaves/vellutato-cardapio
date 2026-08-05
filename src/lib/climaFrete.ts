/**
 * Clima para acréscimo de frete — Open-Meteo (sem API key).
 * Cache em memória por ~15 minutos.
 */

const CACHE_MS = 15 * 60 * 1000;

type CacheEntry = { chuva: boolean; em: number; chave: string };

let cache: CacheEntry | null = null;

/** WMO weather codes com precipitação relevante. */
function codigoIndicaChuva(code: number): boolean {
  // 51–67: drizzle/rain; 80–82: rain showers; 95–99: thunderstorm
  return (
    (code >= 51 && code <= 67) ||
    (code >= 80 && code <= 82) ||
    (code >= 95 && code <= 99)
  );
}

export async function consultarChuvaNaLoja(
  lat: number,
  lng: number,
): Promise<boolean> {
  const chave = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  if (cache && cache.chave === chave && Date.now() - cache.em < CACHE_MS) {
    return cache.chuva;
  }

  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(lat));
    url.searchParams.set("longitude", String(lng));
    url.searchParams.set("current", "precipitation,weather_code");
    url.searchParams.set("timezone", "America/Sao_Paulo");

    const res = await fetch(url.toString());
    if (!res.ok) {
      console.warn("[CLIMA] Open-Meteo HTTP", res.status);
      return false;
    }
    const data = (await res.json()) as {
      current?: { precipitation?: number; weather_code?: number };
    };
    const precip = Number(data.current?.precipitation ?? 0);
    const code = Number(data.current?.weather_code ?? 0);
    const chuva = precip > 0.1 || codigoIndicaChuva(code);
    cache = { chuva, em: Date.now(), chave };
    return chuva;
  } catch (e) {
    console.warn("[CLIMA] Falha ao consultar Open-Meteo", e);
    return false;
  }
}
