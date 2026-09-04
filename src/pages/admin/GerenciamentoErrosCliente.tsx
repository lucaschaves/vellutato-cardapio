import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { Fragment, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminPageShell } from "../../components/AdminPageShell";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { CANAL_LABEL, type CanalAnalytics } from "../../lib/analytics";
import {
  listarErrosCliente,
  marcarErroClienteResolvido,
  type ErroClienteRow,
} from "../../lib/errosCliente";
import { cn } from "../../lib/utils";

type FiltroStatus = "aberto" | "resolvido" | "todos";
type FiltroCanal = CanalAnalytics | "todos";
type FiltroPeriodo = "hoje" | "7d" | "30d" | "todos";

function inicioPeriodo(p: FiltroPeriodo): string | null {
  if (p === "todos") return null;
  const d = new Date();
  if (p === "hoje") {
    d.setHours(0, 0, 0, 0);
  } else if (p === "7d") {
    d.setDate(d.getDate() - 7);
  } else {
    d.setDate(d.getDate() - 30);
  }
  return d.toISOString();
}

function formatarData(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function trecho(msg: string, max = 90) {
  const t = msg.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

export function GerenciamentoErrosCliente() {
  const [erros, setErros] = useState<ErroClienteRow[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [status, setStatus] = useState<FiltroStatus>("aberto");
  const [canal, setCanal] = useState<FiltroCanal>("todos");
  const [periodo, setPeriodo] = useState<FiltroPeriodo>("7d");
  const [expandido, setExpandido] = useState<string | null>(null);
  const [resolvendo, setResolvendo] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const rows = await listarErrosCliente({
        status,
        canal,
        desde: inicioPeriodo(periodo),
        limite: 150,
      });
      setErros(rows);
    } catch (e: unknown) {
      toast.error(
        e instanceof Error ? e.message : "Falha ao carregar erros dos clientes.",
      );
    } finally {
      setCarregando(false);
    }
  }, [status, canal, periodo]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const marcarResolvido = async (id: string) => {
    setResolvendo(id);
    try {
      await marcarErroClienteResolvido(id);
      toast.success("Erro marcado como resolvido.");
      setExpandido(null);
      await carregar();
    } catch (e: unknown) {
      toast.error(
        e instanceof Error ? e.message : "Não foi possível atualizar o status.",
      );
    } finally {
      setResolvendo(null);
    }
  };

  return (
    <AdminPageShell
      title="Erros dos clientes"
      description="Falhas técnicas no delivery, totem e cardápio. O cliente vê mensagem genérica; o detalhe fica aqui."
      actions={
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void carregar()}
          disabled={carregando}
        >
          <RefreshCw
            className={cn("h-4 w-4 mr-1.5", carregando && "animate-spin")}
          />
          Atualizar
        </Button>
      }
    >
      <div className="flex flex-wrap gap-2 mb-4">
        {(
          [
            ["aberto", "Abertos"],
            ["resolvido", "Resolvidos"],
            ["todos", "Todos"],
          ] as const
        ).map(([v, label]) => (
          <Button
            key={v}
            type="button"
            size="sm"
            variant={status === v ? "default" : "outline"}
            onClick={() => setStatus(v)}
          >
            {label}
          </Button>
        ))}
        <span className="w-px bg-border mx-1 hidden sm:block" />
        {(
          [
            ["todos", "Canais"],
            ["delivery", "Delivery"],
            ["totem", "Totem"],
            ["mesa", "Mesa"],
            ["balcao", "Balcão"],
          ] as const
        ).map(([v, label]) => (
          <Button
            key={v}
            type="button"
            size="sm"
            variant={canal === v ? "default" : "outline"}
            onClick={() => setCanal(v)}
          >
            {label}
          </Button>
        ))}
        <span className="w-px bg-border mx-1 hidden sm:block" />
        {(
          [
            ["hoje", "Hoje"],
            ["7d", "7 dias"],
            ["30d", "30 dias"],
            ["todos", "Período"],
          ] as const
        ).map(([v, label]) => (
          <Button
            key={v}
            type="button"
            size="sm"
            variant={periodo === v ? "default" : "outline"}
            onClick={() => setPeriodo(v)}
          >
            {label}
          </Button>
        ))}
      </div>

      {carregando ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : erros.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <AlertTriangle className="h-10 w-10 opacity-30" />
          <p className="text-sm font-medium">Nenhum erro neste filtro.</p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">Quando</TableHead>
                <TableHead className="w-[90px]">Canal</TableHead>
                <TableHead className="w-[120px]">Ação</TableHead>
                <TableHead>Erro</TableHead>
                <TableHead className="w-[100px]">Status</TableHead>
                <TableHead className="w-[120px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {erros.map((e) => {
                const aberto = expandido === e.id;
                return (
                  <Fragment key={e.id}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() =>
                        setExpandido((id) => (id === e.id ? null : e.id))
                      }
                    >
                      <TableCell className="text-xs whitespace-nowrap">
                        {formatarData(e.criado_em)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px]">
                          {CANAL_LABEL[e.canal] || e.canal}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {e.acao}
                      </TableCell>
                      <TableCell className="text-sm">
                        {trecho(e.mensagem_tecnica)}
                        {e.codigo ? (
                          <span className="ml-2 text-[10px] text-muted-foreground font-mono">
                            {e.codigo}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            e.status === "aberto" ? "destructive" : "outline"
                          }
                          className="text-[10px]"
                        >
                          {e.status === "aberto" ? "Aberto" : "Resolvido"}
                        </Badge>
                      </TableCell>
                      <TableCell onClick={(ev) => ev.stopPropagation()}>
                        {e.status === "aberto" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={resolvendo === e.id}
                            onClick={() => void marcarResolvido(e.id)}
                          >
                            {resolvendo === e.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <>
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                Resolver
                              </>
                            )}
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                    {aberto ? (
                      <TableRow>
                        <TableCell colSpan={6} className="bg-muted/40">
                          <div className="space-y-2 py-2 text-xs">
                            <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed max-h-48 overflow-y-auto rounded-lg bg-background border p-3">
                              {e.mensagem_tecnica}
                            </pre>
                            <div className="grid gap-1 sm:grid-cols-2 text-muted-foreground">
                              <p>
                                <span className="font-semibold text-foreground">
                                  URL:{" "}
                                </span>
                                {e.url || "—"}
                              </p>
                              <p>
                                <span className="font-semibold text-foreground">
                                  Sessão:{" "}
                                </span>
                                {e.sessao_id || "—"}
                              </p>
                              <p>
                                <span className="font-semibold text-foreground">
                                  Cliente:{" "}
                                </span>
                                {e.cliente_id || "—"}
                              </p>
                              {e.resolvido_em ? (
                                <p>
                                  <span className="font-semibold text-foreground">
                                    Resolvido em:{" "}
                                  </span>
                                  {formatarData(e.resolvido_em)}
                                </p>
                              ) : null}
                            </div>
                            {e.props && Object.keys(e.props).length > 0 ? (
                              <pre className="whitespace-pre-wrap break-words font-mono text-[11px] rounded-lg bg-background border p-3">
                                {JSON.stringify(e.props, null, 2)}
                              </pre>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </AdminPageShell>
  );
}
