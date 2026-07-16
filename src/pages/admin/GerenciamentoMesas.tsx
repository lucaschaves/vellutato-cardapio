import { Copy, Loader2, Pencil, PlusCircle, QrCode, Trash2 } from "lucide-react";
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

interface Mesa {
  id: string;
  numero: string;
  apelido: string | null;
  ativo: boolean;
  created_at: string;
}

function urlCardapioMesa(numero: string): string {
  const base = window.location.origin;
  // Abre a home para passar pelo vídeo + identificação; mesa só identifica na cozinha
  return `${base}/?mesa=${encodeURIComponent(numero)}`;
}

export function GerenciamentoMesas() {
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [numero, setNumero] = useState("");
  const [apelido, setApelido] = useState("");
  const [editandoId, setEditandoId] = useState<string | null>(null);

  useEffect(() => {
    void carregarMesas();
  }, []);

  const carregarMesas = async () => {
    try {
      setCarregando(true);
      const { data, error } = await supabase
        .from("mesas")
        .select("*")
        .order("numero", { ascending: true });

      if (error) throw error;
      setMesas((data as Mesa[]) || []);
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error("[ERRO - MESAS]", mensagem);
      toast.error(
        "Falha ao carregar mesas. Rode a migration SQL da tabela mesas no Supabase.",
      );
    } finally {
      setCarregando(false);
    }
  };

  const limparFormulario = () => {
    setNumero("");
    setApelido("");
    setEditandoId(null);
  };

  const iniciarEdicao = (mesa: Mesa) => {
    setEditandoId(mesa.id);
    setNumero(mesa.numero);
    setApelido(mesa.apelido || "");
  };

  const salvarMesa = async (e: React.FormEvent) => {
    e.preventDefault();
    const numeroLimpo = numero.trim();
    if (!numeroLimpo) {
      toast.warning("Informe o número da mesa.");
      return;
    }

    try {
      setSalvando(true);
      const payload = {
        numero: numeroLimpo,
        apelido: apelido.trim() || null,
        ativo: true,
      };

      if (editandoId) {
        const { error } = await supabase
          .from("mesas")
          .update(payload)
          .eq("id", editandoId);
        if (error) throw error;
        setMesas((prev) =>
          prev
            .map((m) =>
              m.id === editandoId ? { ...m, ...payload, apelido: payload.apelido } : m,
            )
            .sort((a, b) => a.numero.localeCompare(b.numero, "pt-BR", { numeric: true })),
        );
        toast.success("Mesa atualizada!");
      } else {
        const { data, error } = await supabase
          .from("mesas")
          .insert(payload)
          .select("*")
          .single();
        if (error) throw error;
        setMesas((prev) =>
          [...prev, data as Mesa].sort((a, b) =>
            a.numero.localeCompare(b.numero, "pt-BR", { numeric: true }),
          ),
        );
        toast.success("Mesa cadastrada!");
      }
      limparFormulario();
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error("[ERRO - MESAS]", mensagem);
      toast.error("Erro ao salvar mesa. Número já existe?");
    } finally {
      setSalvando(false);
    }
  };

  const alternarAtivo = async (id: string, ativo: boolean) => {
    const novoStatus = !ativo;
    const { error } = await supabase
      .from("mesas")
      .update({ ativo: novoStatus })
      .eq("id", id);

    if (error) {
      toast.error("Erro ao atualizar mesa.");
      return;
    }

    setMesas((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ativo: novoStatus } : m)),
    );
  };

  const excluirMesa = async (id: string) => {
    if (!window.confirm("Excluir esta mesa?")) return;

    const { error } = await supabase.from("mesas").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir mesa.");
      return;
    }

    setMesas((prev) => prev.filter((m) => m.id !== id));
    if (editandoId === id) limparFormulario();
    toast.success("Mesa excluída.");
  };

  const copiarLink = async (numeroMesa: string) => {
    try {
      await navigator.clipboard.writeText(urlCardapioMesa(numeroMesa));
      toast.success("Link copiado!");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
          <QrCode size={28} className="text-cookie-primary" />
          Mesas
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Link/QR com <code className="text-xs">/?mesa=NUMERO</code> — passa pelo
          vídeo e identificação; a mesa só identifica o pedido na cozinha.
          Comer ou levar o cliente escolhe no carrinho.
        </p>
      </div>

      <form
        onSubmit={salvarMesa}
        className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-800 rounded-xl p-5 grid grid-cols-1 md:grid-cols-3 gap-4"
      >
        <Input
          placeholder="Número (ex: 08, A1)"
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
        />
        <Input
          placeholder="Apelido (ex: Varanda)"
          value={apelido}
          onChange={(e) => setApelido(e.target.value)}
        />
        <div className="flex gap-2 md:col-span-3">
          <Button type="submit" disabled={salvando}>
            {salvando ? (
              <Loader2 className="animate-spin" size={18} />
            ) : editandoId ? (
              <>
                <Pencil size={18} className="mr-2" /> Salvar
              </>
            ) : (
              <>
                <PlusCircle size={18} className="mr-2" /> Cadastrar mesa
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
                <TableHead>Número</TableHead>
                <TableHead>Apelido</TableHead>
                <TableHead>Link do cardápio</TableHead>
                <TableHead>Ativa</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mesas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-gray-500">
                    Nenhuma mesa cadastrada.
                  </TableCell>
                </TableRow>
              ) : (
                mesas.map((mesa) => (
                  <TableRow key={mesa.id}>
                    <TableCell className="font-bold">{mesa.numero}</TableCell>
                    <TableCell>{mesa.apelido || "—"}</TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => void copiarLink(mesa.numero)}
                        className="text-xs text-cookie-primary hover:underline flex items-center gap-1 max-w-[200px] truncate"
                        title={urlCardapioMesa(mesa.numero)}
                      >
                        <Copy size={12} />
                        Copiar link
                      </button>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={mesa.ativo}
                        onCheckedChange={() =>
                          alternarAtivo(mesa.id, mesa.ativo)
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => iniciarEdicao(mesa)}
                        >
                          <Pencil size={16} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-red-600"
                          onClick={() => void excluirMesa(mesa.id)}
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
