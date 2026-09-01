import { Bike, Clock, MapPin, Search, Sparkles, Tag } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { TagMedidaProduto } from "../../components/TagMedidaProduto";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useClienteDeliverySessao } from "../../hooks/useClienteDeliverySessao";
import { track } from "../../lib/analytics";
import {
  avaliarEntregaDelivery,
  listarBairrosFreteGeojson,
  taxasDosBairrosGeojson,
} from "../../lib/deliveryBairros";
import {
  buscarCep,
  formatarCep,
  listarEnderecos,
  type EnderecoCliente,
} from "../../lib/deliveryCliente";
import { buscarDeliveryConfig } from "../../lib/deliveryConfig";
import {
  formatarDistanciaEntrega,
  taxaMinimaConfig,
  type DeliveryConfig,
} from "../../lib/deliveryFrete";
import {
  lerEnderecoDeliveryLocal,
  salvarEnderecoDeliveryLocal,
} from "../../lib/deliveryGuestStorage";
import { precoEfetivoCanal } from "../../lib/precificacao";
import { produtoEstaEsgotado } from "../../lib/estoque";
import {
  buscarDisponibilidadeEncomendaLote,
  type DisponibilidadeEncomenda,
} from "../../lib/encomendaProgramada";
import { buscarStatusLoja, type StatusLoja } from "../../lib/lojaStatus";
import { supabase } from "../../lib/supabase";
import {
  lerRascunhoEndereco,
  salvarRascunhoEndereco,
  type RascunhoEnderecoDelivery,
} from "./DeliveryEndereco";

interface Categoria {
  id: string;
  nome: string;
  ordem: number;
}

interface Produto {
  id: string;
  nome: string;
  descricao: string | null;
  preco: number;
  preco_delivery?: number | null;
  preco_ifood?: number | null;
  preco_promocional: number | null;
  em_promocao: boolean | null;
  destaque?: boolean | null;
  imagem_url: string | null;
  categoria_id: string | null;
  ativo: boolean;
  ordem?: number | null;
  medida_valor?: number | null;
  medida_unidade?: string | null;
  disponibilidade?: string | null;
}

const CATEGORIA_DESTAQUES_ID = "__destaques__";
const CATEGORIA_DESTAQUES_NOME = "Especiais";

function ordenarProdutos(a: Produto, b: Produto) {
  const diff = (a.ordem ?? 0) - (b.ordem ?? 0);
  if (diff !== 0) return diff;
  return a.nome.localeCompare(b.nome, "pt-BR");
}

