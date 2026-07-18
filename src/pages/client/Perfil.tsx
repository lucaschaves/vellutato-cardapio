import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ClipboardList,
  Loader2,
  LogOut,
  Pencil,
  Phone,
  RefreshCw,
  Ticket,
  UserCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { InputTelaCheia } from "../../components/InputTelaCheia";
import {
  buscarClientePorCelular,
  buscarCuponsDoCliente,
  rotuloCupomResumo,
  upsertCliente,
  type ClientePerfil,
  type CupomCliente,
} from "../../lib/clientes";
import {
  buscarMeusPedidos,
  STATUS_PEDIDO_CLIENTE,
  type MeuPedido,
} from "../../lib/meusPedidos";
import { encerrarSessaoCliente } from "../../lib/modoCardapio";
import {
  formatarDataHora,
  formatarMoeda,
  obterClasseStatus,
} from "../../lib/pedidosAdmin";
import { supabase } from "../../lib/supabase";
import {
  formatarTelefoneDeSalvo,
  lerCelularLocalStorage,
  normalizarTelefoneParaSalvar,
  salvarCelularLocalStorage,
  telefoneDigitosCompleto,
} from "../../lib/telefone";
import { urlCardapio } from "../../lib/urlCardapio";

const STATUS_ATIVOS = new Set(["pendente", "em_producao", "pronto"]);

