import {
  Copy,
  Download,
  Loader2,
  Pencil,
  PlusCircle,
  Printer,
  QrCode,
  Trash2,
  X,
} from "lucide-react";
import QRCode from "qrcode";
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
  const [mesaQr, setMesaQr] = useState<Mesa | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [gerandoQr, setGerandoQr] = useState(false);

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

  const abrirQrCode = async (mesa: Mesa) => {
    try {
      setGerandoQr(true);
      setMesaQr(mesa);
      setQrDataUrl(null);
      const url = urlCardapioMesa(mesa.numero);
      const dataUrl = await QRCode.toDataURL(url, {
        width: 512,
        margin: 2,
        errorCorrectionLevel: "M",
        color: { dark: "#111111", light: "#ffffff" },
      });
      setQrDataUrl(dataUrl);
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error("[ERRO - QR CODE]", mensagem);
      toast.error("Não foi possível gerar o QR Code.");
      setMesaQr(null);
    } finally {
      setGerandoQr(false);
    }
  };

  const fecharQrCode = () => {
    setMesaQr(null);
    setQrDataUrl(null);
  };

  const baixarQrCode = () => {
    if (!mesaQr || !qrDataUrl) return;
    const link = document.createElement("a");
    link.href = qrDataUrl;
    link.download = `mesa-${mesaQr.numero}-qrcode.png`;
    link.click();
    toast.success("QR Code baixado!");
  };

  const imprimirQrCode = () => {
    if (!mesaQr || !qrDataUrl) return;
    const titulo = mesaQr.apelido
      ? `Mesa ${mesaQr.numero} — ${mesaQr.apelido}`
      : `Mesa ${mesaQr.numero}`;
    const url = urlCardapioMesa(mesaQr.numero);
    const janela = window.open("", "_blank", "noopener,noreferrer,width=480,height=720");
    if (!janela) {
      toast.error("Permita pop-ups para imprimir o QR Code.");
      return;
    }
    janela.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${titulo}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 2rem;
      text-align: center;
      color: #111;
    }
    h1 { font-size: 1.75rem; margin-bottom: 0.25rem; }
    p.sub { color: #666; font-size: 0.9rem; margin-bottom: 1.5rem; }
    img { width: 280px; height: 280px; }
    p.url { margin-top: 1rem; font-size: 0.7rem; color: #888; word-break: break-all; max-width: 320px; }
    @media print {
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <h1>${titulo}</h1>
  <p class="sub">Escaneie para abrir o cardápio</p>
  <img src="${qrDataUrl}" alt="QR Code ${titulo}" />
  <p class="url">${url}</p>
  <script>window.onload = () => { window.print(); };<\/script>
</body>
</html>`);
    janela.document.close();
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
                          title="Gerar QR Code"
                          onClick={() => void abrirQrCode(mesa)}
                        >
                          <QrCode size={16} />
                        </Button>
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

      {mesaQr && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={fecharQrCode}
          role="presentation"
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-800 p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`QR Code da mesa ${mesaQr.numero}`}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  Mesa {mesaQr.numero}
                </h2>
                {mesaQr.apelido && (
                  <p className="text-sm text-gray-500">{mesaQr.apelido}</p>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={fecharQrCode}
                aria-label="Fechar"
              >
                <X size={18} />
              </Button>
            </div>

            <div className="flex flex-col items-center gap-3">
              {gerandoQr || !qrDataUrl ? (
                <div className="flex h-64 w-64 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-900">
                  <Loader2 className="animate-spin text-cookie-primary" size={32} />
                </div>
              ) : (
                <img
                  src={qrDataUrl}
                  alt={`QR Code mesa ${mesaQr.numero}`}
                  className="h-64 w-64 rounded-xl border border-gray-200 dark:border-gray-700 bg-white"
                />
              )}
              <p className="text-xs text-gray-500 text-center break-all px-2">
                {urlCardapioMesa(mesaQr.numero)}
              </p>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={!qrDataUrl}
                onClick={baixarQrCode}
              >
                <Download size={16} className="mr-2" />
                Baixar PNG
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!qrDataUrl}
                onClick={imprimirQrCode}
              >
                <Printer size={16} className="mr-2" />
                Imprimir
              </Button>
              <Button
                type="button"
                className="col-span-2"
                disabled={!qrDataUrl}
                onClick={() => void copiarLink(mesaQr.numero)}
              >
                <Copy size={16} className="mr-2" />
                Copiar link
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
