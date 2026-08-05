import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "../lib/supabase";

export type PedidoRealtimePayload = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Record<string, unknown>;
  old: Record<string, unknown>;
};

type PedidoRealtimeListener = (payload: PedidoRealtimePayload) => void;

type PedidosRealtimeContextValue = {
  status: "conectado" | "reconectando" | "desconectado";
  /** Incrementa a cada inscrição bem-sucedida; consumidores devem refazer consultas. */
  versaoConexao: number;
  assinar: (listener: PedidoRealtimeListener) => () => void;
  reconectar: () => void;
};

const PedidosRealtimeContext =
  createContext<PedidosRealtimeContextValue | null>(null);

const RECONEXAO_MAX_MS = 30_000;

/**
 * Um único canal de `pedidos` para todo o admin.
 * Recria o canal com backoff e distribui os eventos para KDS, impressão e som.
 */
export function PedidosRealtimeProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] =
    useState<PedidosRealtimeContextValue["status"]>("desconectado");
  const [versaoConexao, setVersaoConexao] = useState(0);
  const listenersRef = useRef(new Set<PedidoRealtimeListener>());
  const canalRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const timerRef = useRef<number | null>(null);
  const tentativaRef = useRef(0);
  const desmontadoRef = useRef(false);
  const statusRef =
    useRef<PedidosRealtimeContextValue["status"]>("desconectado");
  const iniciarRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const assinar = useCallback((listener: PedidoRealtimeListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const limparTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const agendarReconexao = useCallback(() => {
    if (desmontadoRef.current || timerRef.current != null) return;
    const atraso = Math.min(
      RECONEXAO_MAX_MS,
      2_000 * 2 ** tentativaRef.current,
    );
    tentativaRef.current += 1;
    setStatus("reconectando");
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      iniciarRef.current();
    }, atraso);
  }, []);

  const iniciar = useCallback(() => {
    if (desmontadoRef.current) return;
    limparTimer();

    const anterior = canalRef.current;
    canalRef.current = null;
    if (anterior) {
      void supabase.removeChannel(anterior);
    }

    const canal = supabase
      .channel("admin_pedidos_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedidos" },
        (payload) => {
          const evento = payload as unknown as PedidoRealtimePayload;
          for (const listener of listenersRef.current) {
            try {
              listener(evento);
            } catch (erro) {
              console.error("[REALTIME] Erro em consumidor de pedidos:", erro);
            }
          }
        },
      )
      .subscribe((novoStatus, erro) => {
        if (desmontadoRef.current || canalRef.current !== canal) return;

        if (novoStatus === "SUBSCRIBED") {
          tentativaRef.current = 0;
          setStatus("conectado");
          // Postgres Changes não reproduz eventos perdidos: força refetch.
          setVersaoConexao((v) => v + 1);
          return;
        }

        if (
          novoStatus === "CHANNEL_ERROR" ||
          novoStatus === "TIMED_OUT" ||
          novoStatus === "CLOSED"
        ) {
          setStatus("desconectado");
          console.warn(
            `[REALTIME] Canal de pedidos ${novoStatus}. Reconectando...`,
            erro,
          );
          agendarReconexao();
        }
      });

    canalRef.current = canal;
  }, [agendarReconexao, limparTimer]);

  iniciarRef.current = iniciar;

  const reconectar = useCallback(() => {
    tentativaRef.current = 0;
    setStatus("reconectando");
    iniciarRef.current();
  }, []);

  useEffect(() => {
    desmontadoRef.current = false;
    iniciarRef.current();

    const recuperarConexao = () => {
      if (!navigator.onLine) {
        setStatus("desconectado");
        return;
      }
      if (statusRef.current !== "conectado") {
        reconectar();
      }
    };

    window.addEventListener("online", recuperarConexao);
    window.addEventListener("focus", recuperarConexao);
    document.addEventListener("visibilitychange", recuperarConexao);

    const {
      data: { subscription: authSubscription },
    } = supabase.auth.onAuthStateChange((evento, sessao) => {
      if (
        (evento === "TOKEN_REFRESHED" || evento === "SIGNED_IN") &&
        sessao?.access_token
      ) {
        supabase.realtime.setAuth(sessao.access_token);
        if (statusRef.current !== "conectado") reconectar();
      }
    });

    return () => {
      desmontadoRef.current = true;
      limparTimer();
      window.removeEventListener("online", recuperarConexao);
      window.removeEventListener("focus", recuperarConexao);
      document.removeEventListener("visibilitychange", recuperarConexao);
      authSubscription.unsubscribe();
      const canal = canalRef.current;
      canalRef.current = null;
      if (canal) void supabase.removeChannel(canal);
    };
  }, [limparTimer, reconectar]);

  return (
    <PedidosRealtimeContext.Provider
      value={{ status, versaoConexao, assinar, reconectar }}
    >
      {children}
    </PedidosRealtimeContext.Provider>
  );
}

export function usePedidosRealtime() {
  const ctx = useContext(PedidosRealtimeContext);
  if (!ctx) {
    throw new Error(
      "usePedidosRealtime deve ser usado dentro de PedidosRealtimeProvider",
    );
  }
  return ctx;
}
