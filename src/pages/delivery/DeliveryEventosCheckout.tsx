import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  cpfValido,
  formatarCpf,
  garantirClienteCheckout,
} from "../../lib/deliveryCliente";
import { iniciarCheckoutAsaas } from "../../lib/deliveryPedido";
import {
  dataMinimaRetirada,
  descontoCaixasEvento,
  normalizarFaixasEvento,
} from "../../lib/eventos";
import { horariosRetiradaNoDia } from "../../lib/lojaAgendamento";
import { mensagemNomeIncompleto } from "../../lib/nomePessoa";
import { supabase } from "../../lib/supabase";
import { formatarTelefoneBr, telefoneDigitosCompleto } from "../../lib/telefone";
import { urlDelivery } from "../../lib/urlDelivery";
import {
  agruparCaixasPorProduto,
  useEventosCartStore,
} from "../../store/useEventosCartStore";

function moeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function DeliveryEventosCheckout() {
  const navigate = useNavigate();
  const itens = useEventosCartStore((s) => s.itens);
  const limpar = useEventosCartStore((s) => s.limpar);
  const [nome, setNome] = useState("");
  const [quemRetira, setQuemRetira] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [cpf, setCpf] = useState("");
  const [data, setData] = useState("");
  const [hora, setHora] = useState("");
  const [opcoesHora, setOpcoesHora] = useState<string[]>([]);
  const [avisoHora, setAvisoHora] = useState<string | null>(null);
  const [percentual, setPercentual] = useState<50 | 100>(50);
  const [enviando, setEnviando] = useState(false);
  const [faixasPorProduto, setFaixasPorProduto] = useState<
    Record<string, { faixas: ReturnType<typeof normalizarFaixasEvento>; dias: number }>
  >({});

  useEffect(() => {
    const ids = [...new Set(itens.map((i) => i.produtoId))];
    if (!ids.length) return;
    void supabase
      .from("produtos")
      .select("id, evento_descontos, evento_dias_antecedencia")
      .in("id", ids)
      .then(({ data: rows }) => {
        const map: typeof faixasPorProduto = {};
        for (const row of rows || []) {
          map[row.id] = {
            faixas: normalizarFaixasEvento(row.evento_descontos),
            dias: Number(row.evento_dias_antecedencia) || 0,
          };
        }
        setFaixasPorProduto(map);
      });
  }, [itens]);

  const grupos = useMemo(() => agruparCaixasPorProduto(itens), [itens]);
  const subtotal = itens.reduce((s, i) => s + i.precoCaixa, 0);
  const desconto = [...grupos.entries()].reduce((s, [id, g]) => {
    return (
      s +
      descontoCaixasEvento(
        g.preco,
        g.qtd,
        faixasPorProduto[id]?.faixas ?? [],
      )
    );
  }, 0);
  const total = Math.max(0, Number((subtotal - desconto).toFixed(2)));
  const entrada = Number(((total * percentual) / 100).toFixed(2));
  const diasMin = Math.max(
    0,
    ...itens.map((i) => faixasPorProduto[i.produtoId]?.dias ?? 0),
  );
  const minData = dataMinimaRetirada(diasMin);

  useEffect(() => {
    if (!data || data < minData) {
      setOpcoesHora([]);
      setAvisoHora(data ? "Essa data é antes do prazo mínimo." : null);
      setHora("");
      return;
    }
    let ativo = true;
    void horariosRetiradaNoDia(data).then((r) => {
      if (!ativo) return;
      setOpcoesHora(r.opcoes);
      setAvisoHora(r.aviso);
      setHora((atual) => (r.opcoes.includes(atual) ? atual : ""));
    });
    return () => {
      ativo = false;
    };
  }, [data, minData]);

  const enviar = async () => {
    if (!itens.length) {
      toast.error("Adicione ao menos uma caixa.");
      return;
    }
    const erroNome = mensagemNomeIncompleto(nome);
    if (erroNome) {
      toast.error(erroNome);
      return;
    }
    if (!telefoneDigitosCompleto(telefone)) {
      toast.error("Informe um telefone válido.");
      return;
    }
    if (!data || data < minData) {
      toast.error(`A retirada precisa ser a partir de ${minData.split("-").reverse().join("/")}.`);
      return;
    }
    if (!hora || !opcoesHora.includes(hora)) {
      toast.error(
        avisoHora && opcoesHora.length === 0
          ? avisoHora
          : "Escolha um horário dentro do funcionamento da loja.",
      );
      return;
    }
    if (!cpfValido(cpf)) {
      toast.error("Informe um CPF válido para o pagamento.");
      return;
    }
    if (!email.includes("@")) {
      toast.error("Informe um e-mail para o pagamento.");
      return;
    }
    try {
      setEnviando(true);
      const cliente = await garantirClienteCheckout({
        nome,
        celular: telefone,
        email,
      });
      const porProduto = agruparCaixasPorProduto(itens);
      const itensRpc = [...porProduto.entries()].flatMap(([produtoId]) => {
        const caixas = itens.filter((i) => i.produtoId === produtoId);
        const g = porProduto.get(produtoId)!;
        const desc = descontoCaixasEvento(
          g.preco,
          g.qtd,
          faixasPorProduto[produtoId]?.faixas ?? [],
        );
        const precoMedio = Number(
          ((g.preco * g.qtd - desc) / g.qtd).toFixed(2),
        );
        return caixas.map((caixa) => ({
          produto_id: produtoId,
          quantidade: 1,
          preco_unitario: precoMedio,
          observacoes: `Sabores: ${caixa.sabores.join(", ")}${
            caixa.observacao ? ` | Obs: ${caixa.observacao}` : ""
          }`,
        }));
      });

      const { data: criado, error } = await supabase.rpc("criar_pedido_evento", {
        p_cliente_nome: nome.trim(),
        p_cliente_celular: telefone,
        p_cliente_id: cliente.id,
        p_quem_retira: (quemRetira || nome).trim(),
        p_cpf: cpf,
        p_data_retirada: data,
        p_horario: hora,
        p_percentual_entrada: percentual,
        p_identificador: "Evento",
        p_itens: itensRpc,
        p_desconto: desconto,
        p_subtotal: subtotal,
        p_total: total,
      });
      if (error) throw new Error(error.message);
      const payload = criado as {
        pedido_id?: string;
        avisos?: string[];
      };
      const avisos = Array.isArray(payload?.avisos) ? payload.avisos : [];
      if (avisos.length) {
        toast.warning(avisos.join(" "));
      }
      const pedidoId = payload?.pedido_id;
      if (!pedidoId) throw new Error("Pedido não retornado.");
      limpar();
      const checkout = await iniciarCheckoutAsaas(pedidoId, {
        email,
        cpf,
        clienteId: cliente.id,
        forcarNovo: true,
      });
      window.location.href = checkout.checkout_url;
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Não foi possível encomendar.");
    } finally {
      setEnviando(false);
    }
  };

  if (!itens.length) {
    return (
      <div className="space-y-3">
        <p>Nenhuma caixa no pedido de evento.</p>
        <Button onClick={() => navigate(urlDelivery("/eventos"))}>
          Ver caixas
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-lg">
      <h1 className="text-2xl font-black">Encomenda para evento</h1>
      <p className="text-sm text-zinc-500">
        Retirada na loja. O sinal ({percentual}%) é pago agora; o restante, na
        retirada.
      </p>

      <div className="bg-white rounded-2xl border p-4 space-y-2 text-sm">
        {itens.map((i) => (
          <p key={i.idUnico}>
            <span className="font-semibold">{i.nome}</span> — {i.sabores.join(", ")}{" "}
            · {moeda(i.precoCaixa)}
          </p>
        ))}
        <p className="pt-2 font-bold flex justify-between">
          <span>Total</span>
          <span>{moeda(total)}</span>
        </p>
        <p className="text-xs text-zinc-500">
          A pagar agora: {moeda(entrada)}
          {percentual === 50 ? ` · na retirada: ${moeda(total - entrada)}` : ""}
        </p>
      </div>

      <div className="space-y-3 bg-white rounded-2xl border p-4">
        <p className="text-xs text-zinc-500">
          Campos com <span className="text-cookie-primary font-bold">*</span> são
          obrigatórios.
        </p>
        <Campo label="Nome completo" obrigatorio>
          <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome e sobrenome" />
        </Campo>
        <Campo label="Quem vai retirar">
          <Input
            value={quemRetira}
            onChange={(e) => setQuemRetira(e.target.value)}
            placeholder="Se for outra pessoa"
          />
        </Campo>
        <Campo label="Telefone" obrigatorio>
          <Input
            value={telefone}
            onChange={(e) => setTelefone(formatarTelefoneBr(e.target.value))}
            inputMode="tel"
          />
        </Campo>
        <Campo label="E-mail" obrigatorio>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
        </Campo>
        <Campo label="CPF" obrigatorio>
          <Input
            value={cpf}
            onChange={(e) => setCpf(formatarCpf(e.target.value))}
            inputMode="numeric"
          />
        </Campo>
        <Campo label="Data da retirada" obrigatorio>
          <Input
            type="date"
            min={minData}
            value={data}
            onChange={(e) => setData(e.target.value)}
          />
        </Campo>
        <Campo label="Horário da retirada" obrigatorio>
          <select
            className="w-full h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm"
            value={hora}
            disabled={!data || opcoesHora.length === 0}
            onChange={(e) => setHora(e.target.value)}
          >
            <option value="">
              {data ? "Selecione o horário" : "Escolha a data primeiro"}
            </option>
            {opcoesHora.map((opcao) => (
              <option key={opcao} value={opcao}>
                {opcao}
              </option>
            ))}
          </select>
          {avisoHora && (
            <p className="text-[11px] text-zinc-500">{avisoHora}</p>
          )}
        </Campo>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className={`rounded-xl border p-3 text-sm font-semibold ${percentual === 50 ? "border-amber-500 bg-amber-50" : ""}`}
            onClick={() => setPercentual(50)}
          >
            50% agora + 50% na retirada
          </button>
          <button
            type="button"
            className={`rounded-xl border p-3 text-sm font-semibold ${percentual === 100 ? "border-amber-500 bg-amber-50" : ""}`}
            onClick={() => setPercentual(100)}
          >
            100% agora
          </button>
        </div>
      </div>

      <Button
        className="w-full bg-cookie-primary hover:bg-cookie-primary-hover"
        disabled={enviando}
        onClick={() => void enviar()}
      >
        {enviando ? "Enviando…" : `Pagar ${moeda(entrada)} e reservar`}
      </Button>
    </div>
  );
}

function Campo({
  label,
  obrigatorio = false,
  children,
}: {
  label: string;
  obrigatorio?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-zinc-500">
        {label}
        {obrigatorio && <span className="text-cookie-primary"> *</span>}
      </span>
      {children}
    </label>
  );
}
