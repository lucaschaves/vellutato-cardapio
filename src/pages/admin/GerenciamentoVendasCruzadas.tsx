import { GitBranch, Loader2, Pencil, PlusCircle, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Switch } from "../../components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { supabase } from "../../lib/supabase";
import {
  formatarDescontoVendaCruzada,
  rotuloTipoVendaCruzada,
  TIPOS_VENDA_CRUZADA,
  tipoVendaCruzadaRequerValor,
  type TipoVendaCruzada,
} from "../../lib/vendasCruzadas";

interface ProdutoResumo {
  id: string;
  nome: string;
}

interface VendaCruzada {
  id: string;
  gatilho_produto_id: string;
  alvo_produto_id: string;
  tipo: string;
  valor_desconto: number | null;
  mensagem_oferta: string | null;
  ativo: boolean | null;
  gatilho?: ProdutoResumo;
  alvo?: ProdutoResumo;
}

export function GerenciamentoVendasCruzadas() {
  const [regras, setRegras] = useState<VendaCruzada[]>([]);
  const [produtos, setProdutos] = useState<ProdutoResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [gatilhoId, setGatilhoId] = useState("");
  const [alvoId, setAlvoId] = useState("");
  const [tipo, setTipo] = useState<TipoVendaCruzada>("desconto_percentual");
  const [valorDesconto, setValorDesconto] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [editandoId, setEditandoId] = useState<string | null>(null);

  useEffect(() => {
    void carregarDados();
  }, []);

  const carregarDados = async () => {
    try {
      setCarregando(true);

      const [resProdutos, resRegras] = await Promise.all([
        supabase.from("produtos").select("id, nome").eq("ativo", true).order("nome"),
        supabase
          .from("vendas_cruzadas")
          .select(
            `
            id, gatilho_produto_id, alvo_produto_id, tipo, valor_desconto, mensagem_oferta, ativo,
            gatilho:produtos!vendas_cruzadas_gatilho_produto_id_fkey ( id, nome ),
            alvo:produtos!vendas_cruzadas_alvo_produto_id_fkey ( id, nome )
          `,
          )
          .order("created_at", { ascending: false }),
      ]);

      if (resProdutos.error) throw resProdutos.error;
      if (resRegras.error) throw resRegras.error;

      setProdutos((resProdutos.data as ProdutoResumo[]) || []);
      setRegras((resRegras.data as unknown as VendaCruzada[]) || []);
    } catch (erro: unknown) {
      const mensagemErro = erro instanceof Error ? erro.message : String(erro);
      console.error("[ERRO - VENDAS CRUZADAS]", mensagemErro);
      toast.error("Falha ao carregar vendas cruzadas.");
    } finally {
      setCarregando(false);
    }
  };

  const limparFormulario = () => {
    setEditandoId(null);
    setGatilhoId("");
    setAlvoId("");
    setTipo("desconto_percentual");
    setValorDesconto("");
    setMensagem("");
  };

  const iniciarEdicao = (regra: VendaCruzada) => {
    setEditandoId(regra.id);
    setGatilhoId(regra.gatilho_produto_id);
    setAlvoId(regra.alvo_produto_id);
    setTipo(regra.tipo as TipoVendaCruzada);
    setValorDesconto(
      regra.valor_desconto != null ? String(regra.valor_desconto) : "",
    );
    setMensagem(regra.mensagem_oferta || "");
  };

  const salvarRegra = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gatilhoId || !alvoId) {
      toast.warning("Selecione produto gatilho e produto alvo.");
      return;
    }
    if (gatilhoId === alvoId) {
      toast.warning("Gatilho e alvo devem ser produtos diferentes.");
      return;
    }

    if (tipoVendaCruzadaRequerValor(tipo) && !valorDesconto.trim()) {
      toast.warning("Informe o valor do desconto.");
      return;
    }

    const payload = {
      gatilho_produto_id: gatilhoId,
      alvo_produto_id: alvoId,
      tipo,
      valor_desconto: tipoVendaCruzadaRequerValor(tipo)
        ? parseFloat(valorDesconto.replace(",", "."))
        : null,
      mensagem_oferta: mensagem.trim() || null,
    };

    try {
      setSalvando(true);

      if (editandoId) {
        const { data, error } = await supabase
          .from("vendas_cruzadas")
          .update(payload)
          .eq("id", editandoId)
          .select("*")
          .single();

        if (error) throw error;

        const gatilho = produtos.find((p) => p.id === gatilhoId);
        const alvo = produtos.find((p) => p.id === alvoId);

        setRegras((prev) =>
          prev.map((r) =>
            r.id === editandoId
              ? { ...(data as VendaCruzada), gatilho, alvo }
              : r,
          ),
        );
        toast.success("Regra atualizada!");
      } else {
        const { data, error } = await supabase
          .from("vendas_cruzadas")
          .insert({ ...payload, ativo: true })
          .select("*")
          .single();

        if (error) throw error;

        const gatilho = produtos.find((p) => p.id === gatilhoId);
        const alvo = produtos.find((p) => p.id === alvoId);

        setRegras((prev) => [
          { ...(data as VendaCruzada), gatilho, alvo },
          ...prev,
        ]);
        toast.success("Regra de venda cruzada criada!");
      }

      limparFormulario();
    } catch (erro: unknown) {
      const mensagemErro = erro instanceof Error ? erro.message : String(erro);
      console.error("[ERRO - VENDAS CRUZADAS]", mensagemErro);
      toast.error("Erro ao salvar regra.");
    } finally {
      setSalvando(false);
    }
  };

  const cadastrarRegra = salvarRegra;

  const alternarAtivo = async (id: string, ativo: boolean | null) => {
    const novoStatus = !ativo;
    const { error } = await supabase
      .from("vendas_cruzadas")
      .update({ ativo: novoStatus })
      .eq("id", id);

    if (error) {
      toast.error("Erro ao atualizar regra.");
      return;
    }

    setRegras((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ativo: novoStatus } : r)),
    );
  };

  const excluirRegra = async (id: string) => {
    const { error } = await supabase.from("vendas_cruzadas").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir regra.");
      return;
    }
    setRegras((prev) => prev.filter((r) => r.id !== id));
    if (editandoId === id) limparFormulario();
    toast.success("Regra removida.");
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
          <GitBranch size={28} className="text-cookie-primary" />
          Vendas Cruzadas
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Ofereça um produto quando o cliente visualizar outro.
        </p>
      </div>

      <form
        onSubmit={cadastrarRegra}
        className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-4"
      >
        <h2 className="font-bold text-gray-900 dark:text-white">
          {editandoId ? "Editar regra" : "Nova regra"}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">
              Produto gatilho
            </label>
            <select
              value={gatilhoId}
              onChange={(e) => setGatilhoId(e.target.value)}
              className="w-full h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1815] px-3 text-sm"
            >
              <option value="">Selecione...</option>
              {produtos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">
              Produto oferta (alvo)
            </label>
            <select
              value={alvoId}
              onChange={(e) => setAlvoId(e.target.value)}
              className="w-full h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1815] px-3 text-sm"
            >
              <option value="">Selecione...</option>
              {produtos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoVendaCruzada)}
            className="h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1815] px-3 text-sm"
          >
            {TIPOS_VENDA_CRUZADA.map((opcao) => (
              <option key={opcao} value={opcao}>
                {rotuloTipoVendaCruzada(opcao)}
              </option>
            ))}
          </select>
          <Input
            placeholder={
              tipo === "desconto_percentual"
                ? "Desconto (%)"
                : tipo === "desconto_fixo"
                  ? "Desconto (R$)"
                  : "Brinde — sem valor"
            }
            value={valorDesconto}
            onChange={(e) => setValorDesconto(e.target.value)}
            disabled={!tipoVendaCruzadaRequerValor(tipo)}
          />
        </div>
        <Input
          placeholder="Mensagem da oferta (ex: Leve uma bebida gelada!)"
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={salvando}>
            {salvando ? (
              <Loader2 className="animate-spin" size={18} />
            ) : editandoId ? (
              <>
                <Pencil size={18} className="mr-2" /> Salvar alterações
              </>
            ) : (
              <>
                <PlusCircle size={18} className="mr-2" /> Criar regra
              </>
            )}
          </Button>
          {editandoId && (
            <Button type="button" variant="outline" onClick={limparFormulario}>
              Cancelar
            </Button>
          )}
        </div>
      </form>

      {carregando ? (
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-cookie-primary" size={40} />
        </div>
      ) : (
        <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Gatilho</TableHead>
                <TableHead>Oferta</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Desconto</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {regras.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-gray-500">
                    Nenhuma regra cadastrada.
                  </TableCell>
                </TableRow>
              ) : (
                regras.map((regra) => (
                  <TableRow key={regra.id}>
                    <TableCell>{regra.gatilho?.nome || "—"}</TableCell>
                    <TableCell>{regra.alvo?.nome || "—"}</TableCell>
                    <TableCell>{rotuloTipoVendaCruzada(regra.tipo)}</TableCell>
                    <TableCell>
                      {formatarDescontoVendaCruzada(
                        regra.tipo,
                        regra.valor_desconto,
                      )}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={regra.ativo !== false}
                        onCheckedChange={() =>
                          alternarAtivo(regra.id, regra.ativo)
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => iniciarEdicao(regra)}
                        >
                          <Pencil size={16} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-red-600"
                          onClick={() => void excluirRegra(regra.id)}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
