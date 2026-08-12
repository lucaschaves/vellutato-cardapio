import {
  ChevronDown,
  ChevronUp,
  FileDown,
  GripVertical,
  Loader2,
  Printer,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AdminPageShell } from "../../components/AdminPageShell";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Switch } from "../../components/ui/switch";
import { MARCADOR_QR } from "../../lib/comandaImpressao";
import {
  buscarConfigImpressao,
  CAMPO_LABEL,
  CAMPOS_IDS,
  configPadrao,
  criarBloco,
  ESTILO_LABEL,
  salvarConfigImpressao,
  TIPO_BLOCO_LABEL,
  type BlocoImpressao,
  type CampoImpressaoId,
  type EstiloBloco,
  type ImpressaoConfig,
  type TipoBloco,
  type ViaImpressaoConfig,
} from "../../lib/impressaoConfig";
import { gerarComandaPdf, preVisualizarComanda } from "../../lib/impressoraLocal";

const PEDIDO_EXEMPLO = {
  id: "exemplo-0001",
  sequencia_pedido: 42,
  origem: "delivery",
  modalidade: "entrega",
  status_pagamento: "pago",
  identificador: "Delivery",
  cliente_nome: "Maria Silva",
  cliente_celular: "(11) 99999-8888",
  criado_em: new Date().toISOString(),
  /** Exemplo agendado — aparece como faixa “AGENDADO ENTREGA HH:MM” no cupom */
  agendado_para: new Date(
    Date.now() + 2 * 60 * 60 * 1000,
  ).toISOString(),
  total: 86.5,
  desconto_aplicado: 5,
  taxa_entrega: 8,
  endereco_json: {
    cep: "01234-567",
    rua: "Rua das Flores",
    numero: "123",
    bairro: "Jardim Primavera",
    cidade: "São Paulo",
    uf: "SP",
    complemento: "Apto 42, Bloco B",
    referencia: "Portão azul, ao lado da padaria",
  },
  pedido_itens: [
    {
      quantidade: 2,
      observacoes: "Sem nozes",
      preco_unitario: 18,
      modo_consumo: "levar",
      produtos: { nome: "Cookie Duplo Chocolate" },
      pedido_item_adicionais: [
        { preco_aplicado: 3, adicionais: { nome: "Extra Nutella" } },
      ],
      pedido_item_combo_escolhas: [],
    },
    {
      quantidade: 1,
      observacoes: null,
      preco_unitario: 22,
      modo_consumo: "loja",
      produtos: { nome: "Brownie Recheado" },
      pedido_item_adicionais: [],
      pedido_item_combo_escolhas: [
        { nome_grupo: "Cobertura", nome_produto: "Doce de Leite", delta_preco: 2 },
      ],
    },
  ],
};

const CLASSE_SELECT =
  "h-8 rounded-md border border-gray-200 bg-white px-2 text-xs dark:border-gray-700 dark:bg-gray-900/50";

function SelectCampo({
  value,
  onChange,
}: {
  value: CampoImpressaoId | undefined;
  onChange: (v: CampoImpressaoId) => void;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value as CampoImpressaoId)}
      className={CLASSE_SELECT}
    >
      {CAMPOS_IDS.map((id) => (
        <option key={id} value={id}>
          {CAMPO_LABEL[id]}
        </option>
      ))}
    </select>
  );
}

function SelectEstilo({
  value,
  onChange,
}: {
  value: EstiloBloco;
  onChange: (v: EstiloBloco) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as EstiloBloco)}
      className={CLASSE_SELECT}
    >
      {(Object.keys(ESTILO_LABEL) as EstiloBloco[]).map((e) => (
        <option key={e} value={e}>
          {ESTILO_LABEL[e]}
        </option>
      ))}
    </select>
  );
}

