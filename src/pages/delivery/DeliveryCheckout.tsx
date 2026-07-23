import { Minus, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { IconeGoogle } from "../../components/IconeGoogle";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useDeliveryCliente } from "../../hooks/useDeliveryCliente";
import { validarCupom } from "../../lib/cupons";
import {
  buscarCep,
  formatarCpf,
  garantirClienteCheckout,
  geocodificarEndereco,
  listarEnderecos,
  salvarEndereco,
  type EnderecoCliente,
} from "../../lib/deliveryCliente";
import { buscarDeliveryConfig } from "../../lib/deliveryConfig";
import { avaliarEntrega, type DeliveryConfig } from "../../lib/deliveryFrete";
import {
  lerEnderecoDeliveryLocal,
  lerGuestDeliveryLocal,
  salvarEnderecoDeliveryLocal,
  salvarGuestDeliveryLocal,
} from "../../lib/deliveryGuestStorage";
import {
  cancelarPedidoDeliveryAguardando,
  cancelarPedidosDeliveryExpirados,
  criarPedidoDelivery,
  iniciarCheckoutAsaas,
  type ModalidadeDelivery,
} from "../../lib/deliveryPedido";
import { produtoEstaEsgotado } from "../../lib/estoque";
import { ErroNegocioCheckout } from "../../lib/pedidos";
import { supabase } from "../../lib/supabase";
import {
  formatarTelefoneBr,
  telefoneDigitosCompleto,
} from "../../lib/telefone";
import {
  buscarOfertasVendaCruzada,
  calcularPrecoComDescontoVendaCruzada,
  type OfertaVendaCruzada,
} from "../../lib/vendasCruzadas";
import { useCartStore } from "../../store/useCartStore";

type PassoCheckout = 1 | 2;

interface SugestaoCheckout {
  id: string;
  nome: string;
  imagem_url: string | null;
  precoOriginal: number;
  preco: number;
  ehBrinde?: boolean;
  mensagem?: string | null;
}

function custoItem(item: {
  precoBase: number;
  adicionais: Array<{ preco: number }>;
  quantidade: number;
}) {
  const extras = item.adicionais.reduce((s, a) => s + a.preco, 0);
  return (item.precoBase + extras) * item.quantidade;
}

