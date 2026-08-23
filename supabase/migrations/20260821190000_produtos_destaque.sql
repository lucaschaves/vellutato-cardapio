-- Flag para destacar produto no início do cardápio (UI do catálogo; listagem depois).
alter table public.produtos
  add column if not exists destaque boolean not null default false;

comment on column public.produtos.destaque is
  'Se true, o produto deve aparecer no início do cardápio com destaque visual.';

create index if not exists produtos_destaque_idx
  on public.produtos (destaque)
  where destaque = true;
