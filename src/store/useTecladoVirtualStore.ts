import { create } from "zustand";
import { formatarTelefoneBr } from "../lib/telefone";

export type ModoTecladoVirtual = "texto" | "tel" | "cupom";

type SessaoTeclado = {
  id: string;
  modo: ModoTecladoVirtual;
  valor: string;
  maxLength?: number;
  onValorChange: (valor: string) => void;
};

interface TecladoVirtualStore {
  sessao: SessaoTeclado | null;
  abrir: (sessao: SessaoTeclado) => void;
  fechar: () => void;
  sincronizarValor: (id: string, valor: string) => void;
  atualizarCallback: (
    id: string,
    onValorChange: (valor: string) => void,
  ) => void;
  digitar: (tecla: string) => void;
  apagar: () => void;
}

function aplicarFormatacao(
  modo: ModoTecladoVirtual,
  valor: string,
  maxLength?: number,
): string {
  let proximo = valor;
  if (modo === "tel") {
    proximo = formatarTelefoneBr(proximo);
  } else if (modo === "cupom") {
    proximo = proximo.toUpperCase();
  }
  if (maxLength != null) {
    proximo = proximo.slice(0, maxLength);
  }
  return proximo;
}

export const useTecladoVirtualStore = create<TecladoVirtualStore>((set, get) => ({
  sessao: null,

  abrir: (novaSessao) => {
    set({
      sessao: {
        ...novaSessao,
        valor: aplicarFormatacao(
          novaSessao.modo,
          novaSessao.valor,
          novaSessao.maxLength,
        ),
      },
    });
  },

  fechar: () => set({ sessao: null }),

  sincronizarValor: (id, valor) => {
    const { sessao } = get();
    if (!sessao || sessao.id !== id) return;
    set({
      sessao: {
        ...sessao,
        valor: aplicarFormatacao(sessao.modo, valor, sessao.maxLength),
      },
    });
  },

  atualizarCallback: (id, onValorChange) => {
    const { sessao } = get();
    if (!sessao || sessao.id !== id) return;
    set({ sessao: { ...sessao, onValorChange } });
  },

  digitar: (tecla) => {
    const { sessao } = get();
    if (!sessao) return;

    let bruto: string;
    if (sessao.modo === "tel") {
      bruto = sessao.valor.replace(/\D/g, "") + tecla.replace(/\D/g, "");
    } else if (sessao.modo === "texto") {
      bruto = sessao.valor + tecla.toLowerCase();
    } else {
      bruto = sessao.valor + tecla.toUpperCase();
    }

    const valor = aplicarFormatacao(sessao.modo, bruto, sessao.maxLength);
    sessao.onValorChange(valor);
    set({ sessao: { ...sessao, valor } });
  },

  apagar: () => {
    const { sessao } = get();
    if (!sessao) return;

    let bruto: string;
    if (sessao.modo === "tel") {
      bruto = sessao.valor.replace(/\D/g, "").slice(0, -1);
    } else {
      bruto = sessao.valor.slice(0, -1);
    }

    const valor = aplicarFormatacao(sessao.modo, bruto, sessao.maxLength);
    sessao.onValorChange(valor);
    set({ sessao: { ...sessao, valor } });
  },
}));
