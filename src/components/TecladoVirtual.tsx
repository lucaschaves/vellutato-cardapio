import { Delete } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import {
  useTecladoVirtualStore,
  type ModoTecladoVirtual,
} from "../store/useTecladoVirtualStore";
import { cn } from "../lib/utils";

export type { ModoTecladoVirtual };

const LINHAS_TEXTO = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["Z", "X", "C", "V", "B", "N", "M"],
];

const LINHAS_CUPOM = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["Z", "X", "C", "V", "B", "N", "M"],
];

const LINHAS_TEL = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
];

function Tecla({
  children,
  className,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "min-h-12 rounded-xl bg-white dark:bg-[#2a2c30] text-gray-950 dark:text-white font-bold text-base shadow-sm border border-gray-200 dark:border-[#3a3c40] active:scale-95 active:bg-gray-100 dark:active:bg-[#323438] transition-transform select-none",
        className,
      )}
    >
      {children}
    </button>
  );
}

function BarraOk({ aoFechar }: { aoFechar: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-2 px-1">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
        Teclado do cardápio
      </p>
      <button
        type="button"
        onClick={aoFechar}
        className="min-w-20 px-5 py-2.5 rounded-xl bg-[#ff5722] text-white text-sm font-black shadow-md active:scale-95 transition-transform"
      >
        OK
      </button>
    </div>
  );
}

/**
 * Único teclado da app — renderizado no body, fixo no rodapé.
 * Só existe uma instância (via store).
 */
export function TecladoVirtualHost() {
  const sessao = useTecladoVirtualStore((s) => s.sessao);
  const digitar = useTecladoVirtualStore((s) => s.digitar);
  const apagar = useTecladoVirtualStore((s) => s.apagar);
  const fechar = useTecladoVirtualStore((s) => s.fechar);

  useEffect(() => {
    const aoSairFullscreen = () => {
      if (!document.fullscreenElement) {
        fechar();
      }
    };
    document.addEventListener("fullscreenchange", aoSairFullscreen);
    return () =>
      document.removeEventListener("fullscreenchange", aoSairFullscreen);
  }, [fechar]);

  if (!sessao || typeof document === "undefined") return null;

  const { modo } = sessao;

  const conteudo =
    modo === "tel" ? (
      <div className="mx-auto max-w-sm space-y-2">
        <BarraOk aoFechar={fechar} />
        {LINHAS_TEL.map((linha, i) => (
          <div key={i} className="grid grid-cols-3 gap-2">
            {linha.map((tecla) => (
              <Tecla key={tecla} onClick={() => digitar(tecla)}>
                {tecla}
              </Tecla>
            ))}
          </div>
        ))}
        <div className="grid grid-cols-3 gap-2">
          <div />
          <Tecla onClick={() => digitar("0")}>0</Tecla>
          <Tecla onClick={apagar} className="flex items-center justify-center">
            <Delete size={20} />
          </Tecla>
        </div>
      </div>
    ) : (
      <div className="mx-auto max-w-3xl space-y-1.5">
        <BarraOk aoFechar={fechar} />
        {(modo === "cupom" ? LINHAS_CUPOM : LINHAS_TEXTO).map((linha, i) => (
          <div key={i} className="flex justify-center gap-1">
            {linha.map((tecla) => (
              <Tecla
                key={tecla}
                onClick={() => digitar(tecla)}
                className="flex-1 max-w-12 px-1"
              >
                {tecla}
              </Tecla>
            ))}
          </div>
        ))}
        <div className="flex gap-1">
          <Tecla
            onClick={apagar}
            className="w-16 flex items-center justify-center shrink-0"
          >
            <Delete size={18} />
          </Tecla>
          <Tecla
            onClick={() => digitar(" ")}
            className="flex-1 flex items-center justify-center"
          >
            Espaço
          </Tecla>
          <Tecla
            onClick={fechar}
            className="w-24 shrink-0 text-sm font-black text-[#ff5722]"
          >
            OK
          </Tecla>
        </div>
      </div>
    );

  return createPortal(
    <div
      className="fixed inset-x-0 bottom-0 z-[200] bg-[#e8eaed] dark:bg-[#121212] border-t border-gray-300 dark:border-[#2a2c30] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgba(0,0,0,0.2)]"
      role="group"
      aria-label="Teclado virtual"
    >
      {conteudo}
    </div>,
    document.body,
  );
}
