import { MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useDeliveryCliente } from "../../hooks/useDeliveryCliente";
import {
  geocodificarEndereco,
  salvarEndereco,
} from "../../lib/deliveryCliente";
import { salvarEnderecoDeliveryLocal } from "../../lib/deliveryGuestStorage";

export interface RascunhoEnderecoDelivery {
  cep: string;
  rua: string;
  bairro: string;
  cidade: string;
  uf: string;
  numero?: string;
  complemento?: string;
  referencia?: string;
  latitude?: number | null;
  longitude?: number | null;
}

const STORAGE_KEY = "delivery_endereco_rascunho";

export function lerRascunhoEndereco(): RascunhoEnderecoDelivery | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as RascunhoEnderecoDelivery;
  } catch {
    return null;
  }
}

export function salvarRascunhoEndereco(dados: RascunhoEnderecoDelivery) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(dados));
}

export function limparRascunhoEndereco() {
  sessionStorage.removeItem(STORAGE_KEY);
}

function formatarCep(valor: string): string {
  const d = valor.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

export function DeliveryEndereco() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logado, cadastroCompleto, cliente, entrarComGoogle } =
    useDeliveryCliente();

  const estado = (location.state || {}) as Partial<RascunhoEnderecoDelivery>;
  const rascunho = lerRascunhoEndereco();

  const [cep] = useState(formatarCep(estado.cep || rascunho?.cep || ""));
  const [rua, setRua] = useState(estado.rua || rascunho?.rua || "");
  const [bairro, setBairro] = useState(
    estado.bairro || rascunho?.bairro || "",
  );
  const [cidade, setCidade] = useState(
    estado.cidade || rascunho?.cidade || "",
  );
  const [uf, setUf] = useState(estado.uf || rascunho?.uf || "");
  const [numero, setNumero] = useState(
    estado.numero || rascunho?.numero || "",
  );
  const [complemento, setComplemento] = useState(
    estado.complemento || rascunho?.complemento || "",
  );
  const [referencia, setReferencia] = useState(
    estado.referencia || rascunho?.referencia || "",
  );
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!rua && !cep) {
      toast.message("Informe o CEP na tela inicial para começar.");
      navigate("/delivery", { replace: true });
    }
    // só na montagem
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirmar = async () => {
    if (!numero.trim()) {
      toast.warning("Informe o número.");
      return;
    }
    if (!rua.trim() || !bairro.trim() || !cidade.trim() || !uf.trim()) {
      toast.warning("Endereço incompleto. Volte e busque o CEP novamente.");
      return;
    }

    const base = {
      cep: cep.replace(/\D/g, ""),
      rua: rua.trim(),
      numero: numero.trim(),
      bairro: bairro.trim(),
      cidade: cidade.trim(),
      uf: uf.trim().toUpperCase().slice(0, 2),
      complemento: complemento.trim() || null,
      referencia: referencia.trim() || null,
    };

    try {
      setSalvando(true);
      const coords = await geocodificarEndereco({
        rua: base.rua,
        numero: base.numero,
        bairro: base.bairro,
        cidade: base.cidade,
        uf: base.uf,
        cep: base.cep,
      });

      const rascunhoCompleto: RascunhoEnderecoDelivery = {
        ...base,
        complemento: base.complemento || undefined,
        referencia: base.referencia || undefined,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
      };
      salvarRascunhoEndereco(rascunhoCompleto);
      salvarEnderecoDeliveryLocal({
        cep: base.cep,
        rua: base.rua,
        numero: base.numero,
        bairro: base.bairro,
        cidade: base.cidade,
        uf: base.uf,
        complemento: base.complemento || "",
        referencia: base.referencia || "",
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
      });

      if (logado && cadastroCompleto && cliente) {
        await salvarEndereco({
          cliente_id: cliente.id,
          rotulo: "Casa",
          cep: base.cep,
          rua: base.rua,
          numero: base.numero,
          bairro: base.bairro,
          cidade: base.cidade,
          uf: base.uf,
          complemento: base.complemento,
          referencia: base.referencia,
          latitude: coords?.latitude ?? null,
          longitude: coords?.longitude ?? null,
          padrao: true,
        });
        limparRascunhoEndereco();
        toast.success("Endereço salvo!");
      } else if (!logado) {
        toast.message("Endereço guardado. Entre para salvar na sua conta.");
      } else if (!cadastroCompleto) {
        toast.message("Endereço guardado. Complete o cadastro para salvar.");
        navigate("/delivery/cadastro");
        return;
      } else {
        toast.success("Endereço definido para entrega!");
      }

      navigate("/delivery", { replace: true });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar endereço");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-5 max-w-md mx-auto">
      <div>
        <h1 className="text-2xl font-black flex items-center gap-2">
          <MapPin className="text-red-600" size={22} />
          Completar endereço
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Confira os dados do CEP e informe o número.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200 p-4 space-y-3">
        <div>
          <label className="text-xs font-semibold text-zinc-500">CEP</label>
          <Input value={cep} disabled className="bg-zinc-50" />
        </div>
        <div>
          <label className="text-xs font-semibold text-zinc-500">Rua</label>
          <Input value={rua} onChange={(e) => setRua(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-semibold text-zinc-500">
              Número *
            </label>
            <Input
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              placeholder="123"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-500">
              Complemento
            </label>
            <Input
              value={complemento}
              onChange={(e) => setComplemento(e.target.value)}
              placeholder="Apto, bloco…"
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-zinc-500">Bairro</label>
          <Input value={bairro} onChange={(e) => setBairro(e.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <label className="text-xs font-semibold text-zinc-500">
              Cidade
            </label>
            <Input
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-500">UF</label>
            <Input
              value={uf}
              onChange={(e) => setUf(e.target.value.toUpperCase())}
              maxLength={2}
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-zinc-500">
            Ponto de referência
          </label>
          <Input
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            placeholder="Próximo ao…"
          />
        </div>

        {!logado && (
          <p className="text-xs text-zinc-500">
            Você pode definir o endereço agora e{" "}
            <button
              type="button"
              className="text-red-600 font-semibold underline"
              onClick={() =>
                void entrarComGoogle(
                  `${window.location.origin}/delivery/auth/callback`,
                )
              }
            >
              entrar depois
            </button>{" "}
            para salvar na conta.
          </p>
        )}

        <Button
          className="w-full bg-red-600 hover:bg-red-700"
          disabled={salvando}
          onClick={() => void confirmar()}
        >
          {salvando ? "Salvando…" : "Usar este endereço"}
        </Button>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => navigate("/delivery")}
        >
          Voltar
        </Button>
      </div>
    </div>
  );
}

export { formatarCep };
