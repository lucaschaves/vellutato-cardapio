-- Cupom acumulativo (default false = só 1 por pedido) + vínculo N cupons no pedido.

alter table public.cupons
  add column if not exists acumulativo boolean not null default false;

comment on column public.cupons.acumulativo is
  'Se false (padrão), não combina com outros cupons no mesmo pedido. Se true, pode empilhar com outros acumulativos.';

create table if not exists public.pedido_cupons (
  pedido_id uuid not null references public.pedidos (id) on delete cascade,
  cupom_id uuid not null references public.cupons (id) on delete restrict,
  desconto numeric(12, 2) not null check (desconto >= 0),
  primary key (pedido_id, cupom_id)
);

create index if not exists pedido_cupons_cupom_idx
  on public.pedido_cupons (cupom_id);

alter table public.pedido_cupons enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'pedido_cupons'
      and policyname = 'pedido_cupons_select_anon'
  ) then
    create policy pedido_cupons_select_anon
      on public.pedido_cupons for select
      to anon, authenticated
      using (true);
  end if;
end $$;

-- validar_cupom: devolve acumulativo
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

    -- Também conta usos via pedido_cupons (cupons empilhados).
    v_usos_cliente := v_usos_cliente + (
      select count(*)::integer
      from public.pedido_cupons pc
      join public.pedidos p on p.id = pc.pedido_id
      where pc.cupom_id = v_cupom.id
        and p.cliente_id = p_cliente_id
        and coalesce(p.cupom_uso_registrado, false) = true
        and p.status is distinct from 'cancelado'
        and (p.cupom_id is distinct from v_cupom.id)
    );

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
      'usos', v_cupom.usos,
      'acumulativo', coalesce(v_cupom.acumulativo, false)
    )
  );
end;
$$;

grant execute on function public.validar_cupom(text, numeric, uuid)
  to anon, authenticated;

-- processar: estoque/stats; cupom fica a cargo de anexar/registrar (evita double-count).
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

  -- Compat: se anexar_cupons_pedido não for chamado, ainda registra 1 cupom no KDS.
  if p_cupom_id is not null
     and v_pedido.status is distinct from 'aguardando_pagamento'
     and coalesce(v_pedido.cupom_uso_registrado, false) = false then
    perform public.incrementar_uso_cupom(p_cupom_id);
    update public.pedidos
    set cupom_uso_registrado = true
    where id = p_pedido_id;
  end if;
end;
$$;

-- Anexa 1..N cupons ao pedido; registra usos se já estiver no KDS.
create or replace function public.anexar_cupons_pedido(
  p_pedido_id uuid,
  p_cupons jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido public.pedidos%rowtype;
  v_item jsonb;
  v_cupom_id uuid;
  v_desconto numeric;
  v_ja_contado boolean := false;
begin
  select * into v_pedido
  from public.pedidos
  where id = p_pedido_id
  for update;

  if not found then
    raise exception 'Pedido não encontrado.';
  end if;

  if p_cupons is null or jsonb_typeof(p_cupons) <> 'array' then
    return;
  end if;

  for v_item in select * from jsonb_array_elements(p_cupons)
  loop
    v_cupom_id := (v_item->>'cupom_id')::uuid;
    v_desconto := greatest(coalesce((v_item->>'desconto')::numeric, 0), 0);
    if v_cupom_id is null then
      continue;
    end if;

    insert into public.pedido_cupons (pedido_id, cupom_id, desconto)
    values (p_pedido_id, v_cupom_id, v_desconto)
    on conflict (pedido_id, cupom_id) do update
      set desconto = excluded.desconto;
  end loop;

  -- Se o processar já contou o cupom principal, não conte de novo.
  v_ja_contado := coalesce(v_pedido.cupom_uso_registrado, false);

  if v_pedido.status is distinct from 'aguardando_pagamento' then
    if not v_ja_contado then
      for v_cupom_id in
        select pc.cupom_id from public.pedido_cupons pc where pc.pedido_id = p_pedido_id
      loop
        perform public.incrementar_uso_cupom(v_cupom_id);
      end loop;
      update public.pedidos
      set cupom_uso_registrado = true
      where id = p_pedido_id;
    else
      -- Já contou o cupom_id principal: conta só os extras.
      for v_cupom_id in
        select pc.cupom_id
        from public.pedido_cupons pc
        where pc.pedido_id = p_pedido_id
          and pc.cupom_id is distinct from v_pedido.cupom_id
      loop
        perform public.incrementar_uso_cupom(v_cupom_id);
      end loop;
    end if;
  end if;
end;
$$;

grant execute on function public.anexar_cupons_pedido(uuid, jsonb)
  to anon, authenticated, service_role;

-- Ao confirmar pagamento: registra todos os cupons do pedido.
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
  v_cupom_id uuid;
  v_tem_liga boolean;
begin
  select * into v_pedido
  from public.pedidos
  where id = p_pedido_id
  for update;

  if not found then
    return;
  end if;

  if coalesce(v_pedido.cupom_uso_registrado, false) then
    return;
  end if;

  select exists(
    select 1 from public.pedido_cupons where pedido_id = p_pedido_id
  ) into v_tem_liga;

  if v_tem_liga then
    for v_cupom_id in
      select cupom_id from public.pedido_cupons where pedido_id = p_pedido_id
    loop
      perform public.incrementar_uso_cupom(v_cupom_id);
    end loop;
  elsif v_pedido.cupom_id is not null then
    perform public.incrementar_uso_cupom(v_pedido.cupom_id);
  else
    return;
  end if;

  update public.pedidos
  set cupom_uso_registrado = true
  where id = p_pedido_id;
end;
$$;

grant execute on function public.registrar_uso_cupom_ao_confirmar_pagamento(uuid)
  to anon, authenticated, service_role;