export function Perfil() {
  const navigate = useNavigate();
  const location = useLocation();

  const [celular, setCelular] = useState(() => lerCelularLocalStorage());
  const [nome, setNome] = useState(
    () => localStorage.getItem("cliente_nome") || "",
  );
  const [editandoNome, setEditandoNome] = useState(false);
  const [nomeEdicao, setNomeEdicao] = useState("");

  const [cliente, setCliente] = useState<ClientePerfil | null>(null);
  const [cupons, setCupons] = useState<CupomCliente[]>([]);
  const [pedidos, setPedidos] = useState<MeuPedido[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvandoNome, setSalvandoNome] = useState(false);
  const [identificando, setIdentificando] = useState(false);

  const celularNormalizado = normalizarTelefoneParaSalvar(celular);
  const celularValido = telefoneDigitosCompleto(celular);

  const pedidosOrdenados = useMemo(() => {
    return [...pedidos].sort((a, b) => {
      const aAtivo = STATUS_ATIVOS.has(a.status) ? 0 : 1;
      const bAtivo = STATUS_ATIVOS.has(b.status) ? 0 : 1;
      if (aAtivo !== bAtivo) return aAtivo - bAtivo;
      return (
        new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime()
      );
    });
  }, [pedidos]);

  const carregarTudo = useCallback(async () => {
    if (!celularValido) {
      setCliente(null);
      setCupons([]);
      setPedidos([]);
      setCarregando(false);
      return;
    }

    try {
      setCarregando(true);
      const perfil = await buscarClientePorCelular(celular);
      setCliente(perfil);

      if (perfil) {
        setNome(perfil.nome);
        localStorage.setItem("cliente_nome", perfil.nome);
        const [listaCupons, listaPedidos] = await Promise.all([
          buscarCuponsDoCliente(perfil.id),
          buscarMeusPedidos(celular),
        ]);
        setCupons(listaCupons);
        setPedidos(listaPedidos);
      } else {
        setCupons([]);
        setPedidos(await buscarMeusPedidos(celular));
      }
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error("[PERFIL]", mensagem);
      toast.error("Não foi possível carregar seus dados.");
    } finally {
      setCarregando(false);
    }
  }, [celular, celularValido]);

  useEffect(() => {
    void carregarTudo();
  }, [carregarTudo]);

  useEffect(() => {
    if (!celularValido) return;

    const canal = supabase
      .channel(`perfil-pedidos-${celularNormalizado}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "pedidos",
          filter: `cliente_celular=eq.${celularNormalizado}`,
        },
        () => {
          void carregarTudo();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(canal);
    };
  }, [carregarTudo, celularNormalizado, celularValido]);

  const identificar = async () => {
    if (!celularValido) {
      toast.error("Informe um celular válido com DDD.");
      return;
    }
    if (!nome.trim()) {
      toast.error("Informe seu nome para continuar.");
      return;
    }

    try {
      setIdentificando(true);
      salvarCelularLocalStorage(celular);
      const id = await upsertCliente(nome, celular);
      if (!id) throw new Error("Falha ao salvar cadastro.");
      localStorage.setItem("cliente_nome", nome.trim());
      toast.success("Cadastro identificado!");
      await carregarTudo();
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error("[PERFIL] identificar", mensagem);
      toast.error("Não foi possível salvar seu cadastro.");
    } finally {
      setIdentificando(false);
    }
  };

  const salvarNome = async () => {
    if (!nomeEdicao.trim()) {
      toast.error("Informe um nome válido.");
      return;
    }
    if (!celularValido) return;

    try {
      setSalvandoNome(true);
      await upsertCliente(nomeEdicao, celular);
      setNome(nomeEdicao.trim());
      localStorage.setItem("cliente_nome", nomeEdicao.trim());
      setEditandoNome(false);
      toast.success("Nome atualizado!");
      await carregarTudo();
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error("[PERFIL] nome", mensagem);
      toast.error("Não foi possível atualizar o nome.");
    } finally {
      setSalvandoNome(false);
    }
  };

  const sair = () => {
    if (
      !window.confirm(
        "Sair desta conta neste aparelho? Você precisará informar o celular de novo.",
      )
    ) {
      return;
    }
    encerrarSessaoCliente();
    setCelular("");
    setNome("");
    setCliente(null);
    setCupons([]);
    setPedidos([]);
    setEditandoNome(false);
    toast.success("Sessão encerrada.");
  };

  const voltar = () => navigate(urlCardapio("", location.search));

  const aoMudarCelularLogin = async (valor: string) => {
    setCelular(valor);
    if (!telefoneDigitosCompleto(valor)) return;
    try {
      const encontrado = await buscarClientePorCelular(valor);
      if (encontrado) {
        setNome(encontrado.nome);
      }
    } catch {
      /* opcional */
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      className="fixed inset-0 z-50 bg-gray-100 dark:bg-[#121212] flex flex-col"
    >
      <header className="shrink-0 bg-white dark:bg-[#181a1b] border-b border-gray-200 dark:border-[#2a2c30] px-4 py-4 flex items-center gap-3">
        <button
          type="button"
          onClick={voltar}
          className="p-2.5 bg-gray-100 dark:bg-[#2a2c30] rounded-full text-gray-900 dark:text-white active:scale-95 transition-all"
          aria-label="Voltar"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-extrabold text-gray-950 dark:text-white flex items-center gap-2">
            <UserCircle size={20} className="text-[#ff5722]" />
            Minha conta
          </h1>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Dados, cupons e pedidos
          </p>
        </div>
        {celularValido && (
          <button
            type="button"
            onClick={() => void carregarTudo()}
            disabled={carregando}
            className="p-2.5 bg-gray-100 dark:bg-[#2a2c30] rounded-full text-gray-700 dark:text-gray-200 active:scale-95 disabled:opacity-50"
            title="Atualizar"
          >
            <RefreshCw size={18} className={carregando ? "animate-spin" : ""} />
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-4 max-w-lg mx-auto w-full space-y-4 pb-10">
        {!celularValido && (
          <div className="bg-white dark:bg-[#181a1b] rounded-2xl p-5 border border-gray-200 dark:border-[#2a2c30] space-y-4">
            <div className="flex items-start gap-2 text-gray-700 dark:text-gray-300">
              <Phone size={18} className="text-[#ff5722] shrink-0 mt-0.5" />
              <p className="text-sm font-medium">
                Informe celular e nome para acessar sua conta, pedidos e
                cupons.
              </p>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                Celular
              </label>
              <InputTelaCheia
                modo="tel"
                value={celular}
                onValorChange={(v) => void aoMudarCelularLogin(v)}
                placeholder="(11) 98765-4321"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-[#2a2c30] bg-gray-50 dark:bg-[#242629] text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                Nome
              </label>
              <InputTelaCheia
                modo="texto"
                value={nome}
                onValorChange={setNome}
                placeholder="Como devemos te chamar?"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-[#2a2c30] bg-gray-50 dark:bg-[#242629] text-gray-900 dark:text-white"
              />
            </div>
            <button
              type="button"
              onClick={() => void identificar()}
              disabled={identificando}
              className="w-full bg-[#ff5722] hover:bg-[#e64a19] disabled:opacity-60 text-white font-bold py-3 rounded-xl active:scale-[0.98] transition-all"
            >
              {identificando ? "Salvando…" : "Entrar / criar conta"}
            </button>
          </div>
        )}

        {carregando && celularValido && (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-[#ff5722]" size={36} />
          </div>
        )}

        {!carregando && celularValido && (
          <>
            {/* Identidade */}
            <section className="bg-white dark:bg-[#181a1b] rounded-2xl p-5 border border-gray-200 dark:border-[#2a2c30] space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
                    Seus dados
                  </p>
                  {!editandoNome ? (
                    <h2 className="text-xl font-black text-gray-950 dark:text-white mt-1 truncate">
                      {nome || cliente?.nome || "Sem nome"}
                    </h2>
                  ) : (
                    <InputTelaCheia
                      modo="texto"
                      value={nomeEdicao}
                      onValorChange={setNomeEdicao}
                      className="mt-2 w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-[#2a2c30] bg-gray-50 dark:bg-[#242629] text-gray-900 dark:text-white"
                    />
                  )}
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 flex items-center gap-1.5">
                    <Phone size={14} className="text-[#ff5722]" />
                    {formatarTelefoneDeSalvo(celularNormalizado)}
                  </p>
                </div>
                {!editandoNome ? (
                  <button
                    type="button"
                    onClick={() => {
                      setNomeEdicao(nome || cliente?.nome || "");
                      setEditandoNome(true);
                    }}
                    className="p-2.5 rounded-full bg-gray-100 dark:bg-[#2a2c30] text-gray-700 dark:text-gray-200"
                    title="Editar nome"
                  >
                    <Pencil size={16} />
                  </button>
                ) : null}
              </div>

              {editandoNome && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditandoNome(false)}
                    className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-[#2a2c30] font-bold text-sm"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => void salvarNome()}
                    disabled={salvandoNome}
                    className="flex-1 py-2.5 rounded-xl bg-[#ff5722] text-white font-bold text-sm disabled:opacity-60"
                  >
                    {salvandoNome ? "Salvando…" : "Salvar"}
                  </button>
                </div>
              )}

              {!cliente && (
                <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
                  Complete o cadastro com um nome para liberar cupons exclusivos
                  no checkout.
                  {!nome.trim() && (
                    <button
                      type="button"
                      onClick={() => {
                        setNomeEdicao("");
                        setEditandoNome(true);
                      }}
                      className="block mt-2 font-bold text-[#ff5722]"
                    >
                      Informar nome agora
                    </button>
                  )}
                  {nome.trim() && (
                    <button
                      type="button"
                      onClick={() => void identificar()}
                      className="block mt-2 font-bold text-[#ff5722]"
                    >
                      Salvar cadastro
                    </button>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={sair}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 font-bold text-sm active:scale-[0.98]"
              >
                <LogOut size={16} />
                Sair / trocar de conta
              </button>
            </section>

            {/* Stats */}
            {cliente && (
              <section className="grid grid-cols-3 gap-2">
                <div className="bg-white dark:bg-[#181a1b] rounded-2xl border border-gray-200 dark:border-[#2a2c30] p-3 text-center">
                  <p className="text-[0.625rem] font-bold uppercase tracking-wider text-gray-500">
                    Pedidos
                  </p>
                  <p className="text-xl font-black text-gray-950 dark:text-white mt-1">
                    {cliente.total_pedidos}
                  </p>
                </div>
                <div className="bg-white dark:bg-[#181a1b] rounded-2xl border border-gray-200 dark:border-[#2a2c30] p-3 text-center">
                  <p className="text-[0.625rem] font-bold uppercase tracking-wider text-gray-500">
                    Gasto
                  </p>
                  <p className="text-sm font-black text-[#ff5722] mt-1.5">
                    {formatarMoeda(cliente.valor_gasto)}
                  </p>
                </div>
                <div className="bg-white dark:bg-[#181a1b] rounded-2xl border border-gray-200 dark:border-[#2a2c30] p-3 text-center">
                  <p className="text-[0.625rem] font-bold uppercase tracking-wider text-gray-500">
                    Último
                  </p>
                  <p className="text-[0.6875rem] font-bold text-gray-800 dark:text-gray-200 mt-1.5 leading-tight">
                    {cliente.ultimo_pedido
                      ? formatarDataHora(cliente.ultimo_pedido)
                      : "—"}
                  </p>
                </div>
              </section>
            )}

            {/* Cupons */}
            <section className="bg-white dark:bg-[#181a1b] rounded-2xl border border-gray-200 dark:border-[#2a2c30] p-5">
              <div className="flex items-center gap-2 mb-3">
                <Ticket size={18} className="text-[#ff5722]" />
                <h3 className="font-bold text-gray-950 dark:text-white">
                  Seus cupons
                </h3>
              </div>
              {!cliente ? (
                <p className="text-sm text-gray-500">
                  Identifique-se para ver cupons exclusivos.
                </p>
              ) : cupons.length === 0 ? (
                <p className="text-sm text-gray-500">
                  Nenhum cupom exclusivo disponível no momento.
                </p>
              ) : (
                <ul className="space-y-2">
                  {cupons.map((cupom) => (
                    <li
                      key={cupom.id}
                      className="rounded-xl bg-gray-50 dark:bg-[#242629] border border-gray-100 dark:border-[#2a2c30] px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-black tracking-wide text-gray-950 dark:text-white">
                          {cupom.codigo}
                        </span>
                        <span className="text-xs font-bold text-[#ff5722]">
                          {rotuloCupomResumo(cupom)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Use o código no carrinho
                        {cupom.valor_minimo
                          ? ` · pedido mín. ${formatarMoeda(cupom.valor_minimo)}`
                          : ""}
                        {cupom.limite_uso != null
                          ? ` · ${Math.max(cupom.limite_uso - cupom.usos, 0)} uso(s) restante(s)`
                          : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Pedidos */}
            <section>
              <div className="flex items-center gap-2 mb-3 px-1">
                <ClipboardList size={18} className="text-[#ff5722]" />
                <h3 className="font-bold text-gray-950 dark:text-white">
                  Meus pedidos
                </h3>
              </div>

              {pedidosOrdenados.length === 0 ? (
                <div className="text-center py-10 text-gray-500 bg-white dark:bg-[#181a1b] rounded-2xl border border-gray-200 dark:border-[#2a2c30]">
                  <ClipboardList size={40} className="mx-auto mb-2 opacity-20" />
                  <p className="font-medium text-sm">
                    Nenhum pedido encontrado para este celular.
                  </p>
                </div>
              ) : (
                <AnimatePresence>
                  <div className="space-y-3">
                    {pedidosOrdenados.map((pedido) => {
                      const ativo = STATUS_ATIVOS.has(pedido.status);
                      return (
                        <motion.div
                          key={pedido.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`bg-white dark:bg-[#181a1b] rounded-2xl border overflow-hidden ${
                            ativo
                              ? "border-[#ff5722]/50 shadow-sm shadow-[#ff5722]/10"
                              : "border-gray-200 dark:border-[#2a2c30]"
                          }`}
                        >
                          <div className="p-4 border-b border-gray-100 dark:border-[#2a2c30]">
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <span className="font-black text-gray-900 dark:text-white">
                                Pedido #{pedido.sequencia_pedido}
                              </span>
                              <span
                                className={`text-xs font-bold px-2 py-0.5 rounded-full ${obterClasseStatus(pedido.status)}`}
                              >
                                {STATUS_PEDIDO_CLIENTE[pedido.status] ||
                                  pedido.status}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500">
                              {formatarDataHora(pedido.criado_em)} ·{" "}
                              {pedido.identificador}
                            </p>
                            <p className="text-lg font-black text-[#ff5722] mt-2">
                              {formatarMoeda(Number(pedido.total || 0))}
                            </p>
                            {Number(pedido.desconto_aplicado || 0) > 0 && (
                              <p className="text-xs text-green-600 font-medium mt-1">
                                Desconto:{" "}
                                {formatarMoeda(pedido.desconto_aplicado)}
                              </p>
                            )}
                          </div>
                          <ul className="p-4 space-y-2">
                            {pedido.itens.map((item, idx) => (
                              <li
                                key={idx}
                                className="text-sm text-gray-800 dark:text-gray-200"
                              >
                                <span className="font-bold">
                                  {item.quantidade}x
                                </span>{" "}
                                {item.nome}
                                {item.observacoes && (
                                  <p className="text-xs text-gray-500 mt-0.5">
                                    Obs: {item.observacoes}
                                  </p>
                                )}
                              </li>
                            ))}
                          </ul>
                        </motion.div>
                      );
                    })}
                  </div>
                </AnimatePresence>
              )}
            </section>
          </>
        )}
      </div>
    </motion.div>
  );
}
