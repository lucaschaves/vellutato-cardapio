import {
  CalendarClock,
  CheckCircle2,
  Loader2,
  Pencil,
  PlusCircle,
  RefreshCw,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AdminPageShell } from "../../components/AdminPageShell";
import { ModalConfirmacao } from "../../components/ModalConfirmacao";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  atualizarLancamento,
  atualizarRecorrencia,
  cancelarLancamento,
  competenciaDoMes,
  competenciaHoje,
  criarDespesaParcelada,
  criarLancamentoAvulso,
  criarRecorrencia,
  excluirLancamento,
  FORMA_PAGAMENTO_LABEL,
  FORMAS_PAGAMENTO,
  gerarRecorrenciasDoMes,
  listarCategoriasFinanceiro,
  listarLancamentos,
  listarRecorrencias,
  marcarLancamentoPago,
  rotuloCompetencia,
  STATUS_LANCAMENTO_LABEL,
  statusEfetivo,
  hojeLocalISO,
  type FinanceiroCategoria,
  type FinanceiroLancamento,
  type FinanceiroRecorrencia,
  type StatusLancamento,
  type TipoLancamento,
} from "../../lib/financeiro";
import { formatarMoeda } from "../../lib/pedidosAdmin";

type Aba = "lancamentos" | "recorrencias";
type ModoForm =
  | "despesa_avulsa"
  | "receita_avulsa"
  | "despesa_parcelada"
  | "editar";

function classeStatus(status: StatusLancamento): string {
  switch (status) {
    case "paga":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";
    case "atrasada":
      return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";
    case "cancelada":
      return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
    default:
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
  }
}

function mesesOpcoes(centro: string): { value: string; label: string }[] {
  const [y, m] = centro.slice(0, 10).split("-").map(Number);
  const out: { value: string; label: string }[] = [];
  for (let i = -6; i <= 6; i++) {
    const d = new Date(y, m - 1 + i, 1);
    const v = competenciaDoMes(d.getFullYear(), d.getMonth() + 1);
    out.push({ value: v, label: rotuloCompetencia(v) });
  }
  return out;
}

