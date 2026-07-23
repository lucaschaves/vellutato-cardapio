import { MapPin, Ticket, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { IconeGoogle } from "../../components/IconeGoogle";
import { Input } from "../../components/ui/input";
import { useDeliveryCliente } from "../../hooks/useDeliveryCliente";
import {
  buscarCep,
  excluirEndereco,
  formatarCpf,
  geocodificarEndereco,
  listarEnderecos,
  salvarEndereco,
  upsertClienteAuth,
  type EnderecoCliente,
} from "../../lib/deliveryCliente";
import { buscarDeliveryConfig } from "../../lib/deliveryConfig";
import {
  buscarSaldoPontos,
  listarExtratoPontos,
  resgatarPontos,
} from "../../lib/deliveryPontos";
import { buscarCuponsDoCliente } from "../../lib/clientes";
import {
  lerGuestDeliveryLocal,
  salvarGuestDeliveryLocal,
} from "../../lib/deliveryGuestStorage";
import { formatarTelefoneBr, telefoneDigitosCompleto } from "../../lib/telefone";

export function DeliveryConta() {
  const navigate = useNavigate();
  const {
    logado,
    cliente,
    usuario,
    carregando,
    entrarComGoogle,
    enviarOtpSms,
    verificarOtpSms,
    sair,
    recarregar,
    cadastroCompleto,
  } = useDeliveryCliente();
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
  const [cupons, setCupons] = useState<
    Array<{ codigo: string; valor: number; tipo: string }>
  >([]);
  const [resgateCfg, setResgateCfg] = useState({ pontos: 100, valor: 5 });
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
  const [cpf, setCpf] = useState("");

  const [loginTel, setLoginTel] = useState(
    () => lerGuestDeliveryLocal()?.telefone ?? "",
  );
  const [loginCodigo, setLoginCodigo] = useState("");
  const [otpEnviado, setOtpEnviado] = useState(false);
  const [enviandoOtp, setEnviandoOtp] = useState(false);
  const [verificandoOtp, setVerificandoOtp] = useState(false);

  useEffect(() => {
    if (!cliente) {
      const g = lerGuestDeliveryLocal();
      if (g?.nome) setNome(g.nome);
      if (g?.telefone) setCelular(g.telefone);
      return;
    }
    setNome(cliente.nome || lerGuestDeliveryLocal()?.nome || "");
    setCelular(
      cliente.celular
        ? formatarTelefoneBr(cliente.celular)
        : lerGuestDeliveryLocal()?.telefone || "",
    );
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
      setCupons(
        (cups as Array<{ codigo: string; valor: number; tipo: string }>) || [],
      );
    })();
  }, [cliente?.id]);

  const enviarCodigo = async () => {
    if (!telefoneDigitosCompleto(loginTel)) {
      toast.warning("Informe um celular com DDD (11 dígitos).");
      return;
    }
    try {
      setEnviandoOtp(true);
      await enviarOtpSms(loginTel);
      setOtpEnviado(true);
      setLoginCodigo("");
      salvarGuestDeliveryLocal({
        nome: lerGuestDeliveryLocal()?.nome || "",
        telefone: loginTel,
        email: lerGuestDeliveryLocal()?.email || null,
        clienteId: lerGuestDeliveryLocal()?.clienteId,
      });
      toast.success("Código enviado por SMS.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar SMS");
    } finally {
      setEnviandoOtp(false);
    }
  };

  const confirmarCodigo = async () => {
    try {
      setVerificandoOtp(true);
      await verificarOtpSms(loginTel, loginCodigo);
      await recarregar();
      toast.success("Login confirmado!");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Código inválido");
    } finally {
      setVerificandoOtp(false);
    }
  };

  if (carregando) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-red-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!logado) {
    return (
      <div className="max-w-md mx-auto space-y-4 py-8">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-black">Minha conta</h1>
          <p className="text-sm text-zinc-500">
            Entre com seu telefone para ver endereços, pontos e pedidos.
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
              disabled={otpEnviado}
              onChange={(e) => setLoginTel(formatarTelefoneBr(e.target.value))}
            />
          </div>

          {otpEnviado && (
            <div className="space-y-1.5">
              <label
                htmlFor="conta-otp"
                className="text-sm font-semibold text-zinc-800"
              >
                Código SMS
              </label>
              <Input
                id="conta-otp"
                placeholder="000000"
                value={loginCodigo}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                onChange={(e) =>
                  setLoginCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
              />
            </div>
          )}

          {!otpEnviado ? (
            <Button
              className="w-full bg-red-600 hover:bg-red-700"
              disabled={enviandoOtp}
              onClick={() => void enviarCodigo()}
            >
              {enviandoOtp ? "Enviando…" : "Enviar código por SMS"}
            </Button>
          ) : (
            <div className="space-y-2">
              <Button
                className="w-full bg-red-600 hover:bg-red-700"
                disabled={verificandoOtp || loginCodigo.length < 6}
                onClick={() => void confirmarCodigo()}
              >
                {verificandoOtp ? "Verificando…" : "Entrar"}
              </Button>
              <button
                type="button"
                className="w-full text-xs font-semibold text-zinc-500"
                disabled={enviandoOtp}
                onClick={() => {
                  setOtpEnviado(false);
                  setLoginCodigo("");
                }}
              >
                Alterar telefone
              </button>
              <button
                type="button"
                className="w-full text-xs font-semibold text-red-600"
                disabled={enviandoOtp}
                onClick={() => void enviarCodigo()}
              >
                Reenviar código
              </button>
            </div>
          )}
        </div>

        <div className="relative text-center">
          <div className="absolute inset-x-0 top-1/2 border-t border-zinc-200" />
          <span className="relative text-xs text-zinc-400 bg-white px-2">
            ou
          </span>
        </div>

        <Button
          variant="outline"
          className="w-full"
          onClick={() =>
            void entrarComGoogle(
              `${window.location.origin}/delivery/auth/callback`,
            )
          }
        >
          <IconeGoogle className="h-5 w-5 mr-2" />
          Entrar com Google
        </Button>
      </div>
    );
  }

  if (!cadastroCompleto) {
    return (
      <div className="text-center py-16 space-y-3">
        <p>Complete seu cadastro para continuar.</p>
        <Button onClick={() => navigate("/delivery/cadastro")}>
          Completar cadastro
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Olá, {cliente?.nome}</h1>
          <p className="text-sm text-zinc-500">
            {cliente?.email ||
              (cliente?.celular
                ? formatarTelefoneBr(cliente.celular)
                : null)}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void sair()}>
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

      {aba === "dados" && usuario && (
        <div className="bg-white border rounded-2xl p-4 space-y-3">
          <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          <Input
            value={celular}
            onChange={(e) => setCelular(formatarTelefoneBr(e.target.value))}
          />
          <Input
            value={cpf}
            onChange={(e) => setCpf(formatarCpf(e.target.value))}
          />
          <Button
            className="w-full bg-red-600 hover:bg-red-700"
            onClick={async () => {
              try {
                await upsertClienteAuth({
                  authUserId: usuario.id,
                  nome,
                  email: usuario.email,
                  celular,
                  cpf,
                });
                salvarGuestDeliveryLocal({
                  nome,
                  telefone: celular,
                  email: usuario.email,
                  clienteId: cliente?.id,
                });
                await recarregar();
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

      {aba === "enderecos" && cliente && (
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
                <p className="text-zinc-500">
                  {e.bairro} — {e.cidade}/{e.uf}
                </p>
              </div>
              <button
                type="button"
                className="text-xs text-red-600"
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
            <h3 className="font-bold text-sm">Novo endereço</h3>
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="CEP"
                value={formEnd.cep}
                onChange={(e) =>
                  setFormEnd((f) => ({ ...f, cep: e.target.value }))
                }
                onBlur={async () => {
                  const d = await buscarCep(formEnd.cep);
                  if (d) setFormEnd((f) => ({ ...f, ...d }));
                }}
              />
              <Input
                placeholder="Número"
                value={formEnd.numero}
                onChange={(e) =>
                  setFormEnd((f) => ({ ...f, numero: e.target.value }))
                }
              />
              <Input
                className="col-span-2"
                placeholder="Rua"
                value={formEnd.rua}
                onChange={(e) =>
                  setFormEnd((f) => ({ ...f, rua: e.target.value }))
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
            </div>
            <Button
              className="w-full bg-red-600 hover:bg-red-700"
              onClick={async () => {
                try {
                  let lat = formEnd.latitude;
                  let lng = formEnd.longitude;
                  if (lat == null || lng == null) {
                    const c = await geocodificarEndereco(formEnd);
                    if (!c) throw new Error("Não localizou o endereço");
                    lat = c.latitude;
                    lng = c.longitude;
                  }
                  await salvarEndereco({
                    cliente_id: cliente.id,
                    rotulo: "Casa",
                    cep: formEnd.cep,
                    rua: formEnd.rua,
                    numero: formEnd.numero,
                    bairro: formEnd.bairro,
                    cidade: formEnd.cidade,
                    uf: formEnd.uf,
                    complemento: formEnd.complemento,
                    referencia: formEnd.referencia,
                    latitude: lat,
                    longitude: lng,
                    padrao: formEnd.padrao,
                  });
                  setEnderecos(await listarEnderecos(cliente.id));
                  toast.success("Endereço salvo");
                } catch (err: unknown) {
                  toast.error(err instanceof Error ? err.message : "Erro");
                }
              }}
            >
              Salvar endereço
            </Button>
          </div>
        </div>
      )}

      {aba === "pontos" && cliente && (
        <div className="space-y-3">
          <div className="bg-gradient-to-br from-zinc-900 to-zinc-700 text-white rounded-3xl p-5">
            <p className="text-xs uppercase tracking-widest text-white/60 flex items-center gap-1">
              <Trophy size={12} /> Saldo
            </p>
            <p className="text-4xl font-black mt-1">{saldo}</p>
            <p className="text-sm text-white/70 mt-1">
              Resgate: {resgateCfg.pontos} pts = R${" "}
              {resgateCfg.valor.toFixed(2).replace(".", ",")}
            </p>
            <Button
              className="mt-4 bg-white text-zinc-900 hover:bg-zinc-100"
              disabled={saldo < resgateCfg.pontos}
              onClick={async () => {
                try {
                  const r = await resgatarPontos(cliente.id);
                  toast.success(`Cupom ${r.codigo} gerado!`);
                  setSaldo(await buscarSaldoPontos(cliente.id));
                  setExtrato(await listarExtratoPontos(cliente.id));
                } catch (e: unknown) {
                  toast.error(e instanceof Error ? e.message : "Erro");
                }
              }}
            >
              Resgatar cupom
            </Button>
          </div>
          {cupons.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-bold text-sm flex items-center gap-1">
                <Ticket size={14} /> Seus cupons
              </h3>
              {cupons.map((c) => (
                <div
                  key={c.codigo}
                  className="bg-white border rounded-xl p-3 text-sm flex justify-between"
                >
                  <span className="font-mono font-bold">{c.codigo}</span>
                  <span>
                    {c.tipo === "percentual"
                      ? `${c.valor}%`
                      : `R$ ${Number(c.valor).toFixed(2)}`}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-1">
            {extrato.map((x) => (
              <div
                key={x.id}
                className="text-sm flex justify-between bg-white border rounded-xl px-3 py-2"
              >
                <span className="text-zinc-600">{x.descricao || x.tipo}</span>
                <span
                  className={
                    x.pontos >= 0 ? "text-emerald-600 font-bold" : "text-red-600"
                  }
                >
                  {x.pontos >= 0 ? "+" : ""}
                  {x.pontos}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
