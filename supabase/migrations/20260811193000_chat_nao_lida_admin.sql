-- Controle de mensagens não lidas pelo admin (chat delivery).

alter table public.mensagens
  add column if not exists lida_admin boolean not null default false;

alter table public.conversas
  add column if not exists nao_lida_admin boolean not null default false;

comment on column public.mensagens.lida_admin is
  'True quando o admin já leu (mensagens do admin já nascem lidas).';
comment on column public.conversas.nao_lida_admin is
  'True se há mensagem do cliente ainda não lida pelo admin.';

-- Mensagens antigas do admin consideram-se lidas; do cliente, não.
update public.mensagens
set lida_admin = true
where autor = 'admin' and lida_admin = false;

update public.conversas c
set nao_lida_admin = exists (
  select 1
  from public.mensagens m
  where m.conversa_id = c.id
    and m.autor = 'cliente'
    and m.lida_admin = false
);

create or replace function public.tg_mensagens_nao_lida_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.autor = 'admin' then
    new.lida_admin := true;
  else
    new.lida_admin := false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_mensagens_lida_admin_bi on public.mensagens;
create trigger trg_mensagens_lida_admin_bi
  before insert on public.mensagens
  for each row
  execute function public.tg_mensagens_nao_lida_admin();

create or replace function public.tg_mensagens_flag_conversa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.autor = 'cliente' then
    update public.conversas
    set nao_lida_admin = true,
        ultimo_mensagem_em = coalesce(new.criado_em, now())
    where id = new.conversa_id;
  else
    update public.conversas
    set ultimo_mensagem_em = coalesce(new.criado_em, now())
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
  set nao_lida_admin = false
  where id = p_conversa_id;
end;
$$;

grant execute on function public.marcar_conversa_lida_admin(uuid) to authenticated;

create index if not exists mensagens_nao_lida_admin_idx
  on public.mensagens (conversa_id)
  where autor = 'cliente' and lida_admin = false;

create index if not exists conversas_nao_lida_admin_idx
  on public.conversas (nao_lida_admin)
  where nao_lida_admin = true;
