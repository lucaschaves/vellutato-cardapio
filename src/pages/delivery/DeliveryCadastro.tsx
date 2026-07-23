import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useDeliveryCliente } from "../../hooks/useDeliveryCliente";
import {
  buscarClienteDeliveryPorCelular,
  cpfValido,
  formatarCpf,
  upsertClienteAuth,
} from "../../lib/deliveryCliente";
import { formatarTelefoneBr, telefoneDigitosCompleto } from "../../lib/telefone";

type Etapa = "telefone" | "dados";

export function DeliveryCadastro() {
  const { usuario, cliente, carregando, cadastroCompleto, recarregar } =
    useDeliveryCliente();
  const navigate = useNavigate();
  const [etapa, setEtapa] = useState<Etapa>("telefone");
  const [nome, setNome] = useState("");
  const [celular, setCelular] = useState("");
  const [cpf, setCpf] = useState("");
  const [clienteEncontrado, setClienteEncontrado] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  // Se já tem cliente vinculado ao Google, pula direto para completar dados faltantes
  useEffect(() => {
    if (!cliente) return;
    if (cliente.celular && telefoneDigitosCompleto(cliente.celular)) {
      setCelular(formatarTelefoneBr(cliente.celular));
      setNome(cliente.nome || "");
      setCpf(cliente.cpf ? formatarCpf(cliente.cpf) : "");
      setClienteEncontrado(true);
      setEtapa("dados");
    }
  }, [cliente]);

  if (!carregando && !usuario) {
    return <Navigate to="/delivery" replace />;
  }

  if (!carregando && cadastroCompleto) {
    return <Navigate to="/delivery" replace />;
  }

  const buscarPorTelefone = async () => {
    if (!telefoneDigitosCompleto(celular)) {
      toast.warning("Informe um celular com DDD (11 dígitos).");
      return;
    }
    try {
      setBuscando(true);
      const existente = await buscarClienteDeliveryPorCelular(celular);
      if (existente) {
        if (
          existente.auth_user_id &&
          existente.auth_user_id !== usuario?.id
        ) {
          toast.error(
            "Este telefone já está vinculado a outra conta Google. Use outro número ou entre com a conta correta.",
          );
          return;
        }
        setNome(existente.nome || "");
        setCpf(existente.cpf ? formatarCpf(existente.cpf) : "");
        setClienteEncontrado(true);
        toast.success("Encontramos seu cadastro! Confira os dados.");
      } else {
        const meta = usuario?.user_metadata || {};
        setNome(
          meta.full_name ||
            meta.name ||
            usuario?.email?.split("@")[0] ||
            "",
        );
        setCpf("");
        setClienteEncontrado(false);
        toast.message("Telefone novo — complete nome e CPF.");
      }
      setEtapa("dados");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao buscar");
    } finally {
      setBuscando(false);
    }
  };

  const salvar = async () => {
    if (!usuario) return;
    if (!telefoneDigitosCompleto(celular)) {
      toast.warning("Informe um celular válido.");
      return;
    }
    if (!nome.trim()) {
      toast.warning("Informe seu nome.");
      return;
    }
    if (!cpfValido(cpf)) {
      toast.warning("CPF inválido.");
      return;
    }
    try {
      setSalvando(true);
      await upsertClienteAuth({
        authUserId: usuario.id,
        nome,
        email: usuario.email,
        celular,
        cpf,
      });
      await recarregar();
      toast.success(
        clienteEncontrado
          ? "Conta vinculada com sucesso!"
          : "Cadastro completo!",
      );
      navigate("/delivery", { replace: true });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-black">
          {etapa === "telefone" ? "Seu celular" : "Complete seus dados"}
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          {etapa === "telefone"
            ? "Informe o telefone para localizar um cadastro existente ou criar um novo."
            : clienteEncontrado
              ? "Confirme ou atualize os dados do seu cadastro."
              : "Precisamos do seu nome e CPF para finalizar pedidos."}
        </p>
      </div>

      {etapa === "telefone" && (
        <div className="space-y-3 bg-white rounded-2xl p-4 border border-zinc-200">
          <div>
            <label className="text-xs font-semibold text-zinc-500">
              Celular com DDD
            </label>
            <Input
              value={celular}
              onChange={(e) => setCelular(formatarTelefoneBr(e.target.value))}
              inputMode="tel"
              placeholder="(11) 99999-9999"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") void buscarPorTelefone();
              }}
            />
          </div>
          <Button
            className="w-full bg-red-600 hover:bg-red-700"
            disabled={buscando}
            onClick={() => void buscarPorTelefone()}
          >
            {buscando ? "Buscando…" : "Continuar"}
          </Button>
        </div>
      )}

      {etapa === "dados" && (
        <div className="space-y-3 bg-white rounded-2xl p-4 border border-zinc-200">
          <div>
            <label className="text-xs font-semibold text-zinc-500">
              Celular
            </label>
            <Input value={celular} disabled className="bg-zinc-50" />
            <button
              type="button"
              className="text-xs text-red-600 font-semibold mt-1"
              onClick={() => {
                setEtapa("telefone");
                setClienteEncontrado(false);
              }}
            >
              Alterar telefone
            </button>
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-500">Nome</label>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-500">CPF</label>
            <Input
              value={cpf}
              onChange={(e) => setCpf(formatarCpf(e.target.value))}
              inputMode="numeric"
              placeholder="000.000.000-00"
            />
          </div>
          <Button
            className="w-full bg-red-600 hover:bg-red-700"
            disabled={salvando}
            onClick={() => void salvar()}
          >
            {salvando ? "Salvando…" : "Confirmar"}
          </Button>
        </div>
      )}
    </div>
  );
}
