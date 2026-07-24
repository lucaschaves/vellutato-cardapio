-- Limite opcional de quantos adicionais o cliente pode escolher por produto.
-- NULL = sem limite (pode escolher todos os vinculados).
alter table public.produtos
  add column if not exists adicional_maximo integer null;

alter table public.produtos
  drop constraint if exists produtos_adicional_maximo_check;

alter table public.produtos
  add constraint produtos_adicional_maximo_check
  check (adicional_maximo is null or adicional_maximo >= 1);

comment on column public.produtos.adicional_maximo is
  'Máximo de adicionais que o cliente pode selecionar neste produto. NULL = sem limite.';

comment on column public.produtos.adicional_obrigatorio is
  'Quando true, o cliente precisa escolher pelo menos 1 adicional para pedir o produto.';
