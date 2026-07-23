-- Cupons: limite de usos geral (já existe) + limite por cliente
alter table public.cupons
  add column if not exists limite_por_cliente integer
  check (limite_por_cliente is null or limite_por_cliente >= 1);

comment on column public.cupons.limite_uso is
  'Limite TOTAL de usos do cupom (todos os clientes). Null = ilimitado.';
comment on column public.cupons.limite_por_cliente is
  'Máximo de usos do mesmo cupom por cliente_id. Ex.: 1 = uma vez por pessoa. Null = sem limite por cliente.';

create or replace function public.validar_cupom(
  p_codigo text,
  p_subtotal numeric,
  p_cliente_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cupom public.cupons%rowtype;
  v_desconto numeric;
  v_usos_cliente integer;
begin
  select * into v_cupom
  from public.cupons
  where upper(codigo) = upper(trim(p_codigo))
  limit 1;

  if not found or v_cupom.ativo is false then
    return jsonb_build_object('ok', false, 'erro', 'Cupom inválido ou inativo.');
  end if;

  if v_cupom.validade is not null and v_cupom.validade::date < current_date then
    return jsonb_build_object('ok', false, 'erro', 'Cupom expirado.');
  end if;

  -- Limite GERAL (todos os usos somados)
  if v_cupom.limite_uso is not null
     and coalesce(v_cupom.usos, 0) >= v_cupom.limite_uso then
    return jsonb_build_object('ok', false, 'erro', 'Cupom esgotado.');
  end if;

  -- Cupom exclusivo de um cliente
  if v_cupom.cliente_id is not null
     and (p_cliente_id is null or p_cliente_id <> v_cupom.cliente_id) then
    return jsonb_build_object(
      'ok', false,
      'erro', 'Cupom exclusivo de outro cliente.'
    );
  end if;

  if v_cupom.valor_minimo is not null and p_subtotal < v_cupom.valor_minimo then
    return jsonb_build_object(
      'ok', false,
      'erro', 'Pedido abaixo do valor mínimo do cupom.'
    );
  end if;

  -- Limite POR CLIENTE (ex.: 1 = só uma vez por pessoa)
  if v_cupom.limite_por_cliente is not null then
    if p_cliente_id is null then
      return jsonb_build_object(
        'ok', false,
        'erro', 'Informe seu cadastro (telefone) para usar este cupom.'
      );
    end if;

    select count(*)::integer into v_usos_cliente
    from public.pedidos
    where cupom_id = v_cupom.id
      and cliente_id = p_cliente_id
      and status is distinct from 'cancelado';

    if v_usos_cliente >= v_cupom.limite_por_cliente then
      return jsonb_build_object(
        'ok', false,
        'erro',
        case
          when v_cupom.limite_por_cliente = 1
            then 'Você já usou este cupom.'
          else format(
            'Você já usou este cupom o máximo de %s vez(es).',
            v_cupom.limite_por_cliente
          )
        end
      );
    end if;
  end if;

  if v_cupom.tipo = 'percentual' then
    v_desconto := round(p_subtotal * v_cupom.valor / 100.0, 2);
  else
    v_desconto := least(v_cupom.valor, p_subtotal);
  end if;

  if v_desconto <= 0 then
    return jsonb_build_object('ok', false, 'erro', 'Cupom sem desconto aplicável.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'cupom', jsonb_build_object(
      'id', v_cupom.id,
      'codigo', v_cupom.codigo,
      'tipo', v_cupom.tipo,
      'valor', v_cupom.valor,
      'desconto', v_desconto,
      'usos', v_cupom.usos
    )
  );
end;
$$;

grant execute on function public.validar_cupom(text, numeric, uuid) to anon, authenticated;
