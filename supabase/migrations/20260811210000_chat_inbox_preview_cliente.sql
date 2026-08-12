-- Inbox estilo WhatsApp: preview da última mensagem + contadores de não lidas
-- (admin e cliente).

alter table public.mensagens
  add column if not exists lida_cliente boolean not null default false;

alter table public.conversas
  add column if not exists nao_lida_cliente boolean not null default false;

alter table public.conversas
  add column if not exists ultima_mensagem_corpo text;

alter table public.conversas
  add column if not exists ultima_mensagem_autor text;

alter table public.conversas
  add column if not exists nao_lidas_admin_count integer not null default 0;

alter table public.conversas
  add column if not exists nao_lidas_cliente_count integer not null default 0;

comment on column public.mensagens.lida_cliente is
  'True quando o cliente já leu (mensagens do cliente já nascem lidas).';
comment on column public.conversas.nao_lida_cliente is
  'True se há mensagem do admin ainda não lida pelo cliente.';
comment on column public.conversas.ultima_mensagem_corpo is
  'Preview da última mensagem (inbox).';
comment on column public.conversas.nao_lidas_admin_count is
  'Qtde de mensagens do cliente ainda não lidas pelo admin.';
comment on column public.conversas.nao_lidas_cliente_count is
  'Qtde de mensagens do admin ainda não lidas pelo cliente.';

-- Backfill flags / contadores
update public.mensagens
set lida_cliente = true
where autor = 'cliente' and lida_cliente = false;

update public.mensagens
set lida_cliente = false
where autor = 'admin' and lida_cliente = true;

-- Preview a partir da última mensagem
update public.conversas c
set
  ultima_mensagem_corpo = m.corpo,
  ultima_mensagem_autor = m.autor,
  ultimo_mensagem_em = coalesce(c.ultimo_mensagem_em, m.criado_em)
from (
  select distinct on (conversa_id)
    conversa_id,
    corpo,
    autor,
    criado_em
  from public.mensagens
  order by conversa_id, criado_em desc
) m
where m.conversa_id = c.id;

update public.conversas c
set
  nao_lidas_admin_count = (
    select count(*)::integer
    from public.mensagens m
    where m.conversa_id = c.id
      and m.autor = 'cliente'
      and m.lida_admin = false
  ),
  nao_lida_admin = exists (
    select 1
    from public.mensagens m
    where m.conversa_id = c.id
      and m.autor = 'cliente'
      and m.lida_admin = false
  ),
  nao_lidas_cliente_count = (
    select count(*)::integer
    from public.mensagens m
    where m.conversa_id = c.id
      and m.autor = 'admin'
      and m.lida_cliente = false
  ),
  nao_lida_cliente = exists (
    select 1
    from public.mensagens m
    where m.conversa_id = c.id
      and m.autor = 'admin'
      and m.lida_cliente = false
  );

-- BEFORE INSERT: marca lida conforme autor
create or replace function public.tg_mensagens_flags_lida()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.autor = 'admin' then
    new.lida_admin := true;
    new.lida_cliente := false;
  else
    new.lida_admin := false;
    new.lida_cliente := true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_mensagens_lida_admin_bi on public.mensagens;
drop trigger if exists trg_mensagens_flags_lida_bi on public.mensagens;
create trigger trg_mensagens_flags_lida_bi
  before insert on public.mensagens
  for each row
  execute function public.tg_mensagens_flags_lida();

-- AFTER INSERT: atualiza conversa (preview + contadores)
create or replace function public.tg_mensagens_flag_conversa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.autor = 'cliente' then
    update public.conversas
    set
      nao_lida_admin = true,
      nao_lidas_admin_count = nao_lidas_admin_count + 1,
      ultimo_mensagem_em = coalesce(new.criado_em, now()),
      ultima_mensagem_corpo = new.corpo,
      ultima_mensagem_autor = new.autor
    where id = new.conversa_id;
  else
    update public.conversas
    set
      nao_lida_cliente = true,
      nao_lidas_cliente_count = nao_lidas_cliente_count + 1,
      ultimo_mensagem_em = coalesce(new.criado_em, now()),
      ultima_mensagem_corpo = new.corpo,
      ultima_mensagem_autor = new.autor
    where id = new.conversa_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_mensagens_flag_conversa_ai on public.mensagens;
create trigger trg_mensagens_flag_conversa_ai
  after insert on public.mensagens
  for each row
  execute function public.tg_mensagens_flag_conversa();

create or replace function public.marcar_conversa_lida_admin(p_conversa_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
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

create or replace function public.marcar_conversa_lida_cliente(p_conversa_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.mensagens
  set lida_cliente = true
  where conversa_id = p_conversa_id
    and autor = 'admin'
    and lida_cliente = false;

  update public.conversas
  set
    nao_lida_cliente = false,
    nao_lidas_cliente_count = 0
  where id = p_conversa_id;
end;
$$;

grant execute on function public.marcar_conversa_lida_admin(uuid) to authenticated;
grant execute on function public.marcar_conversa_lida_admin(uuid) to anon;
grant execute on function public.marcar_conversa_lida_cliente(uuid) to authenticated;
grant execute on function public.marcar_conversa_lida_cliente(uuid) to anon;

create index if not exists mensagens_nao_lida_cliente_idx
  on public.mensagens (conversa_id)
  where autor = 'admin' and lida_cliente = false;

create index if not exists conversas_nao_lida_cliente_idx
  on public.conversas (nao_lida_cliente)
  where nao_lida_cliente = true;
