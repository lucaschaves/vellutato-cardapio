import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { buscarClientePorCelular } from "../lib/clientes";
import { validarCupom } from "../lib/cupons";
import { normalizarTelefoneParaSalvar } from "../lib/telefone";
import { useCartStore } from "../store/useCartStore";

export function useRevalidarCupomCarrinho(
  celular: string,
  nomeCliente: string,
  carrinhoAberto: boolean,
) {
  const itens = useCartStore((s) => s.itens);
  const cupomAplicado = useCartStore((s) => s.cupomAplicado);
  const aplicarCupom = useCartStore((s) => s.aplicarCupom);
  const removerCupom = useCartStore((s) => s.removerCupom);
  const obterSubtotal = useCartStore((s) => s.obterSubtotal);

  const revalidandoRef = useRef(false);

  useEffect(() => {
    if (!carrinhoAberto || !cupomAplicado || itens.length === 0) return;

    let cancelado = false;

    const revalidar = async () => {
      if (revalidandoRef.current) return;
      revalidandoRef.current = true;

      try {
        const subtotal = obterSubtotal();
        const celularNorm = normalizarTelefoneParaSalvar(celular);
        let clienteId: string | null = null;

        if (celularNorm.length >= 10) {
          const cliente = await buscarClientePorCelular(celularNorm);
          clienteId = cliente?.id ?? null;
        }

        const resultado = await validarCupom(
          cupomAplicado.codigo,
          subtotal,
          clienteId,
        );

        if (cancelado) return;

        if (resultado.ok === false) {
          removerCupom();
          toast.info(`Cupom removido: ${resultado.erro}`);
          return;
        }

        if (resultado.cupom.desconto !== cupomAplicado.desconto) {
          aplicarCupom(resultado.cupom);
        }
      } catch {
        /* falha silenciosa — checkout revalida */
      } finally {
        revalidandoRef.current = false;
      }
    };

    void revalidar();

    return () => {
      cancelado = true;
    };
  }, [
    itens,
    cupomAplicado?.codigo,
    cupomAplicado?.desconto,
    celular,
    nomeCliente,
    carrinhoAberto,
    aplicarCupom,
    removerCupom,
    obterSubtotal,
  ]);
}
