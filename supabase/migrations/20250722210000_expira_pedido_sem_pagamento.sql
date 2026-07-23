-- Cancela pedidos delivery sem pagamento após N minutos (padrão 30).
-- Restaura estoque e desfaz stats via cancelar_pedido_com_estoque.

create or replace function public.cancelar_pedidos_delivery_sem_pagamento(
  p_minutos integer default 30
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  if p_minutos is null or p_minutos < 1 then
    p_minutos := 30;
  end if;

  for v_id in
    select p.id
    from public.pedidos p
    where p.origem = 'delivery'
      and p.status = 'aguardando_pagamento'
      and p.status_pagamento = 'aguardando'
      and p.criado_em < (now() - make_interval(mins => p_minutos))
  loop
    perform public.cancelar_pedido_com_estoque(v_id);

    update public.pedidos
    set status_pagamento = 'expirado'
    where id = v_id
      and status = 'cancelado';

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.cancelar_pedidos_delivery_sem_pagamento(integer)
  to anon, authenticated, service_role;

-- Cancelar um pedido específico ainda aguardando pagamento (ex.: usuário voltou do Asaas).
create or replace function public.cancelar_pedido_delivery_aguardando(
  p_pedido_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido public.pedidos%rowtype;
begin
  select * into v_pedido
  from public.pedidos
  where id = p_pedido_id
  for update;

  if not found then
    return false;
  end if;

  if v_pedido.origem is distinct from 'delivery' then
    return false;
  end if;

  if v_pedido.status is distinct from 'aguardando_pagamento'
     or v_pedido.status_pagamento is distinct from 'aguardando' then
    return false;
  end if;

  perform public.cancelar_pedido_com_estoque(p_pedido_id);

  update public.pedidos
  set status_pagamento = 'cancelado'
  where id = p_pedido_id
    and status = 'cancelado';

  return true;
end;
$$;

grant execute on function public.cancelar_pedido_delivery_aguardando(uuid)
  to anon, authenticated, service_role;
