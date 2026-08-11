-- Configuração customizável do cupom/comanda de impressão (via cozinha e cliente).
-- Single-row (id = 1) com um blob JSON, no mesmo padrão de loja_config.

create table if not exists public.impressao_config (
  id smallint primary key default 1,
  config jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  constraint impressao_config_singleton check (id = 1)
);

insert into public.impressao_config (id, config)
values (1, '{}'::jsonb)
on conflict (id) do nothing;

alter table public.impressao_config enable row level security;

grant select, insert, update on table public.impressao_config to authenticated;
grant select on table public.impressao_config to anon;
grant all on table public.impressao_config to service_role;

drop policy if exists impressao_config_select_todos on public.impressao_config;
create policy impressao_config_select_todos
  on public.impressao_config for select
  to anon, authenticated
  using (true);

drop policy if exists impressao_config_insert_admin on public.impressao_config;
create policy impressao_config_insert_admin
  on public.impressao_config for insert
  to authenticated
  with check (true);

drop policy if exists impressao_config_update_admin on public.impressao_config;
create policy impressao_config_update_admin
  on public.impressao_config for update
  to authenticated
  using (true);
