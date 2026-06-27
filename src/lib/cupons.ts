import { supabase } from "./supabase";

export interface CupomValidado {
  id: string;
  codigo: string;
  tipo: string;
  valor: number;
  desconto: number;
  usos: number | null;
}

interface RespostaValidarCupom {
  ok: boolean;
  erro?: string;
  cupom?: {
    id: string;
    codigo: string;
    tipo: string;
    valor: number;
    desconto: number;
    usos: number | null;
  };
}

export async function validarCupom(
  codigo: string,
  subtotal: number,
  clienteId?: string | null,
): Promise<{ ok: true; cupom: CupomValidado } | { ok: false; erro: string }> {
  const codigoLimpo = codigo.trim().toUpperCase();
  if (!codigoLimpo) {
    return { ok: false, erro: "Informe um código de cupom." };
  }

  const { data, error } = await supabase.rpc("validar_cupom", {
    p_codigo: codigoLimpo,
    p_subtotal: subtotal,
    p_cliente_id: clienteId || null,
  });

  if (error) throw new Error(error.message);

  const resposta = data as RespostaValidarCupom;

  if (!resposta?.ok || !resposta.cupom) {
    return { ok: false, erro: resposta?.erro || "Cupom inválido." };
  }

  return {
    ok: true,
    cupom: {
      id: resposta.cupom.id,
      codigo: resposta.cupom.codigo,
      tipo: resposta.cupom.tipo,
      valor: Number(resposta.cupom.valor),
      desconto: Number(resposta.cupom.desconto),
      usos: resposta.cupom.usos,
    },
  };
}
