import { Button } from "../ui/button";
import { Input } from "../ui/input";

export type FaixaEventoForm = {
  qtd: string;
  tipo: "percentual" | "fixo";
  valor: string;
};

export type FormEventoProduto = {
  canal: boolean;
  unidades: string;
  sabores: string;
  minSabores: string;
  maxSabores: string;
  dias: string;
  limite: string;
  faixas: FaixaEventoForm[];
};

export const FORM_EVENTO_VAZIO: FormEventoProduto = {
  canal: false,
  unidades: "25",
  sabores: "",
  minSabores: "1",
  maxSabores: "3",
  dias: "2",
  limite: "",
  faixas: [],
};

type Props = {
  valor: FormEventoProduto;
  onChange: (valor: FormEventoProduto) => void;
};

export function CamposProdutoEvento({ valor, onChange }: Props) {
  const set = (parcial: Partial<FormEventoProduto>) =>
    onChange({ ...valor, ...parcial });

  return (
    <div className="p-4 rounded-lg border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-900 space-y-3">
      <label className="flex items-center justify-between gap-3">
        <span>
          <span className="font-medium">Produto de evento</span>
          <span className="block text-xs text-gray-500">
            Só aparece na página Eventos. Sempre encomenda, vendido por caixa.
          </span>
        </span>
        <input
          type="checkbox"
          checked={valor.canal}
          onChange={(e) => set({ canal: e.target.checked })}
        />
      </label>
      {valor.canal && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-gray-500">
            Unidades na caixa
            <Input
              className="mt-1"
              inputMode="numeric"
              value={valor.unidades}
              onChange={(e) => set({ unidades: e.target.value })}
            />
          </label>
          <label className="text-xs font-semibold text-gray-500">
            Dias de antecedência
            <Input
              className="mt-1"
              inputMode="numeric"
              value={valor.dias}
              onChange={(e) => set({ dias: e.target.value })}
            />
          </label>
          <label className="text-xs font-semibold text-gray-500">
            Mín. sabores
            <Input
              className="mt-1"
              inputMode="numeric"
              value={valor.minSabores}
              onChange={(e) => set({ minSabores: e.target.value })}
            />
          </label>
          <label className="text-xs font-semibold text-gray-500">
            Máx. sabores
            <Input
              className="mt-1"
              inputMode="numeric"
              value={valor.maxSabores}
              onChange={(e) => set({ maxSabores: e.target.value })}
            />
          </label>
          <label className="text-xs font-semibold text-gray-500 sm:col-span-2">
            Limite de caixas por dia (vazio = sem limite; o cliente ainda pode pedir)
            <Input
              className="mt-1"
              inputMode="numeric"
              value={valor.limite}
              onChange={(e) => set({ limite: e.target.value })}
            />
          </label>
          <label className="text-xs font-semibold text-gray-500 sm:col-span-2">
            Sabores (um por linha)
            <textarea
              className="mt-1 w-full rounded-md border border-gray-200 bg-white p-2 text-sm min-h-24"
              value={valor.sabores}
              onChange={(e) => set({ sabores: e.target.value })}
            />
          </label>
          <div className="sm:col-span-2 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500">
                Desconto por quantidade de caixas
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  set({
                    faixas: [
                      ...valor.faixas,
                      { qtd: "3", tipo: "percentual", valor: "10" },
                    ],
                  })
                }
              >
                Faixa
              </Button>
            </div>
            {valor.faixas.map((faixa, i) => (
              <div key={i} className="flex flex-wrap gap-2 items-end">
                <Input
                  className="w-20"
                  value={faixa.qtd}
                  onChange={(e) => {
                    const faixas = valor.faixas.slice();
                    faixas[i] = { ...faixa, qtd: e.target.value };
                    set({ faixas });
                  }}
                  placeholder="Qtd"
                />
                <select
                  className="h-9 rounded-md border px-2 text-sm"
                  value={faixa.tipo}
                  onChange={(e) => {
                    const faixas = valor.faixas.slice();
                    faixas[i] = {
                      ...faixa,
                      tipo: e.target.value === "fixo" ? "fixo" : "percentual",
                    };
                    set({ faixas });
                  }}
                >
                  <option value="percentual">%</option>
                  <option value="fixo">R$</option>
                </select>
                <Input
                  className="w-24"
                  value={faixa.valor}
                  onChange={(e) => {
                    const faixas = valor.faixas.slice();
                    faixas[i] = { ...faixa, valor: e.target.value };
                    set({ faixas });
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    set({ faixas: valor.faixas.filter((_, j) => j !== i) })
                  }
                >
                  Remover
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function formEventoParaPayload(form: FormEventoProduto) {
  const sabores = form.sabores
    .split(/\n|,/)
    .map((s) => s.trim())
    .filter(Boolean);
  const faixas = form.faixas
    .map((f) => ({
      qtd_min_caixas: Math.max(1, parseInt(f.qtd, 10) || 1),
      tipo: f.tipo,
      valor: Number(String(f.valor).replace(",", ".")) || 0,
    }))
    .filter((f) => f.valor > 0);
  const limite = form.limite.trim();
  return {
    canal_evento: form.canal,
    evento_unidades_caixa: form.canal
      ? Math.max(1, parseInt(form.unidades, 10) || 1)
      : null,
    evento_sabores: sabores,
    evento_min_sabores: Math.max(1, parseInt(form.minSabores, 10) || 1),
    evento_max_sabores: Math.max(
      1,
      parseInt(form.maxSabores, 10) || parseInt(form.minSabores, 10) || 1,
    ),
    evento_descontos: faixas,
    evento_limite_caixas_dia: limite ? Math.max(1, parseInt(limite, 10) || 1) : null,
    evento_dias_antecedencia: Math.max(0, parseInt(form.dias, 10) || 0),
  };
}

export function formEventoDeProduto(data: {
  canal_evento?: boolean | null;
  evento_unidades_caixa?: number | null;
  evento_sabores?: unknown;
  evento_min_sabores?: number | null;
  evento_max_sabores?: number | null;
  evento_descontos?: unknown;
  evento_limite_caixas_dia?: number | null;
  evento_dias_antecedencia?: number | null;
}): FormEventoProduto {
  const sabores = Array.isArray(data.evento_sabores)
    ? data.evento_sabores.map((s) => String(s)).join("\n")
    : "";
  const faixas = Array.isArray(data.evento_descontos)
    ? data.evento_descontos.map((raw) => {
        const o = raw as Record<string, unknown>;
        return {
          qtd: String(o.qtd_min_caixas ?? ""),
          tipo: (o.tipo === "fixo" ? "fixo" : "percentual") as
            | "percentual"
            | "fixo",
          valor: String(o.valor ?? ""),
        };
      })
    : [];
  return {
    canal: Boolean(data.canal_evento),
    unidades: String(data.evento_unidades_caixa ?? 25),
    sabores,
    minSabores: String(data.evento_min_sabores ?? 1),
    maxSabores: String(data.evento_max_sabores ?? 3),
    dias: String(data.evento_dias_antecedencia ?? 2),
    limite:
      data.evento_limite_caixas_dia == null
        ? ""
        : String(data.evento_limite_caixas_dia),
    faixas,
  };
}
