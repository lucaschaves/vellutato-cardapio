-- Push notifications + sessão WhatsApp (janela 24h iniciada pelo cliente)

alter table public.delivery_config
  add column if not exists whatsapp_numero text null;

comment on column public.delivery_config.whatsapp_numero is
  'Número WhatsApp da loja (somente dígitos com DDI, ex: 5511999999999) para o cliente iniciar a conversa.';

-- Subscriptions Web Push (PWA)
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  pedido_id uuid null references public.pedidos (id) on delete cascade,
  cliente_id uuid null references public.clientes (id) on delete cascade,
  user_id uuid null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint push_subscriptions_alvo_check check (
    pedido_id is not null or cliente_id is not null or user_id is not null
  )
);

create index if not exists push_subscriptions_pedido_idx
  on public.push_subscriptions (pedido_id);
create index if not exists push_subscriptions_cliente_idx
  on public.push_subscriptions (cliente_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_insert_publico" on public.push_subscriptions;
create policy "push_subscriptions_insert_publico"
  on public.push_subscriptions for insert
  to anon, authenticated
  with check (true);

drop policy if exists "push_subscriptions_update_publico" on public.push_subscriptions;
create policy "push_subscriptions_update_publico"
  on public.push_subscriptions for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "push_subscriptions_select_dono" on public.push_subscriptions;
create policy "push_subscriptions_select_dono"
  on public.push_subscriptions for select
  to anon, authenticated
  using (true);

drop policy if exists "push_subscriptions_delete_publico" on public.push_subscriptions;
create policy "push_subscriptions_delete_publico"
  on public.push_subscriptions for delete
  to anon, authenticated
  using (true);

-- Sessões WhatsApp: janela de 24h após mensagem do cliente
create table if not exists public.whatsapp_sessoes (
  telefone text primary key,
  janela_ate timestamptz not null,
  ultimo_pedido_id uuid null references public.pedidos (id) on delete set null,
  ultimo_inbound_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists whatsapp_sessoes_janela_idx
  on public.whatsapp_sessoes (janela_ate);

alter table public.whatsapp_sessoes enable row level security;

-- Leitura pública só para o app checar se a janela está ativa (por pedido vinculado)
drop policy if exists "whatsapp_sessoes_select_auth" on public.whatsapp_sessoes;
create policy "whatsapp_sessoes_select_auth"
  on public.whatsapp_sessoes for select
  to authenticated
  using (true);

-- Escrita apenas via service role (Edge Functions) — sem policy de insert/update para anon
