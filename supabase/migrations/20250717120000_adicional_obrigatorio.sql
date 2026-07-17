-- Produtos podem exigir a escolha de 1 adicional no pedido
alter table public.produtos
  add column if not exists adicional_obrigatorio boolean not null default false;

comment on column public.produtos.adicional_obrigatorio is
  'Quando true, o cliente precisa escolher 1 adicional para adicionar o produto ao pedido.';
