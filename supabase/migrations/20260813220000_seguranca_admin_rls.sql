-- Segurança: papel admin, RLS nas tabelas centrais, grants e push.
-- Clientes do delivery continuam guest (telefone); staff = Auth com app_metadata.role = admin.

create or replace function public.eh_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$;

revoke all on function public.eh_admin() from public;
grant execute on function public.eh_admin() to anon, authenticated, service_role;

comment on function public.eh_admin() is
  'True só para usuários Auth com app_metadata.role = admin (não é user_metadata).';

-- Usuários Auth atuais são da loja (cliente ainda não logam).
update auth.users
set raw_app_meta_data =
  coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
where coalesce(raw_app_meta_data->>'role', '') is distinct from 'admin';

-- ---------------------------------------------------------------------------
-- Policies que tratavam qualquer autenticado como admin
-- ---------------------------------------------------------------------------
drop policy if exists "loja_config_update_admin" on public.loja_config;
create policy "loja_config_update_admin"
  on public.loja_config for update to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists "loja_horarios_update_admin" on public.loja_horarios;
create policy "loja_horarios_update_admin"
  on public.loja_horarios for update to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists "delivery_config_update_admin" on public.delivery_config;
create policy "delivery_config_update_admin"
  on public.delivery_config for update to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists delivery_bairros_frete_update_admin
  on public.delivery_bairros_frete;
create policy delivery_bairros_frete_update_admin
  on public.delivery_bairros_frete for update to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists impressao_config_insert_admin on public.impressao_config;
create policy impressao_config_insert_admin
  on public.impressao_config for insert to authenticated
  with check (public.eh_admin());

drop policy if exists impressao_config_update_admin on public.impressao_config;
create policy impressao_config_update_admin
  on public.impressao_config for update to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists integracoes_config_select_auth on public.integracoes_config;
drop policy if exists integracoes_config_insert_auth on public.integracoes_config;
drop policy if exists integracoes_config_update_auth on public.integracoes_config;
drop policy if exists integracoes_config_delete_auth on public.integracoes_config;

create policy integracoes_config_select_auth
  on public.integracoes_config for select to authenticated
  using (public.eh_admin());
create policy integracoes_config_insert_auth
  on public.integracoes_config for insert to authenticated
  with check (public.eh_admin());
create policy integracoes_config_update_auth
  on public.integracoes_config for update to authenticated
  using (public.eh_admin()) with check (public.eh_admin());
create policy integracoes_config_delete_auth
  on public.integracoes_config for delete to authenticated
  using (public.eh_admin());

drop policy if exists analytics_eventos_select_auth on public.analytics_eventos;
create policy analytics_eventos_select_auth
  on public.analytics_eventos for select to authenticated
  using (public.eh_admin());

drop policy if exists "cliente_pontos_all_auth" on public.cliente_pontos;
create policy "cliente_pontos_all_auth"
  on public.cliente_pontos for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists "pontos_extrato_insert_auth" on public.pontos_extrato;
create policy "pontos_extrato_insert_auth"
  on public.pontos_extrato for insert to authenticated
  with check (public.eh_admin());

drop policy if exists "whatsapp_sessoes_select_auth" on public.whatsapp_sessoes;
create policy "whatsapp_sessoes_select_auth"
  on public.whatsapp_sessoes for select to authenticated
  using (public.eh_admin());

drop policy if exists "whatsapp_mensagens_select_authenticated"
  on public.whatsapp_mensagens;
drop policy if exists "whatsapp_mensagens_insert_authenticated"
  on public.whatsapp_mensagens;
drop policy if exists "whatsapp_mensagens_update_authenticated"
  on public.whatsapp_mensagens;
drop policy if exists "whatsapp_mensagens_delete_authenticated"
  on public.whatsapp_mensagens;

create policy "whatsapp_mensagens_admin_all"
  on public.whatsapp_mensagens for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

do $$
declare
  t text;
