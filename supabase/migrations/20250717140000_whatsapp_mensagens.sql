-- Modelos de mensagem de WhatsApp enviados a partir do KDS
create table if not exists public.whatsapp_mensagens (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  conteudo text not null,
  ordem integer not null default 0,
  criado_em timestamptz not null default now()
);

alter table public.whatsapp_mensagens enable row level security;

create policy "whatsapp_mensagens_select_authenticated"
  on public.whatsapp_mensagens for select
  to authenticated
  using (true);

create policy "whatsapp_mensagens_insert_authenticated"
  on public.whatsapp_mensagens for insert
  to authenticated
  with check (true);

create policy "whatsapp_mensagens_update_authenticated"
  on public.whatsapp_mensagens for update
  to authenticated
  using (true);

create policy "whatsapp_mensagens_delete_authenticated"
  on public.whatsapp_mensagens for delete
  to authenticated
  using (true);

-- Modelo padrão inicial
insert into public.whatsapp_mensagens (titulo, conteudo, ordem)
values (
  'Agradecimento + status',
  E'Olá, {nome}! 😊\nObrigado pelo seu pedido na *Vellutato*!\n\n*Pedido #{pedido}*\n{produtos}\n\nTotal: {total}\n\n{status}\n\nQualquer dúvida é só responder por aqui!',
  0
);
