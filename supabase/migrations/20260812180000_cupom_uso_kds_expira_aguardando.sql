-- Cupom só conta uso ao entrar no KDS (não em aguardando_pagamento).
-- Pedidos delivery sem pagamento expiram em 5 min e são removidos (não ficam no histórico).

-- ---------------------------------------------------------------------------
-- Flag de uso registrado
-- ---------------------------------------------------------------------------
alter table public.pedidos
  add column if not exists cupom_uso_registrado boolean not null default false;

comment on column public.pedidos.cupom_uso_registrado is
  'True quando o uso do cupom já entrou em cupons.usos (pedido confirmado / KDS).';

-- Pedidos reais já na cozinha/finalizados: flag sem alterar contador (já incrementados).
update public.pedidos
set cupom_uso_registrado = true
where cupom_id is not null
  and cupom_uso_registrado = false
  and status is distinct from 'aguardando_pagamento'
  and status is distinct from 'cancelado'
  and coalesce(status_pagamento::text, '') is distinct from 'aguardando';

-- Em voo (aguardando): o processar antigo já tinha incrementado usos.
-- Marca a flag para não contar de novo no webhook ao pagar.
update public.pedidos
set cupom_uso_registrado = true
where cupom_id is not null
  and cupom_uso_registrado = false
  and status = 'aguardando_pagamento'
  and coalesce(status_pagamento::text, '') = 'aguardando';

-- ---------------------------------------------------------------------------
-- Uso de cupom
-- ---------------------------------------------------------------------------
create or replace function public.incrementar_uso_cupom(p_cupom_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_cupom_id is null then
    return;
  end if;

  update public.cupons
  set usos = coalesce(usos, 0) + 1
  where id = p_cupom_id;
end;
$$;

grant execute on function public.incrementar_uso_cupom(uuid)
  to anon, authenticated, service_role;

-- Estoque + stats sempre; cupom só se o pedido já for para a cozinha.
create or replace function public.processar_pedido_pos_criacao(
  p_pedido_id uuid,
  p_cupom_id uuid default null
)
returns void
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
    raise exception 'Pedido não encontrado.';
  end if;

  perform public.baixar_estoque_pedido(p_pedido_id);

  if v_pedido.cliente_id is not null then
    perform public.atualizar_stats_cliente_pedido(
      v_pedido.cliente_id,
      coalesce(v_pedido.total, 0),
      1
    );
  end if;

  -- Simulação / Asaas: cupom_id fica no pedido p/ desconto, mas uso só no KDS.
  if p_cupom_id is not null
     and v_pedido.status is distinct from 'aguardando_pagamento' then
    perform public.incrementar_uso_cupom(p_cupom_id);
    update public.pedidos
    set cupom_uso_registrado = true
    where id = p_pedido_id
      and cupom_uso_registrado = false;
  end if;
end;
$$;

grant execute on function public.processar_pedido_pos_criacao(uuid, uuid)
  to anon, authenticated, service_role;

-- Chamado quando o pagamento confirma e o pedido vira pendente (KDS).
create or replace function public.registrar_uso_cupom_ao_confirmar_pagamento(
  p_pedido_id uuid
)
returns void
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
    return;
  end if;

  if v_pedido.cupom_id is null then
    return;
  end if;

  if coalesce(v_pedido.cupom_uso_registrado, false) then
    return;
  end if;

  perform public.incrementar_uso_cupom(v_pedido.cupom_id);

  update public.pedidos
  set cupom_uso_registrado = true
  where id = p_pedido_id;
end;
$$;

grant execute on function public.registrar_uso_cupom_ao_confirmar_pagamento(uuid)
  to anon, authenticated, service_role;

-- Limite por cliente: só pedidos com uso de cupom de fato registrado.
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

  if v_cupom.limite_uso is not null
     and coalesce(v_cupom.usos, 0) >= v_cupom.limite_uso then
    return jsonb_build_object('ok', false, 'erro', 'Cupom esgotado.');
  end if;

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
      and coalesce(cupom_uso_registrado, false) = true
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

grant execute on function public.validar_cupom(text, numeric, uuid)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Expiração: 5 min, restaura estoque/stats e APAGA o pedido (sem histórico fantasma)
-- ---------------------------------------------------------------------------
create or replace function public.cancelar_pedidos_delivery_sem_pagamento(
  p_minutos integer default 5
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
    p_minutos := 5;
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
        -- Mantém cancelado se o delete falhar por FK; o front filtra resíduos.
        null;
    end;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.cancelar_pedidos_delivery_sem_pagamento(integer)
  to anon, authenticated, service_role;

-- Cancelamento manual enquanto aguarda pagamento: também remove (não finalizou).
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

  begin
    delete from public.pedidos where id = p_pedido_id;
  exception
    when others then
      update public.pedidos
      set status_pagamento = 'cancelado'
      where id = p_pedido_id
        and status = 'cancelado';
  end;

  return true;
end;
$$;

grant execute on function public.cancelar_pedido_delivery_aguardando(uuid)
  to anon, authenticated, service_role;

-- Resíduos antigos: cancelados/expirados sem pagamento real (simulações).
do $$
declare
  v_id uuid;
begin
  for v_id in
    select p.id
    from public.pedidos p
    where p.origem = 'delivery'
      and p.status = 'cancelado'
      and p.status_pagamento::text in ('expirado', 'aguardando', 'cancelado')
      and coalesce(p.cupom_uso_registrado, false) = false
      and p.criado_em < (now() - interval '5 minutes')
  loop
    begin
      delete from public.pedidos where id = v_id;
    exception
      when foreign_key_violation then
        null;
    end;
  end loop;
end $$;
