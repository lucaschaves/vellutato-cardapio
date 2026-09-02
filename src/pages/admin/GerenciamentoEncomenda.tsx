import { Clock, Loader2, Plus, Save } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AdminPageShell } from "../../components/AdminPageShell";
import { GradeRegrasEncomenda } from "../../components/admin/GradeRegrasEncomenda";
import { Button } from "../../components/ui/button";
import {
  buscarRegrasTemplate,
  criarTemplateEncomenda,
  listarTemplatesEncomenda,
  montarGradeRegras,
  salvarRegrasTemplate,
  TEMPLATE_ENCOMENDA_PADRAO_ID,
  type RegraEncomendaDiaEditavel,
  type TemplateEncomenda,
} from "../../lib/encomendaProgramada";

export function GerenciamentoEncomenda() {
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [templates, setTemplates] = useState<TemplateEncomenda[]>([]);
  const [templateId, setTemplateId] = useState(TEMPLATE_ENCOMENDA_PADRAO_ID);
  const [regras, setRegras] = useState<RegraEncomendaDiaEditavel[]>(
    montarGradeRegras(),
  );

  const carregarTemplate = useCallback(async (id: string) => {
    const db = await buscarRegrasTemplate(id);
    setRegras(montarGradeRegras(db));
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        setCarregando(true);
        const lista = await listarTemplatesEncomenda();
        setTemplates(lista);
        const id =
          lista.find((t) => t.id === TEMPLATE_ENCOMENDA_PADRAO_ID)?.id ??
          lista[0]?.id ??
          TEMPLATE_ENCOMENDA_PADRAO_ID;
        setTemplateId(id);
        await carregarTemplate(id);
      } catch (erro: unknown) {
        const msg = erro instanceof Error ? erro.message : String(erro);
        toast.error(`Falha ao carregar templates: ${msg}`);
      } finally {
        setCarregando(false);
      }
    })();
  }, [carregarTemplate]);

  const trocarTemplate = async (id: string) => {
    setTemplateId(id);
    try {
      await carregarTemplate(id);
    } catch (erro: unknown) {
      const msg = erro instanceof Error ? erro.message : String(erro);
      toast.error(msg);
    }
  };

  const salvar = async () => {
    try {
      setSalvando(true);
      await salvarRegrasTemplate(templateId, regras);
      toast.success("Regras de encomenda salvas.");
    } catch (erro: unknown) {
      const msg = erro instanceof Error ? erro.message : String(erro);
      toast.error(msg);
    } finally {
      setSalvando(false);
    }
  };

  const novoTemplate = async () => {
    const nome = window.prompt("Nome do novo template de encomenda:");
    if (!nome?.trim()) return;
    try {
      setSalvando(true);
      const id = await criarTemplateEncomenda(nome.trim());
      const lista = await listarTemplatesEncomenda();
      setTemplates(lista);
      setTemplateId(id);
      await carregarTemplate(id);
      toast.success("Template criado.");
    } catch (erro: unknown) {
      const msg = erro instanceof Error ? erro.message : String(erro);
      toast.error(msg);
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-cookie-primary" />
      </div>
    );
  }

  return (
    <AdminPageShell
      title="Encomenda programada"
      description="Horário limite, prazo de retirada e dias extras por dia da semana. Use no catálogo ao marcar um produto como encomenda."
      footer={
        <Button
          type="button"
          onClick={() => void salvar()}
          disabled={salvando}
          className="bg-cookie-primary text-white font-bold"
        >
          {salvando ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <Save size={18} className="mr-2" /> Salvar template
            </>
          )}
        </Button>
      }
    >
      <div className="space-y-6 max-w-4xl">
        <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
          <p className="font-semibold flex items-center gap-2">
            <Clock size={18} /> Como funciona
          </p>
          <ul className="mt-2 space-y-1 list-disc pl-5 text-amber-900/90 dark:text-amber-100/90">
            <li>
              <strong>Horário limite:</strong> antes deste horário, a encomenda
              vale para hoje (retirada ≈ pedido + prazo).
            </li>
            <li>
              <strong>Depois do limite:</strong> a encomenda vai para daqui a N
              dias (próximo dia em que a loja abre). O horário de retirada é o
              horário limite daquele dia + o prazo (ex.: 12:00 + 02:00 → 14:00).
            </li>
            <li>
              Unidades <strong>prontas hoje</strong> no catálogo sempre vendem
              na hora, mesmo depois do horário limite.
            </li>
          </ul>
          <p className="mt-2 text-xs">
            No{" "}
            <Link to="/admin/catalogo" className="underline font-semibold">
              catálogo
            </Link>
            , você pode escolher um template ou definir regras só daquele
            produto.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[12rem]">
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">
              Template
            </label>
            <select
              value={templateId}
              onChange={(e) => void trocarTemplate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border dark:bg-[#1a1815] dark:border-gray-700"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                  {t.id === TEMPLATE_ENCOMENDA_PADRAO_ID ? " (padrão)" : ""}
                </option>
              ))}
            </select>
          </div>
          <Button type="button" variant="outline" onClick={() => void novoTemplate()}>
            <Plus size={16} className="mr-2" /> Novo template
          </Button>
        </div>

        <GradeRegrasEncomenda regras={regras} onChange={setRegras} />
      </div>
    </AdminPageShell>
  );
}
