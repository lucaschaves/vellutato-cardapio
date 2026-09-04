-- Erros técnicos vistos pelo cliente (delivery/totem/mesa/balcão).
-- Insert público (fire-and-forget); leitura/atualização só admin.

create table if not exists public.erros_cliente (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  canal text not null
    check (canal in ('mesa', 'totem', 'balcao', 'delivery')),
  acao text not null,
  mensagem_tecnica text not null,
  codigo text null,
  url text null,
  sessao_id text null,
  cliente_id uuid null references public.clientes (id) on delete set null,
  props jsonb not null default '{}'::jsonb,
  status text not null default 'aberto'
    check (status in ('aberto', 'resolvido')),
  resolvido_em timestamptz null,
  resolvido_por uuid null
);

comment on table public.erros_cliente is
  'Erros técnicos do checkout/canais cliente. Mensagem amigável no app; detalhe só no admin.';

create index if not exists erros_cliente_criado_em_idx
  on public.erros_cliente (criado_em desc);

create index if not exists erros_cliente_status_criado_idx
  on public.erros_cliente (status, criado_em desc);

create index if not exists erros_cliente_canal_criado_idx
  on public.erros_cliente (canal, criado_em desc);

alter table public.erros_cliente enable row level security;

drop policy if exists erros_cliente_insert_publico on public.erros_cliente;
create policy erros_cliente_insert_publico
  on public.erros_cliente
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists erros_cliente_select_admin on public.erros_cliente;
create policy erros_cliente_select_admin
  on public.erros_cliente
  for select
  to authenticated
  using (public.eh_admin());

drop policy if exists erros_cliente_update_admin on public.erros_cliente;
create policy erros_cliente_update_admin
  on public.erros_cliente
  for update
  to authenticated
  using (public.eh_admin())
  with check (public.eh_admin());

grant select, insert, update on table public.erros_cliente to authenticated;
grant insert on table public.erros_cliente to anon;
grant all on table public.erros_cliente to service_role;
