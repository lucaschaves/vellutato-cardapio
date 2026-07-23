-- =============================================================================
-- Delivery online: config, clientes auth, endereços, pedidos, pontos, chat
-- Execute no SQL Editor do Supabase.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Configuração do delivery (linha única)
-- -----------------------------------------------------------------------------
create table if not exists public.delivery_config (
  id integer primary key default 1 check (id = 1),
  ativo boolean not null default false,
  pedido_minimo numeric(10,2) not null default 30,
  loja_latitude double precision,
  loja_longitude double precision,
  raio_km numeric(6,2) not null default 5,
  tempo_estimado_min integer not null default 45,
  -- [{ "ate_km": 2, "taxa": 5.00 }, { "ate_km": 5, "taxa": 10.00 }]
  faixas_frete jsonb not null default '[{"ate_km":2,"taxa":5},{"ate_km":5,"taxa":10}]'::jsonb,
  -- resgate: pontos necessários e valor do cupom gerado
  pontos_por_real numeric(10,2) not null default 1,
  resgate_pontos integer not null default 100,
  resgate_valor_reais numeric(10,2) not null default 5,
  atualizado_em timestamptz not null default now()
);

insert into public.delivery_config (id) values (1)
on conflict (id) do nothing;

alter table public.delivery_config enable row level security;

drop policy if exists "delivery_config_select_todos" on public.delivery_config;
create policy "delivery_config_select_todos"
  on public.delivery_config for select to anon, authenticated using (true);

drop policy if exists "delivery_config_update_admin" on public.delivery_config;
create policy "delivery_config_update_admin"
  on public.delivery_config for update to authenticated using (true);

-- -----------------------------------------------------------------------------
-- Clientes: auth + CPF + email
-- -----------------------------------------------------------------------------
alter table public.clientes
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null,
  add column if not exists cpf text,
  add column if not exists email text;

create index if not exists clientes_auth_user_id_idx on public.clientes (auth_user_id);
create index if not exists clientes_cpf_idx on public.clientes (cpf);

-- -----------------------------------------------------------------------------
-- Endereços do cliente
-- -----------------------------------------------------------------------------
create table if not exists public.cliente_enderecos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  rotulo text,
  cep text not null,
  rua text not null,
  numero text not null,
  bairro text not null,
  cidade text not null,
  uf text not null,
  complemento text,
  referencia text,
  latitude double precision,
  longitude double precision,
  padrao boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists cliente_enderecos_cliente_id_idx
  on public.cliente_enderecos (cliente_id);

alter table public.cliente_enderecos enable row level security;

drop policy if exists "cliente_enderecos_select" on public.cliente_enderecos;
create policy "cliente_enderecos_select"
  on public.cliente_enderecos for select to anon, authenticated using (true);

drop policy if exists "cliente_enderecos_insert" on public.cliente_enderecos;
create policy "cliente_enderecos_insert"
  on public.cliente_enderecos for insert to anon, authenticated with check (true);

drop policy if exists "cliente_enderecos_update" on public.cliente_enderecos;
create policy "cliente_enderecos_update"
  on public.cliente_enderecos for update to anon, authenticated using (true);

drop policy if exists "cliente_enderecos_delete" on public.cliente_enderecos;
create policy "cliente_enderecos_delete"
  on public.cliente_enderecos for delete to anon, authenticated using (true);

-- -----------------------------------------------------------------------------
-- Pedidos: campos delivery / pagamento / VOA
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'tipo_modalidade_pedido'
  ) then
    create type public.tipo_modalidade_pedido as enum ('entrega', 'retirada');
  end if;

  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'tipo_status_pagamento'
  ) then
    create type public.tipo_status_pagamento as enum (
      'nao_aplicavel', 'aguardando', 'pago', 'na_loja', 'expirado', 'cancelado'
    );
  end if;
end $$;

