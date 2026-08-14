import {
  Clock,
  Loader2,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AdminPageShell } from "../../components/AdminPageShell";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { maxAdicionaisProduto } from "../../lib/adicionaisProduto";
import { upsertCliente } from "../../lib/clientes";
import {
  buscarEstruturaCombo,
  calcularDeltaOpcao,
  somarDeltasCombo,
  validarEscolhasCombo,
  type ComboGrupo,
  type EscolhaCombo,
} from "../../lib/combos";
import {
  buscarCep,
  buscarClienteDeliveryPorCelular,
  formatarCep,
  geocodificarEndereco,
  listarEnderecos,
  type EnderecoCliente,
} from "../../lib/deliveryCliente";
import { buscarDeliveryConfig } from "../../lib/deliveryConfig";
import { avaliarEntregaDelivery } from "../../lib/deliveryBairros";
import {
  criarPedidoDelivery,
  type EnderecoSnapshot,
  type StatusPagamentoDelivery,
} from "../../lib/deliveryPedido";
import {
  formatarDistanciaEntrega,
  type DeliveryConfig,
} from "../../lib/deliveryFrete";
import {
  adicionalCompativelComModo,
  produtoCompativelComModo,
  type ModoConsumoItem,
} from "../../lib/disponibilidadeProduto";
import { produtoEstaEsgotado } from "../../lib/estoque";
import {
  listarSlotsAgendamentoHoje,
  rotuloSlot,
} from "../../lib/lojaAgendamento";
import type { StatusLoja } from "../../lib/lojaStatus";
import {
  criarPedidoCompleto,
  ErroNegocioCheckout,
  type ItemPedidoCompleto,
} from "../../lib/pedidos";
import { supabase } from "../../lib/supabase";
import {
  formatarTelefoneBr,
  mensagemTelefoneInvalido,
  normalizarTelefoneParaSalvar,
  telefoneCelularValido,
} from "../../lib/telefone";

type CanalAdmin = "entrega" | "retirada" | "balcao" | "mesa";

type ProdutoCat = {
  id: string;
  nome: string;
  preco: number;
  preco_promocional: number | null;
  em_promocao: boolean;
  tipo: string | null;
  disponibilidade: string | null;
  adicional_obrigatorio: boolean | null;
  adicional_maximo: number | null;
  controlar_estoque: boolean | null;
  quantidade_estoque: number | null;
  imagem_url: string | null;
  ativo: boolean;
};

type AdicionalOpt = {
  id: string;
  nome: string;
  preco: number;
  disponivel: boolean;
  disponibilidade: string | null;
};

type ItemRascunho = {
  chave: string;
  produtoId: string;
  nome: string;
  precoBase: number;
  quantidade: number;
  observacoes: string;
  modoConsumo: ModoConsumoItem;
  adicionais: Array<{ id: string; nome: string; preco: number }>;
  escolhasCombo: EscolhaCombo[];
};

type MesaOpt = { id: string; numero: number; apelido: string | null };

function precoEfetivo(p: ProdutoCat): number {
  if (p.em_promocao && p.preco_promocional != null && p.preco_promocional > 0) {
    return Number(p.preco_promocional);
  }
  return Number(p.preco);
}

function custoItem(item: ItemRascunho): number {
  const extras =
    item.adicionais.reduce((s, a) => s + a.preco, 0) +
    somarDeltasCombo(item.escolhasCombo);
  return (item.precoBase + extras) * item.quantidade;
}

function modoCanal(canal: CanalAdmin): ModoConsumoItem {
  if (canal === "entrega" || canal === "retirada") return "levar";
  if (canal === "mesa") return "loja";
  return "levar";
}

