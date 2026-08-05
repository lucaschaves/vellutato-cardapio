-- Credenciais de integrações (Asaas, VOA, WhatsApp, VAPID, SMS, etc.)
-- Editáveis pelo admin; edge functions leem daqui (com fallback para Deno secrets).

create table if not exists public.integracoes_config (
  chave text primary key,
  valor text not null default '',
  rotulo text null,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid null references auth.users (id) on delete set null
);

comment on table public.integracoes_config is
  'Segredos e tokens de integrações do SaaS. Apenas usuários autenticados (admin).';

alter table public.integracoes_config enable row level security;

drop policy if exists integracoes_config_select_auth on public.integracoes_config;
create policy integracoes_config_select_auth
  on public.integracoes_config
  for select
  to authenticated
  using (true);

drop policy if exists integracoes_config_insert_auth on public.integracoes_config;
create policy integracoes_config_insert_auth
  on public.integracoes_config
  for insert
  to authenticated
  with check (true);

drop policy if exists integracoes_config_update_auth on public.integracoes_config;
create policy integracoes_config_update_auth
  on public.integracoes_config
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists integracoes_config_delete_auth on public.integracoes_config;
create policy integracoes_config_delete_auth
  on public.integracoes_config
  for delete
  to authenticated
  using (true);

-- service_role bypassa RLS (edge functions).

create index if not exists integracoes_config_atualizado_em_idx
  on public.integracoes_config (atualizado_em desc);
