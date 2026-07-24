-- Disponibilidade do adicional: loja / levar / ambos (mesmo enum dos produtos).
alter table public.adicionais
  add column if not exists disponibilidade public.disponibilidade_produto
  not null default 'ambos';

create index if not exists adicionais_disponibilidade_idx
  on public.adicionais (disponibilidade);

comment on column public.adicionais.disponibilidade is
  'Onde o adicional pode ser escolhido: loja, levar ou ambos. Filtrado pelo modo de consumo do cliente.';
