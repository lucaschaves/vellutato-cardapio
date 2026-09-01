-- Margem de lucro separada por canal; iFood usa só a comissão (sem somar cartão).

alter table public.precificacao_config
  add column if not exists margem_lucro_loja_pct numeric,
  add column if not exists margem_lucro_delivery_pct numeric,
  add column if not exists margem_lucro_ifood_pct numeric;

update public.precificacao_config
set
  margem_lucro_loja_pct = coalesce(margem_lucro_loja_pct, margem_lucro_pct, 40),
  margem_lucro_delivery_pct = coalesce(margem_lucro_delivery_pct, margem_lucro_pct, 40),
  margem_lucro_ifood_pct = coalesce(margem_lucro_ifood_pct, margem_lucro_pct, 25)
where true;

alter table public.precificacao_config
  alter column margem_lucro_loja_pct set default 40,
  alter column margem_lucro_delivery_pct set default 40,
  alter column margem_lucro_ifood_pct set default 25;

alter table public.precificacao_config
  alter column margem_lucro_loja_pct set not null,
  alter column margem_lucro_delivery_pct set not null,
  alter column margem_lucro_ifood_pct set not null;

comment on column public.precificacao_config.margem_lucro_loja_pct is
  'Lucro alvo (%) sobre o preço no canal loja.';
comment on column public.precificacao_config.margem_lucro_delivery_pct is
  'Lucro alvo (%) sobre o preço no canal delivery próprio.';
comment on column public.precificacao_config.margem_lucro_ifood_pct is
  'Lucro alvo (%) sobre o preço no canal iFood.';
comment on column public.precificacao_config.taxa_ifood_pct is
  'Comissão iFood completa (all-in). Não soma taxa_cartao no canal iFood.';
