import { PartyPopper, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import {
  dataMinimaRetirada,
  descontoCaixasEvento,
  normalizarFaixasEvento,
  normalizarSabores,
  saboresValidos,
  type FaixaDescontoEvento,
  type ProdutoEvento,
} from "../../lib/eventos";
import { supabase } from "../../lib/supabase";
import { urlDelivery } from "../../lib/urlDelivery";
import {
  agruparCaixasPorProduto,
  useEventosCartStore,
} from "../../store/useEventosCartStore";

function moeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function mapProduto(row: Record<string, unknown>): ProdutoEvento | null {
  if (!row.canal_evento) return null;
  const unidades = Number(row.evento_unidades_caixa);
  if (!Number.isFinite(unidades) || unidades < 1) return null;
  return {
    id: String(row.id),
    nome: String(row.nome || ""),
    descricao: row.descricao ? String(row.descricao) : null,
    imagem_url: row.imagem_url ? String(row.imagem_url) : null,
    preco: Number(row.preco) || 0,
    evento_unidades_caixa: unidades,
    evento_sabores: normalizarSabores(row.evento_sabores),
    evento_min_sabores: Math.max(1, Number(row.evento_min_sabores) || 1),
    evento_max_sabores: Math.max(1, Number(row.evento_max_sabores) || 1),
    evento_descontos: normalizarFaixasEvento(row.evento_descontos),
    evento_limite_caixas_dia:
      row.evento_limite_caixas_dia == null
        ? null
        : Number(row.evento_limite_caixas_dia),
    evento_dias_antecedencia: Math.max(
      0,
      Number(row.evento_dias_antecedencia) || 0,
    ),
  };
}

export function DeliveryEventos() {
  const [produtos, setProdutos] = useState<ProdutoEvento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState<ProdutoEvento | null>(null);
  const [sabores, setSabores] = useState<string[]>([]);
  const [obs, setObs] = useState("");
  const itens = useEventosCartStore((s) => s.itens);
  const adicionar = useEventosCartStore((s) => s.adicionar);
  const remover = useEventosCartStore((s) => s.remover);

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase
        .from("produtos")
        .select("*")
        .eq("ativo", true)
        .eq("canal_evento", true);
      if (error) {
        toast.error("Não foi possível carregar os eventos.");
        setCarregando(false);
        return;
      }
      setProdutos(
        ((data || []) as Record<string, unknown>[])
          .map(mapProduto)
          .filter((p): p is ProdutoEvento => Boolean(p)),
      );
      setCarregando(false);
    })();
  }, []);

  const grupos = useMemo(() => agruparCaixasPorProduto(itens), [itens]);
  const subtotal = itens.reduce((s, i) => s + i.precoCaixa, 0);
  const desconto = [...grupos.entries()].reduce((s, [id, g]) => {
    const prod = produtos.find((p) => p.id === id);
    return s + descontoCaixasEvento(g.preco, g.qtd, prod?.evento_descontos ?? []);
  }, 0);

  const confirmarCaixa = () => {
    if (!aberto) return;
    const erro = saboresValidos(
      sabores,
      aberto.evento_min_sabores,
      aberto.evento_max_sabores,
      aberto.evento_sabores,
    );
    if (erro) {
      toast.warning(erro);
      return;
    }
    adicionar({
      produtoId: aberto.id,
      nome: aberto.nome,
      precoCaixa: aberto.preco,
      unidadesCaixa: aberto.evento_unidades_caixa,
      sabores,
      observacao: obs.trim(),
      imagem: aberto.imagem_url,
    });
    toast.success("Caixa adicionada");
    setAberto(null);
    setSabores([]);
    setObs("");
  };

  const toggleSabor = (sabor: string, max: number) => {
    setSabores((atual) => {
      if (atual.includes(sabor)) return atual.filter((s) => s !== sabor);
      if (atual.length >= max) return atual;
      return [...atual, sabor];
    });
  };

  return (
    <div className="space-y-5 pb-8">
      <div className="rounded-3xl bg-gradient-to-br from-amber-100 via-white to-rose-50 border border-amber-200 p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-amber-800 flex items-center gap-1">
          <PartyPopper size={14} /> Eventos
        </p>
        <h1 className="text-2xl font-black mt-1">Caixas para a sua festa</h1>
        <p className="text-sm text-zinc-600 mt-1">
          Encomenda só para retirada. Cada caixa é fechada — você escolhe os
          sabores. Entrega sob consulta no WhatsApp.
        </p>
      </div>

      {carregando && <p className="text-sm text-zinc-500">Carregando…</p>}
      {!carregando && produtos.length === 0 && (
        <p className="text-sm text-zinc-500">
          Nenhuma caixa de evento disponível no momento.
        </p>
      )}

      <div className="grid gap-3">
        {produtos.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setAberto(p);
              setSabores([]);
              setObs("");
            }}
            className="text-left bg-white rounded-2xl border border-zinc-200 overflow-hidden flex gap-3 p-3 hover:border-amber-300"
          >
            {p.imagem_url ? (
              <img
                src={p.imagem_url}
                alt=""
                className="w-24 h-24 rounded-xl object-cover shrink-0"
              />
            ) : (
              <div className="w-24 h-24 rounded-xl bg-amber-50 shrink-0" />
            )}
            <div className="min-w-0">
              <p className="font-bold leading-tight">{p.nome}</p>
              <p className="text-xs text-zinc-500 mt-1">
                Caixa com {p.evento_unidades_caixa} un ·{" "}
                {p.evento_min_sabores === p.evento_max_sabores
                  ? `${p.evento_max_sabores} sabor(es)`
                  : `${p.evento_min_sabores} a ${p.evento_max_sabores} sabores`}
              </p>
              {p.descricao && (
                <p className="text-xs text-zinc-500 mt-1 line-clamp-2">
                  {p.descricao}
                </p>
              )}
              <p className="text-sm font-black text-cookie-primary mt-2">
                {moeda(p.preco)}
              </p>
              <FaixasResumo faixas={p.evento_descontos} preco={p.preco} />
            </div>
          </button>
        ))}
      </div>

      {itens.length > 0 && (
        <section className="bg-white rounded-2xl border border-zinc-200 p-4 space-y-3">
          <h2 className="font-bold">Suas caixas</h2>
          {itens.map((item) => (
            <div key={item.idUnico} className="flex items-start justify-between gap-2 text-sm">
              <div>
                <p className="font-semibold">{item.nome}</p>
                <p className="text-xs text-zinc-500">
                  {item.sabores.join(", ")}
                  {item.observacao ? ` · ${item.observacao}` : ""}
                </p>
              </div>
              <button
                type="button"
                className="p-1 text-zinc-400"
                onClick={() => remover(item.idUnico)}
                aria-label="Remover caixa"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <div className="text-sm flex justify-between">
            <span>Subtotal</span>
            <span>{moeda(subtotal)}</span>
          </div>
          {desconto > 0 && (
            <div className="text-sm flex justify-between text-emerald-700">
              <span>Desconto por quantidade</span>
              <span>-{moeda(desconto)}</span>
            </div>
          )}
          <p className="text-xs text-zinc-500">
            Retirada a partir de{" "}
            {dataMinimaRetirada(
              Math.max(...itens.map((i) => {
                const p = produtos.find((x) => x.id === i.produtoId);
                return p?.evento_dias_antecedencia ?? 0;
              }), 0),
            )
              .split("-")
              .reverse()
              .join("/")}
            .
          </p>
          <Button asChild className="w-full bg-cookie-primary hover:bg-cookie-primary-hover">
            <Link to={urlDelivery("/eventos/checkout")}>Continuar encomenda</Link>
          </Button>
        </section>
      )}

      {aberto && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center p-3">
          <div className="bg-white rounded-3xl w-full max-w-md p-5 space-y-3 max-h-[90dvh] overflow-auto">
            <h2 className="font-black text-lg">{aberto.nome}</h2>
            <p className="text-xs text-zinc-500">
              Escolha de {aberto.evento_min_sabores} a {aberto.evento_max_sabores}{" "}
              sabor(es). {moeda(aberto.preco)} · {aberto.evento_unidades_caixa} un
            </p>
            <div className="flex flex-wrap gap-2">
              {aberto.evento_sabores.map((sabor) => {
                const on = sabores.includes(sabor);
                return (
                  <button
                    key={sabor}
                    type="button"
                    onClick={() => toggleSabor(sabor, aberto.evento_max_sabores)}
                    className={`px-3 py-1.5 rounded-full text-sm border ${
                      on
                        ? "bg-amber-500 text-white border-amber-500"
                        : "bg-white border-zinc-200"
                    }`}
                  >
                    {sabor}
                  </button>
                );
              })}
            </div>
            <label className="block text-xs font-semibold text-zinc-500">
              Observação desta caixa (opcional)
              <textarea
                className="mt-1 w-full rounded-xl border border-zinc-200 p-2 text-sm"
                rows={2}
                value={obs}
                onChange={(e) => setObs(e.target.value)}
              />
            </label>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setAberto(null)}>
                Cancelar
              </Button>
              <Button
                className="flex-1 bg-cookie-primary hover:bg-cookie-primary-hover"
                onClick={confirmarCaixa}
              >
                <Plus size={16} className="mr-1" /> Adicionar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FaixasResumo({
  faixas,
  preco,
}: {
  faixas: FaixaDescontoEvento[];
  preco: number;
}) {
  if (!faixas.length) return null;
  return (
    <p className="text-[11px] text-emerald-700 mt-1">
      {faixas
        .map((f) =>
          f.tipo === "percentual"
            ? `${f.qtd_min_caixas}+ caixas −${f.valor}%`
            : `${f.qtd_min_caixas}+ caixas −${moeda(f.valor)}`,
        )
        .join(" · ")}{" "}
      (caixa {moeda(preco)})
    </p>
  );
}
