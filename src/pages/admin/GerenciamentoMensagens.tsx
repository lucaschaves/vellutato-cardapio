import {
  Loader2,
  MessageCircle,
  Pencil,
  PlusCircle,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";
import {
  buscarMensagensWhatsapp,
  TAGS_MENSAGEM_WHATSAPP,
  type MensagemWhatsapp,
} from "../../lib/mensagensWhatsapp";

import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";

export function GerenciamentoMensagens() {
  const [mensagens, setMensagens] = useState<MensagemWhatsapp[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [titulo, setTitulo] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void carregarMensagens();
  }, []);

  const carregarMensagens = async () => {
    try {
      setCarregando(true);
      setMensagens(await buscarMensagensWhatsapp());
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error("[ERRO - MENSAGENS] Falha na leitura:", mensagem);
      toast.error("Falha ao carregar mensagens. Rode a migration no banco.");
    } finally {
      setCarregando(false);
    }
  };

  const limparFormulario = () => {
    setEditandoId(null);
    setTitulo("");
    setConteudo("");
  };

  const iniciarEdicao = (mensagem: MensagemWhatsapp) => {
    setEditandoId(mensagem.id);
    setTitulo(mensagem.titulo);
    setConteudo(mensagem.conteudo);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const inserirTag = (tag: string) => {
    const el = textareaRef.current;
    if (!el) {
      setConteudo((atual) => atual + tag);
      return;
    }
    const inicio = el.selectionStart ?? conteudo.length;
    const fim = el.selectionEnd ?? conteudo.length;
    const novo = conteudo.slice(0, inicio) + tag + conteudo.slice(fim);
    setConteudo(novo);
    requestAnimationFrame(() => {
      el.focus();
      const pos = inicio + tag.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const salvarMensagem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim() || !conteudo.trim()) {
      toast.warning("Preencha o título e o conteúdo da mensagem.");
      return;
    }

    try {
      setSalvando(true);

      if (editandoId) {
        const { error } = await supabase
          .from("whatsapp_mensagens")
          .update({ titulo: titulo.trim(), conteudo })
          .eq("id", editandoId);

        if (error) throw new Error(error.message);
        toast.success("Mensagem atualizada!");
      } else {
        const proximaOrdem =
          mensagens.reduce((max, m) => Math.max(max, m.ordem), -1) + 1;
        const { error } = await supabase
          .from("whatsapp_mensagens")
          .insert({ titulo: titulo.trim(), conteudo, ordem: proximaOrdem });

        if (error) throw new Error(error.message);
        toast.success("Mensagem criada!");
      }

      limparFormulario();
      await carregarMensagens();
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error("[ERRO - MENSAGENS] Falha ao salvar:", mensagem);
      toast.error("Erro ao salvar a mensagem.");
    } finally {
      setSalvando(false);
    }
  };

  const excluirMensagem = async (mensagem: MensagemWhatsapp) => {
    if (!window.confirm(`Excluir a mensagem "${mensagem.titulo}"?`)) return;

    const { error } = await supabase
      .from("whatsapp_mensagens")
      .delete()
      .eq("id", mensagem.id);

    if (error) {
      toast.error("Erro ao excluir mensagem.");
      return;
    }

    setMensagens((prev) => prev.filter((m) => m.id !== mensagem.id));
    if (editandoId === mensagem.id) limparFormulario();
    toast.success("Mensagem excluída.");
  };

  return (
    <div className="p-6 max-w-5xl mx-auto h-full space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
          <MessageCircle size={28} className="text-cookie-primary" />
          Mensagens de WhatsApp
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Modelos usados no botão de WhatsApp do KDS. Use as tags para
          preencher automaticamente os dados do pedido.
        </p>
      </div>

      <div className="bg-white dark:bg-surface-dark p-6 rounded-xl border dark:border-gray-800 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold dark:text-white">
            {editandoId ? "Editar Mensagem" : "Nova Mensagem"}
          </h2>
          {editandoId && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={limparFormulario}
              className="text-gray-500"
            >
              <X size={16} className="mr-1" />
              Cancelar edição
            </Button>
          )}
        </div>

        <form onSubmit={salvarMensagem} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium dark:text-gray-300">
              Título (aparece na hora de escolher qual enviar)
            </label>
            <Input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Pedido pronto para retirada"
              className="dark:bg-[#1a1815]"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium dark:text-gray-300">
              Mensagem
            </label>
            <textarea
              ref={textareaRef}
              value={conteudo}
              onChange={(e) => setConteudo(e.target.value)}
              rows={8}
              placeholder="Escreva a mensagem usando as tags abaixo..."
              className="w-full px-4 py-3 rounded-lg border text-sm leading-relaxed dark:bg-[#1a1815] dark:border-gray-700 dark:text-gray-100 outline-none focus:ring-2 focus:ring-cookie-primary resize-y"
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              Tags disponíveis (clique para inserir)
            </p>
            <div className="flex flex-wrap gap-2">
              {TAGS_MENSAGEM_WHATSAPP.map(({ tag, descricao }) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => inserirTag(tag)}
                  title={descricao}
                  className="px-3 py-1.5 rounded-lg border border-cookie-primary/30 bg-cookie-primary/5 text-cookie-primary text-xs font-bold hover:bg-cookie-primary/15 active:scale-95 transition-all"
                >
                  {tag}
                  <span className="ml-1.5 font-normal text-gray-500 dark:text-gray-400">
                    {descricao}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <Button
            type="submit"
            disabled={salvando}
            className="bg-cookie-primary text-white h-10"
          >
            {salvando ? (
              <Loader2 className="animate-spin" size={18} />
            ) : editandoId ? (
              <>
                <Pencil size={18} className="mr-2" /> Salvar alterações
              </>
            ) : (
              <>
                <PlusCircle size={18} className="mr-2" /> Criar mensagem
              </>
            )}
          </Button>
        </form>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold dark:text-white">
          Mensagens cadastradas ({mensagens.length})
        </h2>

        {carregando ? (
          <div className="flex justify-center items-center h-32">
            <Loader2 className="animate-spin text-cookie-primary" size={32} />
          </div>
        ) : mensagens.length === 0 ? (
          <div className="text-center py-10 text-gray-500 bg-white dark:bg-surface-dark rounded-xl border border-dashed dark:border-gray-800">
            Nenhuma mensagem cadastrada. Sem modelos, o KDS usa uma mensagem
            padrão do sistema.
          </div>
        ) : (
          mensagens.map((mensagem) => (
            <div
              key={mensagem.id}
              className={`bg-white dark:bg-surface-dark border dark:border-gray-800 rounded-xl p-5 shadow-sm ${
                editandoId === mensagem.id
                  ? "ring-2 ring-cookie-primary/40"
                  : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="font-bold text-gray-900 dark:text-white">
                  {mensagem.titulo}
                </h3>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => iniciarEdicao(mensagem)}
                    title="Editar mensagem"
                  >
                    <Pencil size={16} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => void excluirMensagem(mensagem)}
                    title="Excluir mensagem"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              </div>
              <pre className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap font-sans bg-gray-50 dark:bg-[#1a1815] rounded-lg p-3 border border-gray-100 dark:border-gray-800">
                {mensagem.conteudo}
              </pre>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