function EditorBlocos({
  blocos,
  onChange,
  permitirGrupo = true,
}: {
  blocos: BlocoImpressao[];
  onChange: (blocos: BlocoImpressao[]) => void;
  permitirGrupo?: boolean;
}) {
  const [arrasto, setArrasto] = useState<number | null>(null);

  const add = (tipo: TipoBloco) => onChange([...blocos, criarBloco(tipo)]);
  const upd = (i: number, patch: Partial<BlocoImpressao>) =>
    onChange(blocos.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  const rem = (i: number) => onChange(blocos.filter((_, idx) => idx !== i));
  const mov = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= blocos.length) return;
    const cp = [...blocos];
    [cp[i], cp[j]] = [cp[j], cp[i]];
    onChange(cp);
  };
  const reord = (de: number, para: number) => {
    if (de === para) return;
    const cp = [...blocos];
    const [it] = cp.splice(de, 1);
    cp.splice(para, 0, it);
    onChange(cp);
  };

  const tiposAdd: TipoBloco[] = [
    "campo",
    "colunas",
    "texto",
    "separador",
    "espaco",
    ...(permitirGrupo ? (["grupo"] as TipoBloco[]) : []),
  ];

  return (
    <div className="space-y-1.5">
      {blocos.map((b, i) => (
        <div
          key={b.id}
          draggable
          onDragStart={() => setArrasto(i)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (arrasto != null && arrasto !== i) reord(arrasto, i);
            setArrasto(null);
          }}
          className={`rounded-lg border ${
            b.ativo
              ? "border-gray-200 dark:border-gray-700 bg-white dark:bg-surface-dark"
              : "border-dashed border-gray-200 dark:border-gray-800 bg-gray-50/60 dark:bg-[#141210] opacity-70"
          }`}
        >
          <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5">
            <GripVertical
              size={15}
              className="shrink-0 cursor-grab text-gray-400"
            />
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => mov(i, -1)}
                disabled={i === 0}
                className="text-gray-400 hover:text-gray-700 disabled:opacity-30"
                aria-label="Mover para cima"
              >
                <ChevronUp size={13} />
              </button>
              <button
                type="button"
                onClick={() => mov(i, 1)}
                disabled={i === blocos.length - 1}
                className="text-gray-400 hover:text-gray-700 disabled:opacity-30"
                aria-label="Mover para baixo"
              >
                <ChevronDown size={13} />
              </button>
            </div>

            <span className="rounded bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-500 shrink-0">
              {TIPO_BLOCO_LABEL[b.tipo]}
            </span>

            {/* Controles por tipo */}
            {b.tipo === "campo" && (
              <>
                <SelectCampo
                  value={b.campo}
                  onChange={(campo) => upd(i, { campo })}
                />
                <SelectEstilo
                  value={b.estilo}
                  onChange={(estilo) => upd(i, { estilo })}
                />
              </>
            )}
            {b.tipo === "colunas" && (
              <>
                <SelectCampo
                  value={b.esquerda}
                  onChange={(esquerda) => upd(i, { esquerda })}
                />
                <span className="text-xs text-gray-400">|</span>
                <SelectCampo
                  value={b.direita}
                  onChange={(direita) => upd(i, { direita })}
                />
                <SelectEstilo
                  value={b.estilo}
                  onChange={(estilo) => upd(i, { estilo })}
                />
              </>
            )}
            {b.tipo === "texto" && (
              <>
                <Input
                  value={b.texto ?? ""}
                  onChange={(e) => upd(i, { texto: e.target.value })}
                  className="h-8 flex-1 min-w-32 text-xs"
                  placeholder="Texto livre"
                />
                <SelectEstilo
                  value={b.estilo}
                  onChange={(estilo) => upd(i, { estilo })}
                />
              </>
            )}
            {b.tipo === "separador" && (
              <Input
                value={b.separadorChar ?? ""}
                onChange={(e) =>
                  upd(i, { separadorChar: e.target.value.slice(0, 1) })
                }
                maxLength={1}
                className="h-8 w-16 text-center text-xs"
                placeholder="="
              />
            )}
            {b.tipo === "espaco" && (
              <span className="text-xs italic text-gray-400">
                linha em branco
              </span>
            )}
            {b.tipo === "grupo" && (
              <>
                <Input
                  value={b.titulo ?? ""}
                  onChange={(e) => upd(i, { titulo: e.target.value })}
                  className="h-8 flex-1 min-w-24 text-xs"
                  placeholder="Título do grupo"
                />
                <SelectEstilo
                  value={b.estilo}
                  onChange={(estilo) => upd(i, { estilo })}
                />
              </>
            )}

            <div className="ml-auto flex items-center gap-1.5">
              <Switch
                checked={b.ativo}
                onCheckedChange={(ativo) => upd(i, { ativo })}
              />
              <button
                type="button"
                onClick={() => rem(i)}
                className="text-gray-400 hover:text-red-500"
                aria-label="Remover"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>

          {b.tipo === "grupo" && (
            <div className="border-t border-gray-100 dark:border-gray-800 px-3 py-2 pl-6 space-y-2">
              <label className="flex items-center gap-2 text-xs text-gray-500">
                <Switch
                  checked={b.moldura ?? false}
                  onCheckedChange={(moldura) => upd(i, { moldura })}
                />
                Desenhar moldura em volta
              </label>
              <EditorBlocos
                blocos={b.filhos ?? []}
                onChange={(filhos) => upd(i, { filhos })}
                permitirGrupo={false}
              />
            </div>
          )}
        </div>
      ))}

      <div className="flex flex-wrap gap-1.5 pt-1">
        {tiposAdd.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => add(t)}
            className="rounded-md border border-dashed border-gray-300 dark:border-gray-700 px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:border-cookie-primary hover:text-cookie-primary"
          >
            + {TIPO_BLOCO_LABEL[t]}
          </button>
        ))}
      </div>
    </div>
  );
}

