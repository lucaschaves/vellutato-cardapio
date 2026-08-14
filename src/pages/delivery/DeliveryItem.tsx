import { Check, Gift, Minus, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { produtoEstaEsgotado } from "../../lib/estoque";
import { TagMedidaProduto } from "../../components/TagMedidaProduto";
import { supabase } from "../../lib/supabase";
import { track } from "../../lib/analytics";
import { adicionalCompativelComModo } from "../../lib/disponibilidadeProduto";
import {
  buscarOfertasVendaCruzada,
  calcularPrecoComDescontoVendaCruzada,
  type OfertaVendaCruzada,
} from "../../lib/vendasCruzadas";
import {
  useCartStore,
  type AdicionalSelecionado,
} from "../../store/useCartStore";
import {
  maxAdicionaisProduto,
  rotuloAdicionaisProduto,
} from "../../lib/adicionaisProduto";
import {
  buscarEstruturaCombo,
  calcularDeltaOpcao,
  rotuloEscolhasGrupo,
  somarDeltasCombo,
  validarEscolhasCombo,
  type ComboGrupo,
  type EscolhaCombo,
} from "../../lib/combos";

interface Adicional {
  id: string;
  nome: string;
  preco: number;
  disponivel: boolean;
  disponibilidade?: string | null;
}

interface ProdutoItem {
  id: string;
  nome: string;
  descricao: string | null;
  preco: number;
  preco_promocional: number | null;
  em_promocao: boolean | null;
  imagem_url: string | null;
  adicional_obrigatorio: boolean | null;
  adicional_maximo: number | null;
  disponibilidade?: string | null;
  medida_valor?: number | null;
  medida_unidade?: string | null;
  tipo?: "simples" | "combo" | null;
}

function precosOferta(oferta: OfertaVendaCruzada) {
  const alvo = oferta.produto_alvo;
  const precoCheio =
    alvo.em_promocao && alvo.preco_promocional
      ? Number(alvo.preco_promocional)
      : Number(alvo.preco);
  const precoOferta = calcularPrecoComDescontoVendaCruzada(
    precoCheio,
    oferta.tipo,
    oferta.valor_desconto,
  );
  return {
    original: Number(alvo.preco),
    cheio: precoCheio,
    oferta: precoOferta,
  };
}

export function DeliveryItem() {
  const { id } = useParams();
  const navigate = useNavigate();
  const adicionarItem = useCartStore((s) => s.adicionarItem);

  const [produto, setProduto] = useState<ProdutoItem | null>(null);
  const [adicionais, setAdicionais] = useState<Adicional[]>([]);
  const [selecionados, setSelecionados] = useState<AdicionalSelecionado[]>([]);
  const [ofertas, setOfertas] = useState<OfertaVendaCruzada[]>([]);
  const [ofertasSelecionadas, setOfertasSelecionadas] = useState<string[]>([]);
  const [qtd, setQtd] = useState(1);
  const [carregando, setCarregando] = useState(true);
  const [gruposCombo, setGruposCombo] = useState<ComboGrupo[]>([]);
  const [escolhasCombo, setEscolhasCombo] = useState<EscolhaCombo[]>([]);
  const [carregandoCombo, setCarregandoCombo] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelado = false;

    void (async () => {
      try {
        setCarregando(true);
        const [prodRes, adcRes, ofertasRes] = await Promise.all([
          supabase
            .from("produtos")
            .select(
              "id, nome, descricao, preco, preco_promocional, em_promocao, imagem_url, adicional_obrigatorio, adicional_maximo, disponibilidade, medida_valor, medida_unidade, tipo",
            )
            .eq("id", id)
            .single(),
          supabase
            .from("produto_adicionais")
            .select("adicionais ( id, nome, preco, disponivel, disponibilidade )")
            .eq("produto_id", id),
          buscarOfertasVendaCruzada(id).catch(() => [] as OfertaVendaCruzada[]),
        ]);

        if (cancelado) return;
        if (prodRes.error) throw prodRes.error;
        const prod = prodRes.data as ProdutoItem;
        if (
          prod.disponibilidade !== "levar" &&
          prod.disponibilidade !== "ambos"
        ) {
          toast.error("Este produto não está disponível no delivery.");
          navigate("/");
          return;
        }
        setProduto(prod);
        track("product_view", {
          canal: "delivery",
          produtoId: prod.id,
          props: { nome: prod.nome },
        });

        const listaAdc = (adcRes.data || [])
          .flatMap((v) => {
            const raw = v.adicionais as Adicional | Adicional[] | null;
            if (!raw) return [];
            return Array.isArray(raw) ? raw : [raw];
          })
          .filter((a) => a.disponivel)
          .filter((a) => adicionalCompativelComModo(a.disponibilidade, "levar"))
          .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
        setAdicionais(listaAdc);
        setOfertas(
          ofertasRes.filter(
            (o) =>
              !produtoEstaEsgotado(o.produto_alvo) &&
              (o.produto_alvo.disponibilidade === "levar" ||
                o.produto_alvo.disponibilidade === "ambos" ||
                !o.produto_alvo.disponibilidade),
          ),
        );
        setSelecionados([]);
        setOfertasSelecionadas([]);
        setQtd(1);
        setGruposCombo([]);
        setEscolhasCombo([]);
        setCarregandoCombo(false);

        if (prod.tipo === "combo") {
          setCarregandoCombo(true);
          try {
            const grupos = await buscarEstruturaCombo(prod.id);
            if (cancelado) return;
            setGruposCombo(grupos);
            const iniciais: EscolhaCombo[] = [];
            for (const grupo of grupos) {
              if (grupo.max_escolhas !== 1 || grupo.min_escolhas < 1) continue;
              if (grupo.opcoes.length === 0) continue;
              const opcao = grupo.opcoes[0];
              iniciais.push({
                grupoId: grupo.id,
                grupoNome: grupo.nome,
                opcaoId: opcao.id,
                produtoId: opcao.produto_id,
                produtoNome: opcao.produto.nome,
                deltaPreco: calcularDeltaOpcao(opcao, grupo.preco_referencia),
              });
            }
            setEscolhasCombo(iniciais);
          } catch (erroCombo: unknown) {
            if (cancelado) return;
            console.error("[COMBO] Falha ao carregar estrutura:", erroCombo);
            toast.error("Não foi possível carregar as opções do combo.");
          } finally {
            if (!cancelado) setCarregandoCombo(false);
          }
        }
      } catch (e) {
        console.error(e);
        toast.error("Produto não encontrado");
        navigate("/");
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [id, navigate]);

  const ofertasAtivas = useMemo(
    () => ofertas.filter((o) => ofertasSelecionadas.includes(o.id)),
    [ofertas, ofertasSelecionadas],
  );

  if (carregando || !produto) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-cookie-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const promo =
    produto.em_promocao &&
    produto.preco_promocional != null &&
    produto.preco_promocional > 0;
  const precoBase = promo
    ? Number(produto.preco_promocional)
    : Number(produto.preco);
  const precoAdicionais = selecionados.reduce((s, a) => s + a.preco, 0);
  const precoCombo = somarDeltasCombo(escolhasCombo);
  const precoCruzadas = ofertasAtivas.reduce(
    (s, o) => s + precosOferta(o).oferta,
    0,
  );
  const total = (precoBase + precoAdicionais + precoCombo) * qtd + precoCruzadas;
  const ehCombo = produto.tipo === "combo";

  const alternarAdicional = (adc: Adicional) => {
    const max = maxAdicionaisProduto(produto?.adicional_maximo);
    setSelecionados((prev) => {
      if (prev.some((x) => x.id === adc.id)) {
        return prev.filter((x) => x.id !== adc.id);
      }
      const novo = {
        id: adc.id,
        nome: adc.nome,
        preco: Number(adc.preco),
      };
      if (max === 1) return [novo];
      if (max != null && prev.length >= max) {
        toast.error(`Você pode escolher no máximo ${max} adicional(is).`);
        return prev;
      }
      return [...prev, novo];
    });
  };

  const alternarOferta = (ofertaId: string) => {
    setOfertasSelecionadas((prev) =>
      prev.includes(ofertaId)
        ? prev.filter((idOferta) => idOferta !== ofertaId)
        : [...prev, ofertaId],
    );
  };

  const selecionarOpcaoCombo = (grupo: ComboGrupo, opcaoId: string) => {
    const opcao = grupo.opcoes.find((o) => o.id === opcaoId);
    if (!opcao) return;

    const escolha: EscolhaCombo = {
      grupoId: grupo.id,
      grupoNome: grupo.nome,
      opcaoId: opcao.id,
      produtoId: opcao.produto_id,
      produtoNome: opcao.produto.nome,
      deltaPreco: calcularDeltaOpcao(opcao, grupo.preco_referencia),
    };

    setEscolhasCombo((prev) => {
      const doGrupo = prev.filter((e) => e.grupoId === grupo.id);
      const qtdDesta = doGrupo.filter((e) => e.opcaoId === opcao.id).length;
      const foraDoGrupo = prev.filter((e) => e.grupoId !== grupo.id);

      if (grupo.max_escolhas <= 1) {
        if (qtdDesta > 0) {
          if (grupo.min_escolhas >= 1) return prev;
          return foraDoGrupo;
        }
        return [...foraDoGrupo, escolha];
      }

      if (doGrupo.length >= grupo.max_escolhas && qtdDesta === 0) {
        return [...foraDoGrupo, ...doGrupo.slice(0, -1), escolha];
      }

      if (qtdDesta > 0 && doGrupo.length < grupo.max_escolhas) {
        return [...prev, escolha];
      }

      if (qtdDesta > 0 && doGrupo.length >= grupo.max_escolhas) {
        let removida = false;
        return prev.filter((e) => {
          if (!removida && e.grupoId === grupo.id && e.opcaoId === opcao.id) {
            removida = true;
            return false;
          }
          return true;
        });
      }

      return [...prev, escolha];
    });
  };

  const voltar = () => navigate("/");

  const adicionar = () => {
    if (ehCombo) {
      const erroCombo = validarEscolhasCombo(gruposCombo, escolhasCombo);
      if (erroCombo) {
        toast.error(erroCombo);
        return;
      }
    }
    if (
      produto.adicional_obrigatorio &&
      adicionais.length > 0 &&
      selecionados.length === 0
    ) {
      toast.error("Escolha pelo menos um adicional para continuar.");
      return;
    }
    const maxAdc = maxAdicionaisProduto(produto.adicional_maximo);
    if (maxAdc != null && selecionados.length > maxAdc) {
      toast.error(`Escolha no máximo ${maxAdc} adicional(is).`);
      return;
    }

    adicionarItem({
      produtoId: produto.id,
      nome: produto.nome,
      descricao: produto.descricao || undefined,
      precoBase,
      originalPrice: Number(produto.preco),
      quantidade: qtd,
      adicionais: selecionados,
      escolhasCombo: ehCombo ? escolhasCombo : undefined,
      imagem: produto.imagem_url || undefined,
      disponibilidade: "levar",
      modoConsumo: "levar",
    });

    for (const oferta of ofertasAtivas) {
      const alvo = oferta.produto_alvo;
      const { oferta: precoOferta, original } = precosOferta(oferta);
      adicionarItem({
        produtoId: alvo.id,
        nome: alvo.nome,
        descricao: alvo.descricao || undefined,
        precoBase: precoOferta,
        originalPrice: original,
        quantidade: 1,
        imagem: alvo.imagem_url || undefined,
        adicionais: [],
        ehBrinde: oferta.tipo === "brinde",
        disponibilidade: "levar",
        modoConsumo: "levar",
      });
    }

    toast.success("Adicionado à sacola");
    voltar();
  };

  return (
    <div className="pb-28 -mt-2">
      <div className="relative rounded-3xl overflow-hidden bg-zinc-100 aspect-[4/3]">
        {produto.imagem_url ? (
          <img
            src={produto.imagem_url}
            alt={produto.nome}
            className="h-full w-full object-cover"
          />
        ) : null}
        <TagMedidaProduto
          valor={produto.medida_valor}
          unidade={produto.medida_unidade}
          variante="overlay"
          tamanho="md"
          className="absolute top-3 right-3 z-10"
        />
      </div>

      <div className="mt-4 space-y-1">
        <h1 className="text-2xl font-black leading-tight">{produto.nome}</h1>
        <TagMedidaProduto
          valor={produto.medida_valor}
          unidade={produto.medida_unidade}
          tamanho="lg"
          className="mt-2"
        />
        {produto.descricao && (
          <p className="text-sm text-zinc-500">{produto.descricao}</p>
        )}
        <p className="text-xl font-black text-cookie-primary pt-1">
          R$ {precoBase.toFixed(2).replace(".", ",")}
        </p>
      </div>

      {carregandoCombo && (
        <section className="mt-6 space-y-2 animate-pulse">
          <div className="h-4 bg-zinc-200 rounded w-28" />
          <div className="h-16 rounded-2xl bg-zinc-100 border border-zinc-200" />
          <div className="h-16 rounded-2xl bg-zinc-100 border border-zinc-200" />
        </section>
      )}

      {!carregandoCombo && gruposCombo.length > 0 && (
        <div className="mt-6 space-y-6">
          {gruposCombo.map((grupo) => {
            const selecionadas = escolhasCombo.filter(
              (e) => e.grupoId === grupo.id,
            ).length;
            const meta =
              grupo.min_escolhas === grupo.max_escolhas
                ? grupo.min_escolhas
                : grupo.max_escolhas;
            const completo = selecionadas >= grupo.min_escolhas;

            return (
              <section key={grupo.id} className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                        {grupo.nome}
                      </h2>
                      <span
                        className={`text-[11px] font-bold ${
                          completo ? "text-emerald-600" : "text-cookie-primary"
                        }`}
                      >
                        {rotuloEscolhasGrupo(grupo)}
                        {meta > 0 ? ` · ${selecionadas}/${meta}` : ""}
                      </span>
                    </div>
                    {grupo.max_escolhas > 1 && (
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        Pode repetir a mesma opção. Com o limite cheio, toque em
                        outra para trocar.
                      </p>
                    )}
                    {grupo.descricao && (
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {grupo.descricao}
                      </p>
                    )}
                  </div>
                  <div className="h-px flex-1 bg-zinc-200" />
                </div>
                {grupo.opcoes.length === 0 ? (
                  <p className="text-sm text-red-600 font-medium">
                    Nenhuma opção disponível neste grupo no momento.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {grupo.opcoes.map((opcao) => {
                      const qtdOpcao = escolhasCombo.filter(
                        (e) =>
                          e.grupoId === grupo.id && e.opcaoId === opcao.id,
                      ).length;
                      const ativo = qtdOpcao > 0;
                      const delta = calcularDeltaOpcao(
                        opcao,
                        grupo.preco_referencia,
                      );
                      return (
                        <button
                          key={opcao.id}
                          type="button"
                          onClick={() => selecionarOpcaoCombo(grupo, opcao.id)}
                          className={`w-full flex items-center justify-between gap-3 p-4 rounded-2xl border-2 text-left transition active:scale-[0.99] ${
                            ativo
                              ? "border-cookie-primary bg-cookie-primary/10"
                              : "border-zinc-200 bg-white"
                          }`}
                        >
                          <span className="flex items-center gap-3 min-w-0 font-semibold text-sm">
                            {opcao.produto.imagem_url ? (
                              <span className="h-12 w-12 shrink-0 rounded-xl overflow-hidden bg-zinc-100">
                                <img
                                  src={opcao.produto.imagem_url}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              </span>
                            ) : null}
                            <span className="truncate">
                              {opcao.produto.nome}
                              {qtdOpcao > 0 && grupo.max_escolhas > 1
                                ? ` ×${qtdOpcao}`
                                : ""}
                            </span>
                          </span>
                          <span
                            className={`text-sm font-bold shrink-0 ${
                              ativo || delta > 0
                                ? "text-cookie-primary"
                                : "text-zinc-500"
                            }`}
                          >
                            {delta > 0
                              ? `+ R$ ${delta.toFixed(2).replace(".", ",")}`
                              : "Incluso"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {adicionais.length > 0 && (
        <section className="mt-6 space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">
              Turbine o pedido
            </h2>
            <span className="text-xs text-zinc-400">
              (
              {rotuloAdicionaisProduto({
                obrigatorio: produto.adicional_obrigatorio,
                maximo: produto.adicional_maximo,
              })}
              )
            </span>
            <div className="h-px flex-1 bg-zinc-200" />
          </div>
          <div className="space-y-2">
            {adicionais.map((adc) => {
              const ativo = selecionados.some((s) => s.id === adc.id);
              return (
                <button
                  key={adc.id}
                  type="button"
                  onClick={() => alternarAdicional(adc)}
                  className={`w-full flex items-center justify-between gap-3 p-4 rounded-2xl border-2 transition active:scale-[0.99] ${
                    ativo
                      ? "border-cookie-primary bg-cookie-primary/10"
                      : "border-zinc-200 bg-white"
                  }`}
                >
                  <span className="flex items-center gap-2 font-semibold text-sm">
                    {ativo && (
                      <Check size={16} className="text-cookie-primary shrink-0" />
                    )}
                    {adc.nome}
                  </span>
                  <span
                    className={`text-sm font-bold shrink-0 ${ativo ? "text-cookie-primary" : "text-zinc-500"}`}
                  >
                    + R$ {Number(adc.preco).toFixed(2).replace(".", ",")}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {ofertas.length > 0 && (
        <section className="mt-6 space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">
              Aproveite também
            </h2>
            <div className="h-px flex-1 bg-zinc-200" />
          </div>
          <div className="space-y-2">
            {ofertas.map((oferta) => {
              const ativo = ofertasSelecionadas.includes(oferta.id);
              const alvo = oferta.produto_alvo;
              const { original, oferta: precoOferta } = precosOferta(oferta);
              const ehBrinde = oferta.tipo === "brinde";
              const temDesconto = precoOferta < original;

              return (
                <button
                  key={oferta.id}
                  type="button"
                  onClick={() => alternarOferta(oferta.id)}
                  className={`w-full flex gap-3 p-3 rounded-2xl border-2 text-left transition active:scale-[0.99] ${
                    ativo
                      ? "border-cookie-primary bg-cookie-primary/10"
                      : "border-zinc-200 bg-white"
                  }`}
                >
                  <div className="h-16 w-16 shrink-0 rounded-xl overflow-hidden bg-zinc-100">
                    {alvo.imagem_url ? (
                      <img
                        src={alvo.imagem_url}
                        alt={alvo.nome}
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-sm leading-snug">
                        {alvo.nome}
                      </p>
                      {ativo && (
                        <Check size={16} className="text-cookie-primary shrink-0 mt-0.5" />
                      )}
                    </div>
                    {oferta.mensagem_oferta && (
                      <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">
                        {oferta.mensagem_oferta}
                      </p>
                    )}
                    <div className="flex items-baseline gap-2 mt-1.5">
                      {ehBrinde ? (
                        <span className="inline-flex items-center gap-1 text-xs font-black text-emerald-600">
                          <Gift size={12} /> Grátis
                        </span>
                      ) : (
                        <>
                          <span className="text-sm font-black text-cookie-primary">
                            R$ {precoOferta.toFixed(2).replace(".", ",")}
                          </span>
                          {temDesconto && (
                            <span className="text-xs text-zinc-400 line-through">
                              R$ {original.toFixed(2).replace(".", ",")}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <div className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-zinc-200 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-2xl border border-zinc-200 bg-zinc-50 p-1">
            <button
              type="button"
              className="h-11 w-11 rounded-xl bg-white shadow-sm flex items-center justify-center"
              onClick={() => setQtd((q) => Math.max(1, q - 1))}
              aria-label="Diminuir"
            >
              <Minus size={18} />
            </button>
            <span className="font-black w-8 text-center text-base">{qtd}</span>
            <button
              type="button"
              className="h-11 w-11 rounded-xl bg-white shadow-sm flex items-center justify-center"
              onClick={() => setQtd((q) => q + 1)}
              aria-label="Aumentar"
            >
              <Plus size={18} />
            </button>
          </div>
          <button
            type="button"
            onClick={adicionar}
            className="flex-1 h-14 rounded-2xl bg-cookie-primary hover:bg-cookie-primary-hover active:scale-[0.98] transition text-white font-bold text-base flex items-center justify-between px-5 shadow-lg shadow-cookie-primary/25"
          >
            <span>Adicionar</span>
            <span>R$ {total.toFixed(2).replace(".", ",")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
