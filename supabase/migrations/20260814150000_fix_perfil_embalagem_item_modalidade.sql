-- Postgres não promove tipo_modalidade_pedido → text na resolução de função.
-- A chamada em baixar_insumos_pedido passava o enum e procurava outra assinatura.

create or replace function public.perfil_embalagem_item(
  p_origem text,
  p_modalidade public.tipo_modalidade_pedido,
  p_modo_consumo text
)
returns text
language sql
immutable
as $$
  select public.perfil_embalagem_item(p_origem, p_modalidade::text, p_modo_consumo);
$$;
