import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Loader2,
  MessageCircle,
  Save,
  Trash2,
  User,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { AdminPageShell } from "../../components/AdminPageShell";
import { ModalConfirmacao } from "../../components/ModalConfirmacao";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Switch } from "../../components/ui/switch";
import { obterOuCriarConversa } from "../../lib/deliveryChat";
import { cpfValido, formatarCpf } from "../../lib/deliveryCliente";
import { montarLinkWhatsapp } from "../../lib/mensagensWhatsapp";
import {
  formatarDataHora,
  formatarMoeda,
  obterClasseStatus,
  obterValorPedido,
  STATUS_PEDIDO_LABEL,
} from "../../lib/pedidosAdmin";
import {
  formatarTelefoneBr,
  formatarTelefoneDeSalvo,
  mensagemTelefoneInvalido,
  normalizarTelefoneParaSalvar,
} from "../../lib/telefone";
import { supabase } from "../../lib/supabase";

interface ClienteDetalhe {
  id: string;
  nome: string;
  celular: string;
  email: string | null;
  cpf: string | null;
  eh_teste: boolean;
  total_pedidos: number | null;
  valor_gasto: number | null;
  ultimo_pedido: string | null;
  created_at: string | null;
}

interface FormCliente {
  nome: string;
  celular: string;
  email: string;
  cpf: string;
}

interface ItemPedidoCliente {
  id: string;
  quantidade: number;
  preco_unitario: number;
  observacoes: string | null;
  produtos: { nome: string } | null;
}

interface PedidoCliente {
  id: string;
  sequencia_pedido: number;
  status: string;
  total: number | null;
  valor_total: number | null;
  desconto_aplicado: number | null;
  identificador: string;
  criado_em: string;
  cupons: { codigo: string } | null;
  pedido_itens: ItemPedidoCliente[];
}

function formDeCliente(cliente: ClienteDetalhe): FormCliente {
  return {
    nome: cliente.nome || "",
    celular: formatarTelefoneDeSalvo(cliente.celular),
    email: cliente.email || "",
    cpf: cliente.cpf ? formatarCpf(cliente.cpf) : "",
  };
}

