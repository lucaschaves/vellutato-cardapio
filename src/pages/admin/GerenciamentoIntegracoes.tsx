import { Eye, EyeOff, KeyRound, Loader2, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminPageShell } from "../../components/AdminPageShell";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useAuth } from "../../context/AuthContext";
import {
  CATALOGO_INTEGRACOES,
  type CampoIntegracao,
} from "../../lib/integracoesCatalogo";
import {
  buscarIntegracoesConfig,
  salvarIntegracoesConfig,
  type IntegracoesMapa,
} from "../../lib/integracoesConfig";

function CampoForm({
  campo,
  valor,
  onChange,
}: {
  campo: CampoIntegracao;
  valor: string;
  onChange: (v: string) => void;
}) {
  const [mostrar, setMostrar] = useState(false);
  const id = `int-${campo.chave}`;

  if (campo.tipo === "select" && campo.opcoes) {
    return (
      <div>
        <label
          htmlFor={id}
          className="text-sm font-semibold text-gray-700 dark:text-gray-300"
        >
          {campo.label}
        </label>
        <select
          id={id}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-gray-200 dark:border-[#2a2c30] bg-white dark:bg-[#121314] px-3 py-2.5 text-sm text-gray-950 dark:text-white outline-none focus:ring-2 focus:ring-[#6b1d2a]/40"
        >
          <option value="">— usar padrão / secret do deploy —</option>
          {campo.opcoes.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.label}
            </option>
          ))}
        </select>
        {campo.ajuda ? (
          <p className="mt-1 text-xs text-gray-500">{campo.ajuda}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <label
        htmlFor={id}
        className="text-sm font-semibold text-gray-700 dark:text-gray-300"
      >
        {campo.label}
      </label>
      <div className="relative mt-1.5">
        <Input
          id={id}
          type={campo.secreto && !mostrar ? "password" : "text"}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          placeholder={campo.placeholder}
          autoComplete="off"
          spellCheck={false}
          className={campo.secreto ? "pr-10 font-mono text-sm" : ""}
        />
        {campo.secreto ? (
          <button
            type="button"
            onClick={() => setMostrar((v) => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            aria-label={mostrar ? "Ocultar" : "Mostrar"}
          >
            {mostrar ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        ) : null}
      </div>
      {campo.ajuda ? (
        <p className="mt-1 text-xs text-gray-500">{campo.ajuda}</p>
      ) : null}
    </div>
  );
}

export function GerenciamentoIntegracoes() {
  const { usuario } = useAuth();
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [valores, setValores] = useState<IntegracoesMapa>({});

  useEffect(() => {
    void (async () => {
      try {
        setCarregando(true);
        setValores(await buscarIntegracoesConfig());
      } catch (erro: unknown) {
        const mensagem = erro instanceof Error ? erro.message : String(erro);
        console.error("[INTEGRACOES ADMIN]", mensagem);
        toast.error(
          "Falha ao carregar. Rode a migration integracoes_config no banco.",
        );
      } finally {
        setCarregando(false);
      }
    })();
  }, []);

  const setCampo = (chave: string, valor: string) => {
    setValores((prev) => ({ ...prev, [chave]: valor }));
  };

  const salvar = async () => {
    try {
      setSalvando(true);
      await salvarIntegracoesConfig(valores, usuario?.id);
      toast.success("Integrações salvas!");
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error("[INTEGRACOES ADMIN] salvar", mensagem);
      toast.error("Erro ao salvar. Verifique a migration no banco.");
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <Loader2 className="animate-spin mr-2" size={20} />
        Carregando integrações...
      </div>
    );
  }

  return (
    <AdminPageShell
      title={
        <span className="flex items-center gap-2">
          <KeyRound className="text-[#6b1d2a]" size={26} />
          Integrações
        </span>
      }
      description="Tokens e API keys do SaaS. Valores salvos aqui têm prioridade sobre os secrets do deploy; campo vazio usa o secret do ambiente."
      footer={
        <Button
          onClick={() => void salvar()}
          disabled={salvando}
          className="bg-[#6b1d2a] hover:bg-[#541622] text-white font-bold"
        >
          {salvando ? (
            <Loader2 className="animate-spin mr-2" size={16} />
          ) : (
            <Save className="mr-2" size={16} />
          )}
          Salvar
        </Button>
      }
      contentClassName="space-y-6"
    >
      {CATALOGO_INTEGRACOES.map((grupo) => (
        <section
          key={grupo.id}
          className="rounded-2xl border border-gray-200 dark:border-[#2a2c30] bg-white dark:bg-[#181a1b] p-5 space-y-4"
        >
          <div>
            <h2 className="font-bold text-gray-950 dark:text-white">
              {grupo.titulo}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">{grupo.descricao}</p>
          </div>

          {grupo.somenteInfo ? (
            <p className="text-sm text-amber-800 dark:text-amber-200/90 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-800/50 rounded-xl px-3 py-2.5">
              {grupo.infoTexto}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {grupo.campos.map((campo) => (
                <CampoForm
                  key={campo.chave}
                  campo={campo}
                  valor={valores[campo.chave] ?? ""}
                  onChange={(v) => setCampo(campo.chave, v)}
                />
              ))}
            </div>
          )}
        </section>
      ))}
    </AdminPageShell>
  );
}
