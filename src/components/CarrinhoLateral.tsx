import { AnimatePresence, motion } from "framer-motion";
import {
  Gift,
  ArrowLeft,
  ArrowRight,
  Minus,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Tag,
  Ticket,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { InputTelaCheia } from "./InputTelaCheia";
import { useLayoutCarrinhoSplit } from "../hooks/useLayoutCarrinhoSplit";
import { useRevalidarCupomCarrinho } from "../hooks/useRevalidarCupomCarrinho";
import {
  buscarClientePorCelular,
  upsertCliente,
} from "../lib/clientes";
import { validarCupom } from "../lib/cupons";
import { criarPedidoCompleto, ErroNegocioCheckout } from "../lib/pedidos";
import { buscarStatusLoja, type StatusLoja } from "../lib/lojaStatus";
import { somarDeltasCombo } from "../lib/combos";
import {
  lerCelularLocalStorage,
  normalizarTelefoneParaSalvar,
  salvarCelularLocalStorage,
  telefoneDigitosCompleto,
} from "../lib/telefone";
import { urlCardapio } from "../lib/urlCardapio";
import {
  itensComConflitoConsumo,
  montarOrigemIdentificadorPedido,
  modoConsumoPermitido,
  rotuloDisponibilidade,
  rotuloModoConsumo,
  type ModoConsumoItem,
} from "../lib/disponibilidadeProduto";
import { formatarDescricaoComQuebras } from "../lib/descricaoProduto.tsx";
import { cn } from "../lib/utils";
import { useCartStore } from "../store/useCartStore";

interface CarrinhoLateralProps {
  aberto: boolean;
  aoFechar: () => void;
  /** Número da mesa na URL (só identificação na cozinha) */
  mesa: string | null;
  rotuloDestino?: string;
}

type EtapaMobileCarrinho = "itens" | "identificacao";

export function CarrinhoLateral({
  aberto,
  aoFechar,
  mesa,
  rotuloDestino,
}: CarrinhoLateralProps) {
  const {
    itens,
    removerItem,
    alterarQuantidade,
    alterarModoConsumo,
    obterSubtotal,
    obterDescontoCupom,
    obterTotal,
    limparCarrinho,
    cupomAplicado,
    aplicarCupom,
    removerCupom,
  } = useCartStore();

  const layoutSplitMedia = useLayoutCarrinhoSplit();
  const [layoutSplit, setLayoutSplit] = useState(layoutSplitMedia);
  const navigate = useNavigate();
  const destinoExibicao = rotuloDestino || (mesa ? `Mesa ${mesa}` : "Balcão");
  const textoDestinoCarrinho = mesa
    ? `Pedido · ${destinoExibicao}`
    : "Pedido · escolha comer ou levar em cada item";
  const textoPagamento = "Pagamento no balcão/caixa";

  const [nomeCliente, setNomeCliente] = useState(
    () => localStorage.getItem("cliente_nome") || "",
  );
  const [celularCliente, setCelularCliente] = useState(() =>
    lerCelularLocalStorage(),
  );
  const [codigoCupom, setCodigoCupom] = useState("");
  const [validandoCupom, setValidandoCupom] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [etapaMobile, setEtapaMobile] = useState<EtapaMobileCarrinho>("itens");
  const [buscandoCliente, setBuscandoCliente] = useState(false);
  const [statusLoja, setStatusLoja] = useState<StatusLoja | null>(null);

  // Consulta o horário de funcionamento sempre que o carrinho abre
  useEffect(() => {
    if (!aberto) return;
    let ativo = true;
    buscarStatusLoja().then((status) => {
      if (ativo) setStatusLoja(status);
    });
    return () => {
      ativo = false;
    };
  }, [aberto]);

  const lojaFechada = statusLoja !== null && !statusLoja.aberta;

  useRevalidarCupomCarrinho(celularCliente, nomeCliente, aberto);

  // Congela o layout enquanto o carrinho está aberto — teclado no tablet
  // altera viewport/orientation e fazia o split piscar.
  useEffect(() => {
    if (!aberto) {
      setLayoutSplit(layoutSplitMedia);
    }
  }, [aberto, layoutSplitMedia]);

  useEffect(() => {
    if (!aberto) setEtapaMobile("itens");
  }, [aberto]);

  useEffect(() => {
    localStorage.setItem("cliente_nome", nomeCliente);
    salvarCelularLocalStorage(celularCliente);
  }, [nomeCliente, celularCliente]);

  const reconhecerClientePorTelefone = async (celularFormatado: string) => {
    if (!telefoneDigitosCompleto(celularFormatado)) return;

    try {
      setBuscandoCliente(true);
      const cliente = await buscarClientePorCelular(celularFormatado);
      if (cliente) {
        setNomeCliente(cliente.nome);
        toast.success(`Olá de novo, ${cliente.nome.split(" ")[0]}!`);
      }
    } catch {
      /* opcional — não bloqueia checkout */
    } finally {
      setBuscandoCliente(false);
    }
  };

  const handleCelularChange = (formatado: string) => {
    setCelularCliente(formatado);
    if (telefoneDigitosCompleto(formatado)) {
      void reconhecerClientePorTelefone(formatado);
    }
  };

  const subtotal = obterSubtotal();
  const descontoCupom = obterDescontoCupom();
  const totalFinal = obterTotal();

  const totalOriginal = itens.reduce((acc, item) => {
    const precoCheio = item.originalPrice || item.precoBase;
    const adicionais =
      item.adicionais?.reduce((soma, a) => soma + a.preco, 0) || 0;
    const deltas = somarDeltasCombo(item.escolhasCombo || []);
    return acc + (precoCheio + adicionais + deltas) * item.quantidade;
  }, 0);

  const economiaPromocional = Math.max(totalOriginal - subtotal, 0);
  const economia = totalOriginal - totalFinal;

  const alterarQuantidadeItem = (idUnico: string, novaQuantidade: number) => {
    if (novaQuantidade <= 0) {
      removerItem(idUnico);
      return;
    }
    alterarQuantidade(idUnico, novaQuantidade);
  };

  const handleAplicarCupom = async () => {
    if (!telefoneDigitosCompleto(celularCliente)) {
      toast.error("Informe o celular antes de aplicar o cupom.");
      return;
    }
    if (!nomeCliente.trim()) {
      toast.error("Informe o nome para vincular o cupom ao seu cadastro.");
      return;
    }

    try {
      setValidandoCupom(true);
      const celularNorm = normalizarTelefoneParaSalvar(celularCliente);
      const clienteId = await upsertCliente(nomeCliente, celularNorm);

      const resultado = await validarCupom(codigoCupom, subtotal, clienteId);

      if (resultado.ok === false) {
        toast.error(resultado.erro);
        return;
      }

      aplicarCupom(resultado.cupom);
      toast.success(`Cupom ${resultado.cupom.codigo} aplicado!`);
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error("[ERRO - CUPOM]", mensagem);
      toast.error("Não foi possível validar o cupom.");
    } finally {
      setValidandoCupom(false);
    }
  };

  const solicitarModoConsumo = (idUnico: string, modo: ModoConsumoItem) => {
    const item = itens.find((i) => i.idUnico === idUnico);
    if (!item) return;

    if (!modoConsumoPermitido(item.disponibilidade, modo)) {
      const rotulo = rotuloDisponibilidade(item.disponibilidade);
      const ok = window.confirm(
        `"${item.nome}" ${rotulo ? `é marcado como: ${rotulo}.` : "não permite esse modo."}\n\nDeseja continuar mesmo assim com "${rotuloModoConsumo(modo)}"?`,
      );
      if (!ok) return;
    }

    alterarModoConsumo(idUnico, modo);
  };

  const finalizarPedido = async (e: React.FormEvent) => {
    e.preventDefault();
    if (itens.length === 0) return;

    // Revalida na hora do envio (o banco também bloqueia, isto é só UX)
    const statusAtual = await buscarStatusLoja();
    setStatusLoja(statusAtual);
    if (statusAtual && !statusAtual.aberta) {
      toast.error(statusAtual.motivo || "A loja está fechada no momento.");
      return;
    }

    if (!telefoneDigitosCompleto(celularCliente)) {
      toast.error("Informe um celular válido com DDD para enviar o pedido.");
      return;
    }

    if (!nomeCliente.trim()) {
      toast.error("Informe seu nome para enviar o pedido.");
      return;
    }

    const conflitos = itensComConflitoConsumo(itens);
    if (conflitos.length > 0) {
      const lista = conflitos
        .map(
          (item) =>
            `• ${item.nome} (${rotuloDisponibilidade(item.disponibilidade) || "restrito"} → ${rotuloModoConsumo(item.modoConsumo)})`,
        )
        .join("\n");
      const ok = window.confirm(
        `Alguns itens não combinam com o modo escolhido:\n\n${lista}\n\nDeseja enviar o pedido mesmo assim?`,
      );
      if (!ok) return;
    }

    try {
      setEnviando(true);

      const celularSalvo = normalizarTelefoneParaSalvar(celularCliente);
      const clienteId = await upsertCliente(nomeCliente, celularSalvo);

      if (!clienteId) {
        throw new Error(
          "Não foi possível vincular seu cadastro. Verifique nome e celular.",
        );
      }

      const subtotalPedido = obterSubtotal();
      const desconto = obterDescontoCupom();
      const totalPedido = obterTotal();
      const { origem, identificador } = montarOrigemIdentificadorPedido({
        mesa,
        modos: itens.map((item) => item.modoConsumo),
      });

      // Tudo (pedido + itens + adicionais + combos + estoque + cupom) é
      // criado numa única transação no banco. Falhou, nada fica gravado.
      const pedido = await criarPedidoCompleto({
        cliente_nome: nomeCliente.trim(),
        cliente_celular: celularSalvo,
        cliente_id: clienteId,
        cupom_id: cupomAplicado?.id || null,
        desconto,
        origem,
        identificador,
        total: totalPedido,
        valor_total: subtotalPedido,
        itens: itens.map((item) => ({
          produto_id: item.produtoId,
          quantidade: item.quantidade,
          preco_unitario: item.precoBase,
          observacoes: item.observacoes?.trim() || null,
          modo_consumo: item.modoConsumo,
          adicionais: (item.adicionais ?? []).map((adc) => ({
            adicional_id: adc.id,
            preco_aplicado: adc.preco,
          })),
          combo_escolhas: (item.escolhasCombo ?? []).map((escolha) => ({
            grupo_id: escolha.grupoId,
            produto_escolhido_id: escolha.produtoId,
            nome_grupo: escolha.grupoNome,
            nome_produto: escolha.produtoNome,
            delta_preco: escolha.deltaPreco,
          })),
        })),
      });

      limparCarrinho();
      setCodigoCupom("");
      setEtapaMobile("itens");
      aoFechar();

      localStorage.setItem("cliente_nome", nomeCliente.trim());
      salvarCelularLocalStorage(celularCliente);

      navigate(urlCardapio("pedido-enviado", window.location.search), {
        state: {
          nomeCliente: nomeCliente.trim(),
          sequenciaPedido: pedido.sequencia_pedido,
        },
      });
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error("[ERRO CRÍTICO - CHECKOUT]", mensagem);
      toast.error(
        erro instanceof ErroNegocioCheckout
          ? mensagem
          : "Erro ao processar o pedido. Tente novamente.",
      );
    } finally {
      setEnviando(false);
    }
  };

  const renderResumoFinanceiro = (
    tamanhoTotal: "normal" | "grande" = "normal",
  ) => (
    <div className="space-y-3">
      {lojaFechada && (
        <div className="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-300">
          Estamos fechados no momento.
          {statusLoja?.motivo ? ` ${statusLoja.motivo}` : ""}
        </div>
      )}
      {economiaPromocional > 0 && (
        <>
          <div className="flex justify-between text-gray-600 dark:text-gray-300 text-sm font-medium">
            <span>Subtotal (sem descontos)</span>
            <span>R$ {totalOriginal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-green-600 font-bold text-sm">
            <span>Economia Promocional</span>
            <span>- R$ {economiaPromocional.toFixed(2)}</span>
          </div>
        </>
      )}

      {descontoCupom > 0 && cupomAplicado && (
        <div className="flex justify-between text-green-600 font-bold text-sm">
          <span>Cupom {cupomAplicado.codigo}</span>
          <span>- R$ {descontoCupom.toFixed(2)}</span>
        </div>
      )}

      <div className="flex justify-between items-end border-t border-gray-200 dark:border-[#2a2c30] pt-3">
        <span className="text-base font-bold text-gray-950 dark:text-white">
          Total a pagar
        </span>
        <span
          className={`font-black text-[#ff5722] ${tamanhoTotal === "grande" ? "text-3xl" : "text-2xl"}`}
        >
          R$ {totalFinal.toFixed(2)}
        </span>
      </div>
    </div>
  );

  const renderCampoCupom = () => (
    <div className="space-y-2">
      <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
        Cupom de desconto
      </label>
      {cupomAplicado ? (
        <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-400 font-bold text-sm">
            <Ticket size={16} />
            {cupomAplicado.codigo}
          </div>
          <button
            type="button"
            onClick={() => {
              removerCupom();
              setCodigoCupom("");
            }}
            className="text-xs font-bold text-red-600 hover:text-red-700"
          >
            Remover
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <InputTelaCheia
            modo="cupom"
            value={codigoCupom}
            onValorChange={setCodigoCupom}
            placeholder="Código promocional"
            className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-[#323438] bg-gray-50 dark:bg-[#121212] text-gray-950 dark:text-white uppercase outline-none focus:ring-2 focus:ring-[#ff5722]"
          />
          <button
            type="button"
            onClick={() => void handleAplicarCupom()}
            disabled={!codigoCupom.trim() || validandoCupom}
            className="px-4 py-3 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold text-sm disabled:opacity-50"
          >
            {validandoCupom ? "..." : "Aplicar"}
          </button>
        </div>
      )}
    </div>
  );

  const renderCamposIdentificacao = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
          Celular / WhatsApp *
        </label>
        <InputTelaCheia
          modo="tel"
          required
          autoComplete="tel"
          maxLength={15}
          placeholder="(00) 00000-0000"
          value={celularCliente}
          onValorChange={handleCelularChange}
          className="w-full px-4 py-3.5 text-base rounded-xl border border-gray-200 dark:border-[#323438] bg-gray-50 dark:bg-[#121212] text-gray-950 dark:text-white focus:ring-2 focus:ring-[#ff5722] focus:border-transparent transition-all outline-none"
        />
        {buscandoCliente && (
          <p className="text-xs text-gray-500 mt-1">Buscando cadastro...</p>
        )}
      </div>

      <div>
        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
          Seu Nome *
        </label>
        <InputTelaCheia
          modo="texto"
          required
          placeholder="Como devemos te chamar?"
          value={nomeCliente}
          onValorChange={setNomeCliente}
          className="w-full px-4 py-3.5 text-base rounded-xl border border-gray-200 dark:border-[#323438] bg-gray-50 dark:bg-[#121212] text-gray-950 dark:text-white focus:ring-2 focus:ring-[#ff5722] focus:border-transparent transition-all outline-none"
          autoComplete="off"
        />
      </div>

      {renderCampoCupom()}
    </div>
  );

  const renderListaItens = () =>
    itens.length === 0 ? (
      <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-600">
        <ShoppingBag size={64} className="mb-4 opacity-20" />
        <p className="text-lg font-medium">Seu carrinho está vazio.</p>
      </div>
    ) : (
      itens.map((item) => {
        const precoCheio = item.originalPrice || item.precoBase;
        const temDesconto = precoCheio > item.precoBase;
        const totalAdicionais =
          item.adicionais?.reduce((acc, a) => acc + a.preco, 0) || 0;
        const totalDeltas = somarDeltasCombo(item.escolhasCombo || []);
        const valorExibicaoFinal =
          (item.precoBase + totalAdicionais + totalDeltas) * item.quantidade;
        const valorExibicaoOriginal =
          (precoCheio + totalAdicionais + totalDeltas) * item.quantidade;

        return (
          <div
            key={item.idUnico}
            className="bg-white dark:bg-[#1c1c1e] p-4 md:landscape:p-5 rounded-2xl flex gap-4 md:landscape:gap-5 shadow-sm border border-gray-200 dark:border-[#2a2c30]"
          >
            <div className="w-20 h-20 md:landscape:w-28 md:landscape:h-28 rounded-xl overflow-hidden bg-gray-100 dark:bg-[#121212] shrink-0 relative">
              <img
                src={item.imagem || "/placeholder.jpg"}
                alt={item.nome}
                className="w-full h-full object-cover"
              />
            </div>

            <div className="flex-1 flex flex-col min-w-0">
              <div className="flex justify-between items-start mb-1 gap-2">
                <div className="min-w-0">
                  <h3 className="font-extrabold text-gray-950 dark:text-white text-sm md:landscape:text-lg leading-tight">
                    {item.nome}
                  </h3>
                  {item.descricao && (
                    <p className="mt-1 text-xs md:landscape:text-sm text-gray-600 dark:text-gray-400 leading-snug line-clamp-2 whitespace-pre-line">
                      {formatarDescricaoComQuebras(item.descricao)}
                    </p>
                  )}
                  {item.ehBrinde && (
                    <span className="inline-flex items-center gap-1 mt-1 text-[0.625rem] md:landscape:text-xs font-black uppercase tracking-wide text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
                      <Gift size={10} /> Brinde
                    </span>
                  )}
                  {rotuloDisponibilidade(item.disponibilidade) && (
                    <span className="inline-flex mt-1 text-[0.625rem] md:landscape:text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full">
                      {rotuloDisponibilidade(item.disponibilidade)}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removerItem(item.idUnico)}
                  className="text-gray-400 hover:text-red-500 transition-colors p-1 shrink-0"
                  title="Remover Item"
                >
                  <Trash2 size={18} className="md:landscape:w-5 md:landscape:h-5" />
                </button>
              </div>

              {item.escolhasCombo && item.escolhasCombo.length > 0 && (
                <div className="text-xs md:landscape:text-sm text-gray-700 dark:text-gray-300 mb-2 space-y-0.5 font-medium">
                  {item.escolhasCombo.map((escolha) => (
                    <p key={`${escolha.grupoId}-${escolha.opcaoId}`}>
                      {escolha.grupoNome}: {escolha.produtoNome}
                      {escolha.deltaPreco > 0 && (
                        <span className="opacity-80">
                          {" "}
                          (+R$ {escolha.deltaPreco.toFixed(2)})
                        </span>
                      )}
                    </p>
                  ))}
                </div>
              )}

              {item.adicionais && item.adicionais.length > 0 && (
                <div className="text-xs md:landscape:text-sm text-gray-700 dark:text-gray-300 mb-2 space-y-0.5 font-medium">
                  {item.adicionais.map((adc) => (
                    <p key={adc.id}>
                      + {adc.nome}{" "}
                      <span className="opacity-80">
                        (R$ {adc.preco.toFixed(2)})
                      </span>
                    </p>
                  ))}
                </div>
              )}

              <div className="mb-3 grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-gray-50 dark:bg-[#2a2c30] border border-gray-200 dark:border-transparent">
                {(["loja", "levar"] as const).map((modo) => {
                  const selecionado = item.modoConsumo === modo;
                  const permitido = modoConsumoPermitido(
                    item.disponibilidade,
                    modo,
                  );
                  return (
                    <button
                      key={modo}
                      type="button"
                      onClick={() => solicitarModoConsumo(item.idUnico, modo)}
                      className={cn(
                        "py-2 px-2 rounded-lg text-[0.6875rem] md:landscape:text-xs font-bold transition-all",
                        selecionado
                          ? "bg-[#ff5722] text-white shadow-sm"
                          : permitido
                            ? "text-gray-600 dark:text-gray-300 hover:bg-white/70 dark:hover:bg-[#323438]"
                            : "text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20",
                      )}
                    >
                      {rotuloModoConsumo(modo)}
                    </button>
                  );
                })}
              </div>

              <div className="mt-auto flex items-center justify-between gap-2">
                <div className="flex items-center bg-gray-50 dark:bg-[#2a2c30] rounded-lg border border-gray-200 dark:border-transparent">
                  <button
                    type="button"
                    onClick={() =>
                      alterarQuantidadeItem(item.idUnico, item.quantidade - 1)
                    }
                    className="p-1.5 md:landscape:p-2 text-gray-600 dark:text-gray-300 active:scale-95"
                  >
                    <Minus size={14} className="md:landscape:w-4 md:landscape:h-4" />
                  </button>
                  <span className="w-6 md:landscape:w-8 text-center text-sm md:landscape:text-base font-bold text-gray-950 dark:text-white">
                    {item.quantidade}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      alterarQuantidadeItem(item.idUnico, item.quantidade + 1)
                    }
                    className="p-1.5 md:landscape:p-2 text-gray-600 dark:text-gray-300 active:scale-95"
                  >
                    <Plus size={14} className="md:landscape:w-4 md:landscape:h-4" />
                  </button>
                </div>

                <div className="text-right flex items-center gap-2">
                  {temDesconto && (
                    <span className="text-xs md:landscape:text-sm font-medium text-gray-400 line-through hidden sm:inline">
                      R$ {valorExibicaoOriginal.toFixed(2)}
                    </span>
                  )}
                  <span className="font-black text-gray-950 dark:text-white md:landscape:text-lg">
                    R$ {valorExibicaoFinal.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })
    );

  const layoutCompacto = !layoutSplit;
  const mostrarLista = layoutCompacto ? etapaMobile === "itens" : true;
  const mostrarIdentificacaoCompacta =
    layoutCompacto && etapaMobile === "identificacao";

  return (
    <AnimatePresence>
      {aberto && (
        <motion.div
          initial={
            layoutSplit
              ? { opacity: 0, x: "100%" }
              : { opacity: 0, y: "100%" }
          }
          animate={{ opacity: 1, x: 0, y: 0 }}
          exit={
            layoutSplit
              ? { opacity: 0, x: "100%" }
              : { opacity: 0, y: "100%" }
          }
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          className={cn(
            "fixed inset-0 z-50 bg-gray-50 dark:bg-[#121212] flex overflow-hidden transition-colors duration-300",
            layoutSplit ? "flex-row" : "flex-col",
          )}
        >
          {mostrarLista && (
            <div
              className={cn(
                "flex flex-col flex-1 min-h-0 min-w-0 bg-gray-50 dark:bg-[#121212] border-gray-200 dark:border-[#2a2c30]",
                layoutSplit
                  ? "w-[52%] lg:w-[58%] h-full border-b-0 border-r"
                  : "border-b",
              )}
            >
              <div className="flex items-center justify-between p-4 md:landscape:p-6 lg:landscape:p-8 bg-white dark:bg-[#181a1b] shadow-sm z-10 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={aoFechar}
                    className="p-2 bg-gray-100 dark:bg-[#2a2c30] rounded-full text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-[#323438] active:scale-95 transition-all shrink-0"
                  >
                    <X size={20} />
                  </button>
                  <div className="min-w-0">
                    <h2 className="text-lg md:landscape:text-2xl font-extrabold text-gray-950 dark:text-white flex items-center gap-2">
                      <ShoppingBag className="text-[#ff5722] shrink-0" /> Meu
                      Pedido
                    </h2>
                    <p className="text-xs text-gray-600 dark:text-gray-300 font-medium truncate">
                      {textoDestinoCarrinho}
                    </p>
                  </div>
                </div>
                <div className="bg-gray-100 dark:bg-[#2a2c30] px-3 py-1.5 rounded-lg text-sm font-bold text-gray-700 dark:text-gray-200 shrink-0">
                  {itens.length} {itens.length === 1 ? "Item" : "Itens"}
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-4 md:landscape:p-6 lg:landscape:p-8 space-y-4 hide-scrollbar">
                {renderListaItens()}
              </div>

              {!layoutSplit && (
              <div className="shrink-0 border-t border-gray-200 dark:border-[#2a2c30] bg-white dark:bg-[#181a1b] p-4 shadow-[0_-8px_24px_rgba(0,0,0,0.08)]">
                {renderResumoFinanceiro()}
                <button
                  type="button"
                  onClick={() => setEtapaMobile("identificacao")}
                  disabled={itens.length === 0}
                  className="w-full mt-4 bg-[#ff5722] hover:bg-[#e64a19] disabled:bg-gray-300 dark:disabled:bg-[#2a2c30] disabled:text-gray-500 text-white font-bold py-4 px-6 rounded-2xl flex items-center justify-center gap-3 active:scale-[0.98] transition-all shadow-lg shadow-[#ff5722]/20"
                >
                  <span>Enviar pedido</span>
                  <ArrowRight size={20} />
                </button>
              </div>
              )}
            </div>
          )}

          {mostrarIdentificacaoCompacta && (
            <div className="flex flex-col flex-1 min-h-0 min-w-0 bg-white dark:bg-[#181a1b]">
              <div className="flex items-center gap-3 p-4 border-b border-gray-200 dark:border-[#2a2c30] shrink-0">
                <button
                  type="button"
                  onClick={() => setEtapaMobile("itens")}
                  className="p-2 bg-gray-100 dark:bg-[#2a2c30] rounded-full text-gray-900 dark:text-white active:scale-95 transition-all"
                >
                  <ArrowLeft size={20} />
                </button>
                <div>
                  <h2 className="text-lg font-extrabold text-gray-950 dark:text-white">
                    Identificação
                  </h2>
                  <p className="text-xs text-gray-600 dark:text-gray-300 font-medium">
                    Celular primeiro — cupom e cadastro usam ele como
                    identificador
                    {mesa ? ` · ${destinoExibicao}` : ""}
                  </p>
                </div>
              </div>

              <form
                onSubmit={finalizarPedido}
                className="flex flex-col flex-1 min-h-0"
              >
                <div className="flex-1 overflow-y-auto p-4 space-y-6 hide-scrollbar">
                  {renderCamposIdentificacao()}

                  {economia > 0 && (
                    <div className="bg-green-50 dark:bg-green-900/10 border border-green-100 dark:border-green-900/30 rounded-xl p-4 flex items-start gap-3">
                      <Tag
                        className="text-green-600 dark:text-green-500 mt-0.5"
                        size={18}
                      />
                      <div>
                        <h4 className="text-sm font-bold text-green-800 dark:text-green-400">
                          Descontos Aplicados
                        </h4>
                        <p className="text-xs text-green-700 dark:text-green-500/80 mt-1">
                          Você está economizando R$ {economia.toFixed(2)} neste
                          pedido.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="shrink-0 p-4 border-t border-gray-200 dark:border-[#2a2c30] bg-white dark:bg-[#181a1b]">
                  {renderResumoFinanceiro("grande")}
                  <button
                    type="submit"
                    disabled={itens.length === 0 || enviando || lojaFechada}
                    className="w-full mt-4 bg-[#ff5722] hover:bg-[#e64a19] disabled:bg-gray-300 dark:disabled:bg-[#2a2c30] disabled:text-gray-500 text-white font-bold py-4 px-6 rounded-2xl flex items-center justify-center gap-3 active:scale-[0.98] transition-all shadow-lg shadow-[#ff5722]/20"
                  >
                    {enviando ? (
                      <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <span>Enviar para Cozinha</span>
                        <ArrowRight size={20} />
                      </>
                    )}
                  </button>
                  <div className="mt-3 flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <ShieldCheck size={14} /> {textoPagamento}
                  </div>
                </div>
              </form>
            </div>
          )}

          <div
            className={cn(
              "min-w-0 flex-col bg-white dark:bg-[#181a1b] shadow-2xl z-20",
              layoutSplit
                ? "flex w-[48%] lg:w-[42%] h-full"
                : "hidden",
            )}
          >
            <form
              onSubmit={finalizarPedido}
              className="flex flex-col flex-1 min-h-0"
            >
              <div className="flex-1 min-h-0 overflow-y-auto p-5 md:landscape:p-6 lg:landscape:p-8 space-y-5 hide-scrollbar">
                <div>
                  <h3 className="text-lg font-extrabold text-gray-950 dark:text-white mb-1">
                    Identificação
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mb-4 font-medium">
                    Informe o celular (identificador) e o nome. Cupom exige os
                    dois.
                    {mesa ? ` Pedido vinculado à ${destinoExibicao}.` : ""}
                  </p>
                  {renderCamposIdentificacao()}
                </div>

                {economia > 0 && (
                  <div className="bg-green-50 dark:bg-green-900/10 border border-green-100 dark:border-green-900/30 rounded-xl p-4 flex items-start gap-3">
                    <Tag
                      className="text-green-600 dark:text-green-500 mt-0.5"
                      size={18}
                    />
                    <div>
                      <h4 className="text-sm font-bold text-green-800 dark:text-green-400">
                        Descontos Aplicados
                      </h4>
                      <p className="text-xs text-green-700 dark:text-green-500/80 mt-1">
                        Você está economizando R$ {economia.toFixed(2)} neste
                        pedido.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="shrink-0 p-5 md:landscape:p-6 lg:landscape:p-8 border-t border-gray-100 dark:border-[#2a2c30] bg-white dark:bg-[#181a1b]">
                {renderResumoFinanceiro("grande")}
                <button
                  type="submit"
                  disabled={itens.length === 0 || enviando || lojaFechada}
                  className="w-full mt-4 md:landscape:mt-5 bg-[#ff5722] hover:bg-[#e64a19] disabled:bg-gray-300 dark:disabled:bg-[#2a2c30] disabled:text-gray-500 text-white font-bold py-4 px-6 rounded-2xl flex items-center justify-center gap-3 active:scale-[0.98] transition-all shadow-lg shadow-[#ff5722]/20"
                >
                  {enviando ? (
                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <span className="text-sm lg:landscape:text-base">
                        Enviar Pedido para Cozinha
                      </span>
                      <ArrowRight size={20} className="shrink-0" />
                    </>
                  )}
                </button>
                <div className="mt-3 md:landscape:mt-4 flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <ShieldCheck size={14} /> {textoPagamento}.
                </div>
              </div>
            </form>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
