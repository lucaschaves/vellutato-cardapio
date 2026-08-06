import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  CheckCircle2,
  CircleDashed,
  Loader2,
  MapPin,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";
import { toast } from "sonner";
import {
  atualizarConfigBairroFrete,
  contarBairrosComTaxa,
  listarBairrosFreteGeojson,
  type BairroFreteFeatureProperties,
  type BairrosFreteGeoJson,
} from "../../lib/deliveryBairros";
import {
  intervaloDistanciaLojaBairro,
  sugerirFaixasPorIntervalo,
  type IntervaloDistanciaBairro,
} from "../../lib/deliveryBairroGeo";
import {
  bairroTemEntrega,
  novoDescontoFreteBairro,
  type DescontoFreteBairro,
  type FaixaFrete,
} from "../../lib/deliveryFrete";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

type Props = {
  onTaxasChange?: (fc: BairrosFreteGeoJson) => void;
  lojaLatitude?: number | null;
  lojaLongitude?: number | null;
};

type FeatureBairro = Feature<Geometry, BairroFreteFeatureProperties>;
type FiltroLista = "todos" | "ativos" | "pendentes";

const FLORIPA_CENTER: [number, number] = [-27.595, -48.548];

function FitBoundsInicial({ data }: { data: FeatureCollection }) {
  const map = useMap();
  const jaAjustou = useRef(false);
  useEffect(() => {
    if (jaAjustou.current || !data.features.length) return;
    jaAjustou.current = true;
    try {
      const layer = L.geoJSON(data);
      const bounds = layer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [24, 24], maxZoom: 12 });
      }
    } catch {
      map.setView(FLORIPA_CENTER, 11);
    }
  }, [data.features.length, map]);
  return null;
}

function estiloBairro(
  feature?: FeatureBairro,
  selecionadoId?: string | null,
) {
  const ativo = bairroTemEntrega({
    faixas: feature?.properties?.faixas,
    taxa: feature?.properties?.taxa,
  });
  const selecionado = Boolean(
    selecionadoId && feature?.properties?.id === selecionadoId,
  );
  return {
    color: selecionado ? "#047857" : ativo ? "#059669" : "#94a3b8",
    weight: selecionado ? 2.5 : 1.2,
    fillColor: selecionado ? "#10b981" : ativo ? "#34d399" : "#e2e8f0",
    fillOpacity: selecionado ? 0.55 : ativo ? 0.45 : 0.25,
  };
}

function formatMoney(v: number): string {
  return v.toFixed(2).replace(".", ",");
}

function resumoCurto(p: BairroFreteFeatureProperties): string {
  if (!bairroTemEntrega(p)) return "Clique para configurar";
  const min = p.faixas?.length
    ? Math.min(...p.faixas.map((f) => f.taxa))
    : Number(p.taxa ?? 0);
  const nFaixas = p.faixas?.length ?? 0;
  const nDesc = p.descontos?.length ?? 0;
  return `R$ ${formatMoney(min)} · ${nFaixas} faixa${nFaixas === 1 ? "" : "s"}${
    nDesc ? ` · ${nDesc} desc.` : ""
  }`;
}

