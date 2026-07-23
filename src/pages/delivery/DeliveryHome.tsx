import { Clock, MapPin, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useDeliveryCliente } from "../../hooks/useDeliveryCliente";
import {
  buscarCep,
  listarEnderecos,
  type EnderecoCliente,
} from "../../lib/deliveryCliente";
import { buscarDeliveryConfig } from "../../lib/deliveryConfig";
import type { DeliveryConfig } from "../../lib/deliveryFrete";
import { produtoEstaEsgotado } from "../../lib/estoque";
import { supabase } from "../../lib/supabase";
import { lerEnderecoDeliveryLocal } from "../../lib/deliveryGuestStorage";
import { TagMedidaProduto } from "../../components/TagMedidaProduto";
import {
  formatarCep,
  lerRascunhoEndereco,
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
  preco_promocional: number | null;
  em_promocao: boolean | null;
  imagem_url: string | null;
  categoria_id: string | null;
  ativo: boolean;
  ordem?: number | null;
  medida_valor?: number | null;
  medida_unidade?: string | null;
  disponibilidade?: string | null;
}

function CardProduto({
  produto,
  onClick,
}: {
  produto: Produto;
  onClick: () => void;
}) {
  const promo =
    produto.em_promocao &&
    produto.preco_promocional != null &&
    produto.preco_promocional > 0;
  const preco = promo
    ? Number(produto.preco_promocional)
    : Number(produto.preco);

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex gap-3 w-full bg-white rounded-2xl border border-zinc-200 p-3 text-left active:scale-[0.99] transition"
    >
      <div className="relative h-24 w-24 shrink-0 rounded-xl overflow-hidden bg-zinc-100">
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
        <TagMedidaProduto
          valor={produto.medida_valor}
          unidade={produto.medida_unidade}
          variante="overlay"
          tamanho="sm"
          className="absolute top-1.5 left-1.5 z-10"
        />
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        <h3 className="font-bold leading-snug">{produto.nome}</h3>
        <TagMedidaProduto
          valor={produto.medida_valor}
          unidade={produto.medida_unidade}
          tamanho="sm"
          className="mt-1 self-start"
        />
        {produto.descricao && (
          <p className="text-xs text-zinc-500 line-clamp-2 mt-0.5">
            {produto.descricao}
          </p>
        )}
        <div className="mt-auto pt-2 flex items-baseline gap-2">
          <span className="font-black text-red-600">
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
  const { logado, cadastroCompleto, cliente, carregando } =
    useDeliveryCliente();
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
  const scrollLockRef = useRef(false);
  const chipRefs = useRef<Record<string, HTMLButtonElement | null>>({});

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
        const prods = (
          (prodRes.data || []) as Array<
            Produto & {
              controlar_estoque?: boolean | null;
              quantidade_estoque?: number | null;
            }
          >
        ).filter((p) => !produtoEstaEsgotado(p));
        setProdutos(prods);
        const cats = ((catRes.data || []) as Categoria[])
          .slice()
          .sort((a, b) => a.ordem - b.ordem)
          .filter((c) => prods.some((p) => p.categoria_id === c.id));
        setCategorias(cats);
        if (cats[0]) setCatAtiva(cats[0].id);
      } catch (e) {
        console.error(e);
        toast.error("Falha ao carregar cardápio.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      if (cliente?.id) {
        try {
          const lista = await listarEnderecos(cliente.id);
          const padrao = lista.find((e) => e.padrao) || lista[0] || null;
          if (padrao) {
            setEndereco(padrao);
            return;
          }
        } catch (e) {
          console.error(e);
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
      setEndereco(null);
    })();
  }, [cliente?.id]);

  const secoes = useMemo(() => {
    return categorias
      .map((categoria) => ({
        categoria,
        produtos: produtos
          .filter((p) => p.categoria_id === categoria.id)
          .sort((a, b) => {
            const diff = (a.ordem ?? 0) - (b.ordem ?? 0);
            if (diff !== 0) return diff;
            return a.nome.localeCompare(b.nome, "pt-BR");
          }),
      }))
      .filter((s) => s.produtos.length > 0);
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
      navigate("/delivery/endereco", {
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

  if (loading || carregando) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-red-600 border-t-transparent rounded-full" />
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
      <section className="rounded-2xl bg-white border border-zinc-200 p-3 space-y-2">
        {!temEnderecoCompleto ? (
          <>
            <div className="flex items-start gap-2">
              <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
                <MapPin size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-bold text-sm">Onde você quer receber?</h2>
                  {tempoEntrega != null && tempoEntrega > 0 && (
                    <span className="inline-flex items-center gap-1 shrink-0 text-xs font-medium text-zinc-500">
                      <Clock size={12} />
                      ~{tempoEntrega} min
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
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void buscarCepHome();
                }}
              />
              <Button
                className="bg-red-600 hover:bg-red-700 shrink-0"
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
              navigate("/delivery/endereco", {
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
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
              <MapPin size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  Entregar em
                </p>
                {tempoEntrega != null && tempoEntrega > 0 && (
                  <span className="inline-flex items-center gap-1 shrink-0 text-xs font-medium text-zinc-500">
                    <Clock size={12} />
                    ~{tempoEntrega} min
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
            <span className="text-xs font-semibold text-red-600 shrink-0">
              Alterar
            </span>
          </button>
        )}

        <p className="text-[11px] text-zinc-400 pl-12">
          Pedido mínimo R$ {pedidoMinimo.toFixed(2).replace(".", ",")}
        </p>

        {logado && !cadastroCompleto && (
          <div className="pl-12">
            <button
              type="button"
              className="text-[11px] font-semibold text-red-600"
              onClick={() => navigate("/delivery/cadastro")}
            >
              Completar cadastro
            </button>
          </div>
        )}
      </section>

      {/* Barra sticky: atalho de scroll (não filtra) */}
      {secoes.length > 0 && (
        <div className="sticky top-14 z-20 -mx-4 px-4 py-2 bg-[#f4f4f5]/95 backdrop-blur border-b border-zinc-200/80">
          <div className="flex gap-2 overflow-x-auto scrollbar-none">
            {secoes.map(({ categoria }) => (
              <button
                key={categoria.id}
                type="button"
                ref={(el) => {
                  chipRefs.current[categoria.id] = el;
                }}
                onClick={() => irParaCategoria(categoria.id)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-semibold border transition ${
                  catAtiva === categoria.id
                    ? "bg-zinc-900 text-white border-zinc-900"
                    : "bg-white border-zinc-200 text-zinc-700"
                }`}
              >
                {categoria.nome}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-8">
        {secoes.map(({ categoria, produtos: itens }) => (
          <section
            key={categoria.id}
            id={`cat-${categoria.id}`}
            className="scroll-mt-28 space-y-3"
          >
            <h2 className="text-lg font-black tracking-tight">
              {categoria.nome}
            </h2>
            <div className="grid grid-cols-1 gap-3">
              {itens.map((p) => (
                <CardProduto
                  key={p.id}
                  produto={p}
                  onClick={() => navigate(`/delivery/item/${p.id}`)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
