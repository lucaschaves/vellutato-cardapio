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
import { useIsMobile } from "../hooks/useIsMobile";
import { useRevalidarCupomCarrinho } from "../hooks/useRevalidarCupomCarrinho";
import {
  buscarClientePorCelular,
  upsertCliente,
} from "../lib/clientes";
import { validarCupom } from "../lib/cupons";
import {
  processarPedidoPosCriacao,
  reverterPedidoFalho,
} from "../lib/pedidos";
import { supabase } from "../lib/supabase";
import {
  aoTeclaTelefone,
  criarHandlerTelefone,
  lerCelularLocalStorage,
  normalizarTelefoneParaSalvar,
  salvarCelularLocalStorage,
  telefoneDigitosCompleto,
} from "../lib/telefone";
import { urlCardapio } from "../lib/urlCardapio";
import { useCartStore } from "../store/useCartStore";

interface CarrinhoLateralProps {
  aberto: boolean;
  aoFechar: () => void;
  identificadorMesa: string;
}

type EtapaMobileCarrinho = "itens" | "identificacao";

export function CarrinhoLateral({
  aberto,
  aoFechar,
  identificadorMesa,
}: CarrinhoLateralProps) {
  const {
    itens,
    removerItem,
    alterarQuantidade,
    alterarObservacoes,
    obterSubtotal,
    obterDescontoCupom,
    obterTotal,
    limparCarrinho,
    cupomAplicado,
    aplicarCupom,
    removerCupom,
  } = useCartStore();

  const isMobile = useIsMobile();
  const navigate = useNavigate();

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

  useRevalidarCupomCarrinho(celularCliente, nomeCliente, aberto);

  useEffect(() => {
    if (!aberto) setEtapaMobile("itens");
  }, [aberto]);

  useEffect(() => {
    localStorage.setItem("cliente_nome", nomeCliente);
    salvarCelularLocalStorage(celularCliente);
  }, [nomeCliente, celularCliente]);

  const handlePhoneChange = criarHandlerTelefone(setCelularCliente);

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

  const handlePhoneChangeComReconhecimento = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    handlePhoneChange(e);
    const formatado = e.target.value;
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
    return acc + (precoCheio + adicionais) * item.quantidade;
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
    try {
      setValidandoCupom(true);
      const celularNorm = normalizarTelefoneParaSalvar(celularCliente);
      let clienteId: string | null = null;

      if (celularNorm && nomeCliente.trim()) {
        clienteId = await upsertCliente(nomeCliente, celularNorm);
      }

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

  const finalizarPedido = async (e: React.FormEvent) => {
    e.preventDefault();
    if (itens.length === 0) return;

    if (!nomeCliente.trim()) {
      toast.error("Informe seu nome para enviar o pedido.");
      return;
    }

    try {
      setEnviando(true);

      const celularSalvo = normalizarTelefoneParaSalvar(celularCliente);
      const clienteId = await upsertCliente(nomeCliente, celularSalvo || null);

      const tipoConsumo = localStorage.getItem("tipo_consumo") || "loja";
      const subtotalPedido = obterSubtotal();
      const desconto = obterDescontoCupom();
      const totalPedido = obterTotal();

      const { data: pedido, error: errorPedido } = await supabase
        .from("pedidos")
        .insert({
          cliente_nome: nomeCliente.trim(),
          cliente_celular: celularSalvo || null,
          cliente_id: clienteId,
          cupom_id: cupomAplicado?.id || null,
          desconto_aplicado: desconto > 0 ? desconto : null,
          status: "pendente",
          origem: tipoConsumo === "viagem" ? "balcao" : "mesa",
          identificador:
            tipoConsumo === "viagem"
              ? `${identificadorMesa || "Balcão"} (PARA VIAGEM)`
              : identificadorMesa || "Balcão",
          total: totalPedido,
          valor_total: subtotalPedido,
        })
        .select("id, sequencia_pedido")
        .single();

      if (errorPedido)
        throw new Error(`Falha ao criar o pedido: ${errorPedido.message}`);

      for (const item of itens) {
        const { data: pedidoItem, error: errorItem } = await supabase
          .from("pedido_itens")
          .insert({
            pedido_id: pedido.id,
            produto_id: item.produtoId,
            quantidade: item.quantidade,
            preco_unitario: item.precoBase,
            observacoes: item.observacoes?.trim() || null,
          })
          .select("id")
          .single();

        if (errorItem)
          throw new Error(`Falha ao inserir item: ${errorItem.message}`);

        if (item.adicionais && item.adicionais.length > 0) {
          const adicionais = item.adicionais.map((adc) => ({
            pedido_item_id: pedidoItem.id,
            adicional_id: adc.id,
            preco_aplicado: adc.preco,
          }));

          const { error: errAdc } = await supabase
            .from("pedido_item_adicionais")
            .insert(adicionais);
          if (errAdc)
            throw new Error(`Falha ao inserir adicionais: ${errAdc.message}`);
        }
      }

      try {
        await processarPedidoPosCriacao(pedido.id, cupomAplicado?.id);
      } catch (erroPos: unknown) {
        await reverterPedidoFalho(pedido.id);
        const mensagem =
          erroPos instanceof Error ? erroPos.message : String(erroPos);
        throw new Error(mensagem);
      }

      limparCarrinho();
      setCodigoCupom("");
      setEtapaMobile("itens");
      aoFechar();

      localStorage.setItem("cliente_nome", nomeCliente.trim());
      if (celularSalvo) {
        salvarCelularLocalStorage(celularCliente);
      }

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
        mensagem.includes("Estoque insuficiente")
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
          <input
            type="text"
            value={codigoCupom}
            onChange={(e) => setCodigoCupom(e.target.value.toUpperCase())}
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
      {renderCampoCupom()}

      <div>
        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
          Seu Nome *
        </label>
        <input
          type="text"
          required
          placeholder="Como devemos te chamar?"
          value={nomeCliente}
          onChange={(e) => setNomeCliente(e.target.value)}
          className="w-full px-4 py-3.5 text-base rounded-xl border border-gray-200 dark:border-[#323438] bg-gray-50 dark:bg-[#121212] text-gray-950 dark:text-white focus:ring-2 focus:ring-[#ff5722] focus:border-transparent transition-all outline-none"
          autoComplete="off"
        />
      </div>

      <div>
        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
          Celular / WhatsApp{" "}
          <span className="opacity-60 font-normal normal-case text-[0.6875rem]">
            (Opcional)
          </span>
        </label>
        <input
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          enterKeyHint="done"
          maxLength={15}
          placeholder="(00) 00000-0000"
          value={celularCliente}
          onChange={handlePhoneChangeComReconhecimento}
          onKeyDown={aoTeclaTelefone}
          className="w-full px-4 py-3.5 text-base rounded-xl border border-gray-200 dark:border-[#323438] bg-gray-50 dark:bg-[#121212] text-gray-950 dark:text-white focus:ring-2 focus:ring-[#ff5722] focus:border-transparent transition-all outline-none"
        />
        {buscandoCliente && (
          <p className="text-xs text-gray-500 mt-1">Buscando cadastro...</p>
        )}
      </div>
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
        const valorExibicaoFinal =
          (item.precoBase + totalAdicionais) * item.quantidade;
        const valorExibicaoOriginal =
          (precoCheio + totalAdicionais) * item.quantidade;

        return (
          <div
            key={item.idUnico}
            className="bg-white dark:bg-[#1c1c1e] p-4 rounded-2xl flex gap-4 shadow-sm border border-gray-200 dark:border-[#2a2c30]"
          >
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-xl overflow-hidden bg-gray-100 dark:bg-[#121212] shrink-0 relative">
              <img
                src={item.imagem || "/placeholder.jpg"}
                alt={item.nome}
                className="w-full h-full object-cover"
              />
            </div>

            <div className="flex-1 flex flex-col min-w-0">
              <div className="flex justify-between items-start mb-1 gap-2">
                <div className="min-w-0">
                  <h3 className="font-extrabold text-gray-950 dark:text-white text-sm md:text-base leading-tight">
                    {item.nome}
                  </h3>
                  {item.ehBrinde && (
                    <span className="inline-flex items-center gap-1 mt-1 text-[0.625rem] font-black uppercase tracking-wide text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
                      <Gift size={10} /> Brinde
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removerItem(item.idUnico)}
                  className="text-gray-400 hover:text-red-500 transition-colors p-1 shrink-0"
                  title="Remover Item"
                >
                  <Trash2 size={18} />
                </button>
              </div>

              {item.adicionais && item.adicionais.length > 0 && (
                <div className="text-xs text-gray-700 dark:text-gray-300 mb-2 space-y-0.5 font-medium">
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

              <input
                type="text"
                value={item.observacoes || ""}
                onChange={(e) =>
                  alterarObservacoes(item.idUnico, e.target.value)
                }
                placeholder="Observação (ex: sem cebola)"
                maxLength={200}
                className="w-full mb-2 text-xs px-2 py-1.5 rounded-lg border border-gray-200 dark:border-[#2a2c30] bg-white dark:bg-[#181a1b] text-gray-800 dark:text-gray-200 placeholder:text-gray-400"
              />

              <div className="mt-auto flex items-center justify-between gap-2">
                <div className="flex items-center bg-gray-50 dark:bg-[#2a2c30] rounded-lg border border-gray-200 dark:border-transparent">
                  <button
                    type="button"
                    onClick={() =>
                      alterarQuantidadeItem(item.idUnico, item.quantidade - 1)
                    }
                    className="p-1.5 text-gray-600 dark:text-gray-300 active:scale-95"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="w-6 text-center text-sm font-bold text-gray-950 dark:text-white">
                    {item.quantidade}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      alterarQuantidadeItem(item.idUnico, item.quantidade + 1)
                    }
                    className="p-1.5 text-gray-600 dark:text-gray-300 active:scale-95"
                  >
                    <Plus size={14} />
                  </button>
                </div>

                <div className="text-right flex items-center gap-2">
                  {temDesconto && (
                    <span className="text-xs font-medium text-gray-400 line-through hidden sm:inline">
                      R$ {valorExibicaoOriginal.toFixed(2)}
                    </span>
                  )}
                  <span className="font-black text-gray-950 dark:text-white">
                    R$ {valorExibicaoFinal.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })
    );

  const mostrarLista = !isMobile || etapaMobile === "itens";
  const mostrarIdentificacaoMobile =
    isMobile && etapaMobile === "identificacao";

  return (
    <AnimatePresence>
      {aberto && (
        <motion.div
          initial={{ opacity: 0, y: "100%" }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          className="fixed inset-0 z-50 bg-gray-50 dark:bg-[#121212] flex flex-col md:flex-row overflow-hidden transition-colors duration-300"
        >
          {mostrarLista && (
            <div className="flex flex-col flex-1 min-h-0 md:w-[55%] lg:w-[60%] md:h-full bg-gray-50 dark:bg-[#121212] border-b md:border-b-0 md:border-r border-gray-200 dark:border-[#2a2c30]">
              <div className="flex items-center justify-between p-4 md:p-8 bg-white dark:bg-[#181a1b] shadow-sm z-10 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={aoFechar}
                    className="p-2 bg-gray-100 dark:bg-[#2a2c30] rounded-full text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-[#323438] active:scale-95 transition-all shrink-0"
                  >
                    <X size={20} />
                  </button>
                  <div className="min-w-0">
                    <h2 className="text-lg md:text-2xl font-extrabold text-gray-950 dark:text-white flex items-center gap-2">
                      <ShoppingBag className="text-[#ff5722] shrink-0" /> Meu
                      Pedido
                    </h2>
                    <p className="text-xs text-gray-600 dark:text-gray-300 font-medium truncate">
                      Entrega em {identificadorMesa}
                    </p>
                  </div>
                </div>
                <div className="bg-gray-100 dark:bg-[#2a2c30] px-3 py-1.5 rounded-lg text-sm font-bold text-gray-700 dark:text-gray-200 shrink-0">
                  {itens.length} {itens.length === 1 ? "Item" : "Itens"}
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-8 space-y-4 hide-scrollbar">
                {renderListaItens()}
              </div>

              <div className="md:hidden shrink-0 border-t border-gray-200 dark:border-[#2a2c30] bg-white dark:bg-[#181a1b] p-4 shadow-[0_-8px_24px_rgba(0,0,0,0.08)]">
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
            </div>
          )}

          {mostrarIdentificacaoMobile && (
            <div className="flex flex-col flex-1 min-h-0 md:hidden bg-white dark:bg-[#181a1b]">
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
                    Para entregar na {identificadorMesa}
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
                    disabled={itens.length === 0 || enviando}
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
                    <ShieldCheck size={14} /> Pagamento no balcão/caixa
                  </div>
                </div>
              </form>
            </div>
          )}

          <div className="hidden md:flex md:w-[45%] lg:w-[40%] md:h-full flex-col bg-white dark:bg-[#181a1b] shadow-2xl z-20">
            <form
              onSubmit={finalizarPedido}
              className="flex-1 flex flex-col h-full min-h-0"
            >
              <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-6 hide-scrollbar">
                <div>
                  <h3 className="text-lg font-extrabold text-gray-950 dark:text-white mb-1">
                    Identificação
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mb-4 font-medium">
                    Para entregar seu pedido corretamente na {identificadorMesa}
                    .
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

              <div className="p-6 md:p-10 border-t border-gray-100 dark:border-[#2a2c30] bg-white dark:bg-[#181a1b] shrink-0">
                {renderResumoFinanceiro("grande")}
                <button
                  type="submit"
                  disabled={itens.length === 0 || enviando}
                  className="w-full mt-6 bg-[#ff5722] hover:bg-[#e64a19] disabled:bg-gray-300 dark:disabled:bg-[#2a2c30] disabled:text-gray-500 text-white font-bold py-4 px-6 rounded-2xl flex items-center justify-center gap-3 active:scale-[0.98] transition-all shadow-lg shadow-[#ff5722]/20"
                >
                  {enviando ? (
                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>Enviar Pedido para Cozinha</span>
                      <ArrowRight size={20} />
                    </>
                  )}
                </button>
                <div className="mt-4 flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <ShieldCheck size={14} /> Pagamento realizado diretamente no
                  balcão/caixa.
                </div>
              </div>
            </form>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