begin
  foreach t in array array[
    'insumos',
    'insumo_alternativas',
    'lista_compras',
    'lista_compras_itens',
    'insumo_estoque_movimentos',
    'insumo_precos_historico'
  ]
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('drop policy if exists %I on public.%I', t || '_select_auth', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_auth', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_auth', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_auth', t);
    execute format('drop policy if exists %I on public.%I', t || '_select_admin', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_admin', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_admin', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_admin', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.eh_admin())',
      t || '_select_admin', t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.eh_admin())',
      t || '_insert_admin', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.eh_admin()) with check (public.eh_admin())',
      t || '_update_admin', t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.eh_admin())',
      t || '_delete_admin', t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- RLS tabelas centrais (catálogo leitura pública; escrita admin)
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  catalogo text[] := array[
    'produtos', 'categorias', 'adicionais', 'produto_adicionais',
    'combo_grupos', 'combo_opcoes', 'produto_midias', 'mesas'
  ];
begin
  foreach t in array catalogo
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select_publico', t);
    execute format('drop policy if exists %I on public.%I', t || '_all_admin', t);
    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (true)',
      t || '_select_publico', t
    );
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.eh_admin()) with check (public.eh_admin())',
      t || '_all_admin', t
    );
  end loop;
end $$;

-- Pedidos: guest precisa LER (acompanhamento por id/telefone); escrita só RPC/admin
do $$
declare
  t text;
  filhos text[] := array[
    'pedidos', 'pedido_itens', 'pedido_item_adicionais',
    'pedido_item_combo_escolhas', 'pedido_cupons'
  ];
begin
  foreach t in array filhos
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select_publico', t);
    execute format('drop policy if exists %I on public.%I', t || '_all_admin', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_admin', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_admin', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_admin', t);
    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (true)',
      t || '_select_publico', t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.eh_admin())',
      t || '_insert_admin', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.eh_admin()) with check (public.eh_admin())',
      t || '_update_admin', t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.eh_admin())',
      t || '_delete_admin', t
    );
  end loop;
end $$;

-- Clientes: guest (telefone) lê/grava o próprio cadastro; sem DELETE público
alter table public.clientes enable row level security;
drop policy if exists clientes_select_publico on public.clientes;
drop policy if exists clientes_insert_publico on public.clientes;
drop policy if exists clientes_update_publico on public.clientes;
drop policy if exists clientes_all_admin on public.clientes;
create policy clientes_select_publico
  on public.clientes for select to anon, authenticated using (true);
create policy clientes_insert_publico
  on public.clientes for insert to anon, authenticated with check (true);
create policy clientes_update_publico
  on public.clientes for update to anon, authenticated using (true) with check (true);
create policy clientes_delete_admin
  on public.clientes for delete to authenticated using (public.eh_admin());

-- Cupons: não listar códigos; admin gerencia; validação via RPC
do $$
begin
  if to_regclass('public.cupons') is not null then
    alter table public.cupons enable row level security;
    drop policy if exists cupons_all_admin on public.cupons;
    drop policy if exists cupons_select_publico on public.cupons;
    create policy cupons_all_admin
      on public.cupons for all to authenticated
      using (public.eh_admin()) with check (public.eh_admin());
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Push: sem CRUD aberto; RPC valida pedido/cliente
-- ---------------------------------------------------------------------------
drop policy if exists "push_subscriptions_insert_publico" on public.push_subscriptions;
drop policy if exists "push_subscriptions_update_publico" on public.push_subscriptions;
drop policy if exists "push_subscriptions_select_dono" on public.push_subscriptions;
drop policy if exists "push_subscriptions_delete_publico" on public.push_subscriptions;

create policy push_subscriptions_select_admin
  on public.push_subscriptions for select to authenticated
  using (public.eh_admin());

create or replace function public.salvar_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_pedido_id uuid default null,
  p_cliente_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_endpoint is null or length(trim(p_endpoint)) < 8 then
    raise exception 'ENDPOINT_INVALIDO';
  end if;
  if p_p256dh is null or p_auth is null then
    raise exception 'CHAVES_INVALIDAS';
  end if;
  if p_pedido_id is null and p_cliente_id is null then
    raise exception 'ALVO_OBRIGATORIO';
  end if;
  if p_pedido_id is not null and not exists (
    select 1 from public.pedidos p
    where p.id = p_pedido_id
      and p.status is distinct from 'cancelado'
  ) then
    raise exception 'PEDIDO_INVALIDO';
  end if;
  if p_cliente_id is not null and not exists (
    select 1 from public.clientes c where c.id = p_cliente_id
  ) then
    raise exception 'CLIENTE_INVALIDO';
  end if;

  insert into public.push_subscriptions (
    endpoint, p256dh, auth, pedido_id, cliente_id, atualizado_em
  ) values (
    trim(p_endpoint), p_p256dh, p_auth, p_pedido_id, p_cliente_id, now()
  )
  on conflict (endpoint) do update set
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    pedido_id = coalesce(excluded.pedido_id, public.push_subscriptions.pedido_id),
    cliente_id = coalesce(excluded.cliente_id, public.push_subscriptions.cliente_id),
    atualizado_em = now();
