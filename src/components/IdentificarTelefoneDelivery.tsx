import { useState } from "react";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  formatarTelefoneBr,
  mensagemTelefoneInvalido,
  telefoneCelularValido,
} from "../lib/telefone";

type Props = {
  titulo: string;
  descricao: string;
  onIdentificar: (telefone: string) => Promise<unknown>;
};

/** Gate simples: informa celular (11 dígitos) para acessar pedidos/chat. */
export function IdentificarTelefoneDelivery({
  titulo,
  descricao,
  onIdentificar,
}: Props) {
  const [telefone, setTelefone] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const aoMudar = (valor: string) => {
    const formatado = formatarTelefoneBr(valor);
    setTelefone(formatado);
    if (formatado.replace(/\D/g, "").length === 0) {
      setErro(null);
      return;
    }
    if (telefoneCelularValido(formatado)) {
      setErro(null);
    } else {
      setErro(mensagemTelefoneInvalido(formatado));
    }
  };

  const continuar = async () => {
    const msg = mensagemTelefoneInvalido(telefone);
    if (msg) {
      setErro(msg);
      toast.error(msg);
      return;
    }
    try {
      setEnviando(true);
      await onIdentificar(telefone);
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : "Falha ao identificar";
      setErro(m);
      toast.error(m);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-4 py-10">
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-black">{titulo}</h1>
        <p className="text-sm text-zinc-500">{descricao}</p>
      </div>
      <div className="bg-white border rounded-2xl p-4 space-y-3">
        <div className="space-y-1.5">
          <label
            htmlFor="identificar-tel"
            className="text-sm font-semibold text-zinc-800"
          >
            Celular / WhatsApp <span className="text-cookie-primary">*</span>
          </label>
          <Input
            id="identificar-tel"
            placeholder="(00) 00000-0000"
            value={telefone}
            inputMode="tel"
            autoComplete="tel"
            maxLength={15}
            onChange={(e) => aoMudar(e.target.value)}
          />
          <p className="text-[11px] text-zinc-400">
            11 dígitos: DDD + 9 + número (ex.: 11 98765-4321)
          </p>
          {erro && <p className="text-xs font-semibold text-cookie-primary">{erro}</p>}
        </div>
        <Button
          className="w-full bg-cookie-primary hover:bg-cookie-primary-hover"
          disabled={enviando}
          onClick={() => void continuar()}
        >
          {enviando ? "Buscando…" : "Continuar"}
        </Button>
      </div>
    </div>
  );
}
