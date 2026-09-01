-- Integração iFood V1: origem, vínculo do pedido, eventos e mapeamento de itens.

-- ---------------------------------------------------------------------------
-- Enum origem
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'tipo_origem_pedido'
  ) then
    begin
      alter type public.tipo_origem_pedido add value if not exists 'ifood';
    exception
      when duplicate_object then null;
      when others then
        begin
          alter type public.tipo_origem_pedido add value 'ifood';
        exception
          when duplicate_object then null;
        end;
    end;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Colunas em pedidos
-- ---------------------------------------------------------------------------
alter table public.pedidos
  add column if not exists ifood_order_id text;

comment on column public.pedidos.ifood_order_id is
  'UUID do pedido na Merchant API do iFood.';

create unique index if not exists pedidos_ifood_order_id_uidx
  on public.pedidos (ifood_order_id)
  where ifood_order_id is not null;

-- ---------------------------------------------------------------------------
-- Eventos processados (idempotência)
-- ---------------------------------------------------------------------------
create table if not exists public.ifood_eventos (
  id text primary key,
  codigo text,
  full_code text,
  order_id text,
  criado_em_ifood timestamptz,
  processado_em timestamptz not null default now(),
  pedido_id uuid references public.pedidos(id) on delete set null,
  payload jsonb,
  erro text
);

create index if not exists ifood_eventos_order_id_idx
  on public.ifood_eventos (order_id);

create index if not exists ifood_eventos_processado_em_idx
  on public.ifood_eventos (processado_em desc);

alter table public.ifood_eventos enable row level security;

drop policy if exists ifood_eventos_admin_all on public.ifood_eventos;
create policy ifood_eventos_admin_all
  on public.ifood_eventos for all to authenticated
  using (public.eh_admin())
  with check (public.eh_admin());

grant select, insert, update, delete on table public.ifood_eventos to authenticated;
grant all on table public.ifood_eventos to service_role;

