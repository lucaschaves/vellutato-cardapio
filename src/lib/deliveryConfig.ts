import { supabase } from "./supabase";
import {
  DELIVERY_CONFIG_PADRAO,
  normalizarFaixas,
  type DeliveryConfig,
  type FaixaFrete,
} from "./deliveryFrete";

export async function buscarDeliveryConfig(): Promise<DeliveryConfig> {
  const { data, error } = await supabase
    .from("delivery_config")
    .select(
      "ativo, pedido_minimo, loja_latitude, loja_longitude, raio_km, tempo_estimado_min, faixas_frete, pontos_por_real, resgate_pontos, resgate_valor_reais, whatsapp_numero",
    )
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    console.error("[DELIVERY] Falha ao ler config:", error.message);
    return { ...DELIVERY_CONFIG_PADRAO };
  }
  if (!data) return { ...DELIVERY_CONFIG_PADRAO };

  return {
    ativo: Boolean(data.ativo),
    pedido_minimo: Number(data.pedido_minimo ?? 30),
    loja_latitude:
      data.loja_latitude != null ? Number(data.loja_latitude) : null,
    loja_longitude:
      data.loja_longitude != null ? Number(data.loja_longitude) : null,
    raio_km: Number(data.raio_km ?? 5),
    tempo_estimado_min: Number(data.tempo_estimado_min ?? 45),
    faixas_frete: normalizarFaixas(data.faixas_frete),
    pontos_por_real: Number(data.pontos_por_real ?? 1),
    resgate_pontos: Number(data.resgate_pontos ?? 100),
    resgate_valor_reais: Number(data.resgate_valor_reais ?? 5),
    whatsapp_numero: data.whatsapp_numero
      ? String(data.whatsapp_numero).replace(/\D/g, "")
      : null,
  };
}

export async function salvarDeliveryConfig(
  config: DeliveryConfig,
): Promise<void> {
  const faixas: FaixaFrete[] = normalizarFaixas(config.faixas_frete);
  const whatsapp = config.whatsapp_numero
    ? config.whatsapp_numero.replace(/\D/g, "")
    : null;
  const { error } = await supabase
    .from("delivery_config")
    .update({
      ativo: config.ativo,
      pedido_minimo: config.pedido_minimo,
      loja_latitude: config.loja_latitude,
      loja_longitude: config.loja_longitude,
      raio_km: config.raio_km,
      tempo_estimado_min: config.tempo_estimado_min,
      faixas_frete: faixas,
      pontos_por_real: config.pontos_por_real,
      resgate_pontos: config.resgate_pontos,
      resgate_valor_reais: config.resgate_valor_reais,
      whatsapp_numero: whatsapp || null,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", 1);

  if (error) throw new Error(error.message);
}