function PainelVia({
  titulo,
  via,
  onVia,
}: {
  titulo: string;
  via: ViaImpressaoConfig;
  onVia: (patch: Partial<ViaImpressaoConfig>) => void;
}) {
  return (
    <Card className="bg-white dark:bg-surface-dark border-gray-200 dark:border-gray-800">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <Printer size={18} /> {titulo}
          </CardTitle>
          <Switch
            checked={via.ativa}
            onCheckedChange={(ativa) => onVia({ ativa })}
          />
        </div>
        <CardDescription>
          {via.ativa ? "Via ativa" : "Via desativada (não imprime)"}
        </CardDescription>
      </CardHeader>

      {via.ativa && (
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs font-semibold text-gray-500">
                Título da via
              </span>
              <Input
                value={via.titulo}
                onChange={(e) => onVia({ titulo: e.target.value })}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold text-gray-500">Cópias</span>
              <Input
                type="number"
                min={1}
                max={5}
                value={via.copias}
                onChange={(e) =>
                  onVia({
                    copias: Math.min(Math.max(Number(e.target.value) || 1, 1), 5),
                  })
                }
              />
            </label>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-gray-500">
              Blocos (arraste para reordenar)
            </p>
            <EditorBlocos
              blocos={via.blocos}
              onChange={(blocos) => onVia({ blocos })}
            />
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export function GerenciamentoImpressao() {
  const [config, setConfig] = useState<ImpressaoConfig>(configPadrao);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        setCarregando(true);
        const cfg = await buscarConfigImpressao();
        setConfig(cfg);
      } catch (erro: unknown) {
        const msg = erro instanceof Error ? erro.message : String(erro);
        console.error("[IMPRESSÃO CONFIG]", msg);
        toast.error("Falha ao carregar a configuração de impressão.");
      } finally {
        setCarregando(false);
      }
    })();
  }, []);

  const preview = useMemo(() => {
    try {
      return preVisualizarComanda(PEDIDO_EXEMPLO, config);
    } catch {
      return null;
    }
  }, [config]);

  const setLoja = (patch: Partial<ImpressaoConfig["loja"]>) =>
    setConfig((c) => ({ ...c, loja: { ...c.loja, ...patch } }));

  const setFormatacao = (patch: Partial<ImpressaoConfig["formatacao"]>) =>
    setConfig((c) => ({ ...c, formatacao: { ...c.formatacao, ...patch } }));

  const setVia = (
    tipo: "via_cozinha" | "via_cliente",
    patch: Partial<ViaImpressaoConfig>,
  ) => setConfig((c) => ({ ...c, [tipo]: { ...c[tipo], ...patch } }));

  const salvar = async () => {
    try {
      setSalvando(true);
      await salvarConfigImpressao(config);
      toast.success("Configuração de impressão salva.");
    } catch (erro: unknown) {
      const msg = erro instanceof Error ? erro.message : String(erro);
      toast.error(`Falha ao salvar: ${msg}`);
    } finally {
      setSalvando(false);
    }
  };

  const restaurarPadrao = () => {
    setConfig(configPadrao());
    toast.message("Padrão restaurado (lembre de salvar).");
  };

  const baixarPdf = async () => {
    try {
      await gerarComandaPdf(PEDIDO_EXEMPLO, config);
    } catch (erro: unknown) {
      const msg = erro instanceof Error ? erro.message : String(erro);
      toast.error(`Falha ao gerar PDF: ${msg}`);
    }
  };

  return (
    <AdminPageShell
      title={
        <h1 className="flex items-center gap-2">
          <Printer size={26} className="text-cookie-primary" />
          Cupom de impressão
        </h1>
      }
      description="Monte cada via com blocos: campos, colunas, textos, separadores, grupos e faixa invertida."
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={restaurarPadrao}
            disabled={salvando}
          >
            <RotateCcw size={16} className="mr-1.5" /> Restaurar padrão
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void baixarPdf()}
          >
            <FileDown size={16} className="mr-1.5" /> Baixar PDF de exemplo
          </Button>
          <Button type="button" onClick={() => void salvar()} disabled={salvando}>
            {salvando ? (
              <Loader2 size={16} className="mr-1.5 animate-spin" />
            ) : (
              <Save size={16} className="mr-1.5" />
            )}
            Salvar
          </Button>
        </>
      }
      scroll={false}
      contentClassName="min-h-0"
    >
      {carregando ? (
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-cookie-primary" size={40} />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 h-full min-h-0">
          {/* Coluna de controles (scroll próprio) */}
          <div className="space-y-4 min-h-0 overflow-y-auto pr-1">
            <Card className="bg-white dark:bg-surface-dark border-gray-200 dark:border-gray-800">
              <CardHeader>
                <CardTitle>Dados da loja</CardTitle>
                <CardDescription>
                  Usados nos campos de topo, rodapé e extras.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-gray-500">
                    Nome (topo)
                  </span>
                  <Input
                    value={config.loja.nome}
                    onChange={(e) => setLoja({ nome: e.target.value })}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-gray-500">
                    CNPJ
                  </span>
                  <Input
                    value={config.loja.cnpj}
                    onChange={(e) => setLoja({ cnpj: e.target.value })}
                  />
                </label>
                <label className="space-y-1 sm:col-span-2">
                  <span className="text-xs font-semibold text-gray-500">
                    Endereço
                  </span>
                  <Input
                    value={config.loja.endereco}
                    onChange={(e) => setLoja({ endereco: e.target.value })}
                    placeholder="Rua, 123 — Bairro, Cidade/UF, 88000-000"
                  />
                  <p className="text-[11px] text-zinc-500">
                    Inclua o CEP. Em retirada com Pix/cartão, o Asaas usa este
                    endereço da loja quando o cliente não informou o dele.
                  </p>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-gray-500">
                    Instagram / redes
                  </span>
                  <Input
                    value={config.loja.instagram}
                    onChange={(e) => setLoja({ instagram: e.target.value })}
                    placeholder="@vellutato"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-gray-500">
                    Wi-Fi
                  </span>
                  <Input
                    value={config.loja.wifi}
                    onChange={(e) => setLoja({ wifi: e.target.value })}
                  />
                </label>
                <label className="space-y-1 sm:col-span-2">
                  <span className="text-xs font-semibold text-gray-500">
                    Mensagem de agradecimento
                  </span>
                  <Input
                    value={config.loja.agradecimento}
                    onChange={(e) => setLoja({ agradecimento: e.target.value })}
                  />
                </label>
                <label className="space-y-1 sm:col-span-2">
                  <span className="text-xs font-semibold text-gray-500">
                    Base de URL do QR do pedido (opcional)
                  </span>
                  <Input
                    value={config.loja.qrUrlBase}
                    onChange={(e) => setLoja({ qrUrlBase: e.target.value })}
                    placeholder="https://sualoja.com/pedido/"
                  />
                </label>
              </CardContent>
            </Card>

            <Card className="bg-white dark:bg-surface-dark border-gray-200 dark:border-gray-800">
              <CardHeader>
                <CardTitle>Formatação</CardTitle>
                <CardDescription>Aparência geral da comanda.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-gray-500">
                      Largura da bobina
                    </span>
                    <select
                      value={config.formatacao.colunas}
                      onChange={(e) =>
                        setFormatacao({ colunas: Number(e.target.value) })
                      }
                      className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900/50"
                    >
                      <option value={48}>80mm (48 colunas)</option>
                      <option value={32}>58mm (32 colunas)</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-gray-500">
                      Separador padrão
                    </span>
                    <select
                      value={config.formatacao.separador}
                      onChange={(e) =>
                        setFormatacao({
                          separador: e.target
                            .value as ImpressaoConfig["formatacao"]["separador"],
                        })
                      }
                      className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900/50"
                    >
                      <option value="=">Igual (=)</option>
                      <option value="-">Traço (-)</option>
                      <option value="*">Asterisco (*)</option>
                      <option value=".">Ponto (.)</option>
                    </select>
                  </label>
                </div>

                <label className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 dark:bg-[#1a1815] px-3 py-2">
                  <span className="text-sm font-medium">
                    Títulos em CAIXA ALTA
                  </span>
                  <Switch
                    checked={config.formatacao.caixaAltaTitulos}
                    onCheckedChange={(caixaAltaTitulos) =>
                      setFormatacao({ caixaAltaTitulos })
                    }
                  />
                </label>
                <label className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 dark:bg-[#1a1815] px-3 py-2">
                  <span className="text-sm font-medium">
                    Linha pontilhada entre itens
                  </span>
                  <Switch
                    checked={config.formatacao.linhaEntreItens}
                    onCheckedChange={(linhaEntreItens) =>
                      setFormatacao({ linhaEntreItens })
                    }
                  />
                </label>
                <label className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 dark:bg-[#1a1815] px-3 py-2">
                  <span className="text-sm font-medium">
                    Mostrar preço por item
                  </span>
                  <Switch
                    checked={config.formatacao.precoPorItem}
                    onCheckedChange={(precoPorItem) =>
                      setFormatacao({ precoPorItem })
                    }
                  />
                </label>
              </CardContent>
            </Card>

            <PainelVia
              titulo="Via da cozinha"
              via={config.via_cozinha}
              onVia={(patch) => setVia("via_cozinha", patch)}
            />
            <PainelVia
              titulo="Via do cliente"
              via={config.via_cliente}
              onVia={(patch) => setVia("via_cliente", patch)}
            />
          </div>

          {/* Coluna de preview (scroll próprio) */}
          <div className="min-h-0 overflow-y-auto">
            <Card className="bg-white dark:bg-surface-dark border-gray-200 dark:border-gray-800">
              <CardHeader>
                <CardTitle>Pré-visualização</CardTitle>
                <CardDescription>
                  Pedido de exemplo na largura real da bobina (
                  {preview?.impressora.colunas === 32 ? "58mm" : "80mm"}) —
                  atualiza conforme você edita.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!preview || preview.vias.length === 0 ? (
                  <p className="text-sm text-gray-500 py-6 text-center">
                    Nenhuma via ativa. Ative a via da cozinha e/ou do cliente.
                  </p>
                ) : (
                  <div className="flex flex-wrap justify-center gap-6 overflow-x-auto">
                    {preview.vias.map((via) => (
                      <div
                        key={via.tipo}
                        style={{
                          width: `${preview.impressora.colunas}ch`,
                          fontSize: "11px",
                        }}
                        className="max-w-full shrink-0"
                      >
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
                            {via.titulo}
                          </span>
                          {via.copias > 1 && (
                            <span className="rounded-full bg-gray-100 dark:bg-gray-800 px-2 text-[11px] font-semibold text-gray-500">
                              {via.copias} cópias
                            </span>
                          )}
                        </div>
                        {/* Papel: largura real da bobina (colunas em ch). */}
                        <div className="rounded-sm border border-gray-300 bg-white py-3 font-mono leading-tight text-black shadow-md">
                          {via.linhasRender.map((l, idx) => {
                            const t =
                              l.texto === MARCADOR_QR
                                ? "[QR do pedido]"
                                : l.texto;
                            if (l.estilo === "invertido") {
                              if (l.colunas) {
                                return (
                                  <div
                                    key={idx}
                                    className="flex justify-between gap-2 bg-black px-1 font-bold text-[13px] leading-snug text-white"
                                  >
                                    <span>{l.colunas.esquerda}</span>
                                    <span>{l.colunas.direita}</span>
                                  </div>
                                );
                              }
                              return (
                                <div
                                  key={idx}
                                  className="bg-black text-center font-bold text-[13px] leading-snug text-white"
                                >
                                  {t.trim().length > 0 ? t.trim() : " "}
                                </div>
                              );
                            }
                            return (
                              <div key={idx} className="whitespace-pre">
                                {t.length > 0 ? t : "\u00a0"}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </AdminPageShell>
  );
}
