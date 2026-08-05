import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  criarUrlSilencioLoop,
  criarUrlSomImpressoraOffline,
  criarUrlSomNovoPedido,
} from "../lib/alertaPedidoSom";
import { usePedidosRealtime } from "../context/PedidosRealtimeContext";
import { supabase } from "../lib/supabase";

const STORAGE_KEY = "kds_alerta_sonoro_ativo";

function pagamentoLiberaAlerta(statusPagamento: string | null | undefined) {
  if (!statusPagamento || statusPagamento === "nao_aplicavel") return true;
  return statusPagamento === "pago" || statusPagamento === "na_loja";
}

function deveAlertarPedido(pedido: {
  status?: string;
  status_pagamento?: string | null;
}): boolean {
  if (pedido.status !== "pendente") return false;
  return pagamentoLiberaAlerta(pedido.status_pagamento);
}

export type UseAlertaNovoPedidoOpts = {
  /** Navega para o KDS (toast / notificação desktop). */
  onIrParaKds?: () => void;
};

/**
 * Alerta sonoro global no admin para pedidos novos.
 * O Chrome exige um clique para liberar autoplay; depois disso o som toca
 * em qualquer rota e com a aba em segundo plano.
 */
export function useAlertaNovoPedido(opts: UseAlertaNovoPedidoOpts = {}) {
  const { assinar, versaoConexao } = usePedidosRealtime();
  const onIrParaKdsRef = useRef(opts.onIrParaKds);
  onIrParaKdsRef.current = opts.onIrParaKds;

  const [ativo, setAtivo] = useState(false);
  const [precisaAtivar, setPrecisaAtivar] = useState(false);

  const alertaUrlRef = useRef<string | null>(null);
  const silencioUrlRef = useRef<string | null>(null);
  const impressoraUrlRef = useRef<string | null>(null);
  const audioAlertaRef = useRef<HTMLAudioElement | null>(null);
  const audioKeepaliveRef = useRef<HTMLAudioElement | null>(null);
  const alertadosRef = useRef<Set<string>>(new Set());
  const primeiraSincronizacaoRef = useRef(true);
  const sincronizacaoRef = useRef(0);
  const ativoRef = useRef(false);

  useEffect(() => {
    ativoRef.current = ativo;
  }, [ativo]);

  useEffect(() => {
    const querAtivo = localStorage.getItem(STORAGE_KEY) === "1";
    setPrecisaAtivar(querAtivo);
    // Após F5 o autoplay volta a bloquear — exige novo clique.
    setAtivo(false);

    return () => {
      audioKeepaliveRef.current?.pause();
      audioAlertaRef.current?.pause();
      if (alertaUrlRef.current) URL.revokeObjectURL(alertaUrlRef.current);
      if (silencioUrlRef.current) URL.revokeObjectURL(silencioUrlRef.current);
      if (impressoraUrlRef.current) URL.revokeObjectURL(impressoraUrlRef.current);
    };
  }, []);

  const irParaKds = useCallback(() => {
    onIrParaKdsRef.current?.();
  }, []);

  const notificarDesktop = useCallback(
    (pedidoId: string, sequencia?: number) => {
      if (typeof Notification === "undefined") return;
      if (Notification.permission !== "granted") return;
      if (document.visibilityState === "visible") return;

      try {
        const n = new Notification("Novo pedido na cozinha", {
          body: sequencia
            ? `Pedido #${sequencia} entrou na fila`
            : "Um pedido novo entrou na fila",
          tag: `pedido-${pedidoId}`,
          requireInteraction: true,
          silent: false,
        });
        n.onclick = () => {
          window.focus();
          irParaKds();
          n.close();
        };
      } catch {
        /* ignore */
      }
    },
    [irParaKds],
  );

  const toastNovoPedido = useCallback(
    (pedidoId: string, sequencia?: number) => {
      const titulo = sequencia
        ? `Novo pedido #${sequencia}`
        : "Novo pedido na fila";

      toast.custom(
        (id) => (
          <button
            type="button"
            onClick={() => {
              toast.dismiss(id);
              irParaKds();
            }}
            className="w-full text-left rounded-xl border border-red-200 dark:border-red-900/50 bg-white dark:bg-stone-900 shadow-lg px-4 py-3 flex flex-col gap-0.5 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
          >
            <span className="font-bold text-red-700 dark:text-red-400 text-sm">
              {titulo}
            </span>
            <span className="text-xs text-gray-600 dark:text-gray-400">
              Clique para abrir o KDS / Fila de produção
            </span>
          </button>
        ),
        {
          duration: 20000,
          id: `novo-pedido-${pedidoId}`,
        },
      );
    },
    [irParaKds],
  );

  const tocarSom = useCallback(() => {
    const base = audioAlertaRef.current;
    if (!base) return;

    const clone = base.cloneNode(true) as HTMLAudioElement;
    clone.volume = 1;
    void clone.play().catch((err) => {
      console.warn("[KDS SOM] Falha ao tocar alerta:", err);
    });
  }, []);

  const alertarPedido = useCallback(
    (pedido: {
      id?: string;
      status?: string;
      status_pagamento?: string | null;
      sequencia_pedido?: number;
    }) => {
      if (!ativoRef.current) return;
      if (!pedido.id) return;
      if (!deveAlertarPedido(pedido)) return;
      if (alertadosRef.current.has(pedido.id)) return;

      alertadosRef.current.add(pedido.id);
      tocarSom();
      toastNovoPedido(pedido.id, pedido.sequencia_pedido);
      notificarDesktop(pedido.id, pedido.sequencia_pedido);
    },
    [tocarSom, toastNovoPedido, notificarDesktop],
  );

  const ativar = useCallback(async () => {
    try {
      if (!alertaUrlRef.current) {
        alertaUrlRef.current = criarUrlSomNovoPedido();
      }
      if (!silencioUrlRef.current) {
        silencioUrlRef.current = criarUrlSilencioLoop();
      }
      if (!impressoraUrlRef.current) {
        impressoraUrlRef.current = criarUrlSomImpressoraOffline();
      }

      const alerta = new Audio(alertaUrlRef.current);
      alerta.preload = "auto";
      alerta.volume = 0;
      audioAlertaRef.current = alerta;

      await alerta.play();
      alerta.pause();
      alerta.currentTime = 0;
      alerta.volume = 1;

      // Desbloqueia também o som de impressora offline (mesmo gesto do usuário).
      const impressora = new Audio(impressoraUrlRef.current);
      impressora.volume = 0;
      await impressora.play();
      impressora.pause();

      const keep = new Audio(silencioUrlRef.current);
      keep.loop = true;
      keep.volume = 0.001;
      keep.preload = "auto";
      audioKeepaliveRef.current = keep;
      await keep.play();

      if (
        typeof Notification !== "undefined" &&
        Notification.permission === "default"
      ) {
        await Notification.requestPermission();
      }

      localStorage.setItem(STORAGE_KEY, "1");
      setAtivo(true);
      setPrecisaAtivar(false);
      toast.success(
        "Alertas ativos — novo pedido (2x) e impressora offline.",
      );

      const clone = alerta.cloneNode(true) as HTMLAudioElement;
      clone.volume = 1;
      void clone.play().catch(() => undefined);
    } catch (err) {
      console.error("[KDS SOM] Falha ao ativar:", err);
      toast.error(
        "Não foi possível ativar o som. Permita áudio para este site no Chrome (ícone do cadeado na barra de endereço).",
      );
      setAtivo(false);
    }
  }, []);

  const desativar = useCallback(() => {
    audioKeepaliveRef.current?.pause();
    audioAlertaRef.current?.pause();
    localStorage.setItem(STORAGE_KEY, "0");
    setAtivo(false);
    setPrecisaAtivar(false);
    toast.message("Alertas sonoros desligados.");
  }, []);

  // Baseline inicial não toca. Nas reconexões, alerta pedidos que chegaram
  // durante a queda e não passaram pelo websocket.
  useEffect(() => {
    const sincronizacao = ++sincronizacaoRef.current;
    void (async () => {
      const { data, error } = await supabase
        .from("pedidos")
        .select("id, status, status_pagamento, sequencia_pedido")
        .eq("status", "pendente");
      if (error || sincronizacao !== sincronizacaoRef.current || !data) return;

      if (primeiraSincronizacaoRef.current) {
        for (const pedido of data) {
          if (pedido.id) alertadosRef.current.add(pedido.id);
        }
        primeiraSincronizacaoRef.current = false;
        return;
      }

      for (const pedido of data) {
        alertarPedido(pedido);
      }
    })();
  }, [alertarPedido, versaoConexao]);

  useEffect(() => {
    return assinar((payload) => {
      if (payload.eventType !== "INSERT" && payload.eventType !== "UPDATE") {
        return;
      }
      // O Set elimina updates genéricos; não dependemos de `old`, que só fica
      // completo quando a migration REPLICA IDENTITY FULL está aplicada.
      alertarPedido(
        payload.new as {
          id?: string;
          status?: string;
          status_pagamento?: string | null;
          sequencia_pedido?: number;
        },
      );
    });
  }, [alertarPedido, assinar]);

  useEffect(() => {
    const retomar = () => {
      if (!ativoRef.current) return;
      const keep = audioKeepaliveRef.current;
      if (keep && keep.paused) {
        void keep.play().catch(() => undefined);
      }
    };
    document.addEventListener("visibilitychange", retomar);
    window.addEventListener("focus", retomar);
    return () => {
      document.removeEventListener("visibilitychange", retomar);
      window.removeEventListener("focus", retomar);
    };
  }, []);

  return {
    ativo,
    precisaReativar: precisaAtivar && !ativo,
    ativar,
    desativar,
    testarSom: tocarSom,
  };
}
