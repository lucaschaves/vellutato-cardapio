-- Canal totem nos pedidos + eventos de funil (analytics).

-- 1) Origem totem (mesa / balcão / delivery já existem)
do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'tipo_origem_pedido'
      and e.enumlabel = 'totem'
  ) then
    alter type public.tipo_origem_pedido add value 'totem';
  end if;
end
$$;

-- 2) Eventos de funil (anon pode inserir; admin autenticado lê)
create table if not exists public.analytics_eventos (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  canal text not null
    check (canal in ('mesa', 'totem', 'balcao', 'delivery')),
  sessao_id text not null,
  cliente_id uuid null references public.clientes (id) on delete set null,
  evento text not null,
  produto_id uuid null references public.produtos (id) on delete set null,
  pedido_id uuid null references public.pedidos (id) on delete set null,
  props jsonb not null default '{}'::jsonb
);

comment on table public.analytics_eventos is
  'Funil de conversão por canal (mesa, totem, balcão, delivery).';

create index if not exists analytics_eventos_criado_em_idx
  on public.analytics_eventos (criado_em desc);

create index if not exists analytics_eventos_canal_evento_idx
  on public.analytics_eventos (canal, evento, criado_em desc);

create index if not exists analytics_eventos_sessao_idx
  on public.analytics_eventos (sessao_id, criado_em);

create index if not exists analytics_eventos_produto_idx
  on public.analytics_eventos (produto_id)
  where produto_id is not null;

alter table public.analytics_eventos enable row level security;

drop policy if exists analytics_eventos_insert_publico on public.analytics_eventos;
create policy analytics_eventos_insert_publico
  on public.analytics_eventos
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists analytics_eventos_select_auth on public.analytics_eventos;
create policy analytics_eventos_select_auth
  on public.analytics_eventos
  for select
  to authenticated
  using (true);

grant select, insert on table public.analytics_eventos to anon, authenticated;
grant all on table public.analytics_eventos to service_role;