export function AdminNovoPedido() {
  const navigate = useNavigate();
  const [canal, setCanal] = useState<CanalAdmin>("entrega");
  const [telefone, setTelefone] = useState("");
  const [nome, setNome] = useState("");
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [buscandoCliente, setBuscandoCliente] = useState(false);

  const [mesas, setMesas] = useState<MesaOpt[]>([]);
  const [mesaId, setMesaId] = useState("");
  const [modoBalcao, setModoBalcao] = useState<ModoConsumoItem>("levar");

  const [enderecos, setEnderecos] = useState<EnderecoCliente[]>([]);
  const [enderecoId, setEnderecoId] = useState<string>("");
  const [formEnd, setFormEnd] = useState({
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
  });
  const [usarNovoEndereco, setUsarNovoEndereco] = useState(true);
  const [config, setConfig] = useState<DeliveryConfig | null>(null);
  const [freteMsg, setFreteMsg] = useState<string | null>(null);
  const [taxaFrete, setTaxaFrete] = useState(0);
  const [acrescimoClima, setAcrescimoClima] = useState(0);
  const [descontoCarrinhoFrete, setDescontoCarrinhoFrete] = useState(0);
  const [distanciaKm, setDistanciaKm] = useState<number | null>(null);
  const [bairroFreteNome, setBairroFreteNome] = useState<string | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);

  const [produtos, setProdutos] = useState<ProdutoCat[]>([]);
  const [busca, setBusca] = useState("");
  const [itens, setItens] = useState<ItemRascunho[]>([]);
  const [enviando, setEnviando] = useState(false);

  /** Delivery/retirada: null = o quanto antes. */
  const [agendadoPara, setAgendadoPara] = useState<string | null>(null);
  const [slotsHoje, setSlotsHoje] = useState<string[]>([]);
  const [abreHoje, setAbreHoje] = useState(true);
  const [motivoSemSlots, setMotivoSemSlots] = useState<string | null>(null);
  const [statusLoja, setStatusLoja] = useState<StatusLoja | null>(null);
  const [statusPagamento, setStatusPagamento] =
    useState<StatusPagamentoDelivery>("pago");

  const [modalProduto, setModalProduto] = useState<ProdutoCat | null>(null);
  const [adicionaisDisp, setAdicionaisDisp] = useState<AdicionalOpt[]>([]);
  const [adicionaisSel, setAdicionaisSel] = useState<AdicionalOpt[]>([]);
  const [gruposCombo, setGruposCombo] = useState<ComboGrupo[]>([]);
  const [escolhasCombo, setEscolhasCombo] = useState<EscolhaCombo[]>([]);
  const [obsItem, setObsItem] = useState("");
  const [qtdItem, setQtdItem] = useState(1);
  const [carregandoModal, setCarregandoModal] = useState(false);

  const modoItens = canal === "balcao" ? modoBalcao : modoCanal(canal);

  useEffect(() => {
    void buscarDeliveryConfig().then(setConfig);
    void supabase
      .from("mesas")
      .select("id, numero, apelido")
      .eq("ativo", true)
      .order("numero")
      .then(({ data }) => setMesas((data as MesaOpt[]) || []));
    void (async () => {
      const r = await listarSlotsAgendamentoHoje();
      setStatusLoja(r.status);
      setSlotsHoje(r.slots);
      setMotivoSemSlots(r.motivoSemSlots);
      setAbreHoje(r.abreHoje);
      if (r.status?.aberta) setAgendadoPara(null);
      else if (r.slots[0]) setAgendadoPara(r.slots[0]);
      else setAgendadoPara(null);
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase
        .from("produtos")
        .select(
          "id, nome, preco, preco_promocional, em_promocao, tipo, disponibilidade, adicional_obrigatorio, adicional_maximo, controlar_estoque, quantidade_estoque, imagem_url, ativo",
        )
        .eq("ativo", true)
        .order("nome");
      if (error) {
        toast.error("Falha ao carregar produtos");
        return;
      }
      setProdutos((data as ProdutoCat[]) || []);
    })();
  }, []);

  useEffect(() => {
    setItens([]);
    setFreteMsg(null);
    setTaxaFrete(0);
    setDistanciaKm(null);
    setBairroFreteNome(null);
    setStatusPagamento("pago");
    if (statusLoja?.aberta) setAgendadoPara(null);
    else if (slotsHoje[0]) setAgendadoPara(slotsHoje[0]);
    else setAgendadoPara(null);
    // Só ao trocar canal — slots/status já carregados no mount
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intencional
  }, [canal]);

  const ehDeliveryCanal = canal === "entrega" || canal === "retirada";
  const lojaAberta = Boolean(statusLoja?.aberta);
  const agendamentoOk =
    !ehDeliveryCanal ||
    (abreHoje
      ? lojaAberta
        ? true
        : Boolean(agendadoPara) && slotsHoje.length > 0
      : false);

  const produtosFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return produtos.filter((p) => {
      if (produtoEstaEsgotado(p)) return false;
      if (!produtoCompativelComModo(p.disponibilidade, modoItens)) return false;
      if (q && !p.nome.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [produtos, busca, modoItens]);

  const subtotal = useMemo(
    () => itens.reduce((s, i) => s + custoItem(i), 0),
    [itens],
  );

  const enderecoAtivo = useMemo((): EnderecoSnapshot | null => {
    if (canal !== "entrega") return null;
    if (!usarNovoEndereco && enderecoId) {
      const e = enderecos.find((x) => x.id === enderecoId);
      if (!e || e.latitude == null || e.longitude == null) return null;
      return {
        cep: e.cep,
        rua: e.rua,
        numero: e.numero,
        bairro: e.bairro,
        cidade: e.cidade,
        uf: e.uf,
        complemento: e.complemento,
        referencia: e.referencia,
        latitude: e.latitude,
        longitude: e.longitude,
      };
    }
    if (formEnd.latitude == null || formEnd.longitude == null) return null;
    if (!formEnd.rua || !formEnd.numero || !formEnd.bairro || !formEnd.cep) {
      return null;
    }
    return {
      cep: formEnd.cep,
      rua: formEnd.rua,
      numero: formEnd.numero,
      bairro: formEnd.bairro,
      cidade: formEnd.cidade,
      uf: formEnd.uf,
      complemento: formEnd.complemento || null,
      referencia: formEnd.referencia || null,
      latitude: formEnd.latitude,
      longitude: formEnd.longitude,
    };
  }, [canal, usarNovoEndereco, enderecoId, enderecos, formEnd]);

  useEffect(() => {
    if (canal !== "entrega" || !config || !enderecoAtivo) {
      if (canal !== "entrega") {
        setTaxaFrete(0);
        setAcrescimoClima(0);
        setDescontoCarrinhoFrete(0);
        setFreteMsg(null);
        setDistanciaKm(null);
        setBairroFreteNome(null);
      }
      return;
    }
    let ativo = true;
    void (async () => {
      const r = await avaliarEntregaDelivery(
        config,
        enderecoAtivo.latitude,
        enderecoAtivo.longitude,
        subtotal,
      );
      if (!ativo) return;
      if (!r.ok) {
        setFreteMsg(r.erro);
        setTaxaFrete(0);
        setAcrescimoClima(0);
        setDescontoCarrinhoFrete(0);
        setDistanciaKm(r.distancia_km ?? null);
        setBairroFreteNome(r.bairro_nome ?? null);
        return;
      }
      setFreteMsg(null);
      setTaxaFrete(r.taxa);
      setAcrescimoClima(r.acrescimo_clima);
      setDescontoCarrinhoFrete(r.desconto_carrinho);
      setDistanciaKm(r.distancia_km);
      setBairroFreteNome(r.bairro_nome);
    })();
    return () => {
      ativo = false;
    };
  }, [canal, config, enderecoAtivo, subtotal]);

  const total =
    canal === "entrega" ? Math.max(0, subtotal) + taxaFrete : Math.max(0, subtotal);

  const buscarCliente = async () => {
    const erro = mensagemTelefoneInvalido(telefone);
    if (erro) {
      toast.warning(erro);
      return;
    }
    setBuscandoCliente(true);
    try {
      const c = await buscarClienteDeliveryPorCelular(telefone);
      if (!c) {
        setClienteId(null);
        setEnderecos([]);
        toast.message("Cliente novo — informe o nome.");
        return;
      }
      setClienteId(c.id);
      setNome(c.nome || "");
      const lista = await listarEnderecos(c.id);
      setEnderecos(lista);
      const padrao = lista.find((e) => e.padrao) || lista[0];
      if (padrao) {
        setEnderecoId(padrao.id);
        setUsarNovoEndereco(false);
      }
      toast.success(`Cliente: ${c.nome}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao buscar cliente");
    } finally {
      setBuscandoCliente(false);
    }
  };

  const aplicarCep = async () => {
    try {
      const dados = await buscarCep(formEnd.cep);
      if (!dados) {
        toast.error("CEP não encontrado");
        return;
      }
      setFormEnd((f) => ({
        ...f,
        rua: dados.rua || f.rua,
        bairro: dados.bairro || f.bairro,
        cidade: dados.cidade || f.cidade,
        uf: dados.uf || f.uf,
      }));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "CEP inválido");
    }
  };

  const geocodificar = async () => {
    setGeoBusy(true);
    try {
      const g = await geocodificarEndereco({
        rua: formEnd.rua,
        numero: formEnd.numero,
        bairro: formEnd.bairro,
        cidade: formEnd.cidade,
        uf: formEnd.uf,
        cep: formEnd.cep,
      });
      if (!g) {
        toast.error("Endereço não localizado");
        return;
      }
      setFormEnd((f) => ({
        ...f,
        latitude: g.latitude,
        longitude: g.longitude,
      }));
      toast.success("Endereço localizado");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao geocodificar");
    } finally {
      setGeoBusy(false);
    }
  };

  const abrirProduto = async (p: ProdutoCat) => {
    setModalProduto(p);
    setAdicionaisSel([]);
    setEscolhasCombo([]);
    setObsItem("");
    setQtdItem(1);
    setAdicionaisDisp([]);
    setGruposCombo([]);
    setCarregandoModal(true);
    try {
      if (p.tipo === "combo") {
        const grupos = await buscarEstruturaCombo(p.id);
        setGruposCombo(grupos);
      } else {
        const { data } = await supabase
          .from("produto_adicionais")
          .select(
            "adicionais ( id, nome, preco, disponivel, disponibilidade )",
          )
          .eq("produto_id", p.id);
        const lista: AdicionalOpt[] = [];
        for (const row of data || []) {
          const a = row.adicionais as unknown as AdicionalOpt | AdicionalOpt[] | null;
          const item = Array.isArray(a) ? a[0] : a;
          if (
            item &&
            item.disponivel &&
            adicionalCompativelComModo(item.disponibilidade, modoItens)
          ) {
            lista.push(item);
          }
        }
        setAdicionaisDisp(lista);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar opções");
      setModalProduto(null);
    } finally {
      setCarregandoModal(false);
    }
  };

  const toggleAdicional = (a: AdicionalOpt) => {
    const max = maxAdicionaisProduto(modalProduto?.adicional_maximo);
    setAdicionaisSel((atual) => {
      const tem = atual.some((x) => x.id === a.id);
      if (tem) return atual.filter((x) => x.id !== a.id);
      if (max != null && atual.length >= max) {
        toast.warning(`Máximo de ${max} adicional(is)`);
        return atual;
      }
      return [...atual, a];
    });
  };

  const toggleOpcaoCombo = (grupo: ComboGrupo, opcaoId: string) => {
    const opcao = grupo.opcoes.find((o) => o.id === opcaoId);
    if (!opcao) return;
    const delta = calcularDeltaOpcao(opcao, grupo.preco_referencia);
    setEscolhasCombo((atual) => {
      const doGrupo = atual.filter((e) => e.grupoId === grupo.id);
      const ja = doGrupo.find((e) => e.opcaoId === opcaoId);
      if (ja) {
        return atual.filter(
          (e) => !(e.grupoId === grupo.id && e.opcaoId === opcaoId),
        );
      }
      if (doGrupo.length >= grupo.max_escolhas) {
        if (grupo.max_escolhas === 1) {
          return [
            ...atual.filter((e) => e.grupoId !== grupo.id),
            {
              grupoId: grupo.id,
              grupoNome: grupo.nome,
              opcaoId: opcao.id,
              produtoId: opcao.produto_id,
              produtoNome: opcao.produto.nome,
              deltaPreco: delta,
            },
          ];
        }
        toast.warning(`Máximo de ${grupo.max_escolhas} em ${grupo.nome}`);
        return atual;
      }
      return [
        ...atual,
        {
          grupoId: grupo.id,
          grupoNome: grupo.nome,
          opcaoId: opcao.id,
          produtoId: opcao.produto_id,
          produtoNome: opcao.produto.nome,
          deltaPreco: delta,
        },
      ];
    });
  };

  const confirmarItemModal = () => {
    if (!modalProduto) return;
    if (modalProduto.tipo === "combo") {
      const erro = validarEscolhasCombo(gruposCombo, escolhasCombo);
      if (erro) {
        toast.warning(erro);
        return;
      }
    } else if (modalProduto.adicional_obrigatorio && adicionaisSel.length === 0) {
      toast.warning("Escolha ao menos 1 adicional");
      return;
    }

    const item: ItemRascunho = {
      chave: `${modalProduto.id}-${Date.now()}`,
      produtoId: modalProduto.id,
      nome: modalProduto.nome,
      precoBase: precoEfetivo(modalProduto),
      quantidade: qtdItem,
      observacoes: obsItem.trim(),
      modoConsumo: modoItens,
      adicionais: adicionaisSel.map((a) => ({
        id: a.id,
        nome: a.nome,
        preco: Number(a.preco),
      })),
      escolhasCombo: [...escolhasCombo],
    };
    setItens((lista) => [...lista, item]);
    setModalProduto(null);
  };

  const mapearItens = (): ItemPedidoCompleto[] =>
    itens.map((item) => ({
      produto_id: item.produtoId,
      quantidade: item.quantidade,
      preco_unitario: item.precoBase,
      observacoes: item.observacoes || null,
      modo_consumo: item.modoConsumo,
      adicionais: item.adicionais.map((a) => ({
        adicional_id: a.id,
        preco_aplicado: a.preco,
      })),
      combo_escolhas: item.escolhasCombo.map((e) => ({
        grupo_id: e.grupoId,
        produto_escolhido_id: e.produtoId,
        nome_grupo: e.grupoNome,
        nome_produto: e.produtoNome,
        delta_preco: e.deltaPreco,
      })),
    }));

  const finalizar = async () => {
    if (itens.length === 0) {
      toast.warning("Adicione ao menos um item");
      return;
    }
    if (!nome.trim()) {
      toast.warning("Informe o nome do cliente");
      return;
    }
    if (ehDeliveryCanal) {
      if (!telefone.trim()) {
        toast.warning("Informe o celular do cliente");
        return;
      }
      if (!telefoneCelularValido(telefone)) {
        toast.warning(mensagemTelefoneInvalido(telefone) || "Telefone inválido");
        return;
      }
      if (!agendamentoOk) {
        toast.warning(
          motivoSemSlots || "Não há horários disponíveis para agendar hoje.",
        );
        return;
      }
      if (!lojaAberta && !agendadoPara) {
        toast.warning("Escolha um horário de entrega/retirada.");
        return;
      }
    } else if (telefone && !telefoneCelularValido(telefone)) {
      toast.warning(mensagemTelefoneInvalido(telefone) || "Telefone inválido");
      return;
    }
    if (canal === "mesa" && !mesaId) {
      toast.warning("Selecione a mesa");
      return;
    }
    let taxaEntregaFinal = 0;
    let distanciaFinal: number | null = null;
    let descontoFreteFinal = 0;
    let acrescimoClimaFinal = 0;
    if (canal === "entrega") {
      if (!enderecoAtivo) {
        toast.warning("Informe e localize o endereço completo");
        return;
      }
      if (!config) {
        toast.error("Configuração de delivery não carregada.");
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

    const totalFinal = Math.max(0, subtotal) + taxaEntregaFinal;

    setEnviando(true);
    try {
      let idCliente = clienteId;
      const digitosTel = normalizarTelefoneParaSalvar(telefone);
      const celular =
        digitosTel && telefoneCelularValido(telefone) ? digitosTel : null;
      if (celular && nome.trim()) {
        idCliente = (await upsertCliente(nome.trim(), celular)) || idCliente;
      }

      if (canal === "entrega" || canal === "retirada") {
        const pag =
          canal === "retirada" && statusPagamento === "na_loja"
            ? "na_loja"
            : "pago";
        const resultado = await criarPedidoDelivery({
          cliente_nome: nome.trim(),
          cliente_celular: celular,
          cliente_id: idCliente,
          cupom_id: null,
          desconto: 0,
          identificador: canal === "entrega" ? "DELIVERY" : "RETIRADA",
          total: totalFinal,
          valor_total: totalFinal,
          itens: mapearItens(),
          modalidade: canal,
          status_pagamento: pag,
          taxa_entrega: taxaEntregaFinal,
          desconto_frete: descontoFreteFinal,
          acrescimo_clima: acrescimoClimaFinal,
          subtotal_itens: subtotal,
          cpf_nota: null,
          endereco: canal === "entrega" ? enderecoAtivo : null,
          distancia_km: distanciaFinal,
          agendado_para: agendadoPara,
        });
        const horaTxt = agendadoPara
          ? ` · ${canal === "retirada" ? "retirada" : "entrega"} ${rotuloSlot(agendadoPara)}`
          : "";
        toast.success(
          `Pedido #${resultado.sequencia_pedido} criado${horaTxt}`,
        );
        navigate("/admin/pedidos");
        return;
      }

      const mesa = mesas.find((m) => m.id === mesaId);
      const origem = canal === "mesa" ? "mesa" : "balcao";
      const identificador =
        canal === "mesa"
          ? `Mesa ${mesa?.numero ?? ""}`.trim()
          : modoBalcao === "levar"
            ? "Balcão (PARA VIAGEM)"
            : "Balcão";

      const resultado = await criarPedidoCompleto({
        cliente_nome: nome.trim(),
        cliente_celular: celular,
        cliente_id: idCliente,
        cupom_id: null,
        desconto: 0,
        origem,
        identificador,
        total: subtotal,
        valor_total: subtotal,
        itens: mapearItens().map((i) => ({
          ...i,
          modo_consumo: canal === "mesa" ? "loja" : modoBalcao,
        })),
      });
      toast.success(`Pedido #${resultado.sequencia_pedido} criado`);
      navigate("/admin/pedidos");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (e instanceof ErroNegocioCheckout) toast.error(msg);
      else toast.error(msg || "Falha ao criar pedido");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <AdminPageShell
      title="Novo pedido"
      description="Delivery, retirada, balcão ou mesa — com os mesmos campos do pedido (cliente, endereço, horário, pagamento)."
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/admin/pedidos")}
          >
            Cancelar
          </Button>
          <Button
            className="h-11 bg-cookie-primary hover:bg-cookie-primary-hover font-bold"
            disabled={enviando || (ehDeliveryCanal && !agendamentoOk)}
            onClick={() => void finalizar()}
          >
            {enviando ? (
              <>
                <Loader2 className="animate-spin mr-2" size={16} /> Enviando…
              </>
            ) : (
              <>
                <ShoppingBag className="mr-2" size={16} /> Criar pedido · R${" "}
                {total.toFixed(2).replace(".", ",")}
              </>
            )}
          </Button>
        </>
      }
      contentClassName="space-y-6"
    >
      <section className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-800 rounded-2xl p-4 space-y-3">
        <h2 className="font-bold text-sm uppercase tracking-wider text-gray-500">
          Modalidade
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {(
            [
              ["entrega", "Delivery"],
              ["retirada", "Retirada"],
              ["balcao", "Balcão"],
              ["mesa", "Mesa"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setCanal(id)}
              className={`rounded-xl border p-3 font-bold text-sm ${
                canal === id
                  ? "border-cookie-primary bg-cookie-primary/10 text-cookie-primary"
                  : "border-gray-200 dark:border-gray-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {canal === "balcao" && (
          <div className="flex gap-2">
            {(["levar", "loja"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setModoBalcao(m)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${
                  modoBalcao === m
                    ? "border-cookie-primary text-cookie-primary"
                    : "border-gray-200"
                }`}
              >
                {m === "levar" ? "Para viagem" : "Consumo no local"}
              </button>
            ))}
          </div>
        )}
        {canal === "mesa" && (
          <div className="space-y-1.5">
            <Label htmlFor="admin-mesa">Mesa</Label>
            <select
              id="admin-mesa"
              className="w-full h-11 rounded-xl border border-gray-200 dark:border-gray-700 bg-transparent px-3"
              value={mesaId}
              onChange={(e) => setMesaId(e.target.value)}
            >
              <option value="">Selecione a mesa</option>
              {mesas.map((m) => (
                <option key={m.id} value={m.id}>
                  Mesa {m.numero}
                  {m.apelido ? ` — ${m.apelido}` : ""}
                </option>
              ))}
            </select>
          </div>
        )}
      </section>

      <section className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-800 rounded-2xl p-4 space-y-3">
        <h2 className="font-bold text-sm uppercase tracking-wider text-gray-500">
          Cliente
        </h2>
        <div className="space-y-1.5">
          <Label htmlFor="admin-tel">
            Celular{ehDeliveryCanal ? " *" : ""}
          </Label>
          <div className="grid md:grid-cols-[1fr_auto] gap-2">
            <Input
              id="admin-tel"
              placeholder="(48) 99999-9999"
              value={telefone}
              onChange={(e) => setTelefone(formatarTelefoneBr(e.target.value))}
              inputMode="tel"
            />
            <Button
              type="button"
              variant="outline"
              disabled={buscandoCliente}
              onClick={() => void buscarCliente()}
            >
              {buscandoCliente ? "Buscando…" : "Buscar"}
            </Button>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="admin-nome">Nome *</Label>
          <Input
            id="admin-nome"
            placeholder="Nome do cliente"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
        </div>
      </section>

      {ehDeliveryCanal && (
        <section className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-start gap-2">
            <Clock
              size={18}
              className="mt-0.5 shrink-0 text-cookie-primary"
            />
            <div className="min-w-0 flex-1">
              <h2 className="font-bold text-sm uppercase tracking-wider text-gray-500">
                {canal === "retirada"
                  ? "Horário de retirada"
                  : "Horário de entrega"}
              </h2>
              {!lojaAberta ? (
                <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
                  {statusLoja?.motivo || "Loja fechada no momento."} Escolha um
                  horário de hoje.
                </p>
              ) : (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  O quanto antes, ou escolha um horário (agendado fica em Novos
                  até 30 min antes).
                </p>
              )}
            </div>
          </div>

          {!abreHoje || slotsHoje.length === 0 ? (
            <p className="rounded-xl bg-amber-50 dark:bg-amber-950/40 p-3 text-sm text-amber-800 dark:text-amber-200">
              {motivoSemSlots || "Não há horários disponíveis para hoje."}
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
                      : "border-gray-200 dark:border-gray-700"
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
                      : "border-gray-200 dark:border-gray-700"
                  }`}
                >
                  {rotuloSlot(slot)}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {ehDeliveryCanal && (
        <section className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-800 rounded-2xl p-4 space-y-3">
          <h2 className="font-bold text-sm uppercase tracking-wider text-gray-500">
            Pagamento
          </h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setStatusPagamento("pago")}
              className={`rounded-xl border px-3 py-2 text-sm font-bold ${
                statusPagamento === "pago"
                  ? "border-cookie-primary bg-cookie-primary/10 text-cookie-primary"
                  : "border-gray-200 dark:border-gray-700"
              }`}
            >
              Já pago
            </button>
            {canal === "retirada" && (
              <button
                type="button"
                onClick={() => setStatusPagamento("na_loja")}
                className={`rounded-xl border px-3 py-2 text-sm font-bold ${
                  statusPagamento === "na_loja"
                    ? "border-cookie-primary bg-cookie-primary/10 text-cookie-primary"
                    : "border-gray-200 dark:border-gray-700"
                }`}
              >
                Pagar na loja
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Pedidos do admin entram no KDS já liberados para impressão (sem
            checkout online).
          </p>
        </section>
      )}

      {canal === "entrega" && (
        <section className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-800 rounded-2xl p-4 space-y-3">
          <h2 className="font-bold text-sm uppercase tracking-wider text-gray-500">
            Endereço e frete
          </h2>
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
                className="text-xs font-semibold text-cookie-primary"
                onClick={() => setUsarNovoEndereco(true)}
              >
                Usar novo endereço
              </button>
            </div>
          )}
          {(usarNovoEndereco || enderecos.length === 0) && (
            <div className="grid md:grid-cols-2 gap-2">
              <div className="flex gap-2 md:col-span-2">
                <Input
                  placeholder="00000-000"
                  value={formEnd.cep}
                  inputMode="numeric"
                  autoComplete="postal-code"
                  maxLength={9}
                  onChange={(e) =>
                    setFormEnd((f) => ({
                      ...f,
                      cep: formatarCep(e.target.value),
                    }))
                  }
                />
                <Button type="button" variant="outline" onClick={() => void aplicarCep()}>
                  CEP
                </Button>
              </div>
              <Input
                placeholder="Rua"
                value={formEnd.rua}
                onChange={(e) =>
                  setFormEnd((f) => ({ ...f, rua: e.target.value }))
                }
              />
              <Input
                placeholder="Número"
                value={formEnd.numero}
                onChange={(e) =>
                  setFormEnd((f) => ({ ...f, numero: e.target.value }))
                }
              />
              <Input
                placeholder="Bairro"
                value={formEnd.bairro}
                onChange={(e) =>
                  setFormEnd((f) => ({ ...f, bairro: e.target.value }))
                }
              />
              <Input
                placeholder="Cidade"
                value={formEnd.cidade}
                onChange={(e) =>
                  setFormEnd((f) => ({ ...f, cidade: e.target.value }))
                }
              />
              <Input
                placeholder="UF"
                value={formEnd.uf}
                onChange={(e) =>
                  setFormEnd((f) => ({ ...f, uf: e.target.value }))
                }
              />
              <Input
                placeholder="Complemento (apto, casa…)"
                value={formEnd.complemento}
                onChange={(e) =>
                  setFormEnd((f) => ({ ...f, complemento: e.target.value }))
                }
              />
              <Input
                placeholder="Ponto de referência"
                value={formEnd.referencia}
                onChange={(e) =>
                  setFormEnd((f) => ({ ...f, referencia: e.target.value }))
                }
              />
              <Button
                type="button"
                variant="outline"
                className="md:col-span-2"
                disabled={geoBusy}
                onClick={() => void geocodificar()}
              >
                {geoBusy ? "Localizando…" : "Localizar no mapa (frete)"}
              </Button>
            </div>
          )}
          {freteMsg && (
            <p className="text-sm text-amber-700 bg-amber-50 rounded-xl p-3">
              {freteMsg}
            </p>
          )}
          {!freteMsg && enderecoAtivo && (
            <p className="text-sm text-zinc-600">
              {bairroFreteNome ? `Entrega para ${bairroFreteNome} · ` : ""}
              Frete: R$ {taxaFrete.toFixed(2).replace(".", ",")}
              {acrescimoClima > 0
                ? ` (inclui +R$ ${acrescimoClima.toFixed(2).replace(".", ",")} chuva)`
                : ""}
              {descontoCarrinhoFrete > 0
                ? ` (−R$ ${descontoCarrinhoFrete.toFixed(2).replace(".", ",")} no frete)`
                : ""}
              {distanciaKm != null
                ? ` · ${formatarDistanciaEntrega(distanciaKm)}`
                : ""}
            </p>
          )}
        </section>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-800 rounded-2xl p-4 space-y-3 min-h-96">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <Input
              className="pl-9"
              placeholder="Buscar produto"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <div className="max-h-96 overflow-y-auto space-y-1">
            {produtosFiltrados.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => void abrirProduto(p)}
                className="w-full text-left flex items-center justify-between gap-2 rounded-xl px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-900"
              >
                <span className="font-medium text-sm truncate">{p.nome}</span>
                <span className="text-sm font-bold text-cookie-primary shrink-0">
                  R$ {precoEfetivo(p).toFixed(2).replace(".", ",")}
                </span>
              </button>
            ))}
            {produtosFiltrados.length === 0 && (
              <p className="text-sm text-gray-500 p-3">Nenhum produto.</p>
            )}
          </div>
        </section>

        <section className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-800 rounded-2xl p-4 space-y-3">
          <h2 className="font-bold text-sm uppercase tracking-wider text-gray-500">
            Itens ({itens.length})
          </h2>
          {itens.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhum item ainda.</p>
          ) : (
            <ul className="space-y-3">
              {itens.map((item) => (
                <li
                  key={item.chave}
                  className="border border-gray-100 dark:border-gray-800 rounded-xl p-3 space-y-2"
                >
                  <div className="flex justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm">{item.nome}</p>
                      {item.adicionais.length > 0 && (
                        <p className="text-xs text-gray-500">
                          {item.adicionais.map((a) => a.nome).join(", ")}
                        </p>
                      )}
                      {item.escolhasCombo.length > 0 && (
                        <p className="text-xs text-gray-500">
                          {item.escolhasCombo
                            .map((e) => `${e.grupoNome}: ${e.produtoNome}`)
                            .join(" · ")}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setItens((lista) =>
                          lista.filter((x) => x.chave !== item.chave),
                        )
                      }
                      className="text-red-500 p-1"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="h-8 w-8 rounded-lg border flex items-center justify-center"
                        onClick={() =>
                          setItens((lista) =>
                            lista
                              .map((x) =>
                                x.chave === item.chave
                                  ? {
                                      ...x,
                                      quantidade: Math.max(1, x.quantidade - 1),
                                    }
                                  : x,
                              )
                              .filter((x) => x.quantidade > 0),
                          )
                        }
                      >
                        <Minus size={14} />
                      </button>
                      <span className="w-8 text-center font-bold text-sm">
                        {item.quantidade}
                      </span>
                      <button
                        type="button"
                        className="h-8 w-8 rounded-lg border flex items-center justify-center"
                        onClick={() =>
                          setItens((lista) =>
                            lista.map((x) =>
                              x.chave === item.chave
                                ? { ...x, quantidade: x.quantidade + 1 }
                                : x,
                            ),
                          )
                        }
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <span className="font-bold text-sm">
                      R$ {custoItem(item).toFixed(2).replace(".", ",")}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t pt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>R$ {subtotal.toFixed(2).replace(".", ",")}</span>
            </div>
            {canal === "entrega" && (
              <div className="flex justify-between">
                <span>Frete</span>
                <span>R$ {taxaFrete.toFixed(2).replace(".", ",")}</span>
              </div>
            )}
            {ehDeliveryCanal && (
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  {canal === "retirada" ? "Retirada" : "Entrega"}
                </span>
                <span>
                  {agendadoPara
                    ? rotuloSlot(agendadoPara)
                    : lojaAberta
                      ? "O quanto antes"
                      : "—"}
                </span>
              </div>
            )}
            {ehDeliveryCanal && (
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Pagamento</span>
                <span>
                  {canal === "retirada" && statusPagamento === "na_loja"
                    ? "Na loja"
                    : "Já pago"}
                </span>
              </div>
            )}
            <div className="flex justify-between font-black text-base">
              <span>Total</span>
              <span>R$ {total.toFixed(2).replace(".", ",")}</span>
            </div>
          </div>
        </section>
      </div>

      {modalProduto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white dark:bg-surface-dark rounded-2xl p-5 space-y-4 shadow-xl">
            <div className="flex justify-between gap-3">
              <div>
                <h3 className="font-bold text-lg">{modalProduto.nome}</h3>
                <p className="text-sm text-cookie-primary font-bold">
                  R$ {precoEfetivo(modalProduto).toFixed(2).replace(".", ",")}
                </p>
              </div>
              <button
                type="button"
                className="text-sm text-gray-500"
                onClick={() => setModalProduto(null)}
              >
                Fechar
              </button>
            </div>

            {carregandoModal ? (
              <div className="flex justify-center py-8">
                <Loader2 className="animate-spin" />
              </div>
            ) : (
              <>
                {gruposCombo.length > 0 &&
                  gruposCombo.map((g) => (
                    <div key={g.id} className="space-y-2">
                      <p className="text-sm font-bold">
                        {g.nome}{" "}
                        <span className="text-xs font-normal text-gray-500">
                          ({g.min_escolhas}-{g.max_escolhas})
                        </span>
                      </p>
                      {g.opcoes
                        .filter((o) => o.ativo && o.produto.ativo)
                        .map((o) => {
                          const delta = calcularDeltaOpcao(o, g.preco_referencia);
                          const sel = escolhasCombo.some(
                            (e) => e.grupoId === g.id && e.opcaoId === o.id,
                          );
                          return (
                            <button
                              key={o.id}
                              type="button"
                              onClick={() => toggleOpcaoCombo(g, o.id)}
                              className={`w-full text-left rounded-xl border px-3 py-2 text-sm ${
                                sel
                                  ? "border-cookie-primary bg-cookie-primary/10"
                                  : "border-gray-200"
                              }`}
                            >
                              {o.produto.nome}
                              {delta > 0
                                ? ` (+R$ ${delta.toFixed(2).replace(".", ",")})`
                                : ""}
                            </button>
                          );
                        })}
                    </div>
                  ))}

                {adicionaisDisp.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-bold">Adicionais</p>
                    {adicionaisDisp.map((a) => {
                      const sel = adicionaisSel.some((x) => x.id === a.id);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => toggleAdicional(a)}
                          className={`w-full text-left rounded-xl border px-3 py-2 text-sm ${
                            sel
                              ? "border-cookie-primary bg-cookie-primary/10"
                              : "border-gray-200"
                          }`}
                        >
                          {a.nome}
                          {Number(a.preco) > 0
                            ? ` (+R$ ${Number(a.preco).toFixed(2).replace(".", ",")})`
                            : " (grátis)"}
                        </button>
                      );
                    })}
                  </div>
                )}

                <Input
                  placeholder="Observações"
                  value={obsItem}
                  onChange={(e) => setObsItem(e.target.value)}
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="h-10 w-10 rounded-lg border"
                    onClick={() => setQtdItem((q) => Math.max(1, q - 1))}
                  >
                    <Minus size={14} className="mx-auto" />
                  </button>
                  <span className="font-bold w-8 text-center">{qtdItem}</span>
                  <button
                    type="button"
                    className="h-10 w-10 rounded-lg border"
                    onClick={() => setQtdItem((q) => q + 1)}
                  >
                    <Plus size={14} className="mx-auto" />
                  </button>
                </div>
                <Button
                  className="w-full h-11 bg-cookie-primary hover:bg-cookie-primary-hover font-bold"
                  onClick={confirmarItemModal}
                >
                  Adicionar ao pedido
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </AdminPageShell>
  );
}
