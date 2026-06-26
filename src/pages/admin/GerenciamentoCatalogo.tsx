import { motion } from "framer-motion";
import {
  AlertCircle,
  Film,
  Image as ImageIcon,
  Save,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";

interface Categoria {
  id: string;
  nome: string;
}

export function GerenciamentoCatalogo() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const produtoEditandoId = searchParams.get("editar");

  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [carregandoProduto, setCarregandoProduto] = useState(false);

  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [preco, setPreco] = useState("");
  const [precoPromocional, setPrecoPromocional] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [controlarEstoque, setControlarEstoque] = useState(true);
  const [quantidadeEstoque, setQuantidadeEstoque] = useState("0");
  const [emPromocao, setEmPromocao] = useState(false);
  const [ativo, setAtivo] = useState(true);

  const [imagemFila, setImagemFila] = useState<File | null>(null);
  const [videoFila, setVideoFila] = useState<File | null>(null);
  const [imagemUrlAtual, setImagemUrlAtual] = useState<string | null>(null);
  const [videoUrlAtual, setVideoUrlAtual] = useState<string | null>(null);

  const modoEdicao = Boolean(produtoEditandoId);

  useEffect(() => {
    async function carregarCategorias() {
      const { data, error } = await supabase
        .from("categorias")
        .select("id, nome")
        .order("ordem");
      if (error) {
        console.error(
          "[ERRO - CATÁLOGO] Falha ao carregar categorias:",
          error.message,
        );
      } else {
        setCategorias(data || []);
        if (!produtoEditandoId && data && data.length > 0) {
          setCategoriaId(data[0].id);
        }
      }
    }
    carregarCategorias();
  }, [produtoEditandoId]);

  useEffect(() => {
    if (!produtoEditandoId) {
      limparFormulario(false);
      return;
    }

    async function carregarProduto() {
      try {
        setCarregandoProduto(true);
        const { data, error } = await supabase
          .from("produtos")
          .select("*")
          .eq("id", produtoEditandoId)
          .single();

        if (error) throw error;
        if (!data) throw new Error("Produto não encontrado.");

        setNome(data.nome);
        setDescricao(data.descricao || "");
        setPreco(String(data.preco));
        setPrecoPromocional(
          data.preco_promocional != null ? String(data.preco_promocional) : "",
        );
        setCategoriaId(data.categoria_id);
        setControlarEstoque(data.controlar_estoque);
        setQuantidadeEstoque(String(data.quantidade_estoque ?? 0));
        setEmPromocao(data.em_promocao);
        setAtivo(data.ativo);
        setImagemUrlAtual(data.imagem_url);
        setVideoUrlAtual(data.video_url);
        setImagemFila(null);
        setVideoFila(null);
      } catch (erro: unknown) {
        const mensagem = erro instanceof Error ? erro.message : String(erro);
        console.error("[ERRO - CATÁLOGO] Falha ao carregar produto:", mensagem);
        toast.error("Não foi possível carregar o produto para edição.");
        setSearchParams({});
      } finally {
        setCarregandoProduto(false);
      }
    }

    carregarProduto();
  }, [produtoEditandoId, setSearchParams]);

  const limparFormulario = (manterCategoria = true) => {
    setNome("");
    setDescricao("");
    setPreco("");
    setPrecoPromocional("");
    setControlarEstoque(true);
    setQuantidadeEstoque("0");
    setEmPromocao(false);
    setAtivo(true);
    setImagemFila(null);
    setVideoFila(null);
    setImagemUrlAtual(null);
    setVideoUrlAtual(null);
    if (manterCategoria && categorias.length > 0) {
      setCategoriaId(categorias[0].id);
    }
  };

  const cancelarEdicao = () => {
    setSearchParams({});
    limparFormulario();
  };

  const fazerUploadMidia = async (
    arquivo: File,
    pasta: "imagens" | "videos",
  ): Promise<string | null> => {
    try {
      const limiteMb = pasta === "videos" ? 15 : 5;
      if (arquivo.size > limiteMb * 1024 * 1024) {
        throw new Error(
          `O arquivo ${arquivo.name} excede o limite de ${limiteMb}MB.`,
        );
      }

      const extensao = arquivo.name.split(".").pop();
      const nomeLimpo = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${extensao}`;
      const caminho = `${pasta}/${nomeLimpo}`;

      const { data, error } = await supabase.storage
        .from("cardapio-midia")
        .upload(caminho, arquivo, { cacheControl: "3600", upsert: false });

      if (error) throw new Error(error.message);

      const { data: publicUrlData } = supabase.storage
        .from("cardapio-midia")
        .getPublicUrl(data.path);

      return publicUrlData.publicUrl;
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error(`[ERRO - UPLOAD DE ${pasta.toUpperCase()}]`, mensagem);
      toast.error(`Falha ao enviar mídia: ${mensagem}`);
      return null;
    }
  };

  const salvarProduto = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!modoEdicao && !imagemFila) {
      toast.error("É obrigatório enviar uma imagem de capa para o produto.");
      return;
    }

    if (modoEdicao && !imagemFila && !imagemUrlAtual) {
      toast.error("O produto precisa de uma imagem de capa.");
      return;
    }

    try {
      setSalvando(true);

      let imagemUrl = imagemUrlAtual;
      if (imagemFila) {
        imagemUrl = await fazerUploadMidia(imagemFila, "imagens");
        if (!imagemUrl) throw new Error("Upload da imagem falhou.");
      }

      let videoUrl = videoUrlAtual;
      if (videoFila) {
        videoUrl = await fazerUploadMidia(videoFila, "videos");
        if (!videoUrl) throw new Error("Upload do vídeo falhou.");
      }

      const precoNumerico = parseFloat(preco.replace(",", "."));
      const precoPromoNumerico =
        emPromocao && precoPromocional.trim()
          ? parseFloat(precoPromocional.replace(",", "."))
          : null;

      const payload = {
        nome,
        descricao,
        preco: precoNumerico,
        preco_promocional: precoPromoNumerico,
        em_promocao: emPromocao && precoPromoNumerico != null,
        categoria_id: categoriaId,
        imagem_url: imagemUrl,
        video_url: videoUrl,
        controlar_estoque: controlarEstoque,
        quantidade_estoque: controlarEstoque
          ? parseInt(quantidadeEstoque, 10)
          : 0,
        ativo,
      };

      if (modoEdicao && produtoEditandoId) {
        const { error: dbError } = await supabase
          .from("produtos")
          .update(payload)
          .eq("id", produtoEditandoId);

        if (dbError) throw new Error(dbError.message);

        toast.success("Produto atualizado com sucesso!");
        navigate("/admin/estoque");
      } else {
        const { error: dbError } = await supabase
          .from("produtos")
          .insert(payload);

        if (dbError) throw new Error(dbError.message);

        toast.success("Produto cadastrado com sucesso!");
        limparFormulario();
      }
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error("[ERRO FATAL - CADASTRO PRODUTO]", mensagem);
      toast.error(`Erro ao salvar produto: ${mensagem}`);
    } finally {
      setSalvando(false);
    }
  };

  if (carregandoProduto) {
    return (
      <div className="p-6 max-w-4xl mx-auto min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-cookie-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto h-full">
      <header className="mb-8 border-b pb-4 border-gray-200 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {modoEdicao ? "Editar Produto" : "Adicionar Produto"}
          </h1>
          <p className="text-gray-500">
            {modoEdicao
              ? "Altere os dados do item no cardápio digital."
              : "Cadastre um novo item no cardápio digital."}
          </p>
        </div>
        {modoEdicao && (
          <button
            type="button"
            onClick={cancelarEdicao}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <X size={16} /> Cancelar edição
          </button>
        )}
      </header>

      <form
        onSubmit={salvarProduto}
        className="grid grid-cols-1 md:grid-cols-2 gap-8"
      >
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">
              Nome do Produto
            </label>
            <input
              required
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border dark:bg-[#1a1815] dark:border-gray-700 outline-none focus:ring-2 focus:ring-cookie-primary"
              placeholder="Ex: Cookie Clássico com Nutella"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">
              Descrição
            </label>
            <textarea
              required
              rows={3}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border dark:bg-[#1a1815] dark:border-gray-700 outline-none focus:ring-2 focus:ring-cookie-primary"
              placeholder="Descreva o produto de forma apetitosa..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-gray-300">
                Preço (R$)
              </label>
              <input
                required
                type="number"
                step="0.01"
                min="0"
                value={preco}
                onChange={(e) => setPreco(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border dark:bg-[#1a1815] dark:border-gray-700 outline-none focus:ring-2 focus:ring-cookie-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-gray-300">
                Categoria
              </label>
              <select
                value={categoriaId}
                onChange={(e) => setCategoriaId(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border dark:bg-[#1a1815] dark:border-gray-700 outline-none focus:ring-2 focus:ring-cookie-primary"
              >
                {categorias.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-800 space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-medium dark:text-gray-300">
                Em promoção?
              </span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={emPromocao}
                  onChange={(e) => setEmPromocao(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cookie-primary" />
              </label>
            </div>

            {emPromocao && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
              >
                <label className="block text-xs text-gray-500 mb-1">
                  Preço promocional (R$)
                </label>
                <input
                  required={emPromocao}
                  type="number"
                  step="0.01"
                  min="0"
                  value={precoPromocional}
                  onChange={(e) => setPrecoPromocional(e.target.value)}
                  className="w-full px-3 py-2 rounded border dark:bg-[#1a1815] dark:border-gray-700"
                />
              </motion.div>
            )}
          </div>

          <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-800 space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-medium dark:text-gray-300">
                Visível no cardápio?
              </span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={ativo}
                  onChange={(e) => setAtivo(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500" />
              </label>
            </div>

            <div className="flex items-center justify-between">
              <span className="font-medium dark:text-gray-300">
                Controlar estoque?
              </span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={controlarEstoque}
                  onChange={(e) => setControlarEstoque(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cookie-primary" />
              </label>
            </div>

            {controlarEstoque && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
              >
                <label className="block text-xs text-gray-500 mb-1">
                  Quantidade em estoque
                </label>
                <input
                  type="number"
                  min="0"
                  value={quantidadeEstoque}
                  onChange={(e) => setQuantidadeEstoque(e.target.value)}
                  className="w-full px-3 py-2 rounded border dark:bg-[#1a1815] dark:border-gray-700"
                />
              </motion.div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-2xl p-6 flex flex-col items-center justify-center bg-gray-50 dark:bg-[#1a1815]/50 relative transition-colors hover:border-cookie-primary min-h-[160px]">
            <input
              type="file"
              accept="image/*"
              required={!modoEdicao && !imagemUrlAtual}
              onChange={(e) => setImagemFila(e.target.files?.[0] || null)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />

            {imagemFila ? (
              <div className="text-center">
                <div className="w-16 h-16 mx-auto bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-2">
                  <ImageIcon />
                </div>
                <p className="font-medium text-sm line-clamp-1">
                  {imagemFila.name}
                </p>
                <p className="text-xs text-gray-500">Nova imagem selecionada</p>
              </div>
            ) : imagemUrlAtual ? (
              <div className="text-center">
                <img
                  src={imagemUrlAtual}
                  alt="Capa atual"
                  className="w-24 h-24 object-cover rounded-lg mx-auto mb-2 border"
                />
                <p className="font-medium text-sm">Imagem atual</p>
                <p className="text-xs text-gray-500">Toque para substituir</p>
              </div>
            ) : (
              <div className="text-center pointer-events-none">
                <Upload className="mx-auto text-gray-400 mb-2" size={32} />
                <p className="font-medium text-sm">Upload da Imagem de Capa</p>
                <p className="text-xs text-gray-500 mt-1">
                  Obrigatório. Formato 4:5. Máx 5MB.
                </p>
              </div>
            )}
          </div>

          <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-2xl p-6 flex flex-col items-center justify-center bg-gray-50 dark:bg-[#1a1815]/50 relative transition-colors hover:border-cookie-primary min-h-[160px]">
            <input
              type="file"
              accept="video/mp4"
              onChange={(e) => setVideoFila(e.target.files?.[0] || null)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />

            {videoFila ? (
              <div className="text-center">
                <div className="w-16 h-16 mx-auto bg-purple-100 text-purple-600 rounded-full flex items-center justify-center mb-2">
                  <Film />
                </div>
                <p className="font-medium text-sm line-clamp-1">
                  {videoFila.name}
                </p>
                <p className="text-xs text-gray-500">Novo vídeo selecionado</p>
              </div>
            ) : videoUrlAtual ? (
              <div className="text-center">
                <div className="w-16 h-16 mx-auto bg-purple-100 text-purple-600 rounded-full flex items-center justify-center mb-2">
                  <Film />
                </div>
                <p className="font-medium text-sm">Vídeo atual cadastrado</p>
                <p className="text-xs text-gray-500">Toque para substituir</p>
              </div>
            ) : (
              <div className="text-center pointer-events-none">
                <Film className="mx-auto text-gray-400 mb-2" size={32} />
                <p className="font-medium text-sm">
                  Upload de Vídeo (Estilo Reels)
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Opcional. Apenas MP4 vertical. Máx 15MB.
                </p>
              </div>
            )}
          </div>

          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 flex gap-3 text-sm text-yellow-800 dark:text-yellow-200">
            <AlertCircle className="shrink-0" size={20} />
            <p>
              {modoEdicao
                ? "Na edição, a mídia só é substituída se você selecionar um novo arquivo."
                : "Ao salvar, os arquivos serão enviados para os servidores em nuvem. Não feche a página durante o processo."}
            </p>
          </div>

          <button
            type="submit"
            disabled={salvando}
            className="w-full bg-cookie-primary text-white py-4 rounded-xl font-bold flex justify-center items-center gap-2 transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            {salvando ? (
              <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <>
                <Save size={20} />{" "}
                {modoEdicao ? "Salvar Alterações" : "Salvar Produto"}
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
