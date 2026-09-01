-- Preços por canal + configuração de precificação (calculadora de venda).

alter table public.produtos
  add column if not exists preco_delivery numeric,
  add column if not exists preco_ifood numeric;

comment on column public.produtos.preco is
  'Preço do canal loja (mesa / totem / balcão comer no local).';
comment on column public.produtos.preco_delivery is
  'Preço do canal delivery próprio. Null = usa preco (loja).';
comment on column public.produtos.preco_ifood is
  'Preço sincronizado / cobrado no iFood. Null = usa preco (loja).';

update public.produtos
set
  preco_delivery = coalesce(preco_delivery, preco),
  preco_ifood = coalesce(preco_ifood, preco)
where preco_delivery is null
   or preco_ifood is null;

create table if not exists public.precificacao_config (
  id smallint primary key default 1 check (id = 1),
  margem_lucro_pct numeric not null default 40,
  contribuicao_modo text not null default 'pct_faturamento'
    check (contribuicao_modo in ('pct_faturamento', 'custo_por_unidade')),
  contribuicao_pct numeric not null default 0,
  contribuicao_rs_unidade numeric not null default 0,
  faturamento_esperado_mensal numeric not null default 0,
  qtd_itens_esperada_mensal numeric not null default 0,
  taxa_cartao_pct numeric not null default 0,
  taxa_ifood_pct numeric not null default 0,
  taxa_delivery_pct numeric not null default 0,
  descontos_volume jsonb not null default '[]'::jsonb,
  atualizado_em timestamptz not null default now()
);

comment on table public.precificacao_config is
  'Singleton de parâmetros da calculadora de preço de venda.';

insert into public.precificacao_config (id)
values (1)
on conflict (id) do nothing;

alter table public.precificacao_config enable row level security;

drop policy if exists precificacao_config_select on public.precificacao_config;
drop policy if exists precificacao_config_upsert on public.precificacao_config;

create policy precificacao_config_select
  on public.precificacao_config for select
  to anon, authenticated
  using (true);

create policy precificacao_config_all_admin
  on public.precificacao_config for all
  to authenticated
  using (public.eh_admin())
  with check (public.eh_admin());

grant select on public.precificacao_config to anon, authenticated;
grant insert, update, delete on public.precificacao_config to authenticated;