export function GerenciamentoDespesas() {
  const [aba, setAba] = useState<Aba>("lancamentos");
  const [competencia, setCompetencia] = useState(competenciaHoje);
  const [filtroTipo, setFiltroTipo] = useState<TipoLancamento | "todos">(
    "todos",
  );
  const [filtroStatus, setFiltroStatus] = useState<StatusLancamento | "todos">(
    "todos",
  );

  const [categorias, setCategorias] = useState<FinanceiroCategoria[]>([]);
  const [lancamentos, setLancamentos] = useState<FinanceiroLancamento[]>([]);
  const [recorrencias, setRecorrencias] = useState<FinanceiroRecorrencia[]>(
    [],
  );
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [gerando, setGerando] = useState(false);

  const [formAberto, setFormAberto] = useState(false);
  const [modoForm, setModoForm] = useState<ModoForm>("despesa_avulsa");
  const [editandoId, setEditandoId] = useState<string | null>(null);

  const [tipoForm, setTipoForm] = useState<TipoLancamento>("despesa");
  const [categoriaId, setCategoriaId] = useState("");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [vencimento, setVencimento] = useState(hojeLocalISO());
  const [compForm, setCompForm] = useState(competenciaHoje());
  const [forma, setForma] = useState("");
  const [observacao, setObservacao] = useState("");
  const [jaPago, setJaPago] = useState(false);
  const [dataPagamento, setDataPagamento] = useState(hojeLocalISO());
  const [nParcelas, setNParcelas] = useState("3");
  const [diaVenc, setDiaVenc] = useState("10");

  const [recEditId, setRecEditId] = useState<string | null>(null);
  const [recCat, setRecCat] = useState("");
  const [recDesc, setRecDesc] = useState("");
  const [recValor, setRecValor] = useState("");
  const [recDia, setRecDia] = useState("10");
  const [recForma, setRecForma] = useState("");
  const [recObs, setRecObs] = useState("");
  const [recAtivo, setRecAtivo] = useState(true);

  const [excluirId, setExcluirId] = useState<string | null>(null);

  const opcoesMes = useMemo(() => mesesOpcoes(competencia), [competencia]);

  const catsForm = useMemo(() => {
    const t =
      modoForm === "receita_avulsa" || tipoForm === "receita"
        ? "receita"
        : "despesa";
    return categorias.filter((c) => c.tipo === t || c.tipo === "ambos");
  }, [categorias, modoForm, tipoForm]);

  const carregar = useCallback(async () => {
    try {
      setCarregando(true);
      const [cats, lancs, recs] = await Promise.all([
        listarCategoriasFinanceiro(),
        listarLancamentos({
          competencia,
          tipo: filtroTipo,
          status: filtroStatus,
        }),
        listarRecorrencias(),
      ]);
      setCategorias(cats);
      setLancamentos(lancs);
      setRecorrencias(recs);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[financeiro]", msg);
      toast.error(
        "Falha ao carregar financeiro. Confira se a migration foi aplicada.",
      );
    } finally {
      setCarregando(false);
    }
  }, [competencia, filtroTipo, filtroStatus]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const totais = useMemo(() => {
    let desp = 0;
    let rec = 0;
    let pend = 0;
    for (const l of lancamentos) {
      if (l.status === "cancelada") continue;
      const v = Number(l.valor) || 0;
      if (l.tipo === "despesa") {
        desp += v;
        if (l.status === "prevista" || l.status === "atrasada") pend += v;
      } else {
        rec += v;
      }
    }
    return { desp, rec, pend };
  }, [lancamentos]);

  const limparForm = () => {
    setFormAberto(false);
    setEditandoId(null);
    setModoForm("despesa_avulsa");
    setTipoForm("despesa");
    setCategoriaId("");
    setDescricao("");
    setValor("");
    setVencimento(hojeLocalISO());
    setCompForm(competencia);
    setForma("");
    setObservacao("");
    setJaPago(false);
    setDataPagamento(hojeLocalISO());
    setNParcelas("3");
    setDiaVenc("10");
  };

  const abrirNovo = (modo: ModoForm) => {
    limparForm();
    setModoForm(modo);
    setTipoForm(modo === "receita_avulsa" ? "receita" : "despesa");
    setCompForm(competencia);
    setFormAberto(true);
  };

  const abrirEdicao = (l: FinanceiroLancamento) => {
    setModoForm("editar");
    setEditandoId(l.id);
    setTipoForm(l.tipo);
    setCategoriaId(l.categoria_id);
    setDescricao(l.descricao);
    setValor(String(l.valor));
    setVencimento(l.vencimento.slice(0, 10));
    setCompForm(l.competencia.slice(0, 10));
    setForma(l.forma_pagamento ?? "");
    setObservacao(l.observacao ?? "");
    setJaPago(l.status === "paga");
    setDataPagamento(
      (l.data_pagamento ?? hojeLocalISO()).slice(0, 10),
    );
    setFormAberto(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const salvarForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoriaId || !descricao.trim() || !valor) {
      toast.warning("Preencha categoria, descrição e valor.");
      return;
    }
    const valorNum = Number(String(valor).replace(",", "."));
    if (!(valorNum > 0)) {
      toast.warning("Informe um valor válido.");
      return;
    }

    try {
      setSalvando(true);

      if (modoForm === "editar" && editandoId) {
        await atualizarLancamento(editandoId, {
          categoria_id: categoriaId,
          descricao,
          valor: valorNum,
          competencia: compForm,
          vencimento,
          forma_pagamento: forma || null,
          observacao: observacao || null,
          status: jaPago ? "paga" : statusEfetivo("prevista", vencimento),
          data_pagamento: jaPago ? dataPagamento : null,
        });
        toast.success("Lançamento atualizado.");
      } else if (modoForm === "despesa_parcelada") {
        const n = Number(nParcelas);
        if (!Number.isInteger(n) || n < 2) {
          toast.warning("Parcelas: informe um número ≥ 2.");
          return;
        }
        await criarDespesaParcelada({
          categoria_id: categoriaId,
          descricao,
          valor_total: valorNum,
          n_parcelas: n,
          competencia_primeira: compForm,
          dia_vencimento: Number(diaVenc) || 10,
          forma_pagamento: forma || null,
          observacao: observacao || null,
        });
        toast.success(`${n} parcelas criadas.`);
      } else {
        await criarLancamentoAvulso({
          tipo: modoForm === "receita_avulsa" ? "receita" : "despesa",
          categoria_id: categoriaId,
          descricao,
          valor: valorNum,
          competencia: compForm,
          vencimento,
          forma_pagamento: forma || null,
          observacao: observacao || null,
          status: jaPago ? "paga" : undefined,
          data_pagamento: jaPago ? dataPagamento : null,
        });
        toast.success(
          modoForm === "receita_avulsa"
            ? "Receita lançada."
            : "Despesa lançada.",
        );
      }

      limparForm();
      await carregar();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setSalvando(false);
    }
  };

  const onGerarMes = async () => {
    try {
      setGerando(true);
      const r = await gerarRecorrenciasDoMes(competencia);
      toast.success(
        `Recorrências: ${r.criados} criadas` +
          (r.jaExistiam ? `, ${r.jaExistiam} já existiam` : "") +
          ".",
      );
      await carregar();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Falha ao gerar.");
    } finally {
      setGerando(false);
    }
  };

  const limparRecForm = () => {
    setRecEditId(null);
    setRecCat("");
    setRecDesc("");
    setRecValor("");
    setRecDia("10");
    setRecForma("");
    setRecObs("");
    setRecAtivo(true);
  };

  const salvarRecorrencia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recCat || !recDesc.trim() || !recValor) {
      toast.warning("Preencha categoria, descrição e valor.");
      return;
    }
    const v = Number(String(recValor).replace(",", "."));
    if (!(v > 0)) {
      toast.warning("Valor inválido.");
      return;
    }
    try {
      setSalvando(true);
      const payload = {
        categoria_id: recCat,
        descricao: recDesc,
        valor: v,
        dia_vencimento: Number(recDia) || 10,
        forma_pagamento: recForma || null,
        observacao: recObs || null,
        ativo: recAtivo,
      };
      if (recEditId) {
        await atualizarRecorrencia(recEditId, payload);
        toast.success("Recorrência atualizada.");
      } else {
        await criarRecorrencia(payload);
        toast.success("Recorrência criada.");
      }
      limparRecForm();
      await carregar();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <AdminPageShell
      title={
        <h1 className="flex items-center gap-2">
          <Wallet size={28} className="text-cookie-primary" />
          Despesas
        </h1>
      }
      description="Controle de despesas, receitas avulsas, parcelas e recorrências."
    >
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setAba("lancamentos")}
          className={`rounded-lg px-4 py-2 text-sm font-bold transition-colors ${
            aba === "lancamentos"
              ? "bg-cookie-primary text-white"
              : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200"
          }`}
        >
          Lançamentos
        </button>
        <button
          type="button"
          onClick={() => setAba("recorrencias")}
          className={`rounded-lg px-4 py-2 text-sm font-bold transition-colors ${
            aba === "recorrencias"
              ? "bg-cookie-primary text-white"
              : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200"
          }`}
        >
          Recorrências
        </button>
      </div>

      {aba === "lancamentos" && (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600 dark:text-gray-300">
              Competência
              <select
                value={competencia}
                onChange={(e) => setCompetencia(e.target.value)}
                className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-surface-dark"
              >
                {opcoesMes.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600 dark:text-gray-300">
              Tipo
              <select
                value={filtroTipo}
                onChange={(e) =>
                  setFiltroTipo(e.target.value as TipoLancamento | "todos")
                }
                className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-surface-dark"
              >
                <option value="todos">Todos</option>
                <option value="despesa">Despesas</option>
                <option value="receita">Receitas</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600 dark:text-gray-300">
              Status
              <select
                value={filtroStatus}
                onChange={(e) =>
                  setFiltroStatus(
                    e.target.value as StatusLancamento | "todos",
                  )
                }
                className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-surface-dark"
              >
                <option value="todos">Todos</option>
                {(
                  Object.keys(STATUS_LANCAMENTO_LABEL) as StatusLancamento[]
                ).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LANCAMENTO_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              variant="outline"
              onClick={() => void onGerarMes()}
              disabled={gerando}
              className="gap-2"
            >
              {gerando ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <RefreshCw size={16} />
              )}
              Gerar mês (recorrentes)
            </Button>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => abrirNovo("despesa_avulsa")}
                className="gap-2"
              >
                <PlusCircle size={16} /> Despesa
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => abrirNovo("despesa_parcelada")}
                className="gap-2"
              >
                <CalendarClock size={16} /> Parcelada
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => abrirNovo("receita_avulsa")}
                className="gap-2"
              >
                <PlusCircle size={16} /> Receita
              </Button>
            </div>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-surface-dark">
              <p className="text-xs text-gray-500">Despesas no mês</p>
              <p className="text-xl font-black text-red-600 dark:text-red-400">
                {formatarMoeda(totais.desp)}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-surface-dark">
              <p className="text-xs text-gray-500">Receitas avulsas</p>
              <p className="text-xl font-black text-emerald-600 dark:text-emerald-400">
                {formatarMoeda(totais.rec)}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-surface-dark">
              <p className="text-xs text-gray-500">A pagar (previstas/atrasadas)</p>
              <p className="text-xl font-black text-amber-600 dark:text-amber-400">
                {formatarMoeda(totais.pend)}
              </p>
            </div>
          </div>

          {formAberto && (
            <form
              onSubmit={salvarForm}
              className="mb-6 space-y-3 rounded-xl border border-cookie-primary/30 bg-white p-4 dark:border-cookie-primary/40 dark:bg-surface-dark"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-gray-900 dark:text-white">
                  {modoForm === "editar"
                    ? "Editar lançamento"
                    : modoForm === "despesa_parcelada"
                      ? "Nova despesa parcelada"
                      : modoForm === "receita_avulsa"
                        ? "Nova receita avulsa"
                        : "Nova despesa avulsa"}
                </h3>
                <button type="button" onClick={limparForm} aria-label="Fechar">
                  <X size={18} />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="flex flex-col gap-1 text-xs font-semibold">
                  Categoria
                  <select
                    required
                    value={categoriaId}
                    onChange={(e) => setCategoriaId(e.target.value)}
                    className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-surface-dark"
                  >
                    <option value="">Selecione…</option>
                    {catsForm.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold sm:col-span-2">
                  Descrição
                  <Input
                    value={descricao}
                    onChange={(e) => setDescricao(e.target.value)}
                    required
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold">
                  Valor {modoForm === "despesa_parcelada" ? "(total)" : ""}
                  <Input
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                    inputMode="decimal"
                    required
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold">
                  Competência
                  <select
                    value={compForm}
                    onChange={(e) => setCompForm(e.target.value)}
                    className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-surface-dark"
                  >
                    {opcoesMes.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                {modoForm !== "despesa_parcelada" ? (
                  <label className="flex flex-col gap-1 text-xs font-semibold">
                    Vencimento
                    <Input
                      type="date"
                      value={vencimento}
                      onChange={(e) => setVencimento(e.target.value)}
                      required
                    />
                  </label>
                ) : (
                  <>
                    <label className="flex flex-col gap-1 text-xs font-semibold">
                      Nº de parcelas
                      <Input
                        value={nParcelas}
                        onChange={(e) => setNParcelas(e.target.value)}
                        inputMode="numeric"
                        required
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-semibold">
                      Dia do vencimento
                      <Input
                        value={diaVenc}
                        onChange={(e) => setDiaVenc(e.target.value)}
                        inputMode="numeric"
                        required
                      />
                    </label>
                  </>
                )}
                <label className="flex flex-col gap-1 text-xs font-semibold">
                  Forma
                  <select
                    value={forma}
                    onChange={(e) => setForma(e.target.value)}
                    className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-surface-dark"
                  >
                    <option value="">—</option>
                    {FORMAS_PAGAMENTO.map((f) => (
                      <option key={f} value={f}>
                        {FORMA_PAGAMENTO_LABEL[f]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold sm:col-span-2">
                  Observação
                  <Input
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                  />
                </label>
              </div>
              {modoForm !== "despesa_parcelada" && (
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={jaPago}
                      onChange={(e) => setJaPago(e.target.checked)}
                    />
                    Já pago / recebido
                  </label>
                  {jaPago && (
                    <Input
                      type="date"
                      value={dataPagamento}
                      onChange={(e) => setDataPagamento(e.target.value)}
                      className="w-auto"
                    />
                  )}
                </div>
              )}
              <div className="flex gap-2">
                <Button type="submit" disabled={salvando} className="gap-2">
                  {salvando && <Loader2 className="animate-spin" size={16} />}
                  Salvar
                </Button>
                <Button type="button" variant="outline" onClick={limparForm}>
                  Cancelar
                </Button>
              </div>
            </form>
          )}

          {carregando ? (
            <div className="flex justify-center py-16">
              <Loader2 className="animate-spin text-cookie-primary" size={36} />
            </div>
          ) : lancamentos.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500">
              Nenhum lançamento nesta competência.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-900/50">
                  <tr>
                    <th className="px-3 py-2">Descrição</th>
                    <th className="px-3 py-2">Categoria</th>
                    <th className="px-3 py-2">Venc.</th>
                    <th className="px-3 py-2">Valor</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {lancamentos.map((l) => {
                    const st = statusEfetivo(
                      l.status as StatusLancamento,
                      l.vencimento,
                    );
                    return (
                      <tr
                        key={l.id}
                        className="border-t border-gray-100 dark:border-gray-800"
                      >
                        <td className="px-3 py-2">
                          <div className="font-medium text-gray-900 dark:text-white">
                            {l.descricao}
                          </div>
                          <div className="text-xs text-gray-500">
                            {l.tipo === "receita" ? "Receita" : "Despesa"}
                            {l.parcela_numero
                              ? ` · ${l.parcela_numero}/${l.parcela_total}`
                              : ""}
                            {l.recorrencia_id ? " · recorrente" : ""}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                          {l.financeiro_categorias?.nome ?? "—"}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {l.vencimento.slice(0, 10).split("-").reverse().join("/")}
                        </td>
                        <td
                          className={`px-3 py-2 font-bold tabular-nums ${
                            l.tipo === "receita"
                              ? "text-emerald-600"
                              : "text-gray-900 dark:text-white"
                          }`}
                        >
                          {formatarMoeda(l.valor)}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${classeStatus(st)}`}
                          >
                            {STATUS_LANCAMENTO_LABEL[st]}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end gap-1">
                            {st !== "paga" && st !== "cancelada" && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                title="Marcar pago"
                                onClick={async () => {
                                  try {
                                    await marcarLancamentoPago(l.id);
                                    toast.success("Marcado como pago.");
                                    await carregar();
                                  } catch (err: unknown) {
                                    toast.error(
                                      err instanceof Error
                                        ? err.message
                                        : "Erro",
                                    );
                                  }
                                }}
                              >
                                <CheckCircle2 size={14} />
                              </Button>
                            )}
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => abrirEdicao(l)}
                            >
                              <Pencil size={14} />
                            </Button>
                            {st !== "cancelada" && st !== "paga" && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={async () => {
                                  try {
                                    await cancelarLancamento(l.id);
                                    toast.success("Cancelado.");
                                    await carregar();
                                  } catch (err: unknown) {
                                    toast.error(
                                      err instanceof Error
                                        ? err.message
                                        : "Erro",
                                    );
                                  }
                                }}
                              >
                                <X size={14} />
                              </Button>
                            )}
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setExcluirId(l.id)}
                            >
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {aba === "recorrencias" && (
        <>
          <form
            onSubmit={salvarRecorrencia}
            className="mb-6 space-y-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-surface-dark"
          >
            <h3 className="font-bold">
              {recEditId ? "Editar recorrência" : "Nova despesa recorrente"}
            </h3>
            <p className="text-xs text-gray-500">
              Sem data fim. Use “Gerar mês” na aba Lançamentos para criar o
              mês desejado.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="flex flex-col gap-1 text-xs font-semibold">
                Categoria
                <select
                  required
                  value={recCat}
                  onChange={(e) => setRecCat(e.target.value)}
                  className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-surface-dark"
                >
                  <option value="">Selecione…</option>
                  {categorias
                    .filter((c) => c.tipo === "despesa" || c.tipo === "ambos")
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold sm:col-span-2">
                Descrição
                <Input
                  value={recDesc}
                  onChange={(e) => setRecDesc(e.target.value)}
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold">
                Valor mensal
                <Input
                  value={recValor}
                  onChange={(e) => setRecValor(e.target.value)}
                  inputMode="decimal"
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold">
                Dia do vencimento
                <Input
                  value={recDia}
                  onChange={(e) => setRecDia(e.target.value)}
                  inputMode="numeric"
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold">
                Forma
                <select
                  value={recForma}
                  onChange={(e) => setRecForma(e.target.value)}
                  className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-surface-dark"
                >
                  <option value="">—</option>
                  {FORMAS_PAGAMENTO.map((f) => (
                    <option key={f} value={f}>
                      {FORMA_PAGAMENTO_LABEL[f]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  checked={recAtivo}
                  onChange={(e) => setRecAtivo(e.target.checked)}
                />
                Ativa
              </label>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={salvando}>
                {recEditId ? "Atualizar" : "Criar"}
              </Button>
              {recEditId && (
                <Button type="button" variant="outline" onClick={limparRecForm}>
                  Cancelar edição
                </Button>
              )}
            </div>
          </form>

          {carregando ? (
            <div className="flex justify-center py-16">
              <Loader2 className="animate-spin text-cookie-primary" size={36} />
            </div>
          ) : (
            <ul className="space-y-2">
              {recorrencias.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-surface-dark"
                >
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {r.descricao}
                      {!r.ativo && (
                        <span className="ml-2 text-xs font-normal text-gray-400">
                          (inativa)
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500">
                      {r.financeiro_categorias?.nome} · dia {r.dia_vencimento}{" "}
                      · {formatarMoeda(r.valor)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setRecEditId(r.id);
                      setRecCat(r.categoria_id);
                      setRecDesc(r.descricao);
                      setRecValor(String(r.valor));
                      setRecDia(String(r.dia_vencimento));
                      setRecForma(r.forma_pagamento ?? "");
                      setRecObs(r.observacao ?? "");
                      setRecAtivo(r.ativo);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    <Pencil size={14} />
                  </Button>
                </li>
              ))}
              {recorrencias.length === 0 && (
                <p className="py-8 text-center text-sm text-gray-500">
                  Nenhuma recorrência cadastrada.
                </p>
              )}
            </ul>
          )}
        </>
      )}

      <ModalConfirmacao
        aberto={!!excluirId}
        titulo="Excluir lançamento?"
        mensagem="Esta ação não pode ser desfeita."
        aoCancelar={() => setExcluirId(null)}
        aoConfirmar={() => {
          void (async () => {
            if (!excluirId) return;
            try {
              await excluirLancamento(excluirId);
              toast.success("Excluído.");
              setExcluirId(null);
              await carregar();
            } catch (err: unknown) {
              toast.error(err instanceof Error ? err.message : "Erro");
            }
          })();
        }}
      />
    </AdminPageShell>
  );
}