-- Ampliar origem com 'delivery' se for enum
do $$
begin
  if exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'tipo_origem_pedido'
  ) then
    begin
      alter type public.tipo_origem_pedido add value if not exists 'delivery';
    exception when others then
      -- Postgres antigo sem IF NOT EXISTS: tenta add puro
      begin
        alter type public.tipo_origem_pedido add value 'delivery';
      exception when duplicate_object then null;
      end;
    end;
  end if;
end $$;

alter table public.pedidos
  add column if not exists modalidade public.tipo_modalidade_pedido,
  add column if not exists status_pagamento public.tipo_status_pagamento
    not null default 'nao_aplicavel',
  add column if not exists taxa_entrega numeric(10,2) default 0,
  add column if not exists subtotal_itens numeric(10,2),
  add column if not exists cpf_nota text,
  add column if not exists asaas_checkout_id text,
  add column if not exists asaas_payment_id text,
  add column if not exists voa_order_id text,
  add column if not exists tracking_url text,
  add column if not exists endereco_json jsonb,
  add column if not exists distancia_km numeric(8,3);

create index if not exists pedidos_asaas_checkout_id_idx on public.pedidos (asaas_checkout_id);
create index if not exists pedidos_status_pagamento_idx on public.pedidos (status_pagamento);

-- -----------------------------------------------------------------------------
-- Pontos
-- -----------------------------------------------------------------------------
create table if not exists public.cliente_pontos (
  cliente_id uuid primary key references public.clientes(id) on delete cascade,
  saldo integer not null default 0 check (saldo >= 0),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.pontos_extrato (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  pedido_id uuid references public.pedidos(id) on delete set null,
  pontos integer not null,
  tipo text not null check (tipo in ('credito', 'debito', 'ajuste')),
  descricao text,
  criado_em timestamptz not null default now()
);

create index if not exists pontos_extrato_cliente_id_idx on public.pontos_extrato (cliente_id);

alter table public.cliente_pontos enable row level security;
alter table public.pontos_extrato enable row level security;

drop policy if exists "cliente_pontos_select" on public.cliente_pontos;
create policy "cliente_pontos_select"
  on public.cliente_pontos for select to anon, authenticated using (true);
drop policy if exists "cliente_pontos_all_auth" on public.cliente_pontos;
create policy "cliente_pontos_all_auth"
  on public.cliente_pontos for all to authenticated using (true) with check (true);

drop policy if exists "pontos_extrato_select" on public.pontos_extrato;
create policy "pontos_extrato_select"
  on public.pontos_extrato for select to anon, authenticated using (true);
drop policy if exists "pontos_extrato_insert_auth" on public.pontos_extrato;
create policy "pontos_extrato_insert_auth"
  on public.pontos_extrato for insert to authenticated with check (true);

-- -----------------------------------------------------------------------------
-- Chat no site
-- -----------------------------------------------------------------------------
create table if not exists public.conversas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  pedido_id uuid references public.pedidos(id) on delete set null,
  status text not null default 'aberta' check (status in ('aberta', 'fechada')),
  ultimo_mensagem_em timestamptz,
  criado_em timestamptz not null default now()
);

create table if not exists public.mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.conversas(id) on delete cascade,
  autor text not null check (autor in ('cliente', 'admin')),
  corpo text not null,
  criado_em timestamptz not null default now()
);

create index if not exists conversas_cliente_id_idx on public.conversas (cliente_id);
create index if not exists mensagens_conversa_id_idx on public.mensagens (conversa_id);

alter table public.conversas enable row level security;
alter table public.mensagens enable row level security;

drop policy if exists "conversas_all" on public.conversas;
create policy "conversas_all"
  on public.conversas for all to anon, authenticated using (true) with check (true);

drop policy if exists "mensagens_all" on public.mensagens;
create policy "mensagens_all"
  on public.mensagens for all to anon, authenticated using (true) with check (true);

-- Realtime (ignore se já estiver na publication)
do $$
begin
  alter publication supabase_realtime add table public.mensagens;
exception when duplicate_object then null;
when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.conversas;
exception when duplicate_object then null;
when undefined_object then null;
end $$;
