-- Clientes marcados como teste (uso interno) não entram nas métricas da Dashboard.

alter table public.clientes
  add column if not exists eh_teste boolean not null default false;

comment on column public.clientes.eh_teste is
  'Cliente de teste/interno: pedidos e uso não contabilizam na Dashboard.';

create index if not exists clientes_eh_teste_idx
  on public.clientes (eh_teste)
  where eh_teste = true;

-- Stats do cadastro ignoram clientes de teste.
-- Assinatura alinhada às chamadas existentes: (cliente_id, valor, delta_pedidos).
create or replace function public.atualizar_stats_cliente_pedido(
  p_cliente_id uuid,
  p_valor numeric,
  p_delta_pedidos integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.clientes c
    where c.id = p_cliente_id
      and c.eh_teste
  ) then
    return;
  end if;

  update public.clientes
  set
    total_pedidos = greatest(coalesce(total_pedidos, 0) + p_delta_pedidos, 0),
    valor_gasto = greatest(coalesce(valor_gasto, 0) + p_valor, 0),
    ultimo_pedido = case
      when p_delta_pedidos > 0 then now()
      else ultimo_pedido
    end
  where id = p_cliente_id;
end;
$$;

grant execute on function public.atualizar_stats_cliente_pedido(uuid, numeric, integer)
  to anon, authenticated, service_role;
