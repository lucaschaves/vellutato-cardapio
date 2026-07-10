import { useEffect, useId } from "react";
import { useEmTelaCheia } from "../hooks/useTelaCheia";
import { formatarTelefoneBr } from "../lib/telefone";
import {
  useTecladoVirtualStore,
  type ModoTecladoVirtual,
} from "../store/useTecladoVirtualStore";
import { cn } from "../lib/utils";

type Props = {
  value: string;
  onValorChange: (valor: string) => void;
  modo?: ModoTecladoVirtual;
  maxLength?: number;
  className?: string;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
  id?: string;
  name?: string;
};

/**
 * Em tela cheia: abre o teclado global (fixo no rodapé, um por vez).
 * Fora da tela cheia: input normal do sistema.
 */
export function InputTelaCheia({
  value,
  onValorChange,
  modo = "texto",
  maxLength,
  className,
  placeholder,
  required,
  autoComplete = "off",
  id,
  name,
}: Props) {
  const emTelaCheia = useEmTelaCheia();
  const idGerado = useId();
  const inputId = id ?? idGerado;

  const sessaoAtivaId = useTecladoVirtualStore((s) => s.sessao?.id ?? null);
  const abrir = useTecladoVirtualStore((s) => s.abrir);
  const fechar = useTecladoVirtualStore((s) => s.fechar);
  const sincronizarValor = useTecladoVirtualStore((s) => s.sincronizarValor);
  const atualizarCallback = useTecladoVirtualStore((s) => s.atualizarCallback);
  const ativo = sessaoAtivaId === inputId;

  useEffect(() => {
    if (ativo) {
      sincronizarValor(inputId, value);
      atualizarCallback(inputId, onValorChange);
    }
  }, [
    value,
    ativo,
    inputId,
    onValorChange,
    sincronizarValor,
    atualizarCallback,
  ]);

  useEffect(() => {
    return () => {
      if (useTecladoVirtualStore.getState().sessao?.id === inputId) {
        fechar();
      }
    };
  }, [inputId, fechar]);

  const abrirTeclado = () => {
    abrir({
      id: inputId,
      modo,
      valor: value,
      maxLength,
      onValorChange,
    });
  };

  if (!emTelaCheia) {
    return (
      <input
        id={inputId}
        name={name}
        type={modo === "tel" ? "tel" : "text"}
        inputMode={modo === "tel" ? "numeric" : "text"}
        autoComplete={autoComplete}
        required={required}
        maxLength={maxLength}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          if (modo === "tel") {
            onValorChange(formatarTelefoneBr(e.target.value));
            return;
          }
          if (modo === "cupom") {
            onValorChange(e.target.value.toUpperCase());
            return;
          }
          onValorChange(e.target.value);
        }}
        className={className}
      />
    );
  }

  return (
    <input
      id={inputId}
      name={name}
      type="text"
      inputMode="none"
      readOnly
      autoComplete="off"
      required={required}
      placeholder={placeholder}
      value={value}
      onFocus={abrirTeclado}
      onClick={abrirTeclado}
      className={cn(
        className,
        "caret-transparent cursor-pointer",
        ativo && "ring-2 ring-[#ff5722] border-transparent",
      )}
    />
  );
}
