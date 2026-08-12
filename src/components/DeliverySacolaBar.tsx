import { Plus, ShoppingBag } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { buscarDeliveryConfig } from "../lib/deliveryConfig";
import { produtoEstaEsgotado } from "../lib/estoque";
import { urlDelivery } from "../lib/urlDelivery";
import {
  buscarOfertasVendaCruzada,
  calcularPrecoComDescontoVendaCruzada,
  type OfertaVendaCruzada,
} from "../lib/vendasCruzadas";
import { useCartStore } from "../store/useCartStore";
import { cn } from "../lib/utils";

export function DeliverySacolaBar({ className }: { className?: string }) {
  const navigate = useNavigate();
  const itens = useCartStore((s) => s.itens);
  const qtd = useCartStore((s) => s.obterQuantidadeTotal());
  const subtotal = useCartStore((s) => s.obterSubtotal());
  const adicionarItem = useCartStore((s) => s.adicionarItem);
  const [pedidoMinimo, setPedidoMinimo] = useState(0);
  const [ofertas, setOfertas] = useState<OfertaVendaCruzada[]>([]);

  useEffect(() => {
    void buscarDeliveryConfig().then((c) =>
      setPedidoMinimo(Number(c.pedido_minimo || 0)),
    );
  }, []);

  const gatilhoIds = useMemo(
    () => [...new Set(itens.map((i) => i.produtoId))],
    [itens],
  );

  useEffect(() => {
    if (gatilhoIds.length === 0) {
      setOfertas([]);
      return;
    }
    let cancelado = false;
    void (async () => {
      const mapa = new Map<string, OfertaVendaCruzada>();
      for (const id of gatilhoIds.slice(0, 4)) {
        const lista = await buscarOfertasVendaCruzada(id);
        for (const o of lista) {
          if (produtoEstaEsgotado(o.produto_alvo)) continue;
          if (itens.some((i) => i.produtoId === o.produto_alvo.id)) continue;
          if (!mapa.has(o.produto_alvo.id)) mapa.set(o.produto_alvo.id, o);
        }
      }
      if (!cancelado) setOfertas([...mapa.values()].slice(0, 2));
    })();
    return () => {
      cancelado = true;
    };
  }, [gatilhoIds, itens]);

  if (qtd <= 0) return null;

  const falta =
    pedidoMinimo > 0 ? Math.max(0, pedidoMinimo - subtotal) : 0;
  const progresso =
    pedidoMinimo > 0
      ? Math.min(100, Math.round((subtotal / pedidoMinimo) * 100))
      : 100;

  const adicionarOferta = (o: OfertaVendaCruzada) => {
    const alvo = o.produto_alvo;
    const cheio =
      alvo.em_promocao && alvo.preco_promocional != null
        ? Number(alvo.preco_promocional)
        : Number(alvo.preco);
    const preco = calcularPrecoComDescontoVendaCruzada(
      cheio,
      o.tipo,
      o.valor_desconto,
    );
    adicionarItem({
      produtoId: alvo.id,
      nome: alvo.nome,
      precoBase: preco,
      originalPrice: Number(alvo.preco),
      quantidade: 1,
      imagem: alvo.imagem_url || undefined,
      adicionais: [],
      ehBrinde: o.tipo === "brinde",
      disponibilidade: "levar",
      modoConsumo: "levar",
    });
    toast.success(`${alvo.nome} adicionado`);
  };

  return (
    <div
      className={cn(
        "fixed bottom-0 inset-x-0 z-40 p-3 pointer-events-none",
        className,
      )}
    >
      <div className="max-w-3xl mx-auto pointer-events-auto space-y-2">
        {ofertas.length > 0 && (
          <div className="rounded-2xl border border-zinc-200 bg-white/95 backdrop-blur p-2 shadow-sm space-y-1.5">
            <p className="px-1 text-[11px] font-bold uppercase tracking-wide text-zinc-400">
              Que tal adicionar?
            </p>
            {ofertas.map((o) => {
              const alvo = o.produto_alvo;
              const cheio =
                alvo.em_promocao && alvo.preco_promocional != null
                  ? Number(alvo.preco_promocional)
                  : Number(alvo.preco);
              const preco = calcularPrecoComDescontoVendaCruzada(
                cheio,
                o.tipo,
                o.valor_desconto,
              );
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => adicionarOferta(o)}
                  className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left hover:bg-zinc-50"
                >
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-zinc-100">
                    {alvo.imagem_url ? (
                      <img
                        src={alvo.imagem_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{alvo.nome}</p>
                    <p className="text-xs text-cookie-primary font-bold">
                      {o.tipo === "brinde"
                        ? "Grátis"
                        : `R$ ${preco.toFixed(2).replace(".", ",")}`}
                    </p>
                  </div>
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-cookie-primary/10 text-cookie-primary">
                    <Plus size={16} />
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {pedidoMinimo > 0 && (
          <div className="rounded-xl border border-zinc-200 bg-white/95 backdrop-blur px-3 py-2 shadow-sm">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="font-medium text-zinc-600">
                {falta > 0
                  ? `Faltam R$ ${falta.toFixed(2).replace(".", ",")} para o mínimo`
                  : "Pedido mínimo atingido"}
              </span>
              <span className="text-zinc-400">
                R$ {subtotal.toFixed(2).replace(".", ",")} /{" "}
                {pedidoMinimo.toFixed(2).replace(".", ",")}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-100">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  falta > 0 ? "bg-amber-500" : "bg-emerald-500",
                )}
                style={{ width: `${progresso}%` }}
              />
            </div>
          </div>
        )}

        <Button
          type="button"
          onClick={() => navigate(urlDelivery("/checkout"))}
          className="h-14 w-full rounded-2xl bg-cookie-primary text-base font-bold text-white shadow-lg shadow-cookie-primary/25 hover:bg-cookie-primary-hover"
        >
          <span className="flex w-full items-center justify-between px-1">
            <span className="flex items-center gap-2">
              <ShoppingBag size={18} />
              Ver sacola
            </span>
            <span className="flex items-center gap-2">
              <span className="rounded-full bg-white/20 px-3 py-1 text-sm">
                {qtd}
              </span>
              <span className="text-sm">
                R$ {subtotal.toFixed(2).replace(".", ",")}
              </span>
            </span>
          </span>
        </Button>
      </div>
    </div>
  );
}
