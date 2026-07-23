-- Ordem dos produtos dentro da categoria (cardápio)
alter table public.produtos
  add column if not exists ordem integer not null default 0;

comment on column public.produtos.ordem is
  'Posição do produto dentro da categoria (menor = primeiro no cardápio).';

create index if not exists produtos_categoria_ordem_idx
  on public.produtos (categoria_id, ordem);

-- Backfill: ordem alfabética por categoria (só onde ainda está 0 em massa)
with ranked as (
  select
    id,
    row_number() over (
      partition by categoria_id
      order by nome asc, criado_em asc
    ) - 1 as nova_ordem
  from public.produtos
)
update public.produtos p
set ordem = ranked.nova_ordem
from ranked
where p.id = ranked.id;
