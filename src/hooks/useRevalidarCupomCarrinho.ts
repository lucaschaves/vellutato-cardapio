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
  const cuponsAplicados = useCartStore((s) => s.cuponsAplicados);
  const aplicarCupom = useCartStore((s) => s.aplicarCupom);
  const removerCupom = useCartStore((s) => s.removerCupom);
  const obterSubtotal = useCartStore((s) => s.obterSubtotal);

  const revalidandoRef = useRef(false);
  const assinatura = cuponsAplicados
    .map((c) => `${c.id}:${c.desconto}`)
    .join("|");

  useEffect(() => {
    if (!carrinhoAberto || cuponsAplicados.length === 0 || itens.length === 0) {
      return;
    }

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

        const atuais = [...useCartStore.getState().cuponsAplicados];
        for (const atual of atuais) {
          if (cancelado) return;

          const resultado = await validarCupom(
            atual.codigo,
            subtotal,
            clienteId,
          );

          if (cancelado) return;

          if (resultado.ok === false) {
            removerCupom(atual.id);
            toast.info(`Cupom ${atual.codigo} removido: ${resultado.erro}`);
            continue;
          }

          if (
            resultado.cupom.desconto !== atual.desconto ||
            resultado.cupom.acumulativo !== atual.acumulativo
          ) {
            removerCupom(atual.id);
            aplicarCupom(resultado.cupom);
          }
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
    assinatura,
    celular,
    nomeCliente,
    carrinhoAberto,
    aplicarCupom,
    removerCupom,
    obterSubtotal,
    cuponsAplicados.length,
  ]);
}