export function DeliveryCheckout() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    logado,
    cliente,
    usuario,
    entrarComGoogle,
    enviarOtpSms,
    verificarOtpSms,
    recarregar,
    cadastroCompleto,
    carregando: authLoading,
  } = useDeliveryCliente();
  const itens = useCartStore((s) => s.itens);
  const cupomAplicado = useCartStore((s) => s.cupomAplicado);
  const aplicarCupom = useCartStore((s) => s.aplicarCupom);
  const removerCupom = useCartStore((s) => s.removerCupom);
  const limparCarrinho = useCartStore((s) => s.limparCarrinho);
  const alterarQuantidade = useCartStore((s) => s.alterarQuantidade);
  const removerItem = useCartStore((s) => s.removerItem);
  const adicionarItem = useCartStore((s) => s.adicionarItem);
  const consolidarItensIguais = useCartStore((s) => s.consolidarItensIguais);
  const obterSubtotal = useCartStore((s) => s.obterSubtotal);
  const obterDescontoCupom = useCartStore((s) => s.obterDescontoCupom);

  const [passo, setPasso] = useState<PassoCheckout>(1);
  const [config, setConfig] = useState<DeliveryConfig | null>(null);
  const [modalidade, setModalidade] = useState<ModalidadeDelivery>("entrega");
  const [enderecos, setEnderecos] = useState<EnderecoCliente[]>([]);
  const [enderecoId, setEnderecoId] = useState<string | null>(null);
  const [formEndereco, setFormEndereco] = useState(() => {
    const end = lerEnderecoDeliveryLocal();
    if (!end) {
      return {
        cep: "",
        rua: "",
        numero: "",
        bairro: "",
        cidade: "",
        uf: "",
        complemento: "",
        referencia: "",
        latitude: null as number | null,
        longitude: null as number | null,
      };
    }
    const d = end.cep.replace(/\D/g, "");
    return {
      cep: d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : end.cep,
      rua: end.rua,
      numero: end.numero,
      bairro: end.bairro,
      cidade: end.cidade,
      uf: end.uf,
      complemento: end.complemento,
      referencia: end.referencia,
      latitude: end.latitude,
      longitude: end.longitude,
    };
  });
  const [usarNovoEndereco, setUsarNovoEndereco] = useState(
    () => !!lerEnderecoDeliveryLocal(),
  );
  const [cpfNota, setCpfNota] = useState("");
  const [guestNome, setGuestNome] = useState(
    () => lerGuestDeliveryLocal()?.nome ?? "",
  );
  const [guestTelefone, setGuestTelefone] = useState(
    () => lerGuestDeliveryLocal()?.telefone ?? "",
  );
  const [guestEmail, setGuestEmail] = useState(
    () => lerGuestDeliveryLocal()?.email ?? "",
  );
  const [otpEnviado, setOtpEnviado] = useState(false);
  const [otpCodigo, setOtpCodigo] = useState("");
  const [enviandoOtp, setEnviandoOtp] = useState(false);
  const [verificandoOtp, setVerificandoOtp] = useState(false);
  const [telefoneVerificado, setTelefoneVerificado] = useState(false);
  const [, setGuestClienteId] = useState<string | null>(null);
  const [codigoCupom, setCodigoCupom] = useState("");
  const [pagarNaLoja, setPagarNaLoja] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [redirecionandoPagamento, setRedirecionandoPagamento] = useState(false);
  const [freteMsg, setFreteMsg] = useState<string | null>(null);
  const [taxaFrete, setTaxaFrete] = useState(0);
  const [distanciaKm, setDistanciaKm] = useState<number | null>(null);
  const [sugestoes, setSugestoes] = useState<SugestaoCheckout[]>([]);

  const subtotal = obterSubtotal();
  const desconto = obterDescontoCupom();
  const idsNoCarrinho = useMemo(
    () => new Set(itens.map((i) => i.produtoId)),
    [itens],
  );

  useEffect(() => {
    consolidarItensIguais();
  }, [consolidarItensIguais]);

  useEffect(() => {
    void buscarDeliveryConfig().then(setConfig);
  }, []);

  useEffect(() => {
    if (searchParams.get("cancelado") === "1") {
      const pedidoCancelar = searchParams.get("pedido");
      toast.message("Pagamento cancelado. Sua sacola continua aqui.");
      if (pedidoCancelar) {
        void cancelarPedidoDeliveryAguardando(pedidoCancelar);
      }
      searchParams.delete("cancelado");
      searchParams.delete("pedido");
      setSearchParams(searchParams, { replace: true });
    }
    void cancelarPedidosDeliveryExpirados(30);
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (cliente?.cpf) setCpfNota(formatarCpf(cliente.cpf));
    if (cliente?.nome) setGuestNome(cliente.nome);
    if (cliente?.celular) setGuestTelefone(formatarTelefoneBr(cliente.celular));
    if (cliente?.email) setGuestEmail(cliente.email);
    else if (usuario?.email) setGuestEmail(usuario.email);
    if (cliente?.id) setGuestClienteId(cliente.id);
  }, [cliente, usuario?.email]);

  useEffect(() => {
    if (!cliente?.id) return;
    void listarEnderecos(cliente.id).then((lista) => {
      setEnderecos(lista);
      const padrao = lista.find((e) => e.padrao) || lista[0];
      if (padrao) {
        setEnderecoId(padrao.id);
        setUsarNovoEndereco(false);
      } else {
        setUsarNovoEndereco(true);
      }
    });
  }, [cliente?.id]);

  // Conta já autenticada com cadastro completo = telefone ok
  useEffect(() => {
    if (logado && cadastroCompleto && cliente?.celular) {
      setTelefoneVerificado(true);
    }
  }, [logado, cadastroCompleto, cliente?.celular]);

  // Sugestões: vendas cruzadas dos itens + promoções (até 4)
  useEffect(() => {
    if (itens.length === 0) {
      setSugestoes([]);
      return;
    }
    let cancelado = false;
    void (async () => {
      try {
        const gatilhos = [...new Set(itens.map((i) => i.produtoId))];
        const ofertasPorGatilho = await Promise.all(
          gatilhos.map((id) =>
            buscarOfertasVendaCruzada(id).catch(
              () => [] as OfertaVendaCruzada[],
            ),
          ),
        );
        const mapa = new Map<string, SugestaoCheckout>();

        for (const ofertas of ofertasPorGatilho) {
          for (const o of ofertas) {
            const alvo = o.produto_alvo;
            if (idsNoCarrinho.has(alvo.id) || mapa.has(alvo.id)) continue;
            if (produtoEstaEsgotado(alvo)) continue;
            if (
              alvo.disponibilidade &&
              alvo.disponibilidade !== "levar" &&
              alvo.disponibilidade !== "ambos"
            ) {
              continue;
            }
            const precoCheio =
              alvo.em_promocao && alvo.preco_promocional
                ? Number(alvo.preco_promocional)
                : Number(alvo.preco);
            const preco = calcularPrecoComDescontoVendaCruzada(
              precoCheio,
              o.tipo,
              o.valor_desconto,
            );
            mapa.set(alvo.id, {
              id: alvo.id,
              nome: alvo.nome,
              imagem_url: alvo.imagem_url,
              precoOriginal: Number(alvo.preco),
              preco,
              ehBrinde: o.tipo === "brinde",
              mensagem: o.mensagem_oferta,
            });
          }
        }

        if (mapa.size < 4) {
          const { data: promos } = await supabase
            .from("produtos")
            .select(
              "id, nome, imagem_url, preco, preco_promocional, em_promocao, disponibilidade, controlar_estoque, quantidade_estoque",
            )
            .eq("ativo", true)
            .eq("em_promocao", true)
            .in("disponibilidade", ["levar", "ambos"])
            .limit(12);

          for (const p of promos || []) {
            if (mapa.size >= 4) break;
            if (idsNoCarrinho.has(p.id) || mapa.has(p.id)) continue;
            if (produtoEstaEsgotado(p)) continue;
            const preco =
              p.em_promocao && p.preco_promocional
                ? Number(p.preco_promocional)
                : Number(p.preco);
            mapa.set(p.id, {
              id: p.id,
              nome: p.nome,
              imagem_url: p.imagem_url,
              precoOriginal: Number(p.preco),
              preco,
              mensagem: "Promoção",
            });
          }
        }

        if (!cancelado) setSugestoes([...mapa.values()].slice(0, 4));
      } catch (e) {
        console.error(e);
        if (!cancelado) setSugestoes([]);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [itens, idsNoCarrinho]);

  const enderecoAtivo = useMemo(() => {
    if (usarNovoEndereco) return formEndereco;
    const e = enderecos.find((x) => x.id === enderecoId);
    if (!e) return formEndereco;
    return {
      cep: e.cep,
      rua: e.rua,
      numero: e.numero,
      bairro: e.bairro,
      cidade: e.cidade,
      uf: e.uf,
      complemento: e.complemento || "",
      referencia: e.referencia || "",
      latitude: e.latitude,
      longitude: e.longitude,
    };
  }, [usarNovoEndereco, formEndereco, enderecos, enderecoId]);

  useEffect(() => {
    if (!config || modalidade !== "entrega") {
      setTaxaFrete(0);
      setFreteMsg(null);
      setDistanciaKm(null);
      return;
    }
    if (enderecoAtivo.latitude == null || enderecoAtivo.longitude == null) {
      setFreteMsg("Informe o endereço completo para calcular o frete.");
      setTaxaFrete(0);
      return;
    }
    const r = avaliarEntrega(
      config,
      enderecoAtivo.latitude,
      enderecoAtivo.longitude,
      subtotal,
    );
    if (!r.ok) {
      setFreteMsg(r.erro);
      setTaxaFrete(0);
      setDistanciaKm(r.distancia_km ?? null);
      return;
    }
    setFreteMsg(null);
    setTaxaFrete(r.taxa);
    setDistanciaKm(r.distancia_km);
  }, [config, modalidade, enderecoAtivo, subtotal]);

  const freteConfirmado =
    modalidade === "entrega" &&
    !freteMsg &&
    enderecoAtivo.latitude != null &&
    enderecoAtivo.longitude != null;

  const taxaMinimaEstimada = config?.faixas_frete?.length
    ? Math.min(...config.faixas_frete.map((f) => f.taxa))
    : 0;

  const taxaExibida =
    modalidade === "entrega"
      ? freteConfirmado
        ? taxaFrete
        : taxaMinimaEstimada
      : 0;

  const total =
    Math.max(0, subtotal - desconto) +
    (modalidade === "entrega" ? taxaFrete : 0);

  const totalPasso1 =
    Math.max(0, subtotal - desconto) +
    (modalidade === "entrega" ? taxaExibida : 0);

  const buscarCepHandler = async () => {
    const cepLimpo = formEndereco.cep.replace(/\D/g, "");
    if (cepLimpo.length !== 8) {
      toast.error("Informe um CEP válido com 8 dígitos");
      return;
    }
    try {
      setBuscandoCep(true);
      const dados = await buscarCep(cepLimpo);
      if (!dados) {
        toast.error("CEP não encontrado");
        setFormEndereco((f) => ({
          ...f,
          cep: cepLimpo,
          rua: "",
          bairro: "",
          cidade: "",
          uf: "",
          latitude: null,
          longitude: null,
        }));
        return;
      }

      const atualizado = {
        ...formEndereco,
        cep: cepLimpo,
        ...dados,
        latitude: null as number | null,
        longitude: null as number | null,
      };

      // Geocodifica com o que veio do CEP (+ número se já preenchido)
      try {
        const coords = await geocodificarEndereco({
          ...atualizado,
          numero: formEndereco.numero || "1",
        });
        if (coords) {
          atualizado.latitude = coords.latitude;
          atualizado.longitude = coords.longitude;
        }
      } catch {
        // CEP ok mesmo se o mapa falhar; coords podem vir ao informar o número
      }

      setFormEndereco(atualizado);
      toast.success(
        atualizado.latitude != null
          ? "Endereço encontrado"
          : "CEP encontrado — informe o número",
      );
    } catch {
      toast.error("Falha ao buscar CEP");
    } finally {
      setBuscandoCep(false);
    }
  };

  const geocodificarComNumero = async (numero: string) => {
    if (
      !formEndereco.cidade?.trim() ||
      !formEndereco.rua?.trim() ||
      !numero.trim()
    ) {
      return;
    }
    try {
      const coords = await geocodificarEndereco({
        ...formEndereco,
        numero: numero.trim(),
      });
      if (coords) {
        setFormEndereco((f) => ({ ...f, ...coords }));
      }
    } catch {
      // silencioso — validação no pagar
    }
  };

  const enviarCodigoCheckout = async () => {
    if (!telefoneDigitosCompleto(guestTelefone)) {
      toast.error("Informe um telefone válido com DDD.");
      return;
    }
    try {
      setEnviandoOtp(true);
      await enviarOtpSms(guestTelefone);
      setOtpEnviado(true);
      setOtpCodigo("");
      toast.success("Código enviado por SMS.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar SMS");
    } finally {
      setEnviandoOtp(false);
    }
  };

  /** Confirma telefone via OTP; só então carrega dados do cliente. */
  const confirmarCodigoCheckout = async () => {
    if (!telefoneDigitosCompleto(guestTelefone)) {
      toast.error("Informe um telefone válido com DDD.");
      return;
    }
    try {
      setVerificandoOtp(true);
      await verificarOtpSms(guestTelefone, otpCodigo);
      await recarregar();
      setTelefoneVerificado(true);
      setOtpEnviado(false);
      setOtpCodigo("");
      toast.success("Telefone confirmado!");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Código inválido");
    } finally {
      setVerificandoOtp(false);
    }
  };

  const aoAlterarTelefone = (valor: string) => {
    const formatado = formatarTelefoneBr(valor);
    setGuestTelefone(formatado);
    if (telefoneVerificado || otpEnviado) {
      setTelefoneVerificado(false);
      setOtpEnviado(false);
      setOtpCodigo("");
    }
  };

  const persistirClienteEEnderecoLocal = async (
    clienteId: string,
    nome: string,
    celular: string | null,
    email: string | null,
  ) => {
    salvarGuestDeliveryLocal({
      nome,
      telefone: celular || guestTelefone,
      email,
      clienteId,
    });

    if (modalidade !== "entrega") return;
    if (
      enderecoAtivo.latitude == null ||
      enderecoAtivo.longitude == null ||
      !enderecoAtivo.rua?.trim()
    ) {
      return;
    }

    const snap = {
      cep: enderecoAtivo.cep,
      rua: enderecoAtivo.rua,
      numero: enderecoAtivo.numero,
      bairro: enderecoAtivo.bairro,
      cidade: enderecoAtivo.cidade,
      uf: enderecoAtivo.uf,
      complemento: enderecoAtivo.complemento || "",
      referencia: enderecoAtivo.referencia || "",
      latitude: enderecoAtivo.latitude,
      longitude: enderecoAtivo.longitude,
    };
    salvarEnderecoDeliveryLocal(snap);

    try {
      await salvarEndereco({
        cliente_id: clienteId,
        rotulo: "Casa",
        cep: snap.cep,
        rua: snap.rua,
        numero: snap.numero,
        bairro: snap.bairro,
        cidade: snap.cidade,
        uf: snap.uf,
        complemento: snap.complemento || null,
        referencia: snap.referencia || null,
        latitude: snap.latitude,
        longitude: snap.longitude,
        padrao: true,
      });
    } catch (e) {
      console.error("[DELIVERY] salvar endereço cliente", e);
    }
  };

  const enderecoEntregaOk =
    modalidade !== "entrega" ||
    (!!enderecoAtivo.cep?.replace(/\D/g, "") &&
      enderecoAtivo.cep.replace(/\D/g, "").length === 8 &&
      !!enderecoAtivo.rua?.trim() &&
      !!enderecoAtivo.numero?.trim() &&
      !!enderecoAtivo.bairro?.trim() &&
      !!enderecoAtivo.cidade?.trim() &&
      !!enderecoAtivo.uf?.trim() &&
      enderecoAtivo.latitude != null &&
      enderecoAtivo.longitude != null &&
      !freteMsg);

  const usaDadosConta = Boolean(
    logado &&
    cadastroCompleto &&
    cliente?.nome?.trim() &&
    cliente.celular &&
    telefoneDigitosCompleto(cliente.celular),
  );
  const emailConta = cliente?.email?.trim() || usuario?.email?.trim() || "";
  const precisaEmailPagamento = !(modalidade === "retirada" && pagarNaLoja);
  const dadosClienteOk = (() => {
    if (usaDadosConta) {
      if (!precisaEmailPagamento) return true;
      return Boolean(
        emailConta.includes("@") ||
        (guestEmail.trim().includes("@") && guestEmail.trim().includes(".")),
      );
    }
    return Boolean(
      telefoneVerificado &&
      guestNome.trim() &&
      telefoneDigitosCompleto(guestTelefone) &&
      (!precisaEmailPagamento ||
        (guestEmail.trim().includes("@") && guestEmail.trim().includes("."))),
    );
  })();

  const podePagar = !enviando && enderecoEntregaOk && dadosClienteOk;

  const aplicarCupomHandler = async () => {
    try {
      const r = await validarCupom(codigoCupom, subtotal, cliente?.id);
      if (!r.ok) {
        toast.error(r.erro);
        return;
      }
      aplicarCupom(r.cupom);
      toast.success("Cupom aplicado");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro no cupom");
    }
  };

  const adicionarSugestao = (s: SugestaoCheckout) => {
    adicionarItem({
      produtoId: s.id,
      nome: s.nome,
      precoBase: s.preco,
      originalPrice: s.precoOriginal,
      quantidade: 1,
      imagem: s.imagem_url || undefined,
      adicionais: [],
      ehBrinde: s.ehBrinde,
      disponibilidade: "levar",
      modoConsumo: "levar",
    });
    toast.success(`${s.nome} adicionado`);
  };

  const irParaEntrega = () => {
    if (itens.length === 0) {
      toast.warning("Sacola vazia");
      return;
    }
    if (config && subtotal < config.pedido_minimo) {
      toast.error(
        `Pedido mínimo de R$ ${config.pedido_minimo.toFixed(2)} (itens).`,
      );
      return;
    }
    setPasso(2);
  };

  const finalizar = async () => {
    if (itens.length === 0) {
      toast.warning("Sacola vazia");
      return;
    }
    if (modalidade === "entrega") {
      if (!enderecoAtivo.rua?.trim() || !enderecoAtivo.numero?.trim()) {
        toast.error("Preencha o endereço completo (CEP, rua e número).");
        return;
      }
      if (!enderecoAtivo.cidade?.trim() || !enderecoAtivo.uf?.trim()) {
        toast.error("Busque o CEP para preencher cidade e estado.");
        return;
      }
      if (enderecoAtivo.latitude == null || enderecoAtivo.longitude == null) {
        toast.error("Busque o CEP para localizar o endereço no mapa.");
        return;
      }
      if (freteMsg) {
        toast.error(freteMsg);
        return;
      }
    }

    const statusPagamento =
      modalidade === "retirada" && pagarNaLoja ? "na_loja" : "aguardando";

    if (!usaDadosConta && !telefoneVerificado) {
      toast.error("Confirme seu telefone com o código SMS.");
      return;
    }

    try {
      setEnviando(true);

      let clienteId: string | null = null;
      let clienteNome = "";
      let clienteCelular: string | null = null;
      let emailPagamento: string | null = null;
      let cpfCliente: string | null = null;

      if (usaDadosConta && cliente) {
        clienteId = cliente.id;
        clienteNome = cliente.nome;
        clienteCelular = cliente.celular;
        emailPagamento = emailConta || guestEmail.trim() || null;
        cpfCliente = cliente.cpf;
      } else {
        if (!guestNome.trim()) {
          toast.error("Informe seu nome.");
          return;
        }
        if (!telefoneDigitosCompleto(guestTelefone)) {
          toast.error("Informe um telefone válido com DDD.");
          return;
        }
        if (
          statusPagamento === "aguardando" &&
          !(guestEmail.trim().includes("@") && guestEmail.trim().includes("."))
        ) {
          toast.error("Informe um e-mail para o pagamento online.");
          return;
        }

        const clienteCheckout = await garantirClienteCheckout({
          nome: guestNome,
          celular: guestTelefone,
          email: guestEmail.trim() || null,
        });
        clienteId = clienteCheckout.id;
        clienteNome = clienteCheckout.nome;
        clienteCelular = clienteCheckout.celular;
        emailPagamento =
          clienteCheckout.email?.trim() || guestEmail.trim() || null;
        cpfCliente = clienteCheckout.cpf;
      }

      if (statusPagamento === "aguardando" && !emailPagamento) {
        toast.error("Informe um e-mail para o pagamento online.");
        return;
      }

      const resultado = await criarPedidoDelivery({
        cliente_nome: clienteNome,
        cliente_celular: clienteCelular,
        cliente_id: clienteId,
        cupom_id: cupomAplicado?.id || null,
        desconto,
        identificador: modalidade === "entrega" ? "DELIVERY" : "RETIRADA",
        total,
        valor_total: total,
        itens: itens.map((item) => ({
          produto_id: item.produtoId,
          quantidade: item.quantidade,
          preco_unitario: item.precoBase,
          observacoes: item.observacoes || null,
          modo_consumo: "levar",
          adicionais: item.adicionais.map((a) => ({
            adicional_id: a.id,
            preco_aplicado: a.preco,
          })),
          combo_escolhas: (item.escolhasCombo || []).map((e) => ({
            grupo_id: e.grupoId,
            produto_escolhido_id: e.produtoId,
            nome_grupo: e.grupoNome,
            nome_produto: e.produtoNome,
            delta_preco: e.deltaPreco,
          })),
        })),
        modalidade,
        status_pagamento: statusPagamento,
        taxa_entrega: modalidade === "entrega" ? taxaFrete : 0,
        subtotal_itens: subtotal,
        cpf_nota: cpfNota.replace(/\D/g, "") || cpfCliente,
        endereco:
          modalidade === "entrega"
            ? {
                cep: enderecoAtivo.cep,
                rua: enderecoAtivo.rua,
                numero: enderecoAtivo.numero,
                bairro: enderecoAtivo.bairro,
                cidade: enderecoAtivo.cidade,
                uf: enderecoAtivo.uf,
                complemento: enderecoAtivo.complemento,
                referencia: enderecoAtivo.referencia,
                latitude: enderecoAtivo.latitude!,
                longitude: enderecoAtivo.longitude!,
              }
            : null,
        distancia_km: distanciaKm,
      });

      // A + B: localStorage + cliente_enderecos (mesmo sem login)
      if (clienteId) {
        await persistirClienteEEnderecoLocal(
          clienteId,
          clienteNome,
          clienteCelular,
          emailPagamento,
        );
        setGuestClienteId(clienteId);
      }

      if (statusPagamento === "na_loja") {
        limparCarrinho();
        toast.success("Pedido enviado à cozinha!");
        navigate(`/delivery/pedido/${resultado.pedido_id}`);
        return;
      }

      toast.message("Abrindo pagamento seguro…");
      const checkout = await iniciarCheckoutAsaas(resultado.pedido_id, {
        email: emailPagamento,
      });

      // Sacola só limpa após pagamento confirmado (página do pedido / webhook).
      setRedirecionandoPagamento(true);
      window.location.assign(checkout.checkout_url);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (e instanceof ErroNegocioCheckout) toast.error(msg);
      else toast.error(msg || "Falha ao criar pedido");
      setRedirecionandoPagamento(false);
    } finally {
      setEnviando(false);
    }
  };

  if (authLoading || redirecionandoPagamento) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <div className="animate-spin h-8 w-8 border-4 border-red-600 border-t-transparent rounded-full" />
        <p className="text-sm font-semibold text-zinc-600">
          {redirecionandoPagamento
            ? "Redirecionando para o pagamento…"
            : "Carregando…"}
        </p>
      </div>
    );
  }

  if (itens.length === 0) {
    return (
      <div className="text-center py-16 space-y-3">
        <p className="font-bold">Sacola vazia</p>
        <Button onClick={() => navigate("/delivery")}>Ver cardápio</Button>
      </div>
    );
  }

  return (
    <div className="relative space-y-4 pb-8">
      {enviando && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-white/80 backdrop-blur-sm">
          <div className="animate-spin h-10 w-10 border-4 border-red-600 border-t-transparent rounded-full" />
          <p className="text-sm font-bold text-zinc-700">
            Preparando pagamento…
          </p>
          <p className="text-xs text-zinc-500 max-w-xs text-center">
            Você será enviado à página segura do Asaas (Pix ou cartão).
          </p>
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-black">
          {passo === 1 ? "Sua sacola" : "Entrega e pagamento"}
        </h1>
        <span className="text-xs font-semibold text-zinc-400">
          Passo {passo} de 2
        </span>
      </div>

      <div className="flex gap-2">
        <div
          className={`h-1 flex-1 rounded-full ${passo >= 1 ? "bg-red-600" : "bg-zinc-200"}`}
        />
        <div
          className={`h-1 flex-1 rounded-full ${passo >= 2 ? "bg-red-600" : "bg-zinc-200"}`}
        />
      </div>

      {passo === 1 && (
        <>
          <div className="grid grid-cols-2 gap-2">
            {(["entrega", "retirada"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setModalidade(m)}
                className={`rounded-2xl border p-3 font-bold capitalize ${
                  modalidade === m
                    ? "border-red-600 bg-red-50 text-red-700"
                    : "border-zinc-200 bg-white"
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <section className="bg-white rounded-2xl border border-zinc-200 divide-y divide-zinc-100">
            {itens.map((i) => (
              <div key={i.idUnico} className="flex gap-3 p-3">
                <div className="h-16 w-16 shrink-0 rounded-xl overflow-hidden bg-zinc-100">
                  {i.imagem ? (
                    <img
                      src={i.imagem}
                      alt={i.nome}
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm leading-snug">{i.nome}</p>
                  {i.adicionais.length > 0 && (
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {i.adicionais.map((a) => a.nome).join(", ")}
                    </p>
                  )}
                  <p className="text-sm font-bold text-red-600 mt-1">
                    R$ {custoItem(i).toFixed(2).replace(".", ",")}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex items-center gap-1 rounded-xl border border-zinc-200 bg-zinc-50 p-0.5">
                      <button
                        type="button"
                        className="h-8 w-8 rounded-lg bg-white flex items-center justify-center"
                        onClick={() =>
                          i.quantidade <= 1
                            ? removerItem(i.idUnico)
                            : alterarQuantidade(i.idUnico, i.quantidade - 1)
                        }
                      >
                        {i.quantidade <= 1 ? (
                          <Trash2 size={14} className="text-zinc-500" />
                        ) : (
                          <Minus size={14} />
                        )}
                      </button>
                      <span className="w-6 text-center text-sm font-bold">
                        {i.quantidade}
                      </span>
                      <button
                        type="button"
                        className="h-8 w-8 rounded-lg bg-white flex items-center justify-center"
                        onClick={() =>
                          alterarQuantidade(i.idUnico, i.quantidade + 1)
                        }
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </section>

          {sugestoes.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-bold text-sm text-zinc-500 uppercase tracking-wider">
                Aproveite também
              </h2>
              <div className="grid grid-cols-2 gap-2">
                {sugestoes.map((s) => (
                  <div
                    key={s.id}
                    className="bg-white border border-zinc-200 rounded-2xl p-2.5 flex flex-col"
                  >
                    <div className="aspect-square rounded-xl overflow-hidden bg-zinc-100 mb-2">
                      {s.imagem_url ? (
                        <img
                          src={s.imagem_url}
                          alt={s.nome}
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </div>
                    <p className="text-xs font-semibold leading-snug line-clamp-2 min-h-[2rem]">
                      {s.nome}
                    </p>
                    <div className="flex items-baseline gap-1.5 mt-1">
                      <span className="text-sm font-black text-red-600">
                        {s.ehBrinde
                          ? "Grátis"
                          : `R$ ${s.preco.toFixed(2).replace(".", ",")}`}
                      </span>
                      {!s.ehBrinde && s.preco < s.precoOriginal && (
                        <span className="text-[10px] text-zinc-400 line-through">
                          R$ {s.precoOriginal.toFixed(2).replace(".", ",")}
                        </span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      className="w-full mt-2 bg-red-600 hover:bg-red-700 h-8 text-xs"
                      onClick={() => adicionarSugestao(s)}
                    >
                      Adicionar
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="bg-white rounded-2xl border border-zinc-200 p-4 space-y-3">
            <h2 className="font-bold">Cupom</h2>
            {cupomAplicado ? (
              <div className="flex justify-between text-sm">
                <span className="font-mono font-bold">
                  {cupomAplicado.codigo}
                </span>
                <button
                  type="button"
                  className="text-red-600 font-semibold"
                  onClick={() => removerCupom()}
                >
                  Remover
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  value={codigoCupom}
                  onChange={(e) => setCodigoCupom(e.target.value)}
                  placeholder="Código do cupom"
                />
                <Button
                  variant="outline"
                  onClick={() => void aplicarCupomHandler()}
                >
                  Aplicar
                </Button>
              </div>
            )}
          </section>

          <section className="bg-white rounded-2xl border border-zinc-200 p-4 space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>R$ {subtotal.toFixed(2).replace(".", ",")}</span>
            </div>
            {desconto > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Desconto</span>
                <span>- R$ {desconto.toFixed(2).replace(".", ",")}</span>
              </div>
            )}
            {modalidade === "entrega" && (
              <div className="flex justify-between text-zinc-600">
                <span>Entrega</span>
                <span>
                  {freteConfirmado
                    ? `R$ ${taxaFrete.toFixed(2).replace(".", ",")}`
                    : `a partir de R$ ${taxaExibida.toFixed(2).replace(".", ",")}`}
                </span>
              </div>
            )}
            {modalidade === "retirada" && (
              <div className="flex justify-between text-zinc-600">
                <span>Entrega</span>
                <span>Grátis (retirada)</span>
              </div>
            )}
            <div className="flex justify-between font-black text-base pt-1">
              <span>Total</span>
              <span>R$ {totalPasso1.toFixed(2).replace(".", ",")}</span>
            </div>
            {modalidade === "entrega" && !freteConfirmado && (
              <p className="text-[11px] text-zinc-400 pt-1">
                Frete final confirmado no próximo passo com o endereço.
              </p>
            )}
          </section>

          <Button
            className="w-full h-12 bg-red-600 hover:bg-red-700 text-base font-bold"
            onClick={irParaEntrega}
          >
            Continuar
          </Button>
        </>
      )}

      {passo === 2 && (
        <>
          <section className="bg-white rounded-2xl border border-zinc-200 p-4 space-y-3">
            <div>
              <h2 className="font-bold">Seus dados</h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                {usaDadosConta
                  ? "Usando os dados da sua conta."
                  : "Confirme o telefone com o código SMS para continuar."}
              </p>
            </div>

            {usaDadosConta && cliente ? (
              <div className="space-y-3">
                <div className="rounded-xl bg-zinc-50 border border-zinc-100 px-3 py-3 space-y-1 text-sm">
                  <p className="font-semibold">{cliente.nome}</p>
                  {cliente.celular && (
                    <p className="text-zinc-600">
                      {formatarTelefoneBr(cliente.celular)}
                    </p>
                  )}
                  {emailConta && (
                    <p className="text-zinc-500 text-xs">{emailConta}</p>
                  )}
                </div>
                {precisaEmailPagamento && !emailConta.includes("@") && (
                  <div className="space-y-1.5">
                    <label
                      htmlFor="checkout-email-conta"
                      className="text-sm font-semibold text-zinc-800"
                    >
                      E-mail <span className="text-red-600">*</span>
                    </label>
                    <Input
                      id="checkout-email-conta"
                      placeholder="seu@email.com"
                      type="email"
                      value={guestEmail}
                      autoComplete="email"
                      onChange={(e) => setGuestEmail(e.target.value)}
                    />
                    <p className="text-[11px] text-zinc-400">
                      Necessário para o pagamento online (Pix/cartão).
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label
                    htmlFor="checkout-tel"
                    className="text-sm font-semibold text-zinc-800"
                  >
                    Telefone / WhatsApp <span className="text-red-600">*</span>
                  </label>
                  <Input
                    id="checkout-tel"
                    placeholder="(00) 00000-0000"
                    value={guestTelefone}
                    inputMode="tel"
                    autoComplete="tel"
                    disabled={telefoneVerificado}
                    onChange={(e) => aoAlterarTelefone(e.target.value)}
                  />
                  {telefoneVerificado ? (
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-emerald-600">
                        Telefone confirmado
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setTelefoneVerificado(false);
                          setOtpEnviado(false);
                          setOtpCodigo("");
                        }}
                        className="text-xs font-semibold text-zinc-500"
                      >
                        Alterar
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2 pt-1">
                      {otpEnviado && (
                        <Input
                          id="checkout-otp"
                          placeholder="Código SMS (6 dígitos)"
                          value={otpCodigo}
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={6}
                          onChange={(e) =>
                            setOtpCodigo(
                              e.target.value.replace(/\D/g, "").slice(0, 6),
                            )
                          }
                        />
                      )}
                      {!otpEnviado ? (
                        <Button
                          type="button"
                          className="w-full bg-red-600 hover:bg-red-700"
                          disabled={enviandoOtp}
                          onClick={() => void enviarCodigoCheckout()}
                        >
                          {enviandoOtp
                            ? "Enviando…"
                            : "Enviar código por SMS para confirmar"}
                        </Button>
                      ) : (
                        <div className="space-y-2">
                          <Button
                            type="button"
                            className="w-full bg-red-600 hover:bg-red-700"
                            disabled={verificandoOtp || otpCodigo.length < 6}
                            onClick={() => void confirmarCodigoCheckout()}
                          >
                            {verificandoOtp
                              ? "Verificando…"
                              : "Confirmar código"}
                          </Button>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              className="flex-1"
                              disabled={enviandoOtp}
                              onClick={() => void enviarCodigoCheckout()}
                            >
                              Reenviar
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className="flex-1"
                              onClick={() => {
                                setOtpEnviado(false);
                                setOtpCodigo("");
                              }}
                            >
                              Alterar telefone
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {telefoneVerificado && (
                  <>
                    <div className="space-y-1.5">
                      <label
                        htmlFor="checkout-nome"
                        className="text-sm font-semibold text-zinc-800"
                      >
                        Nome completo <span className="text-red-600">*</span>
                      </label>
                      <Input
                        id="checkout-nome"
                        placeholder="Como devemos te chamar"
                        value={guestNome}
                        autoComplete="name"
                        onChange={(e) => setGuestNome(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label
                        htmlFor="checkout-email"
                        className="text-sm font-semibold text-zinc-800"
                      >
                        E-mail{" "}
                        {precisaEmailPagamento ? (
                          <span className="text-red-600">*</span>
                        ) : (
                          <span className="text-zinc-400 font-normal">
                            (opcional)
                          </span>
                        )}
                      </label>
                      <Input
                        id="checkout-email"
                        placeholder="seu@email.com"
                        type="email"
                        value={guestEmail}
                        autoComplete="email"
                        onChange={(e) => setGuestEmail(e.target.value)}
                      />
                      {precisaEmailPagamento && (
                        <p className="text-[11px] text-zinc-400">
                          Necessário para o pagamento online (Pix/cartão).
                        </p>
                      )}
                    </div>
                  </>
                )}
                {!logado && !telefoneVerificado && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() =>
                      void entrarComGoogle(
                        `${window.location.origin}/delivery/auth/callback`,
                      ).catch((e) =>
                        toast.error(
                          e instanceof Error ? e.message : "Erro no login",
                        ),
                      )
                    }
                  >
                    <IconeGoogle className="h-5 w-5 mr-2" />
                    Entrar com Google
                  </Button>
                )}
              </div>
            )}
          </section>

          {modalidade === "entrega" && (
            <section className="bg-white rounded-2xl border border-zinc-200 p-4 space-y-3">
              <div>
                <h2 className="font-bold">Endereço de entrega</h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Comece pelo CEP — o restante fica mais fácil.
                </p>
              </div>
              {enderecos.length > 0 && (
                <div className="space-y-2">
                  {enderecos.map((e) => (
                    <label
                      key={e.id}
                      className="flex gap-2 items-start text-sm border rounded-xl p-3 cursor-pointer"
                    >
                      <input
                        type="radio"
                        checked={!usarNovoEndereco && enderecoId === e.id}
                        onChange={() => {
                          setUsarNovoEndereco(false);
                          setEnderecoId(e.id);
                        }}
                      />
                      <span>
                        {e.rua}, {e.numero} — {e.bairro}, {e.cidade}/{e.uf}
                      </span>
                    </label>
                  ))}
                  <button
                    type="button"
                    className="text-sm text-red-600 font-semibold"
                    onClick={() => setUsarNovoEndereco(true)}
                  >
                    + Novo endereço
                  </button>
                </div>
              )}
              {(usarNovoEndereco || enderecos.length === 0) && (
                <div className="space-y-4">
                  <p className="text-xs text-zinc-500">
                    Campos com <span className="text-red-600 font-bold">*</span>{" "}
                    são obrigatórios.
                  </p>

                  {/* 1. CEP */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor="entrega-cep"
                      className="text-sm font-semibold text-zinc-800"
                    >
                      CEP <span className="text-red-600">*</span>
                    </label>
                    <div className="flex gap-2">
                      <Input
                        id="entrega-cep"
                        placeholder="00000-000"
                        value={formEndereco.cep}
                        inputMode="numeric"
                        autoComplete="postal-code"
                        className="font-mono tracking-wide"
                        onChange={(e) =>
                          setFormEndereco((f) => ({
                            ...f,
                            cep: e.target.value,
                            cidade: "",
                            uf: "",
                            latitude: null,
                            longitude: null,
                          }))
                        }
                      />
                      <Button
                        type="button"
                        className="shrink-0 bg-zinc-900 hover:bg-zinc-800 text-white"
                        disabled={buscandoCep}
                        onClick={() => void buscarCepHandler()}
                      >
                        {buscandoCep ? "Buscando…" : "Buscar CEP"}
                      </Button>
                    </div>
                    <p className="text-[11px] text-zinc-400">
                      Cidade e estado vêm automaticamente do CEP.
                    </p>
                  </div>

                  {formEndereco.cidade && formEndereco.uf ? (
                    <>
                      <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2.5 text-sm">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700/80">
                          Localidade (pelo CEP)
                        </p>
                        <p className="font-semibold text-emerald-900 mt-0.5">
                          {formEndereco.cidade} — {formEndereco.uf}
                        </p>
                      </div>

                      {/* 2. Número + Rua */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                          <label
                            htmlFor="entrega-numero"
                            className="text-sm font-semibold text-zinc-800"
                          >
                            Número <span className="text-red-600">*</span>
                          </label>
                          <Input
                            id="entrega-numero"
                            placeholder="Ex: 140"
                            value={formEndereco.numero}
                            autoComplete="address-line2"
                            onChange={(e) =>
                              setFormEndereco((f) => ({
                                ...f,
                                numero: e.target.value,
                                latitude: null,
                                longitude: null,
                              }))
                            }
                            onBlur={(e) =>
                              void geocodificarComNumero(e.target.value)
                            }
                          />
                        </div>
                        <div className="col-span-2 space-y-1.5">
                          <label
                            htmlFor="entrega-rua"
                            className="text-sm font-semibold text-zinc-800"
                          >
                            Rua <span className="text-red-600">*</span>
                          </label>
                          <Input
                            id="entrega-rua"
                            placeholder="Nome da rua"
                            value={formEndereco.rua}
                            autoComplete="address-line1"
                            onChange={(e) =>
                              setFormEndereco((f) => ({
                                ...f,
                                rua: e.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label
                          htmlFor="entrega-bairro"
                          className="text-sm font-semibold text-zinc-800"
                        >
                          Bairro <span className="text-red-600">*</span>
                        </label>
                        <Input
                          id="entrega-bairro"
                          placeholder="Bairro"
                          value={formEndereco.bairro}
                          onChange={(e) =>
                            setFormEndereco((f) => ({
                              ...f,
                              bairro: e.target.value,
                            }))
                          }
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label
                          htmlFor="entrega-complemento"
                          className="text-sm font-semibold text-zinc-800"
                        >
                          Complemento{" "}
                          <span className="text-zinc-400 font-normal">
                            (opcional)
                          </span>
                        </label>
                        <Input
                          id="entrega-complemento"
                          placeholder="Apto, bloco, referência…"
                          value={formEndereco.complemento}
                          onChange={(e) =>
                            setFormEndereco((f) => ({
                              ...f,
                              complemento: e.target.value,
                            }))
                          }
                        />
                      </div>

                      {formEndereco.latitude != null &&
                      formEndereco.longitude != null &&
                      formEndereco.numero.trim() ? (
                        <p className="text-xs font-medium text-emerald-700 flex items-center gap-1.5">
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          Endereço localizado — pronto para calcular o frete
                        </p>
                      ) : (
                        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                          {!formEndereco.numero.trim()
                            ? "Informe o número para concluir o endereço."
                            : "Aguarde a localização do endereço…"}
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-3 py-4 text-center">
                      <p className="text-sm text-zinc-500">
                        Digite o CEP e toque em{" "}
                        <span className="font-semibold text-zinc-700">
                          Buscar CEP
                        </span>{" "}
                        para liberar os demais campos.
                      </p>
                    </div>
                  )}
                </div>
              )}
              {freteMsg && (
                <p className="text-sm text-amber-700 bg-amber-50 rounded-xl p-3">
                  {freteMsg}
                </p>
              )}
              {!freteMsg && (
                <p className="text-sm text-zinc-600">
                  Frete: R$ {taxaFrete.toFixed(2).replace(".", ",")}
                  {distanciaKm != null ? ` · ${distanciaKm} km` : ""}
                  {config?.tempo_estimado_min
                    ? ` · ~${config.tempo_estimado_min} min`
                    : ""}
                </p>
              )}
            </section>
          )}

          {modalidade === "retirada" && (
            <section className="bg-white rounded-2xl border border-zinc-200 p-4 space-y-3">
              <h2 className="font-bold">Retirada na loja</h2>
              <p className="text-sm text-zinc-600">
                {config?.tempo_estimado_min
                  ? `Seu pedido fica pronto em cerca de ${config.tempo_estimado_min} minutos.`
                  : "Avisaremos quando o pedido estiver pronto para retirar."}
              </p>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={pagarNaLoja}
                  onChange={(e) => setPagarNaLoja(e.target.checked)}
                />
                Pagar na loja
              </label>
            </section>
          )}

          <section className="bg-white rounded-2xl border border-zinc-200 p-4 space-y-3">
            <h2 className="font-bold">CPF na nota</h2>
            <Input
              value={cpfNota}
              onChange={(e) => setCpfNota(formatarCpf(e.target.value))}
              inputMode="numeric"
            />
          </section>

          <section className="bg-white rounded-2xl border border-zinc-200 p-4 space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>R$ {subtotal.toFixed(2).replace(".", ",")}</span>
            </div>
            {desconto > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Desconto</span>
                <span>- R$ {desconto.toFixed(2).replace(".", ",")}</span>
              </div>
            )}
            {modalidade === "entrega" && (
              <div className="flex justify-between">
                <span>Entrega</span>
                <span>R$ {taxaFrete.toFixed(2).replace(".", ",")}</span>
              </div>
            )}
            <div className="flex justify-between font-black text-base pt-1">
              <span>Total</span>
              <span>R$ {total.toFixed(2).replace(".", ",")}</span>
            </div>
          </section>

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              className="h-12"
              onClick={() => setPasso(1)}
            >
              Voltar
            </Button>
            <Button
              className="h-12 bg-red-600 hover:bg-red-700 text-base font-bold"
              disabled={!podePagar}
              onClick={() => void finalizar()}
            >
              {enviando
                ? "Enviando…"
                : pagarNaLoja && modalidade === "retirada"
                  ? "Confirmar"
                  : "Pagar"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