export function DetalheCliente() {
  const navigate = useNavigate();
  const { clienteId } = useParams<{ clienteId: string }>();
  const [cliente, setCliente] = useState<ClienteDetalhe | null>(null);
  const [form, setForm] = useState<FormCliente>({
    nome: "",
    celular: "",
    email: "",
    cpf: "",
  });
  const [pedidos, setPedidos] = useState<PedidoCliente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [expandidoId, setExpandidoId] = useState<string | null>(null);
  const [abrindoChat, setAbrindoChat] = useState(false);
  const [salvandoTeste, setSalvandoTeste] = useState(false);
  const [salvandoDados, setSalvandoDados] = useState(false);
  const [confirmandoExcluir, setConfirmandoExcluir] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  const abrirChat = async () => {
    if (!clienteId || abrindoChat) return;
    setAbrindoChat(true);
    try {
      const conversaId = await obterOuCriarConversa({ clienteId });
      navigate(`/admin/chat?conversa=${conversaId}`);
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error("[CHAT] Abrir conversa do cliente:", mensagem);
      toast.error("Não foi possível abrir o chat deste cliente.");
    } finally {
      setAbrindoChat(false);
    }
  };

  const carregar = useCallback(async () => {
    if (!clienteId) return;

    try {
      setCarregando(true);

      const { data: dataCliente, error: erroCliente } = await supabase
        .from("clientes")
        .select("*")
        .eq("id", clienteId)
        .single();

      if (erroCliente) throw erroCliente;

      const { data: dataPedidos, error: erroPedidos } = await supabase
        .from("pedidos")
        .select(
          `
          id, sequencia_pedido, status, total, valor_total, desconto_aplicado,
          identificador, criado_em,
          cupons!cupom_id ( codigo ),
          pedido_itens (
            id, quantidade, preco_unitario, observacoes,
            produtos ( nome )
          )
        `,
        )
        .eq("cliente_id", clienteId)
        .order("criado_em", { ascending: false })
        .limit(50);

      if (erroPedidos) throw erroPedidos;

      const row = dataCliente as ClienteDetalhe & {
        eh_teste?: boolean | null;
        email?: string | null;
        cpf?: string | null;
      };
      const detalhe: ClienteDetalhe = {
        ...row,
        email: row.email ?? null,
        cpf: row.cpf ?? null,
        eh_teste: Boolean(row.eh_teste),
      };
      setCliente(detalhe);
      setForm(formDeCliente(detalhe));
      setPedidos((dataPedidos as unknown as PedidoCliente[]) || []);
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error("[ERRO - DETALHE CLIENTE]", mensagem);
      toast.error("Falha ao carregar dados do cliente.");
    } finally {
      setCarregando(false);
    }
  }, [clienteId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const formInicial = useMemo(
    () => (cliente ? formDeCliente(cliente) : null),
    [cliente],
  );

  const formAlterado = useMemo(() => {
    if (!formInicial) return false;
    return (
      form.nome.trim() !== formInicial.nome.trim() ||
      normalizarTelefoneParaSalvar(form.celular) !==
        normalizarTelefoneParaSalvar(formInicial.celular) ||
      form.email.trim() !== formInicial.email.trim() ||
      form.cpf.replace(/\D/g, "") !== formInicial.cpf.replace(/\D/g, "")
    );
  }, [form, formInicial]);

  const temPedidos = pedidos.length > 0 || Number(cliente?.total_pedidos || 0) > 0;

  const excluirCliente = async () => {
    if (!cliente || excluindo) return;

    setExcluindo(true);
    try {
      const { count, error: erroCount } = await supabase
        .from("pedidos")
        .select("id", { count: "exact", head: true })
        .eq("cliente_id", cliente.id);

      if (erroCount) throw erroCount;

      if ((count ?? 0) > 0) {
        toast.error(
          "Não é possível excluir: este cliente já possui pedidos vinculados.",
        );
        setConfirmandoExcluir(false);
        return;
      }

      // Cupons exclusivos apontando para o cliente (libera o FK).
      await supabase
        .from("cupons")
        .update({ cliente_id: null })
        .eq("cliente_id", cliente.id);

      const { error } = await supabase
        .from("clientes")
        .delete()
        .eq("id", cliente.id);

      if (error) throw error;

      toast.success("Cliente excluído.");
      navigate("/admin/clientes");
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error("[ERRO - EXCLUIR CLIENTE]", mensagem);
      toast.error("Não foi possível excluir o cliente.");
      setConfirmandoExcluir(false);
    } finally {
      setExcluindo(false);
    }
  };

  const alternarClienteTeste = async (marcado: boolean) => {
    if (!cliente || salvandoTeste) return;
    const anterior = cliente.eh_teste;
    setCliente({ ...cliente, eh_teste: marcado });
    setSalvandoTeste(true);
    try {
      const { error } = await supabase
        .from("clientes")
        .update({ eh_teste: marcado })
        .eq("id", cliente.id);
      if (error) throw error;
      toast.success(
        marcado
          ? "Cliente marcado como teste — não entra nas métricas da Dashboard."
          : "Cliente removido da lista de teste.",
      );
    } catch (erro: unknown) {
      setCliente({ ...cliente, eh_teste: anterior });
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error("[ERRO - CLIENTE TESTE]", mensagem);
      toast.error("Não foi possível atualizar o cliente de teste.");
    } finally {
      setSalvandoTeste(false);
    }
  };

  const salvarDados = async () => {
    if (!cliente || salvandoDados) return;

    const nomeLimpo = form.nome.trim();
    if (!nomeLimpo) {
      toast.error("Informe o nome do cliente.");
      return;
    }

    const erroTel = mensagemTelefoneInvalido(form.celular);
    if (erroTel) {
      toast.error(erroTel);
      return;
    }

    const celularNormalizado = normalizarTelefoneParaSalvar(form.celular);
    const emailLimpo = form.email.trim() || null;
    const cpfDigitos = form.cpf.replace(/\D/g, "");

    if (cpfDigitos && !cpfValido(cpfDigitos)) {
      toast.error("CPF inválido.");
      return;
    }

    if (emailLimpo && !emailLimpo.includes("@")) {
      toast.error("E-mail inválido.");
      return;
    }

    setSalvandoDados(true);
    try {
      if (celularNormalizado !== cliente.celular) {
        const { data: conflito, error: erroConflito } = await supabase
          .from("clientes")
          .select("id, nome")
          .eq("celular", celularNormalizado)
          .neq("id", cliente.id)
          .maybeSingle();

        if (erroConflito) throw erroConflito;
        if (conflito) {
          toast.error(
            `Este celular já está cadastrado em outro cliente (${conflito.nome}).`,
          );
          return;
        }
      }

      const { data, error } = await supabase
        .from("clientes")
        .update({
          nome: nomeLimpo,
          celular: celularNormalizado,
          email: emailLimpo,
          cpf: cpfDigitos || null,
        })
        .eq("id", cliente.id)
        .select("*")
        .single();

      if (error) throw error;

      const row = data as ClienteDetalhe & { eh_teste?: boolean | null };
      const atualizado: ClienteDetalhe = {
        ...row,
        email: row.email ?? null,
        cpf: row.cpf ?? null,
        eh_teste: Boolean(row.eh_teste),
      };
      setCliente(atualizado);
      setForm(formDeCliente(atualizado));
      toast.success("Dados do cliente atualizados.");
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error("[ERRO - SALVAR CLIENTE]", mensagem);
      toast.error("Não foi possível salvar os dados do cliente.");
    } finally {
      setSalvandoDados(false);
    }
  };

  const linkWhatsapp = useMemo(() => {
    const celular = form.celular || cliente?.celular;
    if (!celular) return null;
    const nome = (form.nome || cliente?.nome || "cliente").trim();
    const primeiroNome = nome.split(/\s+/)[0] || "cliente";
    return montarLinkWhatsapp(
      celular,
      `Olá, ${primeiroNome}! Aqui é da Vellutato 😊`,
    );
  }, [cliente, form.celular, form.nome]);

  const abrirWhatsapp = () => {
    if (!linkWhatsapp) {
      toast.error("Este cliente não tem um celular válido para WhatsApp.");
      return;
    }
    window.open(linkWhatsapp, "_blank", "noopener,noreferrer");
  };

  if (carregando) {
    return (
      <AdminPageShell contentClassName="flex justify-center py-20">
        <Loader2 className="animate-spin text-cookie-primary" size={40} />
      </AdminPageShell>
    );
  }

  if (!cliente) {
    return (
      <AdminPageShell contentClassName="text-center py-20">
        <p className="text-gray-500 mb-4">Cliente não encontrado.</p>
        <Link
          to="/admin/clientes"
          className="text-cookie-primary font-semibold hover:underline"
        >
          Voltar para clientes
        </Link>
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell
      title={
        <h1 className="flex items-center gap-2 truncate">
          <User size={28} className="text-cookie-primary shrink-0" />
          {cliente.nome}
          {cliente.eh_teste && (
            <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200 border-0 shrink-0">
              Teste
            </Badge>
          )}
        </h1>
      }
      description={
        <>
          {formatarTelefoneDeSalvo(cliente.celular)}
          {cliente.created_at && (
            <>
              {" · "}Cliente desde{" "}
              {new Date(cliente.created_at).toLocaleDateString("pt-BR")}
            </>
          )}
        </>
      }
      actions={
        <>
          <Button
            type="button"
            onClick={() => void abrirChat()}
            disabled={abrindoChat}
            className="bg-cookie-primary hover:bg-cookie-primary-hover text-white"
          >
            {abrindoChat ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <MessageCircle size={16} />
            )}
            Chat com o cliente
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={abrirWhatsapp}
            disabled={!linkWhatsapp}
            className="border-[#25D366]/60 text-[#128C7E] hover:bg-[#25D366]/10 hover:text-[#075E54]"
            title={
              linkWhatsapp
                ? "Abrir conversa no WhatsApp"
                : "Cliente sem celular válido"
            }
          >
            <MessageCircle size={16} />
            WhatsApp
          </Button>
          <Link
            to="/admin/clientes"
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-cookie-primary transition-colors"
          >
            <ArrowLeft size={16} />
            Voltar para clientes
          </Link>
        </>
      }
      contentClassName="space-y-6"
    >
      <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-800 rounded-2xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              Dados do cliente
            </h2>
            <p className="text-sm text-gray-500">
              Ajuste nome, celular, e-mail ou CPF se o cliente informou algo
              errado.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              disabled={temPedidos || excluindo}
              title={
                temPedidos
                  ? "Não é possível excluir clientes com pedidos"
                  : "Excluir cliente"
              }
              onClick={() => setConfirmandoExcluir(true)}
              className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              <Trash2 size={16} />
              Excluir
            </Button>
            {formAlterado && (
              <Button
                type="button"
                variant="outline"
                disabled={salvandoDados}
                onClick={() => setForm(formDeCliente(cliente))}
              >
                Descartar
              </Button>
            )}
            <Button
              type="button"
              disabled={!formAlterado || salvandoDados}
              onClick={() => void salvarDados()}
              className="bg-cookie-primary hover:bg-cookie-primary-hover text-white"
            >
              {salvandoDados ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Save size={16} />
              )}
              Salvar alterações
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cliente-nome">Nome</Label>
            <Input
              id="cliente-nome"
              value={form.nome}
              onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
              placeholder="Nome completo"
              className="dark:bg-[#1a1815]"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cliente-celular">Celular</Label>
            <Input
              id="cliente-celular"
              value={form.celular}
              inputMode="tel"
              maxLength={15}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  celular: formatarTelefoneBr(e.target.value),
                }))
              }
              placeholder="(00) 00000-0000"
              className="dark:bg-[#1a1815]"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cliente-email">E-mail</Label>
            <Input
              id="cliente-email"
              type="email"
              value={form.email}
              onChange={(e) =>
                setForm((f) => ({ ...f, email: e.target.value }))
              }
              placeholder="opcional"
              className="dark:bg-[#1a1815]"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2 sm:max-w-xs">
            <Label htmlFor="cliente-cpf">CPF</Label>
            <Input
              id="cliente-cpf"
              value={form.cpf}
              inputMode="numeric"
              maxLength={14}
              onChange={(e) =>
                setForm((f) => ({ ...f, cpf: formatarCpf(e.target.value) }))
              }
              placeholder="000.000.000-00"
              className="dark:bg-[#1a1815]"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-amber-200/80 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-950/20 px-4 py-3">
          <div className="min-w-0">
            <Label
              htmlFor="cliente-eh-teste"
              className="text-sm font-semibold text-gray-900 dark:text-white"
            >
              Cliente de teste
            </Label>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
              Uso interno: vendas, cupons e demais métricas da Dashboard não
              contabilizam este cliente.
            </p>
          </div>
          <Switch
            id="cliente-eh-teste"
            checked={cliente.eh_teste}
            disabled={salvandoTeste}
            onCheckedChange={(marcado) => void alternarClienteTeste(marcado)}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl bg-gray-50 dark:bg-[#1a1815] p-4">
            <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">
              Pedidos
            </p>
            <p className="text-2xl font-black text-gray-900 dark:text-white mt-1">
              {cliente.total_pedidos || 0}
            </p>
          </div>
          <div className="rounded-xl bg-gray-50 dark:bg-[#1a1815] p-4">
            <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">
              Total gasto
            </p>
            <p className="text-2xl font-black text-cookie-accent mt-1">
              {formatarMoeda(cliente.valor_gasto)}
            </p>
          </div>
          <div className="rounded-xl bg-gray-50 dark:bg-[#1a1815] p-4">
            <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">
              Ticket médio
            </p>
            <p className="text-2xl font-black text-gray-900 dark:text-white mt-1">
              {cliente.total_pedidos && cliente.total_pedidos > 0
                ? formatarMoeda(
                    Number(cliente.valor_gasto || 0) / cliente.total_pedidos,
                  )
                : "—"}
            </p>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">
          Histórico de pedidos ({pedidos.length})
        </h2>

        {pedidos.length === 0 ? (
          <div className="text-center py-12 text-gray-500 bg-white dark:bg-surface-dark rounded-xl border border-dashed dark:border-gray-800">
            Nenhum pedido vinculado a este cliente.
          </div>
        ) : (
          <div className="space-y-3">
            {pedidos.map((pedido) => {
              const expandido = expandidoId === pedido.id;
              return (
                <div
                  key={pedido.id}
                  className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpandidoId(expandido ? null : pedido.id)
                    }
                    className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-bold text-gray-900 dark:text-white">
                          #{pedido.sequencia_pedido}
                        </span>
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-full ${obterClasseStatus(pedido.status)}`}
                        >
                          {STATUS_PEDIDO_LABEL[pedido.status] || pedido.status}
                        </span>
                        <Badge variant="outline">{pedido.identificador}</Badge>
                        {pedido.cupons && (
                          <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 border-0">
                            {pedido.cupons.codigo}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">
                        {formatarDataHora(pedido.criado_em)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-black text-cookie-accent">
                        {formatarMoeda(obterValorPedido(pedido))}
                      </span>
                      {expandido ? (
                        <ChevronUp size={18} className="text-gray-400" />
                      ) : (
                        <ChevronDown size={18} className="text-gray-400" />
                      )}
                    </div>
                  </button>

                  {expandido && (
                    <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-800 pt-3 space-y-2">
                      {Number(pedido.desconto_aplicado || 0) > 0 && (
                        <p className="text-xs text-green-600 font-medium">
                          Desconto: -{formatarMoeda(pedido.desconto_aplicado)}
                        </p>
                      )}
                      {pedido.pedido_itens.map((item) => (
                        <div
                          key={item.id}
                          className="flex justify-between text-sm bg-gray-50 dark:bg-[#1a1815] rounded-lg p-2"
                        >
                          <span>
                            {item.quantidade}x {item.produtos?.nome || "Item"}
                            {item.observacoes && (
                              <span className="block text-xs text-gray-500">
                                Obs: {item.observacoes}
                              </span>
                            )}
                          </span>
                          <span className="font-semibold shrink-0">
                            {formatarMoeda(
                              item.preco_unitario * item.quantidade,
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ModalConfirmacao
        aberto={confirmandoExcluir}
        titulo="Excluir cliente?"
        mensagem={`Excluir "${cliente.nome}"? Só é permitido se não houver pedidos. Esta ação não pode ser desfeita.`}
        textoConfirmar="Excluir"
        textoCancelar="Cancelar"
        carregando={excluindo}
        aoCancelar={() => {
          if (!excluindo) setConfirmandoExcluir(false);
        }}
        aoConfirmar={() => void excluirCliente()}
      />
    </AdminPageShell>
  );
}