-- ---------------------------------------------------------------------------
-- Snapshot do pedido iFood (histórico / debug)
-- ---------------------------------------------------------------------------
create table if not exists public.ifood_pedidos (
  ifood_order_id text primary key,
  merchant_id text,
  display_id text,
  status_ifood text,
  order_type text,
  order_timing text,
  payload jsonb not null default '{}'::jsonb,
  pedido_id uuid references public.pedidos(id) on delete set null,
  itens_nao_mapeados jsonb not null default '[]'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists ifood_pedidos_pedido_id_idx
  on public.ifood_pedidos (pedido_id)
  where pedido_id is not null;

alter table public.ifood_pedidos enable row level security;

drop policy if exists ifood_pedidos_admin_all on public.ifood_pedidos;
create policy ifood_pedidos_admin_all
  on public.ifood_pedidos for all to authenticated
  using (public.eh_admin())
  with check (public.eh_admin());

grant select, insert, update, delete on table public.ifood_pedidos to authenticated;
grant all on table public.ifood_pedidos to service_role;

-- ---------------------------------------------------------------------------
-- De-para catálogo (externalCode iFood ↔ produto/adicional)
-- ---------------------------------------------------------------------------
create table if not exists public.ifood_mapeamentos (
  external_code text primary key,
  produto_id uuid references public.produtos(id) on delete cascade,
  adicional_id uuid references public.adicionais(id) on delete cascade,
  criado_em timestamptz not null default now(),
  constraint ifood_mapeamentos_alvo_chk check (
    (produto_id is not null and adicional_id is null)
    or (produto_id is null and adicional_id is not null)
  )
);

create index if not exists ifood_mapeamentos_produto_id_idx
  on public.ifood_mapeamentos (produto_id)
  where produto_id is not null;

create index if not exists ifood_mapeamentos_adicional_id_idx
  on public.ifood_mapeamentos (adicional_id)
  where adicional_id is not null;

alter table public.ifood_mapeamentos enable row level security;

drop policy if exists ifood_mapeamentos_admin_all on public.ifood_mapeamentos;
create policy ifood_mapeamentos_admin_all
  on public.ifood_mapeamentos for all to authenticated
  using (public.eh_admin())
  with check (public.eh_admin());

grant select, insert, update, delete on table public.ifood_mapeamentos to authenticated;
grant all on table public.ifood_mapeamentos to service_role;

-- ---------------------------------------------------------------------------
-- Cache do OAuth (Edge Function é efêmera)
-- ---------------------------------------------------------------------------
create table if not exists public.ifood_oauth_cache (
  id text primary key default 'default',
  access_token text not null,
  expires_at timestamptz not null,
  atualizado_em timestamptz not null default now()
);

alter table public.ifood_oauth_cache enable row level security;

-- Só service_role (sem policies para authenticated)
grant all on table public.ifood_oauth_cache to service_role;

-- ---------------------------------------------------------------------------
-- Embalagem: iFood trata como delivery
-- ---------------------------------------------------------------------------
create or replace function public.perfil_embalagem_item(
  p_origem text,
  p_modalidade text,
  p_modo_consumo text
)
returns text
language plpgsql
immutable
as $$
begin
  if coalesce(p_modo_consumo, '') = 'loja' then
    return null;
  end if;
  if p_origem in ('delivery', 'ifood') and coalesce(p_modalidade, '') = 'entrega' then
    return 'delivery';
  end if;
  if p_origem in ('delivery', 'ifood') then
    return 'levar_rapido';
  end if;
  if p_origem in ('balcao', 'totem') and coalesce(p_modo_consumo, '') = 'levar' then
    return 'viagem';
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Estoque de cardápio: iFood já vendeu — permite ficar negativo
-- ---------------------------------------------------------------------------
create or replace function public.baixar_estoque_pedido(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_nova_quantidade integer;
  v_origem text;
begin
  if not exists (select 1 from public.pedidos where id = p_pedido_id) then
    raise exception 'Pedido não encontrado.';
  end if;

  select origem::text into v_origem
  from public.pedidos
  where id = p_pedido_id;

  for r in
    select
      x.produto_id,
      sum(x.quantidade)::integer as quantidade,
      p.nome,
      coalesce(p.controlar_estoque, false) as controlar_estoque,
      coalesce(p.quantidade_estoque, 0)::integer as quantidade_estoque
    from (
      select pi.produto_id, pi.quantidade
      from public.pedido_itens pi
      join public.produtos prod on prod.id = pi.produto_id
      where pi.pedido_id = p_pedido_id
        and coalesce(prod.tipo::text, 'simples') <> 'combo'
      union all
      select c.produto_escolhido_id as produto_id, pi.quantidade
      from public.pedido_itens pi
      join public.produtos prod on prod.id = pi.produto_id
      join public.pedido_item_combo_escolhas c on c.pedido_item_id = pi.id
      where pi.pedido_id = p_pedido_id
        and prod.tipo = 'combo'
        and c.produto_escolhido_id is not null
    ) x
    join public.produtos p on p.id = x.produto_id
    group by x.produto_id, p.nome, p.controlar_estoque, p.quantidade_estoque
  loop
    if not r.controlar_estoque then
      continue;
    end if;
    if v_origem is distinct from 'ifood'
       and r.quantidade_estoque < r.quantidade then
      raise exception
        'Estoque insuficiente para "%". Disponível: %, solicitado: %',
        r.nome, r.quantidade_estoque, r.quantidade;
    end if;
    v_nova_quantidade := r.quantidade_estoque - r.quantidade;
    update public.produtos
    set
      quantidade_estoque = v_nova_quantidade,
      ativo = case when v_nova_quantidade <= 0 then false else ativo end
    where id = r.produto_id;
  end loop;

  perform public.baixar_insumos_pedido(p_pedido_id);
end;
$$;
