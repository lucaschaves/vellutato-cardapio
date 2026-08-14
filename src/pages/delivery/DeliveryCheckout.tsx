import { Clock, Copy, Minus, Plus, Ticket, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ModalConfirmacao } from "../../components/ModalConfirmacao";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useDeliveryCliente } from "../../hooks/useDeliveryCliente";
import {
  buscarCuponsDoCliente,
  rotuloCupomResumo,
  type CupomCliente,
} from "../../lib/clientes";
import { anexarCuponsPedido, validarCupom } from "../../lib/cupons";
import {
  buscarCep,
  buscarClienteDeliveryPorCelular,
  cpfValido,
  formatarCep,
  formatarCpf,
  garantirClienteCheckout,
  geocodificarEndereco,
  listarEnderecos,
  salvarEndereco,
  type ClienteDelivery,
  type EnderecoCliente,
} from "../../lib/deliveryCliente";
import { buscarDeliveryConfig } from "../../lib/deliveryConfig";
import {
  avaliarEntregaDelivery,
  listarBairrosFreteGeojson,
  taxasDosBairrosGeojson,
} from "../../lib/deliveryBairros";
import {
  formatarDistanciaEntrega,
  taxaMinimaConfig,
  type DeliveryConfig,
} from "../../lib/deliveryFrete";
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
import {
  listarSlotsAgendamentoHoje,
  rotuloSlot,
} from "../../lib/lojaAgendamento";
import type { StatusLoja } from "../../lib/lojaStatus";
import { ErroNegocioCheckout } from "../../lib/pedidos";
import {
  lembrarClienteAnalytics,
  track,
} from "../../lib/analytics";
import { supabase } from "../../lib/supabase";
import {
  formatarTelefoneBr,
  mensagemTelefoneInvalido,
  telefoneCelularValido,
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
  const { cliente, usuario, carregando: authLoading } = useDeliveryCliente();
  const itens = useCartStore((s) => s.itens);
  const cupomAplicado = useCartStore((s) => s.cupomAplicado);
  const cuponsAplicados = useCartStore((s) => s.cuponsAplicados);
  const aplicarCupom = useCartStore((s) => s.aplicarCupom);
  const removerCupom = useCartStore((s) => s.removerCupom);
  const limparCarrinho = useCartStore((s) => s.limparCarrinho);
  const alterarQuantidade = useCartStore((s) => s.alterarQuantidade);
  const removerItem = useCartStore((s) => s.removerItem);
  const adicionarItem = useCartStore((s) => s.adicionarItem);
  const consolidarItensIguais = useCartStore((s) => s.consolidarItensIguais);
  const obterSubtotal = useCartStore((s) => s.obterSubtotal);
  const obterDescontoCupom = useCartStore((s) => s.obterDescontoCupom);
  const [carrinhoHidratado, setCarrinhoHidratado] = useState(() =>
    useCartStore.persist.hasHydrated(),
  );

  useEffect(() => {
    track("begin_checkout", { canal: "delivery" });
  }, []);

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
    return {
      cep: formatarCep(end.cep),
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
  const [guestClienteId, setGuestClienteId] = useState<string | null>(
    () => lerGuestDeliveryLocal()?.clienteId ?? null,
  );
  const [clientePorTelefone, setClientePorTelefone] =
    useState<ClienteDelivery | null>(null);
  const [buscandoCliente, setBuscandoCliente] = useState(false);
  const [telefoneConsultado, setTelefoneConsultado] = useState(false);
  const buscaTelRef = useRef(0);
  const [codigoCupom, setCodigoCupom] = useState("");
  const [cuponsCliente, setCuponsCliente] = useState<CupomCliente[]>([]);
  const [mostrarCuponsCliente, setMostrarCuponsCliente] = useState(false);
  const [carregandoCuponsCliente, setCarregandoCuponsCliente] = useState(false);
  const [pagarNaLoja, setPagarNaLoja] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [statusLoja, setStatusLoja] = useState<StatusLoja | null>(null);
  const [slotsHoje, setSlotsHoje] = useState<string[]>([]);
  const [motivoSemSlots, setMotivoSemSlots] = useState<string | null>(null);
  const [agendadoPara, setAgendadoPara] = useState<string | null>(null);
  const [abreHoje, setAbreHoje] = useState(true);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [redirecionandoPagamento, setRedirecionandoPagamento] = useState(false);
  const [freteMsg, setFreteMsg] = useState<string | null>(null);
  const [avaliandoFrete, setAvaliandoFrete] = useState(false);
  const [taxaFrete, setTaxaFrete] = useState(0);
  const [, setAcrescimoClima] = useState(0);
  const [descontoCarrinhoFrete, setDescontoCarrinhoFrete] = useState(0);
  const [distanciaKm, setDistanciaKm] = useState<number | null>(null);
  const [bairroFreteNome, setBairroFreteNome] = useState<string | null>(null);
  const [taxasBairroEstimativa, setTaxasBairroEstimativa] = useState<
    Array<{ taxa: number | null }>
  >([]);
  const [sugestoes, setSugestoes] = useState<SugestaoCheckout[]>([]);
  const [confirmarLimparSacola, setConfirmarLimparSacola] = useState(false);
  const freteTrackRef = useRef<string>("");

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
    const concluir = () => setCarrinhoHidratado(true);
    if (useCartStore.persist.hasHydrated()) {
      concluir();
      return;
    }
    return useCartStore.persist.onFinishHydration(concluir);
  }, []);

  useEffect(() => {
    void (async () => {
      const cfg = await buscarDeliveryConfig();
      setConfig(cfg);
      if (cfg.modo_frete === "bairro") {
        try {
          const fc = await listarBairrosFreteGeojson();
          setTaxasBairroEstimativa(taxasDosBairrosGeojson(fc));
        } catch {
          setTaxasBairroEstimativa([]);
        }
      }
    })();
  }, []);

  useEffect(() => {
    let cancelado = false;
    void (async () => {
      const r = await listarSlotsAgendamentoHoje();
      if (cancelado) return;
      setStatusLoja(r.status);
      setSlotsHoje(r.slots);
      setMotivoSemSlots(r.motivoSemSlots);
      setAbreHoje(r.abreHoje);
      if (r.status?.aberta) {
        // Aberto: padrão = o quanto antes
        setAgendadoPara(null);
      } else if (r.slots[0]) {
        setAgendadoPara(r.slots[0]);
      } else {
        setAgendadoPara(null);
      }
    })();
    return () => {
      cancelado = true;
    };
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
    void cancelarPedidosDeliveryExpirados();
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (cliente?.cpf) setCpfNota(formatarCpf(cliente.cpf));
    if (cliente?.nome) setGuestNome(cliente.nome);
    if (cliente?.celular) setGuestTelefone(formatarTelefoneBr(cliente.celular));
    if (cliente?.email) setGuestEmail(cliente.email);
    else if (usuario?.email) setGuestEmail(usuario.email);
    if (cliente?.id) {
      setGuestClienteId(cliente.id);
      setClientePorTelefone(cliente);
      setTelefoneConsultado(true);
    }
  }, [cliente, usuario?.email]);

  const carregarEnderecosCliente = (clienteId: string) => {
    void listarEnderecos(clienteId).then((lista) => {
      setEnderecos(lista);
      const padrao = lista.find((e) => e.padrao) || lista[0];
      if (padrao) {
        setEnderecoId(padrao.id);
        setUsarNovoEndereco(false);
        salvarEnderecoDeliveryLocal({
          cep: padrao.cep,
          rua: padrao.rua,
          numero: padrao.numero,
          bairro: padrao.bairro,
          cidade: padrao.cidade,
          uf: padrao.uf,
          complemento: padrao.complemento || "",
          referencia: padrao.referencia || "",
          latitude: padrao.latitude,
          longitude: padrao.longitude,
        });
      } else if (!lerEnderecoDeliveryLocal()) {
        setUsarNovoEndereco(true);
      }
    });
  };

  useEffect(() => {
    if (cliente?.id) carregarEnderecosCliente(cliente.id);
  }, [cliente?.id]);

  useEffect(() => {
    const clienteIdCupons = cliente?.id || guestClienteId;
    if (!clienteIdCupons) {
      setCuponsCliente([]);
      return;
    }
    let ativo = true;
    setCarregandoCuponsCliente(true);
    void buscarCuponsDoCliente(clienteIdCupons)
      .then((lista) => {
        if (ativo) setCuponsCliente(lista);
      })
      .catch(() => {
        if (ativo) setCuponsCliente([]);
      })
      .finally(() => {
        if (ativo) setCarregandoCuponsCliente(false);
      });
    return () => {
      ativo = false;
    };
  }, [cliente?.id, guestClienteId]);

  /** Identifica cliente só pelo telefone (sem SMS/Google). */
  useEffect(() => {
    if (!telefoneDigitosCompleto(guestTelefone)) {
      setClientePorTelefone(null);
      setTelefoneConsultado(false);
      setBuscandoCliente(false);
      return;
    }

    const seq = ++buscaTelRef.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          setBuscandoCliente(true);
          const encontrado =
            await buscarClienteDeliveryPorCelular(guestTelefone);
          if (seq !== buscaTelRef.current) return;

          setClientePorTelefone(encontrado);
          setTelefoneConsultado(true);

          if (encontrado) {
            setGuestNome(encontrado.nome || "");
            setGuestEmail(encontrado.email || "");
            setGuestClienteId(encontrado.id);
            if (encontrado.cpf) setCpfNota(formatarCpf(encontrado.cpf));
            salvarGuestDeliveryLocal({
              nome: encontrado.nome || "",
              telefone: guestTelefone,
              email: encontrado.email,
              clienteId: encontrado.id,
            });
            carregarEnderecosCliente(encontrado.id);
            track("auth_ok", {
              canal: "delivery",
              clienteId: encontrado.id,
              props: { metodo: "telefone", cadastro: "existente" },
            });
          } else {
            setGuestClienteId(null);
            // Novo: limpa nome/email só se não havia rascunho local do mesmo tel
            const guest = lerGuestDeliveryLocal();
            const mesmoTel =
              guest?.telefone &&
              telefoneDigitosCompleto(guest.telefone) &&
              guest.telefone.replace(/\D/g, "") ===
                guestTelefone.replace(/\D/g, "");
            if (!mesmoTel) {
              setGuestNome("");
              setGuestEmail("");
            }
          }
        } catch (e) {
          console.error("[CHECKOUT] busca cliente", e);
          if (seq === buscaTelRef.current) {
            setClientePorTelefone(null);
            setTelefoneConsultado(true);
          }
        } finally {
          if (seq === buscaTelRef.current) setBuscandoCliente(false);
        }
      })();
    }, 400);

    return () => window.clearTimeout(timer);
  }, [guestTelefone]);

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
      setAcrescimoClima(0);
        setDescontoCarrinhoFrete(0);
      setFreteMsg(null);
      setDistanciaKm(null);
      setBairroFreteNome(null);
      setAvaliandoFrete(false);
      return;
    }
    if (enderecoAtivo.latitude == null || enderecoAtivo.longitude == null) {
      setFreteMsg("Informe o endereço completo para calcular o frete.");
      setTaxaFrete(0);
      setAcrescimoClima(0);
        setDescontoCarrinhoFrete(0);
      setBairroFreteNome(null);
      setAvaliandoFrete(false);
      return;
    }
    let ativo = true;
    setAvaliandoFrete(true);
    void (async () => {
      const r = await avaliarEntregaDelivery(
        config,
        enderecoAtivo.latitude!,
        enderecoAtivo.longitude!,
        subtotal,
      );
      if (!ativo) return;
      setAvaliandoFrete(false);
      if (!r.ok) {
        setFreteMsg(r.erro);
        setTaxaFrete(0);
        setAcrescimoClima(0);
        setDescontoCarrinhoFrete(0);
        setDistanciaKm(r.distancia_km ?? null);
        setBairroFreteNome(r.bairro_nome ?? null);
        const chave = `err:${enderecoAtivo.latitude},${enderecoAtivo.longitude}:${r.erro}`;
        if (freteTrackRef.current !== chave) {
          freteTrackRef.current = chave;
          const foraArea =
            /raio|área|area|não atendemos|nao atendemos|não entregamos|nao entregamos|fora dos bairros/i.test(
              r.erro || "",
            );
          track(foraArea ? "cep_fora_raio" : "checkout_error", {
            canal: "delivery",
            props: {
              motivo: foraArea ? "fora_area" : "frete",
              erro: r.erro,
              distancia_km: r.distancia_km,
              bairro: r.bairro_nome,
              modo: r.modo,
            },
          });
        }
        return;
      }
      setFreteMsg(null);
      setTaxaFrete(r.taxa);
      setAcrescimoClima(r.acrescimo_clima);
      setDescontoCarrinhoFrete(r.desconto_carrinho);
      setDistanciaKm(r.distancia_km);
      setBairroFreteNome(r.bairro_nome);
      const chaveOk = `ok:${enderecoAtivo.latitude},${enderecoAtivo.longitude}:${r.taxa}`;
      if (freteTrackRef.current !== chaveOk) {
        freteTrackRef.current = chaveOk;
        track("cep_ok", {
          canal: "delivery",
          props: {
            taxa: r.taxa,
            distancia_km: r.distancia_km,
            chuva: r.chuva,
            acrescimo_clima: r.acrescimo_clima,
            bairro: r.bairro_nome,
            modo: r.modo,
          },
        });
      }
    })();
    return () => {
      ativo = false;
    };
  }, [config, modalidade, enderecoAtivo, subtotal]);

  const freteConfirmado =
    modalidade === "entrega" &&
    !avaliandoFrete &&
    !freteMsg &&
    enderecoAtivo.latitude != null &&
    enderecoAtivo.longitude != null;

  const taxaMinimaEstimada = config
    ? taxaMinimaConfig(config, taxasBairroEstimativa)
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

  const aoAlterarTelefone = (valor: string) => {
    setGuestTelefone(formatarTelefoneBr(valor));
    setTelefoneConsultado(false);
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
      !avaliandoFrete &&
      !freteMsg);

  const precisaEmailPagamento = !(modalidade === "retirada" && pagarNaLoja);
  const precisaCpfPagamento = precisaEmailPagamento; // Asaas exige CPF no checkout online
  const emailValido =
    guestEmail.trim().includes("@") && guestEmail.trim().includes(".");
  const cpfOk = cpfValido(cpfNota);
  const dadosClienteOk = Boolean(
    telefoneConsultado &&
      !buscandoCliente &&
      telefoneDigitosCompleto(guestTelefone) &&
      guestNome.trim() &&
      (!precisaEmailPagamento || emailValido) &&
      (!precisaCpfPagamento || cpfOk),
  );

  const lojaAberta = Boolean(statusLoja?.aberta);
  const precisaAgendar = !lojaAberta;
  const agendamentoOk = abreHoje
    ? lojaAberta
      ? true
      : Boolean(agendadoPara) && slotsHoje.length > 0
    : false;

  const podePagar =
    !enviando && enderecoEntregaOk && dadosClienteOk && agendamentoOk;

  const aplicarCupomHandler = async (codigo?: string) => {
    try {
      const r = await validarCupom(
        codigo ?? codigoCupom,
        subtotal,
        guestClienteId || cliente?.id,
      );
      if (!r.ok) {
        toast.error(r.erro);
        return;
      }
      const aplicado = aplicarCupom(r.cupom);
      if (!aplicado.ok) {
        toast.error(aplicado.erro);
        return;
      }
      if (aplicado.modo === "substituido") {
        toast.success(
          `Cupom ${r.cupom.codigo} aplicado (substituiu o anterior).`,
        );
      } else if (aplicado.modo === "empilhado") {
        toast.success(`Cupom ${r.cupom.codigo} combinado!`);
      } else {
        toast.success("Cupom aplicado");
      }
      setCodigoCupom("");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro no cupom");
    }
  };

  const copiarCodigoCupom = async (codigo: string) => {
    try {
      await navigator.clipboard.writeText(codigo);
      setCodigoCupom(codigo);
      toast.success(`Código ${codigo} copiado`);
    } catch {
      setCodigoCupom(codigo);
      toast.message("Código preenchido no campo");
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

    if (!abreHoje) {
      toast.error(
        motivoSemSlots ||
          "A loja não abre hoje — não é possível fazer pedidos agora.",
      );
      return;
    }
    if (precisaAgendar && !agendadoPara) {
      toast.error("Escolha um horário para receber ou retirar o pedido.");
      return;
    }

    // Revalida estoque antes de criar o pedido
    try {
      const ids = [...new Set(itens.map((i) => i.produtoId))];
      const { data: prods, error: errEstoque } = await supabase
        .from("produtos")
        .select(
          "id, nome, ativo, controlar_estoque, quantidade_estoque",
        )
        .in("id", ids);
      if (errEstoque) throw new Error(errEstoque.message);
      const mapa = new Map(
        (prods || []).map((p) => [p.id as string, p]),
      );
      for (const item of itens) {
        const p = mapa.get(item.produtoId);
        if (!p || !p.ativo || produtoEstaEsgotado(p)) {
          toast.error(
            `${item.nome} está indisponível. Remova da sacola para continuar.`,
          );
          return;
        }
      }
    } catch (e: unknown) {
      toast.error(
        e instanceof Error
          ? e.message
          : "Não foi possível validar o estoque.",
      );
      return;
    }

    let taxaEntregaFinal = 0;
    let distanciaFinal: number | null = null;
    let descontoFreteFinal = 0;
    let acrescimoClimaFinal = 0;
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
      if (!config) {
        toast.error("Não foi possível calcular o frete. Recarregue a página.");
        return;
      }
      // Revalida na hora: o estado pode estar desatualizado ou ainda calculando.
      const avaliacao = await avaliarEntregaDelivery(
        config,
        enderecoAtivo.latitude,
        enderecoAtivo.longitude,
        subtotal,
      );
      if (!avaliacao.ok) {
        setFreteMsg(avaliacao.erro);
        setTaxaFrete(0);
        setAcrescimoClima(0);
        setDescontoCarrinhoFrete(0);
        setDistanciaKm(avaliacao.distancia_km ?? null);
        setBairroFreteNome(avaliacao.bairro_nome ?? null);
        toast.error(avaliacao.erro);
        return;
      }
      taxaEntregaFinal = avaliacao.taxa;
      distanciaFinal = avaliacao.distancia_km;
      descontoFreteFinal = avaliacao.desconto_carrinho;
      acrescimoClimaFinal = avaliacao.acrescimo_clima;
      setFreteMsg(null);
      setTaxaFrete(avaliacao.taxa);
      setAcrescimoClima(avaliacao.acrescimo_clima);
      setDescontoCarrinhoFrete(avaliacao.desconto_carrinho);
      setDistanciaKm(avaliacao.distancia_km);
      setBairroFreteNome(avaliacao.bairro_nome);
    }

    const statusPagamento =
      modalidade === "retirada" && pagarNaLoja ? "na_loja" : "aguardando";

    if (!telefoneDigitosCompleto(guestTelefone)) {
      toast.error("Informe um telefone válido com DDD.");
      return;
    }
    if (!guestNome.trim()) {
      toast.error("Informe seu nome.");
      return;
    }
    if (
      statusPagamento === "aguardando" &&
      !(guestEmail.trim().includes("@") && guestEmail.trim().includes("."))
    ) {
      toast.error("Informe um e-mail para o pagamento online.");
      return;
    }
    if (statusPagamento === "aguardando" && !cpfValido(cpfNota)) {
      toast.error("Informe um CPF válido para o pagamento (obrigatório).");
      return;
    }

    const totalFinal = Math.max(0, subtotal - desconto) + taxaEntregaFinal;

    try {
      setEnviando(true);

      const clienteCheckout = await garantirClienteCheckout({
        nome: guestNome,
        celular: guestTelefone,
        email: guestEmail.trim() || null,
      });
      const clienteId = clienteCheckout.id;
      const clienteNome = clienteCheckout.nome;
      const clienteCelular = clienteCheckout.celular;
      const emailPagamento =
        guestEmail.trim() || clienteCheckout.email?.trim() || null;
      const cpfCliente = clienteCheckout.cpf || null;
      setGuestClienteId(clienteId);

      if (statusPagamento === "aguardando" && !emailPagamento) {
        toast.error("Informe um e-mail para o pagamento online.");
        return;
      }

      const resultado = await criarPedidoDelivery({
        cliente_nome: clienteNome,
        cliente_celular: clienteCelular,
        cliente_id: clienteId,
        cupom_id: cuponsAplicados[0]?.id || cupomAplicado?.id || null,
        desconto,
        identificador: modalidade === "entrega" ? "DELIVERY" : "RETIRADA",
        total: totalFinal,
        valor_total: totalFinal,
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
        taxa_entrega: taxaEntregaFinal,
        desconto_frete: descontoFreteFinal,
        acrescimo_clima: acrescimoClimaFinal,
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
        distancia_km: distanciaFinal,
        agendado_para: agendadoPara,
      });

      await anexarCuponsPedido(resultado.pedido_id, cuponsAplicados);

      lembrarClienteAnalytics(clienteId);
      track("order_created", {
        canal: "delivery",
        pedidoId: resultado.pedido_id,
        clienteId,
        props: {
          modalidade,
          status_pagamento: statusPagamento,
          total: totalFinal,
        },
      });
      if (statusPagamento === "na_loja") {
        track("payment_ok", {
          canal: "delivery",
          pedidoId: resultado.pedido_id,
          props: { metodo: "na_loja" },
        });
      }

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
        navigate(`/pedido/${resultado.pedido_id}`);
        return;
      }

      toast.message("Abrindo pagamento seguro…");
      const checkout = await iniciarCheckoutAsaas(resultado.pedido_id, {
        email: emailPagamento,
        cpf: cpfNota,
        clienteId,
      });

      // Sacola só limpa após pagamento confirmado (página do pedido / webhook).
      setRedirecionandoPagamento(true);
      window.location.assign(checkout.checkout_url);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      track("checkout_error", {
        canal: "delivery",
        props: { motivo: "criar_pedido", erro: msg },
      });
      if (e instanceof ErroNegocioCheckout) toast.error(msg);
      else toast.error(msg || "Falha ao criar pedido");
      setRedirecionandoPagamento(false);
    } finally {
      setEnviando(false);
    }
  };

  if (authLoading || redirecionandoPagamento || !carrinhoHidratado) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <div className="animate-spin h-8 w-8 border-4 border-cookie-primary border-t-transparent rounded-full" />
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
        <Button onClick={() => navigate("/")}>Ver cardápio</Button>
      </div>
    );
  }

  return (
    <div className="relative space-y-4 pb-28">
      {enviando && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-white/80 backdrop-blur-sm">
          <div className="animate-spin h-10 w-10 border-4 border-cookie-primary border-t-transparent rounded-full" />
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
        <div className="flex items-center gap-3 shrink-0">
          {passo === 1 && (
            <button
              type="button"
              onClick={() => setConfirmarLimparSacola(true)}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-500 hover:text-cookie-primary transition-colors"
            >
              <Trash2 size={15} />
              Limpar
            </button>
          )}
          <span className="text-xs font-semibold text-zinc-400">
            Passo {passo} de 2
          </span>
        </div>
      </div>

      <div className="flex gap-2">
        <div
          className={`h-1 flex-1 rounded-full ${passo >= 1 ? "bg-cookie-primary" : "bg-zinc-200"}`}
        />
        <div
          className={`h-1 flex-1 rounded-full ${passo >= 2 ? "bg-cookie-primary" : "bg-zinc-200"}`}
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
                    ? "border-cookie-primary bg-cookie-primary/10 text-cookie-primary"
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
                  <p className="text-sm font-bold text-cookie-primary mt-1">
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
                      <span className="text-sm font-black text-cookie-primary">
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
                      className="w-full mt-2 bg-cookie-primary hover:bg-cookie-primary-hover h-8 text-xs"
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
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-bold">Cupom</h2>
              {(cliente?.id || guestClienteId) && (
                <button
                  type="button"
                  onClick={() => setMostrarCuponsCliente((v) => !v)}
                  className="text-xs font-bold text-cookie-primary inline-flex items-center gap-1"
                >
                  <Ticket size={14} />
                  {carregandoCuponsCliente
                    ? "Carregando…"
                    : cuponsCliente.length > 0
                      ? `Tem ${cuponsCliente.length} cupom${cuponsCliente.length === 1 ? "" : "s"}`
                      : "Sem cupons"}
                </button>
              )}
            </div>

            {mostrarCuponsCliente && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 space-y-2">
                {cuponsCliente.length === 0 ? (
                  <p className="text-xs text-zinc-500">
                    Nenhum cupom exclusivo disponível nesta conta.
                  </p>
                ) : (
                  cuponsCliente.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-white border border-zinc-200 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="font-mono font-black text-sm tracking-wide">
                          {c.codigo}
                        </p>
                        <p className="text-[11px] text-zinc-500 truncate">
                          {rotuloCupomResumo(c)}
                          {c.acumulativo ? " · acumulativo" : ""}
                        </p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 px-2"
                          onClick={() => void copiarCodigoCupom(c.codigo)}
                          title="Copiar código"
                        >
                          <Copy size={14} />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="h-8 px-2 bg-cookie-primary hover:bg-cookie-primary-hover"
                          onClick={() => void aplicarCupomHandler(c.codigo)}
                        >
                          Usar
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {cuponsAplicados.length > 0 ? (
              <div className="space-y-2">
                {cuponsAplicados.map((c) => (
                  <div key={c.id} className="flex justify-between text-sm gap-2">
                    <span className="font-mono font-bold">
                      {c.codigo}
                      {c.acumulativo ? (
                        <span className="ml-1 text-[10px] font-semibold uppercase text-zinc-400">
                          acumulativo
                        </span>
                      ) : null}
                    </span>
                    <button
                      type="button"
                      className="text-cookie-primary font-semibold"
                      onClick={() => removerCupom(c.id)}
                    >
                      Remover
                    </button>
                  </div>
                ))}
                {cuponsAplicados.every((c) => c.acumulativo) && (
                  <div className="flex gap-2 pt-1">
                    <Input
                      value={codigoCupom}
                      onChange={(e) => setCodigoCupom(e.target.value)}
                      placeholder="Outro cupom acumulativo"
                    />
                    <Button
                      variant="outline"
                      onClick={() => void aplicarCupomHandler()}
                    >
                      Aplicar
                    </Button>
                  </div>
                )}
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
            <p className="text-[11px] text-zinc-400">
              Por padrão vale 1 cupom por pedido. Só combina se o cupom for
              marcado como acumulativo.
            </p>
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
        </>
      )}

      {passo === 2 && (
        <>
          <section className="bg-white rounded-2xl border border-zinc-200 p-4 space-y-3">
            <div>
              <h2 className="font-bold">Seus dados</h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Informe o WhatsApp. Se já tiver cadastro, carregamos seus dados.
              </p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="checkout-tel"
                  className="text-sm font-semibold text-zinc-800"
                >
                  Telefone / WhatsApp <span className="text-cookie-primary">*</span>
                </label>
                <Input
                  id="checkout-tel"
                  placeholder="(00) 00000-0000"
                  value={guestTelefone}
                  inputMode="tel"
                  autoComplete="tel"
                  maxLength={15}
                  onChange={(e) => aoAlterarTelefone(e.target.value)}
                />
                <p className="text-[11px] text-zinc-400">
                  11 dígitos: DDD + 9 + número (ex.: 11 98765-4321)
                </p>
                {guestTelefone.replace(/\D/g, "").length > 0 &&
                  !telefoneCelularValido(guestTelefone) && (
                    <p className="text-xs font-semibold text-cookie-primary">
                      {mensagemTelefoneInvalido(guestTelefone)}
                    </p>
                  )}
                {buscandoCliente && (
                  <p className="text-xs text-zinc-400">Buscando cadastro…</p>
                )}
                {telefoneConsultado &&
                  !buscandoCliente &&
                  clientePorTelefone && (
                    <p className="text-xs font-semibold text-emerald-600">
                      Cadastro encontrado — confira ou edite os dados abaixo.
                    </p>
                  )}
                {telefoneConsultado &&
                  !buscandoCliente &&
                  !clientePorTelefone &&
                  telefoneCelularValido(guestTelefone) && (
                    <p className="text-xs text-zinc-500">
                      Novo cliente — preencha nome e e-mail para continuar.
                    </p>
                  )}
              </div>

              {telefoneConsultado &&
                !buscandoCliente &&
                telefoneDigitosCompleto(guestTelefone) && (
                  <>
                    <div className="space-y-1.5">
                      <label
                        htmlFor="checkout-nome"
                        className="text-sm font-semibold text-zinc-800"
                      >
                        Nome completo <span className="text-cookie-primary">*</span>
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
                          <span className="text-cookie-primary">*</span>
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
                          Necessário para o pagamento online (Pix/cartão). Você
                          pode editar a qualquer momento.
                        </p>
                      )}
                    </div>
                  </>
                )}
            </div>
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
                    className="text-sm text-cookie-primary font-semibold"
                    onClick={() => setUsarNovoEndereco(true)}
                  >
                    + Novo endereço
                  </button>
                </div>
              )}
              {(usarNovoEndereco || enderecos.length === 0) && (
                <div className="space-y-4">
                  <p className="text-xs text-zinc-500">
                    Campos com <span className="text-cookie-primary font-bold">*</span>{" "}
                    são obrigatórios.
                  </p>

                  {/* 1. CEP */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor="entrega-cep"
                      className="text-sm font-semibold text-zinc-800"
                    >
                      CEP <span className="text-cookie-primary">*</span>
                    </label>
                    <div className="flex gap-2">
                      <Input
                        id="entrega-cep"
                        placeholder="00000-000"
                        value={formEndereco.cep}
                        inputMode="numeric"
                        autoComplete="postal-code"
                        maxLength={9}
                        className="font-mono tracking-wide"
                        onChange={(e) =>
                          setFormEndereco((f) => ({
                            ...f,
                            cep: formatarCep(e.target.value),
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
                            Número <span className="text-cookie-primary">*</span>
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
                            Rua <span className="text-cookie-primary">*</span>
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
                          Bairro <span className="text-cookie-primary">*</span>
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
                          placeholder="Apto, casa, bloco…"
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
              {avaliandoFrete && (
                <p className="text-sm text-zinc-600">Calculando frete…</p>
              )}
              {!avaliandoFrete && freteMsg && (
                <p className="text-sm text-amber-700 bg-amber-50 rounded-xl p-3">
                  {freteMsg}
                </p>
              )}
              {!avaliandoFrete && !freteMsg && (
                <p className="text-sm text-zinc-600">
                  {bairroFreteNome
                    ? `Entrega para ${bairroFreteNome} · `
                    : ""}
                  Frete: R$ {taxaFrete.toFixed(2).replace(".", ",")}
                  {descontoCarrinhoFrete > 0
                    ? ` (−R$ ${descontoCarrinhoFrete.toFixed(2).replace(".", ",")} no frete)`
                    : ""}
                  {distanciaKm != null
                    ? ` · ${formatarDistanciaEntrega(distanciaKm)}`
                    : ""}
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
            <div className="flex items-start gap-2">
              <Clock
                size={18}
                className="mt-0.5 shrink-0 text-cookie-primary"
              />
              <div className="min-w-0 flex-1">
                <h2 className="font-bold">
                  {modalidade === "retirada"
                    ? "Horário de retirada"
                    : "Horário de entrega"}
                </h2>
                {!lojaAberta ? (
                  <p className="mt-0.5 text-xs text-amber-700">
                    {statusLoja?.motivo || "Loja fechada no momento."} Escolha
                    um horário de hoje.
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-zinc-500">
                    O quanto antes, ou escolha um horário de hoje.
                  </p>
                )}
              </div>
            </div>

            {!abreHoje || slotsHoje.length === 0 ? (
              <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                {motivoSemSlots ||
                  "Não há horários disponíveis para hoje."}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {lojaAberta && (
                  <button
                    type="button"
                    onClick={() => setAgendadoPara(null)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
                      agendadoPara == null
                        ? "border-cookie-primary bg-cookie-primary text-white"
                        : "border-zinc-200 bg-white text-zinc-700"
                    }`}
                  >
                    O quanto antes
                  </button>
                )}
                {slotsHoje.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setAgendadoPara(slot)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
                      agendadoPara === slot
                        ? "border-cookie-primary bg-cookie-primary text-white"
                        : "border-zinc-200 bg-white text-zinc-700"
                    }`}
                  >
                    {rotuloSlot(slot)}
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="bg-white rounded-2xl border border-zinc-200 p-4 space-y-3">
            <div className="space-y-1">
              <h2 className="font-bold">
                CPF na nota
                {precisaCpfPagamento && (
                  <span className="text-red-600 font-bold"> *</span>
                )}
              </h2>
              {precisaCpfPagamento && (
                <p className="text-xs text-zinc-500">
                  Obrigatório para pagamento online (PIX / cartão).
                </p>
              )}
            </div>
            <Input
              value={cpfNota}
              onChange={(e) => setCpfNota(formatarCpf(e.target.value))}
              inputMode="numeric"
              placeholder="000.000.000-00"
              autoComplete="off"
              aria-required={precisaCpfPagamento}
              aria-invalid={
                precisaCpfPagamento && cpfNota.length > 0 && !cpfOk
              }
              className={
                precisaCpfPagamento && cpfNota.length > 0 && !cpfOk
                  ? "border-red-400 focus-visible:ring-red-400"
                  : undefined
              }
            />
            {precisaCpfPagamento && cpfNota.replace(/\D/g, "").length > 0 && !cpfOk && (
              <p className="text-xs text-red-600">CPF inválido ou incompleto.</p>
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
        </>
      )}

      <div className="fixed bottom-0 inset-x-0 z-40 border-t border-zinc-200 bg-white/95 backdrop-blur p-3">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
              Total
              {passo === 1 && modalidade === "entrega" && !freteConfirmado
                ? " (est.)"
                : ""}
            </p>
            <p className="truncate text-lg font-black">
              R${" "}
              {(passo === 1 ? totalPasso1 : total)
                .toFixed(2)
                .replace(".", ",")}
            </p>
            {agendadoPara && passo === 2 && (
              <p className="truncate text-[11px] text-sky-700">
                {modalidade === "retirada" ? "Retirada" : "Entrega"}{" "}
                {rotuloSlot(agendadoPara)}
              </p>
            )}
          </div>
          {passo === 1 ? (
            <Button
              className="h-12 shrink-0 bg-cookie-primary px-6 font-bold hover:bg-cookie-primary-hover"
              onClick={irParaEntrega}
            >
              Continuar
            </Button>
          ) : (
            <div className="flex shrink-0 gap-2">
              <Button
                variant="outline"
                className="h-12"
                onClick={() => setPasso(1)}
              >
                Voltar
              </Button>
              <Button
                className="h-12 bg-cookie-primary px-5 font-bold hover:bg-cookie-primary-hover"
                disabled={!podePagar}
                onClick={() => void finalizar()}
              >
                {enviando
                  ? "…"
                  : pagarNaLoja && modalidade === "retirada"
                    ? "Confirmar"
                    : "Pagar"}
              </Button>
            </div>
          )}
        </div>
      </div>

      <ModalConfirmacao
        aberto={confirmarLimparSacola}
        titulo="Limpar sacola?"
        mensagem="Todos os itens serão removidos. Essa ação não pode ser desfeita."
        textoConfirmar="Sim, limpar"
        textoCancelar="Manter itens"
        aoCancelar={() => setConfirmarLimparSacola(false)}
        aoConfirmar={() => {
          limparCarrinho();
          setConfirmarLimparSacola(false);
          toast.message("Sacola limpa");
        }}
      />
    </div>
  );
}
