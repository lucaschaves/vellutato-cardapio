-- Corrige RLS/grants de integracoes_config (upsert admin falhava com 42501).

grant select, insert, update, delete on table public.integracoes_config to authenticated;
grant all on table public.integracoes_config to service_role;

drop policy if exists integracoes_config_select_auth on public.integracoes_config;
drop policy if exists integracoes_config_insert_auth on public.integracoes_config;
drop policy if exists integracoes_config_update_auth on public.integracoes_config;
drop policy if exists integracoes_config_delete_auth on public.integracoes_config;

-- Qualquer usuário autenticado (admin logado) pode gerenciar.
create policy integracoes_config_select_auth
  on public.integracoes_config
  for select
  to authenticated
  using (auth.uid() is not null);

create policy integracoes_config_insert_auth
  on public.integracoes_config
  for insert
  to authenticated
  with check (auth.uid() is not null);

create policy integracoes_config_update_auth
  on public.integracoes_config
  for update
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

create policy integracoes_config_delete_auth
  on public.integracoes_config
  for delete
  to authenticated
  using (auth.uid() is not null);
