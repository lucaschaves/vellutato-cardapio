import {
  Layers,
  Loader2,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  calcularDeltaOpcao,
  listarProdutosParaOpcaoCombo,
  type ComboGrupo,
  type ComboOpcao,
} from "../../lib/combos";
import { supabase } from "../../lib/supabase";

interface ComboResumo {
  id: string;
  nome: string;
  preco: number;
  ativo: boolean;
}

export function GerenciamentoCombos() {
  const [searchParams, setSearchParams] = useSearchParams();
  const produtoId = searchParams.get("produto");

  const [combos, setCombos] = useState<ComboResumo[]>([]);
  const [carregandoLista, setCarregandoLista] = useState(true);
  const [carregandoEditor, setCarregandoEditor] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const [comboAtual, setComboAtual] = useState<ComboResumo | null>(null);
  const [grupos, setGrupos] = useState<ComboGrupo[]>([]);
  const [produtosSimples, setProdutosSimples] = useState<
    { id: string; nome: string; preco: number }[]
  >([]);

  const carregarCombos = useCallback(async () => {
    try {
      setCarregandoLista(true);
      const { data, error } = await supabase
        .from("produtos")
        .select("id, nome, preco, ativo")
        .eq("tipo", "combo")
        .order("nome");
      if (error) throw error;
      setCombos(
        (data || []).map((c) => ({
          id: c.id,
          nome: c.nome,
          preco: Number(c.preco),
          ativo: c.ativo,
        })),
      );
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      toast.error(`Falha ao listar combos: ${mensagem}`);
    } finally {
      setCarregandoLista(false);
    }
  }, []);

  const carregarEditor = useCallback(async (id: string) => {
    try {
      setCarregandoEditor(true);
      const [{ data: produto, error: errProd }, produtos] = await Promise.all([
        supabase
          .from("produtos")
          .select("id, nome, preco, ativo, tipo")
          .eq("id", id)
          .single(),
        listarProdutosParaOpcaoCombo(),
      ]);

      if (errProd) throw errProd;
      if (!produto || produto.tipo !== "combo") {
        throw new Error("Produto não é um combo.");
      }

      setComboAtual({
        id: produto.id,
        nome: produto.nome,
        preco: Number(produto.preco),
        ativo: produto.ativo,
      });
      setProdutosSimples(produtos);

      const { data: gruposDb, error: errGrupos } = await supabase
        .from("combo_grupos")
        .select(
          `
          id, combo_produto_id, nome, descricao, min_escolhas, max_escolhas,
          preco_referencia, ordem,
          combo_opcoes (
            id, grupo_id, produto_id, delta_preco, ordem, ativo,
            produtos ( id, nome, preco, preco_promocional, em_promocao, imagem_url, ativo )
          )
        `,
        )
        .eq("combo_produto_id", id)
        .order("ordem");

      if (errGrupos) throw errGrupos;

      const montados: ComboGrupo[] = (gruposDb || []).map((g) => {
        const opcoesRaw = (g.combo_opcoes || []) as unknown as Array<{
          id: string;
          grupo_id: string;
          produto_id: string;
          delta_preco: number | null;
          ordem: number;
          ativo: boolean;
          produtos: ComboOpcao["produto"] | null;
        }>;

        return {
          id: g.id,
          combo_produto_id: g.combo_produto_id,
          nome: g.nome,
          descricao: g.descricao,
          min_escolhas: g.min_escolhas,
          max_escolhas: g.max_escolhas,
          preco_referencia: Number(g.preco_referencia),
          ordem: g.ordem,
          opcoes: opcoesRaw
            .map((o) => {
              const produto = Array.isArray(o.produtos)
                ? o.produtos[0]
                : o.produtos;
              if (!produto) return null;
              return {
                id: o.id,
                grupo_id: o.grupo_id,
                produto_id: o.produto_id,
                delta_preco: o.delta_preco,
                ordem: o.ordem,
                ativo: o.ativo,
                produto,
              } satisfies ComboOpcao;
            })
            .filter((o): o is ComboOpcao => o != null)
            .sort((a, b) => a.ordem - b.ordem),
        };
      });

      setGrupos(montados);
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      toast.error(mensagem);
      setSearchParams({});
      setComboAtual(null);
      setGrupos([]);
    } finally {
      setCarregandoEditor(false);
    }
  }, [setSearchParams]);

  useEffect(() => {
    void carregarCombos();
  }, [carregarCombos]);

  useEffect(() => {
    if (produtoId) {
      void carregarEditor(produtoId);
    } else {
      setComboAtual(null);
      setGrupos([]);
    }
  }, [produtoId, carregarEditor]);

  const adicionarGrupo = () => {
    const tempId = `temp-${Date.now()}`;
    setGrupos((prev) => [
      ...prev,
      {
        id: tempId,
        combo_produto_id: comboAtual?.id || "",
        nome: "",
        descricao: null,
        min_escolhas: 1,
        max_escolhas: 1,
        preco_referencia: 0,
        ordem: prev.length,
        opcoes: [],
      },
    ]);
  };

  const atualizarGrupo = (grupoId: string, patch: Partial<ComboGrupo>) => {
    setGrupos((prev) =>
      prev.map((g) => (g.id === grupoId ? { ...g, ...patch } : g)),
    );
  };

  const removerGrupo = (grupoId: string) => {
    setGrupos((prev) => prev.filter((g) => g.id !== grupoId));
  };

  const adicionarOpcao = (grupoId: string, produtoId: string) => {
    const produto = produtosSimples.find((p) => p.id === produtoId);
    if (!produto) return;

    setGrupos((prev) =>
      prev.map((g) => {
        if (g.id !== grupoId) return g;
        if (g.opcoes.some((o) => o.produto_id === produtoId)) {
          toast.info("Esse produto já está neste grupo.");
          return g;
        }
        const deltaSugerido = Math.max(
          produto.preco - Number(g.preco_referencia),
          0,
        );
        return {
          ...g,
          opcoes: [
            ...g.opcoes,
            {
              id: `temp-opcao-${Date.now()}`,
              grupo_id: g.id,
              produto_id: produto.id,
              delta_preco: deltaSugerido,
              ordem: g.opcoes.length,
              ativo: true,
              produto: {
                id: produto.id,
                nome: produto.nome,
                preco: produto.preco,
                preco_promocional: null,
                em_promocao: false,
                imagem_url: null,
                ativo: true,
              },
            },
          ],
        };
      }),
    );
  };

  const atualizarOpcao = (
    grupoId: string,
    opcaoId: string,
    patch: Partial<ComboOpcao>,
  ) => {
    setGrupos((prev) =>
      prev.map((g) =>
        g.id !== grupoId
          ? g
          : {
              ...g,
              opcoes: g.opcoes.map((o) =>
                o.id === opcaoId ? { ...o, ...patch } : o,
              ),
            },
      ),
    );
  };

  const removerOpcao = (grupoId: string, opcaoId: string) => {
    setGrupos((prev) =>
      prev.map((g) =>
        g.id !== grupoId
          ? g
          : { ...g, opcoes: g.opcoes.filter((o) => o.id !== opcaoId) },
      ),
    );
  };

  const salvarEstrutura = async () => {
    if (!comboAtual) return;

    for (const g of grupos) {
      if (!g.nome.trim()) {
        toast.error("Todos os grupos precisam de um nome.");
        return;
      }
      if (g.opcoes.length === 0) {
        toast.error(`O grupo "${g.nome}" precisa de ao menos uma opção.`);
        return;
      }
      const min = Number(g.min_escolhas);
      const max = Number(g.max_escolhas);
      if (!Number.isFinite(min) || min < 0) {
        toast.error(
          `O grupo "${g.nome}" precisa de quantidade obrigatória ≥ 0.`,
        );
        return;
      }
      if (!Number.isFinite(max) || max < 1) {
        toast.error(`O grupo "${g.nome}" precisa de máximo ≥ 1.`);
        return;
      }
      if (min > max) {
        toast.error(
          `No grupo "${g.nome}", obrigatórias não pode ser maior que o máximo.`,
        );
        return;
      }
      if (max > g.opcoes.length) {
        toast.error(
          `No grupo "${g.nome}", o máximo (${max}) não pode ser maior que o número de opções (${g.opcoes.length}).`,
        );
        return;
      }
    }

    try {
      setSalvando(true);

      const { data: gruposExistentes, error: errExist } = await supabase
        .from("combo_grupos")
        .select("id")
        .eq("combo_produto_id", comboAtual.id);
      if (errExist) throw errExist;

      const idsMantidos = new Set(
        grupos.filter((g) => !g.id.startsWith("temp-")).map((g) => g.id),
      );
      const paraRemover = (gruposExistentes || [])
        .map((g) => g.id)
        .filter((id) => !idsMantidos.has(id));

      if (paraRemover.length > 0) {
        const { error } = await supabase
          .from("combo_grupos")
          .delete()
          .in("id", paraRemover);
        if (error) throw error;
      }

      for (let i = 0; i < grupos.length; i++) {
        const g = grupos[i];
        let grupoId = g.id;

        if (g.id.startsWith("temp-")) {
          const { data: novo, error } = await supabase
            .from("combo_grupos")
            .insert({
              combo_produto_id: comboAtual.id,
              nome: g.nome.trim(),
              descricao: g.descricao,
              min_escolhas: g.min_escolhas,
              max_escolhas: g.max_escolhas,
              preco_referencia: g.preco_referencia,
              ordem: i,
            })
            .select("id")
            .single();
          if (error) throw error;
          grupoId = novo.id;
        } else {
          const { error } = await supabase
            .from("combo_grupos")
            .update({
              nome: g.nome.trim(),
              descricao: g.descricao,
              min_escolhas: g.min_escolhas,
              max_escolhas: g.max_escolhas,
              preco_referencia: g.preco_referencia,
              ordem: i,
            })
            .eq("id", g.id);
          if (error) throw error;
        }

        const { data: opcoesExistentes, error: errOp } = await supabase
          .from("combo_opcoes")
          .select("id")
          .eq("grupo_id", grupoId);
        if (errOp) throw errOp;

        const idsOpcoesMantidos = new Set(
          g.opcoes.filter((o) => !o.id.startsWith("temp-")).map((o) => o.id),
        );
        const opcoesRemover = (opcoesExistentes || [])
          .map((o) => o.id)
          .filter((id) => !idsOpcoesMantidos.has(id));

        if (opcoesRemover.length > 0) {
          const { error } = await supabase
            .from("combo_opcoes")
            .delete()
            .in("id", opcoesRemover);
          if (error) throw error;
        }

        for (let j = 0; j < g.opcoes.length; j++) {
          const o = g.opcoes[j];
          const payload = {
            grupo_id: grupoId,
            produto_id: o.produto_id,
            delta_preco: o.delta_preco,
            ordem: j,
            ativo: o.ativo,
          };

          if (o.id.startsWith("temp-")) {
            const { error } = await supabase.from("combo_opcoes").insert(payload);
            if (error) throw error;
          } else {
            const { error } = await supabase
              .from("combo_opcoes")
              .update(payload)
              .eq("id", o.id);
            if (error) throw error;
          }
        }
      }

      toast.success("Estrutura do combo salva!");
      await carregarEditor(comboAtual.id);
      await carregarCombos();
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      toast.error(`Erro ao salvar: ${mensagem}`);
    } finally {
      setSalvando(false);
    }
  };

  if (produtoId) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 dark:border-gray-800 pb-4">
          <div>
            <button
              type="button"
              onClick={() => setSearchParams({})}
              className="text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 mb-2"
            >
              ← Voltar aos combos
            </button>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {comboAtual?.nome || "Configurar combo"}
            </h1>
            {comboAtual && (
              <p className="text-sm text-gray-500">
                Preço base: R$ {comboAtual.preco.toFixed(2)} — o cliente paga
                base + deltas das escolhas.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => void salvarEstrutura()}
            disabled={salvando || carregandoEditor}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cookie-primary text-white font-bold disabled:opacity-50"
          >
            {salvando ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Save size={18} />
            )}
            Salvar estrutura
          </button>
        </header>

        {carregandoEditor ? (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-cookie-primary" size={32} />
          </div>
        ) : (
          <div className="space-y-4">
            {grupos.map((grupo) => (
              <div
                key={grupo.id}
                className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-surface-dark p-4 space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold uppercase text-gray-500">
                        Nome do grupo
                      </label>
                      <input
                        value={grupo.nome}
                        onChange={(e) =>
                          atualizarGrupo(grupo.id, { nome: e.target.value })
                        }
                        placeholder="Ex: Cookie"
                        className="w-full mt-1 px-3 py-2 rounded-lg border dark:bg-[#1a1815] dark:border-gray-700"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold uppercase text-gray-500">
                        Preço referência (incluso)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={grupo.preco_referencia}
                        onChange={(e) =>
                          atualizarGrupo(grupo.id, {
                            preco_referencia: Number(e.target.value) || 0,
                          })
                        }
                        className="w-full mt-1 px-3 py-2 rounded-lg border dark:bg-[#1a1815] dark:border-gray-700"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold uppercase text-gray-500">
                        Obrigatórias
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={grupo.min_escolhas}
                        onChange={(e) => {
                          const min = Math.max(
                            0,
                            Math.floor(Number(e.target.value) || 0),
                          );
                          atualizarGrupo(grupo.id, {
                            min_escolhas: min,
                            max_escolhas: Math.max(grupo.max_escolhas, min, 1),
                          });
                        }}
                        className="w-full mt-1 px-3 py-2 rounded-lg border dark:bg-[#1a1815] dark:border-gray-700"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold uppercase text-gray-500">
                        Máximo
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={grupo.max_escolhas}
                        onChange={(e) => {
                          const max = Math.max(
                            1,
                            Math.floor(Number(e.target.value) || 1),
                          );
                          atualizarGrupo(grupo.id, {
                            max_escolhas: max,
                            min_escolhas: Math.min(grupo.min_escolhas, max),
                          });
                        }}
                        className="w-full mt-1 px-3 py-2 rounded-lg border dark:bg-[#1a1815] dark:border-gray-700"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removerGrupo(grupo.id)}
                    className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                    title="Remover grupo"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
                <p className="text-[11px] text-gray-500 -mt-2">
                  Ex.: 3 cookies obrigatórios → Obrigatórias 3 e Máximo 3. Bebida
                  única → 1 e 1.
                </p>

                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase text-gray-500">
                    Opções
                  </p>
                  {grupo.opcoes.map((opcao) => {
                    const deltaExibido = calcularDeltaOpcao(
                      opcao,
                      grupo.preco_referencia,
                    );
                    return (
                      <div
                        key={opcao.id}
                        className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-xl bg-gray-50 dark:bg-[#1a1815] border border-gray-100 dark:border-gray-800"
                      >
                        <span className="flex-1 font-medium text-sm">
                          {opcao.produto.nome}
                          <span className="text-gray-500 font-normal">
                            {" "}
                            (R$ {Number(opcao.produto.preco).toFixed(2)})
                          </span>
                        </span>
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-gray-500">Delta R$</label>
                          <input
                            type="number"
                            step="0.01"
                            value={
                              opcao.delta_preco == null
                                ? deltaExibido
                                : opcao.delta_preco
                            }
                            onChange={(e) =>
                              atualizarOpcao(grupo.id, opcao.id, {
                                delta_preco: Number(e.target.value) || 0,
                              })
                            }
                            className="w-24 px-2 py-1.5 rounded-lg border dark:bg-[#121212] dark:border-gray-700 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => removerOpcao(grupo.id, opcao.id)}
                            className="p-1.5 text-red-500"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  <select
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) {
                        adicionarOpcao(grupo.id, e.target.value);
                        e.target.value = "";
                      }
                    }}
                    className="w-full px-3 py-2 rounded-lg border dark:bg-[#1a1815] dark:border-gray-700 text-sm"
                  >
                    <option value="">+ Adicionar produto ao grupo</option>
                    {produtosSimples.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome} — R$ {p.preco.toFixed(2)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={adicionarGrupo}
              className="w-full py-3 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700 text-sm font-bold text-gray-600 dark:text-gray-300 hover:border-cookie-primary hover:text-cookie-primary flex items-center justify-center gap-2"
            >
              <Plus size={18} /> Novo grupo (ex.: Cookie, Brownie, Café)
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <header className="border-b border-gray-200 dark:border-gray-800 pb-4">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Layers className="text-cookie-primary" /> Combos
        </h1>
        <p className="text-gray-500 mt-1">
          Monte grupos e opções reutilizando produtos do cardápio. Cadastre o
          produto como tipo <strong>Combo</strong> no{" "}
          <Link to="/admin/catalogo" className="text-cookie-primary underline">
            Catálogo
          </Link>
          .
        </p>
      </header>

      {carregandoLista ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-cookie-primary" size={32} />
        </div>
      ) : combos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-8 text-center text-gray-500">
          Nenhum combo cadastrado. No catálogo, crie um produto e marque o tipo
          como Combo.
        </div>
      ) : (
        <div className="space-y-3">
          {combos.map((combo) => (
            <button
              key={combo.id}
              type="button"
              onClick={() => setSearchParams({ produto: combo.id })}
              className="w-full text-left p-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-surface-dark hover:border-cookie-primary transition-colors flex items-center justify-between gap-3"
            >
              <div>
                <p className="font-bold text-gray-900 dark:text-white">
                  {combo.nome}
                </p>
                <p className="text-sm text-gray-500">
                  Base R$ {combo.preco.toFixed(2)}
                  {!combo.ativo && " · oculto"}
                </p>
              </div>
              <span className="text-sm font-bold text-cookie-primary">
                Configurar →
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