function CardProduto({
  produto,
  onClick,
  variante = "normal",
}: {
  produto: Produto;
  onClick: () => void;
  variante?: "normal" | "destaque";
}) {
  const preco = precoEfetivoCanal(produto, "delivery");
  const promo = false; // promo só no canal loja nesta fase
  const ehDestaque = variante === "destaque";
  const mostrarEspecial = Boolean(produto.destaque);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex gap-3 w-full bg-white rounded-2xl p-3 text-left active:scale-[0.99] transition ${
        ehDestaque
          ? "border-2 border-amber-400/80 shadow-sm"
          : "border border-zinc-200"
      }`}
    >
      <div
        className={`relative shrink-0 rounded-xl overflow-hidden bg-zinc-100 ${
          ehDestaque ? "h-32 w-32 sm:h-36 sm:w-36" : "h-24 w-24"
        }`}
      >
        {produto.imagem_url ? (
          <img
            src={produto.imagem_url}
            alt={produto.nome}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-zinc-300 text-xs">
            sem foto
          </div>
        )}
        {promo && (
          <span className="absolute top-1.5 left-1.5 z-10 inline-flex items-center gap-0.5 rounded-md bg-cookie-primary px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white shadow">
            <Tag size={9} strokeWidth={3} />
            Promo
          </span>
        )}
        {mostrarEspecial && (
          <span
            className={`absolute z-10 inline-flex items-center gap-0.5 rounded-md bg-amber-500 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white shadow ${
              promo ? "top-1.5 left-[3.75rem]" : "top-1.5 left-1.5"
            }`}
          >
            <Sparkles size={9} strokeWidth={3} />
            Especial
          </span>
        )}
        <TagMedidaProduto
          valor={produto.medida_valor}
          unidade={produto.medida_unidade}
          variante="overlay"
          tamanho="sm"
          className={`absolute z-10 ${
            promo || mostrarEspecial
              ? promo && mostrarEspecial
                ? "top-1.5 left-[7.25rem]"
                : "top-1.5 left-[3.75rem]"
              : "top-1.5 left-1.5"
          }`}
        />
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        <h3
          className={`font-bold leading-snug ${
            ehDestaque ? "text-base" : "text-sm"
          }`}
        >
          {produto.nome}
        </h3>
        <TagMedidaProduto
          valor={produto.medida_valor}
          unidade={produto.medida_unidade}
          tamanho="sm"
          className="mt-1 self-start"
        />
        {produto.descricao && (
          <p
            className="text-xs text-zinc-500 mt-0.5 line-clamp-2"
          >
            {produto.descricao}
          </p>
        )}
        <div className="mt-auto pt-2 flex items-baseline gap-2">
          <span
            className={`font-black text-cookie-primary ${
              ehDestaque ? "text-base" : ""
            }`}
          >
            R$ {preco.toFixed(2).replace(".", ",")}
          </span>
          {promo && (
            <span className="text-xs text-zinc-400 line-through">
              R$ {Number(produto.preco).toFixed(2).replace(".", ",")}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

export function DeliveryHome() {
  const navigate = useNavigate();
  const { cliente, carregando: carregandoCliente } = useClienteDeliverySessao();
  const [config, setConfig] = useState<DeliveryConfig | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [catAtiva, setCatAtiva] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [endereco, setEndereco] = useState<
    EnderecoCliente | RascunhoEnderecoDelivery | null
  >(null);
  const [cepInput, setCepInput] = useState("");
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [freteInfo, setFreteInfo] = useState<{
    texto: string;
    ok: boolean;
  } | null>(null);
  const [taxaMinima, setTaxaMinima] = useState<number | null>(null);
  const [statusLoja, setStatusLoja] = useState<StatusLoja | null>(null);
  const scrollLockRef = useRef(false);
  const chipRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    track("page_view", { canal: "delivery", props: { path: "/" } });
  }, []);

  useEffect(() => {
    let ativo = true;
    const consultar = () => {
      void buscarStatusLoja().then((status) => {
        if (ativo) setStatusLoja(status);
      });
    };
    consultar();
    const intervalo = window.setInterval(consultar, 60_000);
    return () => {
      ativo = false;
      window.clearInterval(intervalo);
    };
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        const [cfg, catRes, prodRes] = await Promise.all([
          buscarDeliveryConfig(),
          supabase.from("categorias").select("id, nome, ordem").order("ordem"),
          supabase
            .from("produtos")
            .select("*")
            .eq("ativo", true)
            .in("disponibilidade", ["levar", "ambos"]),
        ]);
        setConfig(cfg);
        try {
          if (cfg.modo_frete === "bairro") {
            const fc = await listarBairrosFreteGeojson();
            setTaxaMinima(taxaMinimaConfig(cfg, taxasDosBairrosGeojson(fc)));
          } else {
            setTaxaMinima(taxaMinimaConfig(cfg));
          }
        } catch {
          setTaxaMinima(taxaMinimaConfig(cfg));
        }
        const brutos = (prodRes.data || []) as Array<
          Produto & {
            controlar_estoque?: boolean | null;
            quantidade_estoque?: number | null;
            encomenda_programada?: boolean | null;
          }
        >;
        const idsEncomenda = brutos
          .filter((p) => p.encomenda_programada)
          .map((p) => p.id);
        let mapaDisp: Record<string, DisponibilidadeEncomenda> = {};
        if (idsEncomenda.length > 0) {
          try {
            mapaDisp = await buscarDisponibilidadeEncomendaLote(idsEncomenda);
          } catch {
            mapaDisp = {};
          }
        }
        const prods = brutos.filter(
          (p) => !produtoEstaEsgotado(p, mapaDisp[p.id]),
        );
        setProdutos(prods);
        const cats = ((catRes.data || []) as Categoria[])
          .slice()
          .sort((a, b) => a.ordem - b.ordem)
          .filter((c) => prods.some((p) => p.categoria_id === c.id));
        setCategorias(cats);
        const temDestaque = prods.some((p) => p.destaque);
        if (temDestaque) setCatAtiva(CATEGORIA_DESTAQUES_ID);
        else if (cats[0]) setCatAtiva(cats[0].id);
      } catch (e) {
        console.error(e);
        toast.error("Falha ao carregar cardápio.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /** Após login por telefone: puxa endereço cadastrado e atualiza home + storage. */
  useEffect(() => {
    if (carregandoCliente) return;

    void (async () => {
      if (cliente?.id) {
        try {
          const lista = await listarEnderecos(cliente.id);
          const padrao = lista.find((e) => e.padrao) || lista[0] || null;
          if (padrao) {
            setEndereco(padrao);
            salvarEnderecoDeliveryLocal({
              cep: padrao.cep,
              rua: padrao.rua,
              numero: padrao.numero,
              bairro: padrao.bairro,
              cidade: padrao.cidade,
              uf: padrao.uf,
              complemento: padrao.complemento || "",
              referencia: padrao.referencia || "",
              latitude: padrao.latitude,
              longitude: padrao.longitude,
            });
            salvarRascunhoEndereco({
              cep: padrao.cep,
              rua: padrao.rua,
              numero: padrao.numero,
              bairro: padrao.bairro,
              cidade: padrao.cidade,
              uf: padrao.uf,
              complemento: padrao.complemento || undefined,
              referencia: padrao.referencia || undefined,
              latitude: padrao.latitude,
              longitude: padrao.longitude,
            });
            return;
          }
        } catch (e) {
          console.error("[HOME] endereços cliente", e);
        }
      }

      const rascunho = lerRascunhoEndereco();
      if (rascunho?.rua) {
        setEndereco(rascunho);
        return;
      }
      const local = lerEnderecoDeliveryLocal();
      if (local) {
        setEndereco({
          cep: local.cep,
          rua: local.rua,
          numero: local.numero,
          bairro: local.bairro,
          cidade: local.cidade,
          uf: local.uf,
          complemento: local.complemento || undefined,
          referencia: local.referencia || undefined,
          latitude: local.latitude,
          longitude: local.longitude,
        });
        return;
      }
      if (!cliente?.id) setEndereco(null);
    })();
  }, [cliente?.id, carregandoCliente]);

  useEffect(() => {
    if (!config) {
      setFreteInfo(null);
      return;
    }
    const lat = endereco && "latitude" in endereco ? endereco.latitude : null;
    const lng = endereco && "longitude" in endereco ? endereco.longitude : null;
    if (lat == null || lng == null) {
      setFreteInfo(null);
      return;
    }
    let cancelado = false;
    void (async () => {
      const r = await avaliarEntregaDelivery(config, lat, lng, 0);
      if (cancelado) return;
      if (!r.ok) {
        setFreteInfo({ ok: false, texto: r.erro });
        return;
      }
      const dist =
        r.distancia_km != null
          ? ` · ${formatarDistanciaEntrega(r.distancia_km)}`
          : "";
      const bairro = r.bairro_nome ? ` · ${r.bairro_nome}` : "";
      setFreteInfo({
        ok: true,
        texto:
          r.taxa <= 0
            ? `Frete grátis${dist}${bairro}`
            : `Frete R$ ${r.taxa.toFixed(2).replace(".", ",")}${dist}${bairro}`,
      });
    })();
    return () => {
      cancelado = true;
    };
  }, [config, endereco]);

  const secoes = useMemo(() => {
    const produtosDestaque = produtos
      .filter((p) => p.destaque)
      .slice()
      .sort(ordenarProdutos);

    const base = categorias
      .map((categoria) => ({
        categoria,
        produtos: produtos
          .filter((p) => p.categoria_id === categoria.id)
          .slice()
          .sort(ordenarProdutos),
        destaque: false as boolean,
      }))
      .filter((s) => s.produtos.length > 0);

    if (produtosDestaque.length === 0) return base;

    return [
      {
        categoria: {
          id: CATEGORIA_DESTAQUES_ID,
          nome: CATEGORIA_DESTAQUES_NOME,
          ordem: -1,
        },
        produtos: produtosDestaque,
        destaque: true,
      },
      ...base,
    ];
  }, [categorias, produtos]);

  // Destaca a categoria visível no scroll
  useEffect(() => {
    if (secoes.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (scrollLockRef.current) return;
        const visiveis = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) =>
              Math.abs(a.boundingClientRect.top) -
              Math.abs(b.boundingClientRect.top),
          );
        const top = visiveis[0];
        if (!top?.target.id) return;
        const id = top.target.id.replace("cat-", "");
        setCatAtiva(id);
      },
      {
        root: null,
        // header (56) + barra categorias (~48) + folga
        rootMargin: "-110px 0px -55% 0px",
        threshold: [0, 0.1, 0.25],
      },
    );

    for (const s of secoes) {
      const el = document.getElementById(`cat-${s.categoria.id}`);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [secoes]);

  // Mantém o chip ativo visível na barra horizontal
  useEffect(() => {
    if (!catAtiva) return;
    chipRefs.current[catAtiva]?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [catAtiva]);

  const irParaCategoria = (categoriaId: string) => {
    setCatAtiva(categoriaId);
    scrollLockRef.current = true;
    const el = document.getElementById(`cat-${categoriaId}`);
    if (el) {
      const headerOffset = 112; // header + sticky cats
      const top =
        el.getBoundingClientRect().top + window.scrollY - headerOffset;
      window.scrollTo({ top, behavior: "smooth" });
    }
    window.setTimeout(() => {
      scrollLockRef.current = false;
    }, 600);
  };

  const buscarCepHome = async () => {
    const limpo = cepInput.replace(/\D/g, "");
    if (limpo.length !== 8) {
      toast.warning("Informe um CEP com 8 dígitos.");
      return;
    }
    try {
      setBuscandoCep(true);
      const dados = await buscarCep(limpo);
      if (!dados) {
        toast.error("CEP não encontrado. Confira e tente de novo.");
        return;
      }
      navigate("/endereco", {
        state: {
          cep: limpo,
          rua: dados.rua,
          bairro: dados.bairro,
          cidade: dados.cidade,
          uf: dados.uf,
        },
      });
    } catch {
      toast.error("Falha ao consultar o CEP.");
    } finally {
      setBuscandoCep(false);
    }
  };

  if (loading || carregandoCliente) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-cookie-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (config && !config.ativo) {
    return (
      <div className="text-center py-16 space-y-3">
        <h1 className="text-2xl font-black">Delivery indisponível</h1>
        <p className="text-zinc-500 text-sm">
          Estamos temporariamente sem entregas online. Tente mais tarde.
        </p>
      </div>
    );
  }

  const temEnderecoCompleto = Boolean(
    endereco && "numero" in endereco && endereco.numero && endereco.rua,
  );

  const tempoEntrega = config?.tempo_estimado_min;
  const pedidoMinimo = config?.pedido_minimo ?? 0;

  return (
    <div className="space-y-5">
      {statusLoja && !statusLoja.aberta && (
        <div className="rounded-2xl bg-cookie-primary px-4 py-3 text-center text-sm font-bold text-white">
          Estamos fechados no momento.
          {statusLoja.motivo ? ` ${statusLoja.motivo}` : ""} Você pode montar o
          pedido e agendar um horário de hoje no checkout.
        </div>
      )}

      <section className="rounded-2xl bg-white border border-zinc-200 p-3 space-y-2">
        {!temEnderecoCompleto ? (
          <>
            <div className="flex items-start gap-2">
              <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cookie-primary/10 text-cookie-primary">
                <MapPin size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-bold text-sm">Onde você quer receber?</h2>
                  {tempoEntrega != null && tempoEntrega > 0 && (
                    <span className="inline-flex items-center gap-1 shrink-0 text-xs font-medium text-zinc-500">
                      <Clock size={12} />~{tempoEntrega} min
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Digite o CEP — buscamos o endereço.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Input
                value={cepInput}
                onChange={(e) => setCepInput(formatarCep(e.target.value))}
                placeholder="00000-000"
                inputMode="numeric"
                autoComplete="postal-code"
                maxLength={9}
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void buscarCepHome();
                }}
              />
              <Button
                className="bg-cookie-primary hover:bg-cookie-primary-hover shrink-0"
                disabled={buscandoCep}
                onClick={() => void buscarCepHome()}
              >
                {buscandoCep ? (
                  "…"
                ) : (
                  <>
                    <Search size={16} className="mr-1" />
                    Buscar
                  </>
                )}
              </Button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() =>
              navigate("/endereco", {
                state: {
                  cep: endereco!.cep,
                  rua: endereco!.rua,
                  bairro: endereco!.bairro,
                  cidade: endereco!.cidade,
                  uf: endereco!.uf,
                  numero: "numero" in endereco! ? endereco!.numero : undefined,
                  complemento:
                    "complemento" in endereco!
                      ? endereco!.complemento || undefined
                      : undefined,
                  referencia:
                    "referencia" in endereco!
                      ? endereco!.referencia || undefined
                      : undefined,
                },
              })
            }
            className="w-full flex items-center gap-3 text-left"
          >
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cookie-primary/10 text-cookie-primary">
              <MapPin size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  Entregar em
                </p>
                {tempoEntrega != null && tempoEntrega > 0 && (
                  <span className="inline-flex items-center gap-1 shrink-0 text-xs font-medium text-zinc-500">
                    <Clock size={12} />~{tempoEntrega} min
                  </span>
                )}
              </div>
              <p className="font-semibold text-sm truncate">
                {endereco!.rua}
                {"numero" in endereco! && endereco!.numero
                  ? `, ${endereco!.numero}`
                  : ""}
              </p>
              <p className="text-xs text-zinc-500 truncate">
                {endereco!.bairro} — {endereco!.cidade}/{endereco!.uf}
              </p>
            </div>
            <span className="text-xs font-semibold text-cookie-primary shrink-0">
              Alterar
            </span>
          </button>
        )}

        <p className="text-[11px] text-zinc-500 pl-12 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {freteInfo ? (
            <span
              className={
                freteInfo.ok
                  ? "inline-flex items-center gap-1 text-zinc-600"
                  : "inline-flex items-center gap-1 text-amber-700"
              }
            >
              <Bike size={11} />
              {freteInfo.texto}
            </span>
          ) : taxaMinima != null ? (
            <span className="inline-flex items-center gap-1">
              <Bike size={11} />
              Frete a partir de R$ {taxaMinima.toFixed(2).replace(".", ",")}
            </span>
          ) : null}
          {pedidoMinimo > 0 && (
            <span>
              Pedido mínimo R$ {pedidoMinimo.toFixed(2).replace(".", ",")}
            </span>
          )}
        </p>
      </section>

      {/* Barra sticky: atalho de scroll (não filtra) */}
      {secoes.length > 0 && (
        <div className="sticky top-14 z-20 -mx-4 px-4 py-2 bg-[#f4f4f5]/95 backdrop-blur border-b border-zinc-200/80">
          <div className="flex gap-2 overflow-x-auto scrollbar-none">
            {secoes.map(({ categoria, destaque }) => {
              const ativa = catAtiva === categoria.id;
              return (
                <button
                  key={categoria.id}
                  type="button"
                  ref={(el) => {
                    chipRefs.current[categoria.id] = el;
                  }}
                  onClick={() => irParaCategoria(categoria.id)}
                  className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border transition ${
                    ativa
                      ? destaque
                        ? "bg-amber-500 text-white border-amber-500"
                        : "bg-zinc-900 text-white border-zinc-900"
                      : destaque
                        ? "bg-amber-50 border-amber-300 text-amber-900"
                        : "bg-white border-zinc-200 text-zinc-700"
                  }`}
                >
                  {destaque && <Sparkles size={13} strokeWidth={2.5} />}
                  {categoria.nome}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-8">
        {secoes.map(({ categoria, produtos: itens, destaque }) => (
          <section
            key={categoria.id}
            id={`cat-${categoria.id}`}
            className="scroll-mt-28 space-y-3"
          >
            <div>
              <h2 className="text-lg font-black tracking-tight inline-flex items-center gap-2">
                {destaque && (
                  <Sparkles size={18} className="text-amber-500 shrink-0" />
                )}
                {categoria.nome}
              </h2>
              {destaque && (
                <p className="text-xs text-amber-800/80 font-medium mt-0.5">
                  Seleção da casa
                </p>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3">
              {itens.map((p) => (
                <CardProduto
                  key={`${destaque ? "d" : "n"}-${p.id}`}
                  produto={p}
                  variante={destaque ? "destaque" : "normal"}
                  onClick={() => navigate(`/item/${p.id}`)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