end;
$$;

revoke all on function public.salvar_push_subscription(text, text, text, uuid, uuid) from public;
grant execute on function public.salvar_push_subscription(text, text, text, uuid, uuid)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Grants: tirar poder operacional do anon
-- ---------------------------------------------------------------------------
revoke execute on function public.marcar_conversa_lida_admin(uuid) from anon;

revoke execute on function public.cancelar_pedidos_delivery_sem_pagamento(integer)
  from anon;

create or replace function public.expirar_pedidos_delivery_padrao()
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.cancelar_pedidos_delivery_sem_pagamento(10);
end;
$$;

revoke all on function public.expirar_pedidos_delivery_padrao() from public;
grant execute on function public.expirar_pedidos_delivery_padrao()
  to anon, authenticated, service_role;

do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'incrementar_uso_cupom'
  ) then
    execute 'revoke execute on function public.incrementar_uso_cupom(uuid) from anon';
  end if;
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'processar_pedido_pos_criacao'
  ) then
    execute 'revoke execute on function public.processar_pedido_pos_criacao(uuid, uuid) from anon';
  end if;
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'registrar_uso_cupom_ao_confirmar_pagamento'
  ) then
    execute 'revoke execute on function public.registrar_uso_cupom_ao_confirmar_pagamento(uuid) from anon';
  end if;
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'creditar_pontos_pedido'
  ) then
    execute 'revoke execute on function public.creditar_pontos_pedido(uuid) from anon';
  end if;
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'validar_agendamento_delivery'
  ) then
    execute 'revoke execute on function public.validar_agendamento_delivery(timestamptz) from anon';
  end if;
  -- anexar_cupons_pedido permanece no anon: checkout guest chama após criar o pedido
end $$;

create or replace function public.exigir_admin()
returns void
language plpgsql
stable
as $$
begin
  if not public.eh_admin() then
    raise exception 'NAO_AUTORIZADO' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.marcar_conversa_lida_admin(p_conversa_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_admin();
  update public.mensagens
  set lida_admin = true
  where conversa_id = p_conversa_id
    and autor = 'cliente'
    and lida_admin = false;
  update public.conversas
  set
    nao_lida_admin = false,
    nao_lidas_admin_count = 0
  where id = p_conversa_id;
end;
$$;

revoke execute on function public.marcar_conversa_lida_admin(uuid) from anon;
grant execute on function public.marcar_conversa_lida_admin(uuid) to authenticated;

create or replace function public.ajustar_estoque_insumo(
  p_insumo_id uuid,
  p_delta numeric,
  p_origem text default 'manual',
  p_observacao text default null,
  p_lista_compra_item_id uuid default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_atual numeric;
  v_nova numeric;
  v_tipo text;
begin
  perform public.exigir_admin();
  if p_delta = 0 then
    raise exception 'Delta deve ser diferente de zero.';
  end if;
  if p_origem not in ('compra', 'uso', 'manual', 'ajuste') then
    raise exception 'Origem inválida.';
  end if;
  select quantidade_atual into v_atual
  from public.insumos
  where id = p_insumo_id
  for update;
  if not found then
    raise exception 'Insumo não encontrado.';
  end if;
  v_nova := round(v_atual + p_delta, 4);
  if v_nova < 0 then
    raise exception 'Estoque insuficiente. Atual: %, delta: %', v_atual, p_delta;
  end if;
  update public.insumos
  set quantidade_atual = v_nova, atualizado_em = now()
  where id = p_insumo_id;
  v_tipo := case when p_delta > 0 then 'entrada' else 'saida' end;
  insert into public.insumo_estoque_movimentos (
    insumo_id, tipo, quantidade, origem, observacao, lista_compra_item_id
  ) values (
    p_insumo_id, v_tipo, abs(p_delta), p_origem, p_observacao, p_lista_compra_item_id
  );
  return v_nova;
end;
$$;
