-- Alinha expiração de pagamento ao mínimo do Asaas (minutesToExpire ≥ 10).
create or replace function public.cancelar_pedidos_delivery_sem_pagamento(
  p_minutos integer default 10
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
    p_minutos := 10;
  end if;

  for v_id in
    select p.id
    from public.pedidos p
    where p.origem = 'delivery'
      and p.status = 'aguardando_pagamento'
      and p.status_pagamento = 'aguardando'
      and p.criado_em < (now() - make_interval(mins => p_minutos))
  loop
    begin
      perform public.cancelar_pedido_com_estoque(v_id);
      delete from public.pedidos where id = v_id;
      v_count := v_count + 1;
    exception
      when others then
        null;
    end;
  end loop;

  return v_count;
end;
$$;
