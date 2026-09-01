-- iFood V1.5: ifood_item_id para Catalog API (preço/status)

alter table public.ifood_mapeamentos
  add column if not exists ifood_item_id text;

comment on column public.ifood_mapeamentos.ifood_item_id is
  'UUID do item no catálogo iFood (necessário para PATCH preço/status).';

create index if not exists ifood_mapeamentos_ifood_item_id_idx
  on public.ifood_mapeamentos (ifood_item_id)
  where ifood_item_id is not null;
