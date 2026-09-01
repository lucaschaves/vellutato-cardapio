import {
  Copy,
  LogOut,
  MapPin,
  Pencil,
  Plus,
  Ticket,
  Trash2,
  Trophy,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useDeliveryCliente } from "../../hooks/useDeliveryCliente";
import {
  buscarCep,
  buscarClienteDeliveryPorCelular,
  excluirEndereco,
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
  buscarSaldoPontos,
  listarExtratoPontos,
  resgatarPontos,
} from "../../lib/deliveryPontos";
import {
  buscarCuponsDoCliente,
  type CupomCliente,
} from "../../lib/clientes";
import {
  lerGuestDeliveryLocal,
  salvarEnderecoDeliveryLocal,
  salvarGuestDeliveryLocal,
} from "../../lib/deliveryGuestStorage";
import { salvarRascunhoEndereco } from "./DeliveryEndereco";
import {
  formatarTelefoneBr,
  mensagemTelefoneInvalido,
  telefoneCelularValido,
} from "../../lib/telefone";
import { cn } from "../../lib/utils";

const EXTRATO_INICIAL = 5;

const FORM_END_VAZIO = {
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
  padrao: true,
};

type AbaConta = "dados" | "enderecos" | "pontos";

function Campo({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block text-xs font-semibold uppercase tracking-wide text-zinc-500"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

export function DeliveryConta() {
  const { cliente: clienteAuth, carregando: authLoading, sair } =
    useDeliveryCliente();

  const [clienteLocal, setClienteLocal] = useState<ClienteDelivery | null>(
    null,
  );
  const cliente = clienteAuth || clienteLocal;

  const [aba, setAba] = useState<AbaConta>("dados");
  const [enderecos, setEnderecos] = useState<EnderecoCliente[]>([]);
  const [saldo, setSaldo] = useState(0);
  const [extrato, setExtrato] = useState<
    Array<{
      id: string;
      pontos: number;
      tipo: string;
      descricao: string | null;
      criado_em: string;
    }>
  >([]);
  const [cupons, setCupons] = useState<CupomCliente[]>([]);
  const [resgateCfg, setResgateCfg] = useState({ pontos: 100, valor: 5 });
  const [resgatando, setResgatando] = useState(false);
  const [extratoLimite, setExtratoLimite] = useState(EXTRATO_INICIAL);
  const [formEnd, setFormEnd] = useState(FORM_END_VAZIO);
  const [editandoEnderecoId, setEditandoEnderecoId] = useState<string | null>(
    null,
  );
  const [mostrarFormEnd, setMostrarFormEnd] = useState(false);
  const [salvandoEnd, setSalvandoEnd] = useState(false);
  const [salvandoDados, setSalvandoDados] = useState(false);

  const [nome, setNome] = useState("");
  const [celular, setCelular] = useState("");
  const [email, setEmail] = useState("");
  const [cpf, setCpf] = useState("");

  const [loginTel, setLoginTel] = useState(
    () => lerGuestDeliveryLocal()?.telefone ?? "",
  );
  const [loginNome, setLoginNome] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [precisaCadastro, setPrecisaCadastro] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (clienteAuth) {
      setClienteLocal(null);
      return;
    }
    const g = lerGuestDeliveryLocal();
    if (!g?.clienteId || !g.telefone) return;
    void buscarClienteDeliveryPorCelular(g.telefone)
      .then((c) => {
        if (c) setClienteLocal(c);
      })
      .catch(() => undefined);
  }, [clienteAuth]);

  useEffect(() => {
    if (!cliente) {
      const g = lerGuestDeliveryLocal();
      if (g?.nome) setNome(g.nome);
      if (g?.telefone) setCelular(g.telefone);
      if (g?.email) setEmail(g.email);
      return;
    }
    setNome(cliente.nome || "");
    setCelular(cliente.celular ? formatarTelefoneBr(cliente.celular) : "");
    setEmail(cliente.email || "");
    setCpf(cliente.cpf ? formatarCpf(cliente.cpf) : "");
  }, [cliente]);

  useEffect(() => {
    if (!cliente?.id) return;
    void (async () => {
      const [e, s, x, cfg, cups] = await Promise.all([
        listarEnderecos(cliente.id),
        buscarSaldoPontos(cliente.id),
        listarExtratoPontos(cliente.id),
        buscarDeliveryConfig(),
        buscarCuponsDoCliente(cliente.id).catch(() => []),
      ]);
      setEnderecos(e);
      setSaldo(s);
      setExtrato(x as typeof extrato);
      setExtratoLimite(EXTRATO_INICIAL);
      setResgateCfg({
        pontos: cfg.resgate_pontos,
        valor: cfg.resgate_valor_reais,
      });
      setCupons(cups || []);
    })();
  }, [cliente?.id]);

  const copiarCupom = async (codigo: string) => {
    try {
      await navigator.clipboard.writeText(codigo);
      toast.success(`Cupom ${codigo} copiado`);
    } catch {
      toast.error("Não foi possível copiar o código");
    }
  };

  const resgatar = async () => {
    if (!cliente?.id || resgatando) return;
    setResgatando(true);
    try {
      const r = await resgatarPontos(cliente.id);
      const [s, x, cups] = await Promise.all([
        buscarSaldoPontos(cliente.id),
        listarExtratoPontos(cliente.id),
        buscarCuponsDoCliente(cliente.id),
      ]);
      setSaldo(s);
      setExtrato(x as typeof extrato);
      setCupons(cups);
      toast.success(
        `Cupom ${r.codigo} gerado (R$ ${r.valor.toFixed(2).replace(".", ",")})`,
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setResgatando(false);
    }
  };

  const entrarComTelefone = async () => {
    const erroTel = mensagemTelefoneInvalido(loginTel);
    if (erroTel) {
      toast.warning(erroTel);
      return;
    }
    try {
      setBuscando(true);
      const existente = await buscarClienteDeliveryPorCelular(loginTel);
      if (existente) {
        setClienteLocal(existente);
        setPrecisaCadastro(false);
        salvarGuestDeliveryLocal({
          nome: existente.nome,
          telefone: loginTel,
          email: existente.email,
          clienteId: existente.id,
        });
        try {
          const lista = await listarEnderecos(existente.id);
          const padrao = lista.find((e) => e.padrao) || lista[0];
          if (padrao) {
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
            salvarRascunhoEndereco({
              cep: padrao.cep,
              rua: padrao.rua,
              numero: padrao.numero,
              bairro: padrao.bairro,
              cidade: padrao.cidade,
              uf: padrao.uf,
              complemento: padrao.complemento || undefined,
              referencia: padrao.referencia || undefined,
              latitude: padrao.latitude,
              longitude: padrao.longitude,
            });
          }
        } catch {
          /* opcional */
        }
        toast.success(`Olá, ${existente.nome}!`);
        return;
      }
      setPrecisaCadastro(true);
      toast.message("Não encontramos cadastro. Informe nome e e-mail.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao buscar");
    } finally {
      setBuscando(false);
    }
  };

  const criarCadastroConta = async () => {
    if (!loginNome.trim()) {
      toast.error("Informe seu nome.");
      return;
    }
    if (
      !(loginEmail.trim().includes("@") && loginEmail.trim().includes("."))
    ) {
      toast.error("Informe um e-mail válido.");
      return;
    }
    try {
      setSalvando(true);
      const criado = await garantirClienteCheckout({
        nome: loginNome,
        celular: loginTel,
        email: loginEmail.trim(),
      });
      setClienteLocal(criado);
      setPrecisaCadastro(false);
      salvarGuestDeliveryLocal({
        nome: criado.nome,
        telefone: loginTel,
        email: criado.email,
        clienteId: criado.id,
      });
      toast.success("Cadastro pronto!");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao cadastrar");
    } finally {
      setSalvando(false);
    }
  };

  const sairConta = async () => {
    setClienteLocal(null);
    setPrecisaCadastro(false);
    setMostrarFormEnd(false);
    setEditandoEnderecoId(null);
    setFormEnd(FORM_END_VAZIO);
    salvarGuestDeliveryLocal({
      nome: "",
      telefone: "",
      email: null,
      clienteId: null,
    });
    try {
      await sair();
    } catch {
      /* ignore se não havia sessão Auth */
    }
  };

  const abrirNovoEndereco = () => {
    setEditandoEnderecoId(null);
    setFormEnd({ ...FORM_END_VAZIO, padrao: enderecos.length === 0 });
    setMostrarFormEnd(true);
  };

  const abrirEditarEndereco = (e: EnderecoCliente) => {
    setEditandoEnderecoId(e.id);
    setFormEnd({
      cep: formatarCep(e.cep),
      rua: e.rua,
      numero: e.numero,
      bairro: e.bairro,
      cidade: e.cidade,
      uf: e.uf,
      complemento: e.complemento || "",
      referencia: e.referencia || "",
      latitude: e.latitude,
      longitude: e.longitude,
      padrao: e.padrao,
    });
    setMostrarFormEnd(true);
  };

  const fecharFormEnd = () => {
    setMostrarFormEnd(false);
    setEditandoEnderecoId(null);
    setFormEnd(FORM_END_VAZIO);
  };

  const salvarFormEndereco = async () => {
    if (!cliente?.id) return;
    if (!formEnd.rua.trim() || !formEnd.numero.trim() || !formEnd.cep.trim()) {
      toast.error("Preencha CEP, rua e número.");
      return;
    }
    try {
      setSalvandoEnd(true);
      let lat = formEnd.latitude;
      let lng = formEnd.longitude;
      if (lat == null || lng == null) {
        const coords = await geocodificarEndereco(formEnd);
        if (!coords) {
          toast.error("Não foi possível localizar o endereço.");
          return;
        }
        lat = coords.latitude;
        lng = coords.longitude;
      }
      await salvarEndereco({
        id: editandoEnderecoId || undefined,
        cliente_id: cliente.id,
        rotulo: "Casa",
        ...formEnd,
        latitude: lat,
        longitude: lng,
      });
      setEnderecos(await listarEnderecos(cliente.id));
      fecharFormEnd();
      toast.success(
        editandoEnderecoId ? "Endereço atualizado" : "Endereço salvo",
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSalvandoEnd(false);
    }
  };

  const excluirEnd = async (id: string) => {
    try {
      await excluirEndereco(id);
      if (editandoEnderecoId === id) fecharFormEnd();
      setEnderecos(await listarEnderecos(cliente!.id));
      toast.success("Endereço removido");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir");
    }
  };

  const salvarDados = async () => {
    try {
      setSalvandoDados(true);
      const atualizado = await garantirClienteCheckout({
        nome,
        celular,
        email: email.trim() || null,
      });
      setClienteLocal(atualizado);
      salvarGuestDeliveryLocal({
        nome,
        telefone: celular,
        email: email.trim() || null,
        clienteId: atualizado.id,
      });
      toast.success("Dados atualizados");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSalvandoDados(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-cookie-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!cliente) {
    return (
      <div className="max-w-md mx-auto space-y-5 py-6">
        <div className="space-y-1">
          <h1 className="text-xl font-bold tracking-tight text-zinc-900">
            Minha conta
          </h1>
          <p className="text-sm text-zinc-500">
            Informe seu telefone para ver endereços e pontos.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-4 space-y-3 shadow-sm">
          <Campo label="Telefone / WhatsApp" htmlFor="conta-tel">
            <Input
              id="conta-tel"
              placeholder="(00) 00000-0000"
              value={loginTel}
              inputMode="tel"
              autoComplete="tel"
              maxLength={15}
              onChange={(e) => {
                setLoginTel(formatarTelefoneBr(e.target.value));
                setPrecisaCadastro(false);
              }}
            />
          </Campo>
          <p className="text-[11px] text-zinc-400 -mt-1">
            11 dígitos: DDD + 9 + número
          </p>
          {loginTel.replace(/\D/g, "").length > 0 &&
            !telefoneCelularValido(loginTel) && (
              <p className="text-xs font-semibold text-cookie-primary">
                {mensagemTelefoneInvalido(loginTel)}
              </p>
            )}

          {precisaCadastro && (
            <>
              <Campo label="Nome completo" htmlFor="conta-nome-novo">
                <Input
                  id="conta-nome-novo"
                  placeholder="Como devemos te chamar"
                  value={loginNome}
                  autoComplete="name"
                  onChange={(e) => setLoginNome(e.target.value)}
                />
              </Campo>
              <Campo label="E-mail" htmlFor="conta-email-novo">
                <Input
                  id="conta-email-novo"
                  placeholder="seu@email.com"
                  type="email"
                  value={loginEmail}
                  autoComplete="email"
                  onChange={(e) => setLoginEmail(e.target.value)}
                />
              </Campo>
            </>
          )}

          {!precisaCadastro ? (
            <Button
              className="w-full h-11 bg-cookie-primary hover:bg-cookie-primary-hover"
              disabled={buscando}
              onClick={() => void entrarComTelefone()}
            >
              {buscando ? "Buscando…" : "Continuar"}
            </Button>
          ) : (
            <Button
              className="w-full h-11 bg-cookie-primary hover:bg-cookie-primary-hover"
              disabled={salvando}
              onClick={() => void criarCadastroConta()}
            >
              {salvando ? "Salvando…" : "Criar cadastro"}
            </Button>
          )}
        </div>
      </div>
    );
  }

  const primeiroNome = cliente.nome.trim().split(/\s+/)[0] || "Cliente";
  const telefoneExibicao = cliente.celular
    ? formatarTelefoneBr(cliente.celular)
    : null;

  return (
    <div className="space-y-4 pb-6">
      {/* Cabeçalho compacto */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            Minha conta
          </p>
          <h1 className="text-lg font-bold text-zinc-900 truncate leading-tight">
            Olá, {primeiroNome}
          </h1>
          {telefoneExibicao && (
            <p className="text-sm text-zinc-500 tabular-nums">
              {telefoneExibicao}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5 border-zinc-200 text-zinc-700"
          onClick={() => void sairConta()}
        >
          <LogOut size={14} />
          Sair
        </Button>
      </div>

      {/* Abas */}
      <div
        className="grid grid-cols-3 gap-1 rounded-xl bg-zinc-100 p-1"
        role="tablist"
      >
        {(
          [
            ["dados", "Dados"],
            ["enderecos", "Endereços"],
            ["pontos", "Pontos"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={aba === id}
            onClick={() => setAba(id)}
            className={cn(
              "rounded-lg py-2 text-sm font-semibold transition-colors",
              aba === id
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-500 hover:text-zinc-800",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {aba === "dados" && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 space-y-3.5 shadow-sm">
          <Campo label="Nome" htmlFor="conta-nome">
            <Input
              id="conta-nome"
              value={nome}
              autoComplete="name"
              onChange={(e) => setNome(e.target.value)}
            />
          </Campo>
          <Campo label="Telefone" htmlFor="conta-celular">
            <Input
              id="conta-celular"
              value={celular}
              inputMode="tel"
              autoComplete="tel"
              onChange={(e) => setCelular(formatarTelefoneBr(e.target.value))}
            />
          </Campo>
          <Campo label="E-mail" htmlFor="conta-email">
            <Input
              id="conta-email"
              type="email"
              value={email}
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
            />
          </Campo>
          <Campo label="CPF" htmlFor="conta-cpf">
            <Input
              id="conta-cpf"
              value={cpf}
              inputMode="numeric"
              autoComplete="off"
              onChange={(e) => setCpf(formatarCpf(e.target.value))}
              placeholder="000.000.000-00"
            />
          </Campo>
          <Button
            className="w-full h-11 bg-cookie-primary hover:bg-cookie-primary-hover"
            disabled={salvandoDados}
            onClick={() => void salvarDados()}
          >
            {salvandoDados ? "Salvando…" : "Salvar dados"}
          </Button>
        </div>
      )}

      {aba === "enderecos" && (
        <div className="space-y-3">
          {enderecos.length === 0 && !mostrarFormEnd && (
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-4 py-8 text-center">
              <MapPin className="mx-auto mb-2 text-zinc-300" size={28} />
              <p className="text-sm font-medium text-zinc-700">
                Nenhum endereço salvo
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Cadastre um endereço para agilizar o checkout.
              </p>
            </div>
          )}

          {enderecos.map((e) => (
            <div
              key={e.id}
              className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cookie-primary/10 text-cookie-primary">
                  <MapPin size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-zinc-900">
                      {e.rua}, {e.numero}
                    </p>
                    {e.padrao && (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                        Padrão
                      </span>
                    )}
                  </div>
                  {e.complemento?.trim() && (
                    <p className="mt-0.5 text-xs text-zinc-600">
                      {e.complemento}
                    </p>
                  )}
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {e.bairro} · {e.cidade}/{e.uf}
                    {e.cep ? ` · CEP ${formatarCep(e.cep)}` : ""}
                  </p>
                  {e.referencia?.trim() && (
                    <p className="mt-1 text-xs text-zinc-400">
                      Ref.: {e.referencia}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-3 flex gap-2 border-t border-zinc-100 pt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5"
                  onClick={() => abrirEditarEndereco(e)}
                >
                  <Pencil size={14} />
                  Editar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-cookie-primary hover:bg-cookie-primary/5 hover:text-cookie-primary"
                  onClick={() => void excluirEnd(e.id)}
                >
                  <Trash2 size={14} />
                  Excluir
                </Button>
              </div>
            </div>
          ))}

          {!mostrarFormEnd ? (
            <Button
              type="button"
              variant="outline"
              className="w-full h-11 gap-2 border-dashed"
              onClick={abrirNovoEndereco}
            >
              <Plus size={16} />
              Adicionar endereço
            </Button>
          ) : (
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 space-y-3 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-zinc-900">
                  {editandoEnderecoId ? "Editar endereço" : "Novo endereço"}
                </p>
                <button
                  type="button"
                  onClick={fecharFormEnd}
                  className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                  aria-label="Fechar formulário"
                >
                  <X size={16} />
                </button>
              </div>

              <Campo label="CEP">
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
                      latitude: null,
                      longitude: null,
                    }))
                  }
                  onBlur={() =>
                    void buscarCep(formEnd.cep).then((r) => {
                      if (!r) return;
                      setFormEnd((f) => ({
                        ...f,
                        rua: r.rua || f.rua,
                        bairro: r.bairro || f.bairro,
                        cidade: r.cidade || f.cidade,
                        uf: r.uf || f.uf,
                        latitude: null,
                        longitude: null,
                      }));
                    })
                  }
                />
              </Campo>
              <Campo label="Rua">
                <Input
                  placeholder="Rua"
                  value={formEnd.rua}
                  autoComplete="address-line1"
                  onChange={(e) =>
                    setFormEnd((f) => ({
                      ...f,
                      rua: e.target.value,
                      latitude: null,
                      longitude: null,
                    }))
                  }
                />
              </Campo>
              <div className="grid grid-cols-2 gap-2">
                <Campo label="Número">
                  <Input
                    placeholder="Nº"
                    value={formEnd.numero}
                    onChange={(e) =>
                      setFormEnd((f) => ({
                        ...f,
                        numero: e.target.value,
                        latitude: null,
                        longitude: null,
                      }))
                    }
                  />
                </Campo>
                <Campo label="Complemento">
                  <Input
                    placeholder="Apto, casa…"
                    value={formEnd.complemento}
                    onChange={(e) =>
                      setFormEnd((f) => ({
                        ...f,
                        complemento: e.target.value,
                      }))
                    }
                  />
                </Campo>
              </div>
              <Campo label="Bairro">
                <Input
                  placeholder="Bairro"
                  value={formEnd.bairro}
                  onChange={(e) =>
                    setFormEnd((f) => ({
                      ...f,
                      bairro: e.target.value,
                      latitude: null,
                      longitude: null,
                    }))
                  }
                />
              </Campo>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <Campo label="Cidade">
                    <Input
                      placeholder="Cidade"
                      value={formEnd.cidade}
                      onChange={(e) =>
                        setFormEnd((f) => ({
                          ...f,
                          cidade: e.target.value,
                          latitude: null,
                          longitude: null,
                        }))
                      }
                    />
                  </Campo>
                </div>
                <Campo label="UF">
                  <Input
                    placeholder="UF"
                    value={formEnd.uf}
                    maxLength={2}
                    onChange={(e) =>
                      setFormEnd((f) => ({
                        ...f,
                        uf: e.target.value.toUpperCase(),
                        latitude: null,
                        longitude: null,
                      }))
                    }
                  />
                </Campo>
              </div>
              <Campo label="Referência (opcional)">
                <Input
                  placeholder="Próximo a…"
                  value={formEnd.referencia}
                  onChange={(e) =>
                    setFormEnd((f) => ({
                      ...f,
                      referencia: e.target.value,
                    }))
                  }
                />
              </Campo>

              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  className="rounded border-zinc-300"
                  checked={formEnd.padrao}
                  onChange={(e) =>
                    setFormEnd((f) => ({ ...f, padrao: e.target.checked }))
                  }
                />
                Usar como endereço padrão
              </label>

              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={fecharFormEnd}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  className="flex-1 bg-cookie-primary hover:bg-cookie-primary-hover"
                  disabled={salvandoEnd}
                  onClick={() => void salvarFormEndereco()}
                >
                  {salvandoEnd
                    ? "Salvando…"
                    : editandoEnderecoId
                      ? "Atualizar"
                      : "Salvar"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {aba === "pontos" && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 space-y-3 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-500">
                <Trophy size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-2xl font-black tabular-nums leading-none">
                  {saldo}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">pontos disponíveis</p>
              </div>
              <Button
                className="shrink-0"
                variant="outline"
                disabled={saldo < resgateCfg.pontos || resgatando}
                onClick={() => void resgatar()}
              >
                {resgatando
                  ? "Resgatando…"
                  : `Resgatar (${resgateCfg.pontos} pts)`}
              </Button>
            </div>
            <p className="text-sm text-zinc-600 leading-snug rounded-xl bg-zinc-50 px-3 py-2.5">
              Ao resgatar, seus pontos viram um cupom de desconto de{" "}
              <span className="font-semibold text-zinc-800">
                R$ {resgateCfg.valor.toFixed(2).replace(".", ",")}
              </span>{" "}
              para usar no próximo pedido. São necessários{" "}
              <span className="font-semibold text-zinc-800">
                {resgateCfg.pontos} pontos
              </span>{" "}
              por resgate.
            </p>
          </div>

          {cupons.length > 0 && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 space-y-2.5 shadow-sm">
              <p className="text-sm font-bold flex items-center gap-1.5 text-zinc-900">
                <Ticket size={15} className="text-cookie-primary" /> Seus cupons
              </p>
              {cupons.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-bold">{c.codigo}</p>
                    <p className="text-xs text-zinc-500">
                      {c.tipo === "percentual"
                        ? `${c.valor}% de desconto`
                        : `R$ ${Number(c.valor).toFixed(2).replace(".", ",")}`}
                      {c.validade
                        ? ` · até ${new Date(c.validade).toLocaleDateString("pt-BR")}`
                        : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => void copiarCupom(c.codigo)}
                    aria-label={`Copiar cupom ${c.codigo}`}
                  >
                    <Copy size={14} data-icon="inline-start" />
                    Copiar
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-2xl border border-zinc-200 bg-white p-4 space-y-1 shadow-sm">
            <p className="mb-2 text-sm font-bold text-zinc-900">Extrato</p>
            {extrato.length === 0 ? (
              <p className="text-sm text-zinc-500 py-2">
                Sem movimentos ainda.
              </p>
            ) : (
              <>
                {extrato.slice(0, extratoLimite).map((x) => (
                  <div
                    key={x.id}
                    className="flex justify-between gap-3 text-sm border-b border-zinc-50 py-2 last:border-0"
                  >
                    <span className="text-zinc-600 min-w-0">
                      {x.descricao || x.tipo}
                    </span>
                    <span
                      className={cn(
                        "font-semibold tabular-nums shrink-0",
                        x.pontos >= 0
                          ? "text-emerald-600"
                          : "text-cookie-primary",
                      )}
                    >
                      {x.pontos >= 0 ? "+" : ""}
                      {x.pontos}
                    </span>
                  </div>
                ))}
                {extrato.length > extratoLimite && (
                  <button
                    type="button"
                    className="w-full pt-2 text-center text-sm font-semibold text-cookie-primary"
                    onClick={() =>
                      setExtratoLimite((n) => n + EXTRATO_INICIAL)
                    }
                  >
                    Ver mais
                  </button>
                )}
                {extratoLimite > EXTRATO_INICIAL &&
                  extratoLimite >= extrato.length && (
                    <button
                      type="button"
                      className="w-full pt-2 text-center text-sm font-semibold text-zinc-500"
                      onClick={() => setExtratoLimite(EXTRATO_INICIAL)}
                    >
                      Ver menos
                    </button>
                  )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