function BotaoBairro({
  bairro,
  ativo,
  selecionado,
  onClick,
}: {
  bairro: BairroFreteFeatureProperties;
  ativo: boolean;
  selecionado: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-lg px-3 py-2.5 transition-colors border ${
        selecionado
          ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 dark:border-emerald-600"
          : "border-transparent hover:bg-gray-50 dark:hover:bg-gray-800/50"
      }`}
    >
      <div className="flex items-start gap-2">
        {ativo ? (
          <CheckCircle2
            size={16}
            className="mt-0.5 shrink-0 text-emerald-600"
          />
        ) : (
          <CircleDashed size={16} className="mt-0.5 shrink-0 text-gray-400" />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm text-gray-950 dark:text-white truncate">
            {bairro.nome}
          </p>
          <p className="text-[11px] text-gray-500 truncate">
            {bairro.distrito} · {resumoCurto(bairro)}
          </p>
        </div>
      </div>
    </button>
  );
}

export function MapaFreteBairros({
  onTaxasChange,
  lojaLatitude,
  lojaLongitude,
}: Props) {
  const [carregando, setCarregando] = useState(true);
  const [geojson, setGeojson] = useState<BairrosFreteGeoJson | null>(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<FiltroLista>("todos");
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [raioEdit, setRaioEdit] = useState("");
  const [faixasEdit, setFaixasEdit] = useState<FaixaFrete[]>([]);
  const [descontosEdit, setDescontosEdit] = useState<DescontoFreteBairro[]>(
    [],
  );
  const [salvando, setSalvando] = useState(false);
  const [passoSugestao, setPassoSugestao] = useState<1 | 2>(2);
  const [intervaloSel, setIntervaloSel] =
    useState<IntervaloDistanciaBairro | null>(null);

  const lojaOk =
    lojaLatitude != null &&
    lojaLongitude != null &&
    Number.isFinite(lojaLatitude) &&
    Number.isFinite(lojaLongitude);

  const carregar = async () => {
    try {
      setCarregando(true);
      const fc = await listarBairrosFreteGeojson();
      setGeojson(fc);
      onTaxasChange?.(fc);
    } catch (erro: unknown) {
      const msg = erro instanceof Error ? erro.message : String(erro);
      console.error("[MAPA BAIRROS]", msg);
      toast.error(
        msg.includes("listar_bairros") || msg.includes("does not exist")
          ? "Rode a migration de frete por bairro no banco."
          : "Falha ao carregar mapa de bairros.",
      );
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const contagem = useMemo(() => contarBairrosComTaxa(geojson), [geojson]);

  /** Menores por cima: bairro fino recebe o clique em vez do polígono do distrito. */
  const fcMapa = useMemo(() => {
    const features = [...(geojson?.features ?? [])].sort((a, b) => {
      try {
        const ba = L.geoJSON(a as Feature).getBounds();
        const bb = L.geoJSON(b as Feature).getBounds();
        const areaA =
          (ba.getNorth() - ba.getSouth()) * (ba.getEast() - ba.getWest());
        const areaB =
          (bb.getNorth() - bb.getSouth()) * (bb.getEast() - bb.getWest());
        return areaB - areaA;
      } catch {
        return 0;
      }
    });
    return { type: "FeatureCollection" as const, features };
  }, [geojson]);

  const selecionado = useMemo(() => {
    if (!selecionadoId || !geojson) return null;
    return (
      geojson.features.find((f) => f.properties?.id === selecionadoId)
        ?.properties ?? null
    );
  }, [geojson, selecionadoId]);

  const { ativos, pendentes } = useMemo(() => {
    const features = geojson?.features ?? [];
    const q = busca.trim().toLowerCase();
    const props = features
      .map((f) => f.properties)
      .filter(Boolean) as BairroFreteFeatureProperties[];
    const filtrados = q
      ? props.filter(
          (p) =>
            p.nome.toLowerCase().includes(q) ||
            p.distrito.toLowerCase().includes(q) ||
            p.regiao.toLowerCase().includes(q),
        )
      : props;
    const sortNome = (a: BairroFreteFeatureProperties, b: BairroFreteFeatureProperties) =>
      a.nome.localeCompare(b.nome, "pt-BR");
    const com = filtrados.filter((p) => bairroTemEntrega(p)).sort(sortNome);
    const sem = filtrados.filter((p) => !bairroTemEntrega(p)).sort(sortNome);
    return { ativos: com, pendentes: sem };
  }, [geojson, busca]);

  const obterGeometria = (
    bairroId: string,
  ): { type: string; coordinates: unknown } | null => {
    const feat = geojson?.features.find((f) => f.properties?.id === bairroId);
    const g = feat?.geometry;
    if (!g || g.type === "GeometryCollection" || !("coordinates" in g)) {
      return null;
    }
    return { type: g.type, coordinates: g.coordinates };
  };

  const calcularIntervalo = (
    bairroId: string,
  ): IntervaloDistanciaBairro | null => {
    if (!lojaOk) return null;
    const geom = obterGeometria(bairroId);
    if (!geom) return null;
    return intervaloDistanciaLojaBairro(lojaLatitude!, lojaLongitude!, geom);
  };

  const aplicarSugestaoFaixas = (
    bairroId: string,
    passo: 1 | 2 = passoSugestao,
  ): boolean => {
    const intervalo = calcularIntervalo(bairroId);
    setIntervaloSel(intervalo);
    if (!intervalo) return false;
    const { faixas, raio_km } = sugerirFaixasPorIntervalo(
      intervalo.dist_min_km,
      intervalo.dist_max_km,
      { passo_km: passo },
    );
    setFaixasEdit(faixas);
    setRaioEdit(String(raio_km));
    return true;
  };

  const selecionar = (p: BairroFreteFeatureProperties) => {
    setSelecionadoId(p.id);
    setDescontosEdit((p.descontos ?? []).map((d) => ({ ...d })));
    const intervalo = calcularIntervalo(p.id);
    setIntervaloSel(intervalo);

    if (p.faixas?.length) {
      setFaixasEdit(p.faixas.map((f) => ({ ...f })));
      setRaioEdit(p.raio_km != null ? String(p.raio_km) : "");
    } else if (p.taxa != null) {
      setFaixasEdit([{ ate_km: p.raio_km ?? 5, taxa: Number(p.taxa) }]);
      setRaioEdit(p.raio_km != null ? String(p.raio_km) : "");
    } else if (intervalo) {
      const { faixas, raio_km } = sugerirFaixasPorIntervalo(
        intervalo.dist_min_km,
        intervalo.dist_max_km,
        { passo_km: passoSugestao },
      );
      setFaixasEdit(faixas);
      setRaioEdit(String(raio_km));
    } else {
      setFaixasEdit([{ ate_km: 3, taxa: 8 }]);
      setRaioEdit(p.raio_km != null ? String(p.raio_km) : "5");
    }
  };

  const sugerirFaixasPelaLoja = () => {
    if (!selecionado) return;
    if (!lojaOk) {
      toast.warning(
        "Informe a latitude e longitude da loja na seção acima para sugerir faixas.",
      );
      return;
    }
    const ok = aplicarSugestaoFaixas(selecionado.id, passoSugestao);
    if (!ok) {
      toast.error("Não foi possível calcular a distância até este bairro.");
      return;
    }
    toast.success(
      `Faixas sugeridas a cada ${passoSugestao} km (ajuste as taxas se quiser).`,
    );
  };

  const fecharEditor = () => {
    setSelecionadoId(null);
    setIntervaloSel(null);
  };

  const adicionarFaixa = () => {
    const ultima = faixasEdit[faixasEdit.length - 1];
    setFaixasEdit([
      ...faixasEdit,
      {
        ate_km: (ultima?.ate_km ?? 0) + 2,
        taxa: (ultima?.taxa ?? 5) + 3,
      },
    ]);
  };

  const salvarConfig = async () => {
    if (!selecionado) return;
    const raioRaw = raioEdit.trim();
    let raio: number | null = null;
    if (raioRaw !== "") {
      const n = Number(raioRaw.replace(",", "."));
      if (!Number.isFinite(n) || n <= 0) {
        toast.warning("Raio inválido (use km > 0 ou deixe vazio).");
        return;
      }
      raio = Number(n.toFixed(2));
    }
    for (const f of faixasEdit) {
      if (!(f.ate_km > 0) || !(f.taxa >= 0)) {
        toast.warning("Cada faixa precisa de km > 0 e taxa ≥ 0.");
        return;
      }
    }
    for (const d of descontosEdit) {
      if (!(d.pedido_minimo >= 0)) {
        toast.warning("Pedido mínimo do desconto inválido.");
        return;
      }
      if (d.ate_km != null && !(d.ate_km > 0)) {
        toast.warning("Até km do desconto deve ser > 0 ou vazio.");
        return;
      }
      if (d.tipo !== "gratis" && !(d.valor >= 0)) {
        toast.warning("Valor do desconto inválido.");
        return;
      }
    }
    try {
      setSalvando(true);
      const atualizado = await atualizarConfigBairroFrete(selecionado.id, {
        raio_km: raio,
        faixas: faixasEdit,
        descontos: descontosEdit,
      });
      setGeojson((prev) => {
        if (!prev) return prev;
        const next: BairrosFreteGeoJson = {
          ...prev,
          features: prev.features.map((f) =>
            f.properties?.id === selecionado.id
              ? {
                  ...f,
                  properties: {
                    ...f.properties,
                    taxa: atualizado.taxa,
                    raio_km: atualizado.raio_km,
                    faixas: atualizado.faixas,
                    descontos: atualizado.descontos,
                    ativo: bairroTemEntrega(atualizado),
                  },
                }
              : f,
          ),
        };
        onTaxasChange?.(next);
        return next;
      });
      setFaixasEdit(atualizado.faixas.map((f) => ({ ...f })));
      setDescontosEdit(atualizado.descontos.map((d) => ({ ...d })));
      setRaioEdit(
        atualizado.raio_km != null ? String(atualizado.raio_km) : "",
      );
      toast.success(
        atualizado.faixas.length === 0
          ? `${atualizado.nome}: sem entrega`
          : `${atualizado.nome}: config salva`,
      );
    } catch (erro: unknown) {
      const msg = erro instanceof Error ? erro.message : String(erro);
      toast.error(
        msg.includes("atualizar_config_bairro") || msg.includes("does not exist")
          ? "Rode a migration de frete híbrido no banco."
          : msg || "Erro ao salvar.",
      );
    } finally {
      setSalvando(false);
    }
  };

  const limparEntrega = async () => {
    if (!selecionado) return;
    try {
      setSalvando(true);
      const atualizado = await atualizarConfigBairroFrete(selecionado.id, {
        raio_km: raioEdit.trim() ? Number(raioEdit) : null,
        faixas: [],
        descontos: [],
      });
      setFaixasEdit([]);
      setDescontosEdit([]);
      setGeojson((prev) => {
        if (!prev) return prev;
        const next: BairrosFreteGeoJson = {
          ...prev,
          features: prev.features.map((f) =>
            f.properties?.id === selecionado.id
              ? {
                  ...f,
                  properties: {
                    ...f.properties,
                    taxa: null,
                    faixas: [],
                    descontos: [],
                    ativo: false,
                    raio_km: atualizado.raio_km,
                  },
                }
              : f,
          ),
        };
        onTaxasChange?.(next);
        return next;
      });
      toast.success(`${atualizado.nome}: entrega desativada`);
    } catch (erro: unknown) {
      const msg = erro instanceof Error ? erro.message : String(erro);
      toast.error(msg || "Erro ao limpar.");
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-gray-400">
        <Loader2 className="animate-spin" size={18} />
        Carregando bairros de Florianópolis…
      </div>
    );
  }

  const fc = (geojson ?? {
    type: "FeatureCollection",
    features: [],
  }) as FeatureCollection;

  const mostrarAtivos = filtro !== "pendentes";
  const mostrarPendentes = filtro !== "ativos";

  return (
    <div className="flex flex-col gap-4">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
              {contagem.ativos}
            </span>{" "}
            com entrega ·{" "}
            <span className="font-semibold text-gray-500">
              {contagem.total - contagem.ativos}
            </span>{" "}
            sem configurar
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Cálculo: faixa de km → chuva → desconto do carrinho
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 sm:w-52">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <Input
              className="pl-8 h-9"
              placeholder="Buscar bairro…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 p-0.5 text-xs font-semibold">
            {(
              [
                ["todos", "Todos"],
                ["ativos", "Com entrega"],
                ["pendentes", "Sem entrega"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFiltro(id)}
                className={`px-2.5 py-1.5 rounded-md transition-colors ${
                  filtro === id
                    ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                    : "text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Mapa + listas */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)] gap-4">
        <div className="h-[380px] lg:h-[440px] rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 z-0 relative">
          <MapContainer
            center={FLORIPA_CENTER}
            zoom={11}
            className="h-full w-full"
            scrollWheelZoom
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitBoundsInicial data={fc} />
            {fcMapa.features.length > 0 ? (
              <GeoJSON
                key={`bairros-${contagem.ativos}-${contagem.total}-${selecionadoId ?? "x"}`}
                data={fcMapa}
                style={(feat) =>
                  estiloBairro(
                    feat as FeatureBairro | undefined,
                    selecionadoId,
                  )
                }
                onEachFeature={(feature, layer) => {
                  const props = (feature as FeatureBairro).properties;
                  if (!props) return;
                  layer.bindTooltip(`${props.nome}: ${resumoCurto(props)}`);
                  layer.on("click", () => selecionar(props));
                }}
              />
            ) : null}
          </MapContainer>
          <div className="absolute bottom-3 left-3 z-[1000] flex gap-2 text-[10px] font-medium pointer-events-none">
            <span className="rounded-full bg-white/95 dark:bg-gray-900/95 border border-gray-200 dark:border-gray-700 px-2 py-1 shadow-sm">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 mr-1.5 align-middle" />
              Com entrega
            </span>
            <span className="rounded-full bg-white/95 dark:bg-gray-900/95 border border-gray-200 dark:border-gray-700 px-2 py-1 shadow-sm">
              <span className="inline-block w-2 h-2 rounded-full bg-slate-300 mr-1.5 align-middle" />
              Sem entrega
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-3 min-h-0 max-h-[440px]">
          {mostrarAtivos ? (
            <section className="flex flex-col min-h-0 flex-1 rounded-xl border border-emerald-200/80 dark:border-emerald-900/50 bg-emerald-50/30 dark:bg-emerald-950/10 overflow-hidden">
              <header className="px-3 py-2 border-b border-emerald-100 dark:border-emerald-900/40 flex items-center gap-2 shrink-0">
                <CheckCircle2 size={14} className="text-emerald-600" />
                <h3 className="text-xs font-bold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
                  Com entrega
                </h3>
                <span className="ml-auto text-[11px] font-semibold text-emerald-700/80 dark:text-emerald-400">
                  {ativos.length}
                </span>
              </header>
              <div className="overflow-y-auto p-1.5 flex-1">
                {ativos.length === 0 ? (
                  <p className="text-xs text-gray-400 px-2 py-4 text-center">
                    Nenhum bairro com frete ainda.
                  </p>
                ) : (
                  ativos.map((b) => (
                    <BotaoBairro
                      key={b.id}
                      bairro={b}
                      ativo
                      selecionado={selecionadoId === b.id}
                      onClick={() => selecionar(b)}
                    />
                  ))
                )}
              </div>
            </section>
          ) : null}

          {mostrarPendentes ? (
            <section className="flex flex-col min-h-0 flex-1 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <header className="px-3 py-2 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2 shrink-0 bg-gray-50/80 dark:bg-gray-900/40">
                <CircleDashed size={14} className="text-gray-400" />
                <h3 className="text-xs font-bold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                  Sem entrega
                </h3>
                <span className="ml-auto text-[11px] font-semibold text-gray-400">
                  {pendentes.length}
                </span>
              </header>
              <div className="overflow-y-auto p-1.5 flex-1">
                {pendentes.length === 0 ? (
                  <p className="text-xs text-gray-400 px-2 py-4 text-center">
                    Todos os bairros filtrados já têm frete.
                  </p>
                ) : (
                  pendentes.map((b) => (
                    <BotaoBairro
                      key={b.id}
                      bairro={b}
                      ativo={false}
                      selecionado={selecionadoId === b.id}
                      onClick={() => selecionar(b)}
                    />
                  ))
                )}
              </div>
            </section>
          ) : null}
        </div>
      </div>

      {/* Editor do bairro selecionado */}
      {selecionado ? (
        <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#181a1b] overflow-hidden">
          <header className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/30">
            <div className="flex items-start gap-3 min-w-0">
              <div className="mt-0.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 p-2 text-emerald-700 dark:text-emerald-300">
                <MapPin size={18} />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-lg text-gray-950 dark:text-white truncate">
                  {selecionado.nome}
                </h3>
                <p className="text-xs text-gray-500">
                  {selecionado.regiao} · Distrito {selecionado.distrito}
                  {bairroTemEntrega(selecionado) ? (
                    <span className="ml-2 inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-semibold">
                      <CheckCircle2 size={12} /> Ativo
                    </span>
                  ) : (
                    <span className="ml-2 text-amber-700 dark:text-amber-400 font-semibold">
                      Configurando agora
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={salvando}
                onClick={() => void limparEntrega()}
              >
                Remover entrega
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={salvando || faixasEdit.length === 0}
                onClick={() => void salvarConfig()}
              >
                {salvando ? (
                  <Loader2 className="animate-spin" size={14} />
                ) : (
                  "Salvar"
                )}
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={fecharEditor}
                aria-label="Fechar editor"
              >
                <X size={16} />
              </Button>
            </div>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 lg:divide-x divide-gray-100 dark:divide-gray-800">
            {/* Cobertura */}
            <div className="p-4 flex flex-col gap-3">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wide text-gray-500">
                  1. Cobertura
                </h4>
                <p className="text-[11px] text-gray-400 mt-1">
                  Até quantos km da loja este bairro atende.
                </p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Raio máximo (km)
                </label>
                <Input
                  type="number"
                  min={0.1}
                  step="0.1"
                  placeholder="Ex.: 5"
                  value={raioEdit}
                  onChange={(e) => setRaioEdit(e.target.value)}
                  className="mt-1.5"
                />
                <p className="text-[11px] text-gray-400 mt-1.5">
                  Vazio = usa a maior faixa de km abaixo.
                </p>
              </div>
            </div>

            {/* Faixas */}
            <div className="p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wide text-gray-500">
                    2. Faixas de frete
                  </h4>
                  <p className="text-[11px] text-gray-400 mt-1">
                    Preço por distância dentro do bairro.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={adicionarFaixa}
                >
                  <Plus size={14} className="mr-1" /> Faixa
                </Button>
              </div>

              {intervaloSel ? (
                <p className="text-[11px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg px-2.5 py-1.5">
                  {intervaloSel.loja_dentro
                    ? `Loja dentro do bairro · pontos até ${intervaloSel.dist_max_km.toFixed(1)} km`
                    : `Distância loja→bairro: ${intervaloSel.dist_min_km.toFixed(1)}–${intervaloSel.dist_max_km.toFixed(1)} km`}
                </p>
              ) : lojaOk ? null : (
                <p className="text-[11px] text-amber-700 dark:text-amber-300">
                  Cadastre lat/lng da loja acima para sugerir faixas pela
                  distância.
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-gray-500">Passo:</span>
                <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                  {([1, 2] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPassoSugestao(p)}
                      className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                        passoSugestao === p
                          ? "bg-emerald-600 text-white"
                          : "bg-white dark:bg-gray-900 text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
                      }`}
                    >
                      {p} km
                    </button>
                  ))}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={!lojaOk}
                  onClick={sugerirFaixasPelaLoja}
                >
                  <Sparkles size={14} className="mr-1" /> Sugerir pela loja
                </Button>
              </div>

              {faixasEdit.length === 0 ? (
                <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/80 dark:bg-amber-950/20 dark:border-amber-800 px-3 py-4 text-center">
                  <p className="text-sm text-amber-800 dark:text-amber-200 font-medium">
                    Sem faixas = sem entrega neste bairro
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    className="mt-3"
                    onClick={adicionarFaixa}
                  >
                    <Plus size={14} className="mr-1" /> Criar primeira faixa
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-[1fr_1fr_36px] gap-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400 px-0.5">
                    <span>Até (km)</span>
                    <span>Taxa (R$)</span>
                    <span />
                  </div>
                  {faixasEdit.map((f, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-[1fr_1fr_36px] gap-2 items-center"
                    >
                      <Input
                        type="number"
                        min={0.1}
                        step="0.1"
                        value={f.ate_km}
                        aria-label={`Faixa ${i + 1} até km`}
                        onChange={(e) => {
                          const next = [...faixasEdit];
                          next[i] = { ...f, ate_km: Number(e.target.value) };
                          setFaixasEdit(next);
                        }}
                      />
                      <Input
                        type="number"
                        min={0}
                        step="0.5"
                        value={f.taxa}
                        aria-label={`Faixa ${i + 1} taxa`}
                        onChange={(e) => {
                          const next = [...faixasEdit];
                          next[i] = { ...f, taxa: Number(e.target.value) };
                          setFaixasEdit(next);
                        }}
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="text-red-600"
                        disabled={faixasEdit.length <= 1}
                        onClick={() =>
                          setFaixasEdit(faixasEdit.filter((_, j) => j !== i))
                        }
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  ))}
                  <p className="text-[11px] text-gray-400">
                    Ex.: até 2 km = R$ 7 · até 4 km = R$ 10 · até 5 km = R$ 15
                  </p>
                </div>
              )}
            </div>

            {/* Descontos */}
            <div className="p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wide text-gray-500">
                    3. Descontos (opcional)
                  </h4>
                  <p className="text-[11px] text-gray-400 mt-1">
                    Linhas por valor do carrinho. Vale a maior em R$.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setDescontosEdit([
                      ...descontosEdit,
                      novoDescontoFreteBairro(),
                    ])
                  }
                >
                  <Plus size={14} className="mr-1" /> Linha
                </Button>
              </div>

              {descontosEdit.length === 0 ? (
                <p className="text-xs text-gray-400 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 px-3 py-4 text-center">
                  Nenhum desconto. O cliente paga a faixa cheia (+ chuva).
                </p>
              ) : (
                <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-0.5">
                  {descontosEdit.map((d, i) => (
                    <div
                      key={d.id}
                      className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 flex flex-col gap-2 bg-gray-50/50 dark:bg-gray-900/20"
                    >
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-semibold text-gray-500">
                            Pedido mín. (R$)
                          </label>
                          <Input
                            type="number"
                            min={0}
                            step="1"
                            className="mt-1"
                            value={d.pedido_minimo}
                            onChange={(e) => {
                              const next = [...descontosEdit];
                              next[i] = {
                                ...d,
                                pedido_minimo: Number(e.target.value),
                              };
                              setDescontosEdit(next);
                            }}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-gray-500">
                            Até km
                          </label>
                          <Input
                            type="number"
                            min={0.1}
                            step="0.1"
                            className="mt-1"
                            placeholder="Qualquer"
                            value={d.ate_km ?? ""}
                            onChange={(e) => {
                              const raw = e.target.value.trim();
                              const next = [...descontosEdit];
                              next[i] = {
                                ...d,
                                ate_km: raw === "" ? null : Number(raw),
                              };
                              setDescontosEdit(next);
                            }}
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="flex-1 min-w-[120px]">
                          <label className="text-[10px] font-semibold text-gray-500">
                            Tipo
                          </label>
                          <select
                            className="mt-1 w-full h-9 rounded-md border border-gray-200 dark:border-gray-700 bg-transparent px-2 text-sm"
                            value={d.tipo}
                            onChange={(e) => {
                              const tipo =
                                e.target.value as DescontoFreteBairro["tipo"];
                              const next = [...descontosEdit];
                              next[i] = {
                                ...d,
                                tipo:
                                  tipo === "gratis" || tipo === "percentual"
                                    ? tipo
                                    : "fixo",
                              };
                              setDescontosEdit(next);
                            }}
                          >
                            <option value="gratis">Frete grátis</option>
                            <option value="fixo">− R$ fixo</option>
                            <option value="percentual">− %</option>
                          </select>
                        </div>
                        {d.tipo !== "gratis" ? (
                          <div className="w-24">
                            <label className="text-[10px] font-semibold text-gray-500">
                              {d.tipo === "percentual" ? "%" : "R$"}
                            </label>
                            <Input
                              type="number"
                              min={0}
                              step="0.5"
                              className="mt-1"
                              value={d.valor}
                              onChange={(e) => {
                                const next = [...descontosEdit];
                                next[i] = {
                                  ...d,
                                  valor: Number(e.target.value),
                                };
                                setDescontosEdit(next);
                              }}
                            />
                          </div>
                        ) : null}
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="text-red-600"
                          onClick={() =>
                            setDescontosEdit(
                              descontosEdit.filter((_, j) => j !== i),
                            )
                          }
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      ) : (
        <p className="text-sm text-center text-gray-400 py-2">
          Selecione um bairro no mapa ou nas listas para configurar raio, faixas
          e descontos.
        </p>
      )}
    </div>
  );
}
