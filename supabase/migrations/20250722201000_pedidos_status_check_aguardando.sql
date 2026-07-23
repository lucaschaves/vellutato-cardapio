-- A coluna status ainda tinha CHECK antigo (só os status da cozinha/caixa).
-- Inclui aguardando_pagamento para pedidos Asaas antes do pagamento.

alter table public.pedidos drop constraint if exists status_check;

alter table public.pedidos
  add constraint status_check
  check (
    status::text = any (
      array[
        'pendente',
        'em_producao',
        'pronto',
        'entregue',
        'pago',
        'cancelado',
        'aguardando_pagamento'
      ]
    )
  );
