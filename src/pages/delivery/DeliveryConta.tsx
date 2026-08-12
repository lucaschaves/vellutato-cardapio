import { Copy, MapPin, Ticket, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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

export function DeliveryConta() {
  const navigate = useNavigate();
  const { cliente: clienteAuth, carregando: authLoading, sair } =
    useDeliveryCliente();

  const [clienteLocal, setClienteLocal] = useState<ClienteDelivery | null>(
    null,
  );
  const cliente = clienteAuth || clienteLocal;

  const [aba, setAba] = useState<"dados" | "enderecos" | "pontos">("dados");
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
    padrao: true,
  });
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
    setCelular(
      cliente.celular ? formatarTelefoneBr(cliente.celular) : "",
    );
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

  if (authLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-cookie-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!cliente) {
    return (
      <div className="max-w-md mx-auto space-y-4 py-8">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-black">Minha conta</h1>
          <p className="text-sm text-zinc-500">
            Informe seu telefone para ver endereços, pontos e pedidos.
          </p>
        </div>

        <div className="bg-white border rounded-2xl p-4 space-y-3">
          <div className="space-y-1.5">
            <label
              htmlFor="conta-tel"
              className="text-sm font-semibold text-zinc-800"
            >
              Telefone / WhatsApp
            </label>
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
            <p className="text-[11px] text-zinc-400">
              11 dígitos: DDD + 9 + número
            </p>
            {loginTel.replace(/\D/g, "").length > 0 &&
              !telefoneCelularValido(loginTel) && (
                <p className="text-xs font-semibold text-cookie-primary">
                  {mensagemTelefoneInvalido(loginTel)}
                </p>
              )}
          </div>

          {precisaCadastro && (
            <>
              <div className="space-y-1.5">
                <label
                  htmlFor="conta-nome-novo"
                  className="text-sm font-semibold text-zinc-800"
                >
                  Nome completo
                </label>
                <Input
                  id="conta-nome-novo"
                  placeholder="Como devemos te chamar"
                  value={loginNome}
                  autoComplete="name"
                  onChange={(e) => setLoginNome(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="conta-email-novo"
                  className="text-sm font-semibold text-zinc-800"
                >
                  E-mail
                </label>
                <Input
                  id="conta-email-novo"
                  placeholder="seu@email.com"
                  type="email"
                  value={loginEmail}
                  autoComplete="email"
                  onChange={(e) => setLoginEmail(e.target.value)}
                />
              </div>
            </>
          )}

          {!precisaCadastro ? (
            <Button
              className="w-full bg-cookie-primary hover:bg-cookie-primary-hover"
              disabled={buscando}
              onClick={() => void entrarComTelefone()}
            >
              {buscando ? "Buscando…" : "Continuar"}
            </Button>
          ) : (
            <Button
              className="w-full bg-cookie-primary hover:bg-cookie-primary-hover"
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

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Olá, {cliente.nome}</h1>
          <p className="text-sm text-zinc-500">
            {cliente.email ||
              (cliente.celular
                ? formatarTelefoneBr(cliente.celular)
                : null)}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void sairConta()}>
          Sair
        </Button>
      </div>

      <div className="flex gap-1 overflow-x-auto">
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
            onClick={() => setAba(id)}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold shrink-0 ${
              aba === id ? "bg-zinc-900 text-white" : "bg-white border"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {aba === "dados" && (
        <div className="bg-white border rounded-2xl p-4 space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-zinc-800">Nome</label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-zinc-800">
              Telefone
            </label>
            <Input
              value={celular}
              onChange={(e) => setCelular(formatarTelefoneBr(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-zinc-800">
              E-mail
            </label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-zinc-800">CPF</label>
            <Input
              value={cpf}
              onChange={(e) => setCpf(formatarCpf(e.target.value))}
            />
          </div>
          <Button
            className="w-full bg-cookie-primary hover:bg-cookie-primary-hover"
            onClick={async () => {
              try {
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
              }
            }}
          >
            Salvar
          </Button>
        </div>
      )}

      {aba === "enderecos" && (
        <div className="space-y-3">
          {enderecos.map((e) => (
            <div
              key={e.id}
              className="bg-white border rounded-2xl p-4 flex justify-between gap-2"
            >
              <div className="text-sm">
                <p className="font-bold flex items-center gap-1">
                  <MapPin size={14} /> {e.rua}, {e.numero}
                  {e.padrao && (
                    <span className="text-[10px] uppercase bg-zinc-100 px-1.5 rounded">
                      padrão
                    </span>
                  )}
                </p>
                {e.complemento?.trim() && (
                  <p className="text-zinc-600 text-xs mt-0.5">
                    Compl.: {e.complemento}
                  </p>
                )}
                <p className="text-zinc-500">
                  {e.bairro} — {e.cidade}/{e.uf}
                </p>
              </div>
              <button
                type="button"
                className="text-xs text-cookie-primary"
                onClick={() =>
                  void excluirEndereco(e.id).then(() =>
                    listarEnderecos(cliente.id).then(setEnderecos),
                  )
                }
              >
                Excluir
              </button>
            </div>
          ))}

          <div className="bg-white border rounded-2xl p-4 space-y-2">
            <p className="font-bold text-sm">Novo endereço</p>
            <Input
              placeholder="00000-000"
              value={formEnd.cep}
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={9}
              onChange={(e) =>
                setFormEnd((f) => ({ ...f, cep: formatarCep(e.target.value) }))
              }
              onBlur={() =>
                void buscarCep(formEnd.cep).then((r) => {
                  if (!r) return;
                  setFormEnd((f) => ({
                    ...f,
                    rua: r.rua,
                    bairro: r.bairro,
                    cidade: r.cidade,
                    uf: r.uf,
                  }));
                })
              }
            />
            <Input
              placeholder="Rua"
              value={formEnd.rua}
              onChange={(e) =>
                setFormEnd((f) => ({ ...f, rua: e.target.value }))
              }
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="Número"
                value={formEnd.numero}
                onChange={(e) =>
                  setFormEnd((f) => ({ ...f, numero: e.target.value }))
                }
              />
              <Input
                placeholder="Complemento (apto, casa…)"
                value={formEnd.complemento}
                onChange={(e) =>
                  setFormEnd((f) => ({ ...f, complemento: e.target.value }))
                }
              />
            </div>
            <Input
              placeholder="Bairro"
              value={formEnd.bairro}
              onChange={(e) =>
                setFormEnd((f) => ({ ...f, bairro: e.target.value }))
              }
            />
            <div className="grid grid-cols-3 gap-2">
              <Input
                className="col-span-2"
                placeholder="Cidade"
                value={formEnd.cidade}
                onChange={(e) =>
                  setFormEnd((f) => ({ ...f, cidade: e.target.value }))
                }
              />
              <Input
                placeholder="UF"
                value={formEnd.uf}
                maxLength={2}
                onChange={(e) =>
                  setFormEnd((f) => ({
                    ...f,
                    uf: e.target.value.toUpperCase(),
                  }))
                }
              />
            </div>
            <Input
              placeholder="Ponto de referência (opcional)"
              value={formEnd.referencia}
              onChange={(e) =>
                setFormEnd((f) => ({ ...f, referencia: e.target.value }))
              }
            />
            <Button
              className="w-full"
              onClick={async () => {
                try {
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
                    cliente_id: cliente.id,
                    rotulo: "Casa",
                    ...formEnd,
                    latitude: lat,
                    longitude: lng,
                  });
                  setEnderecos(await listarEnderecos(cliente.id));
                  setFormEnd({
                    cep: "",
                    rua: "",
                    numero: "",
                    bairro: "",
                    cidade: "",
                    uf: "",
                    complemento: "",
                    referencia: "",
                    latitude: null,
                    longitude: null,
                    padrao: true,
                  });
                  toast.success("Endereço salvo");
                } catch (e: unknown) {
                  toast.error(e instanceof Error ? e.message : "Erro");
                }
              }}
            >
              Salvar endereço
            </Button>
          </div>
        </div>
      )}

      {aba === "pontos" && (
        <div className="space-y-3">
          <div className="bg-white border rounded-2xl p-4 flex items-center gap-3">
            <Trophy className="text-amber-500" />
            <div>
              <p className="text-2xl font-black">{saldo}</p>
              <p className="text-xs text-zinc-500">pontos</p>
            </div>
            <Button
              className="ml-auto"
              variant="outline"
              disabled={saldo < resgateCfg.pontos || resgatando}
              onClick={() => void resgatar()}
            >
              {resgatando
                ? "Resgatando…"
                : `Resgatar (${resgateCfg.pontos} pts)`}
            </Button>
          </div>

          {cupons.length > 0 && (
            <div className="bg-white border rounded-2xl p-4 space-y-2">
              <p className="font-bold text-sm flex items-center gap-1">
                <Ticket size={14} /> Seus cupons
              </p>
              {cupons.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-zinc-100 px-3 py-2"
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

          <div className="bg-white border rounded-2xl p-4 space-y-2">
            <p className="font-bold text-sm">Extrato</p>
            {extrato.length === 0 ? (
              <p className="text-sm text-zinc-500">Sem movimentos ainda.</p>
            ) : (
              extrato.slice(0, 20).map((x) => (
                <div
                  key={x.id}
                  className="flex justify-between text-sm border-b border-zinc-50 py-1"
                >
                  <span className="text-zinc-600">
                    {x.descricao || x.tipo}
                  </span>
                  <span
                    className={
                      x.pontos >= 0 ? "text-emerald-600" : "text-cookie-primary"
                    }
                  >
                    {x.pontos >= 0 ? "+" : ""}
                    {x.pontos}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <Button variant="outline" className="w-full" onClick={() => navigate("/pedidos")}>
        Meus pedidos
      </Button>
    </div>
  );
}
