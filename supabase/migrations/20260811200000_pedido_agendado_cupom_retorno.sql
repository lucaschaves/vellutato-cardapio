-- Pedido agendado (mesmo dia) + cupom de retorno 10% ao finalizar.

alter table public.pedidos
  add column if not exists agendado_para timestamptz;

comment on column public.pedidos.agendado_para is
  'Horário escolhido pelo cliente para entrega/retirada (mesmo dia). Null = o quanto antes.';

alter table public.cupons
  add column if not exists pedido_origem_id uuid references public.pedidos(id) on delete set null;

comment on column public.cupons.pedido_origem_id is
  'Pedido que gerou o cupom de retorno (quando aplicável).';

create index if not exists cupons_pedido_origem_id_idx
  on public.cupons (pedido_origem_id)
  where pedido_origem_id is not null;

-- Desativa cupom ao atingir limite de usos.
create or replace function public.cupons_desativar_ao_esgotar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.limite_uso is not null
     and coalesce(new.usos, 0) >= new.limite_uso then
    new.ativo := false;
  end if;
  if new.validade is not null and new.validade < current_date then
    new.ativo := false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cupons_desativar_ao_esgotar on public.cupons;
create trigger trg_cupons_desativar_ao_esgotar
  before insert or update of usos, validade, limite_uso
  on public.cupons
  for each row
  execute function public.cupons_desativar_ao_esgotar();

-- Cupom de retorno 10% (1 uso, 7 dias) ao marcar pedido como entregue.
create or replace function public.gerar_cupom_retorno_ao_entregue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo text;
  v_tentativa integer := 0;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.status is distinct from 'entregue'
     or old.status is not distinct from 'entregue' then
    return new;
  end if;

  if new.origem is distinct from 'delivery' then
    return new;
  end if;

  if new.cliente_id is null then
    return new;
  end if;

  -- Já gerou cupom para este pedido.
  if exists (
    select 1 from public.cupons c where c.pedido_origem_id = new.id
  ) then
    return new;
  end if;

  loop
    v_tentativa := v_tentativa + 1;
    v_codigo := 'VOLTA' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from public.cupons c where c.codigo = v_codigo);
    if v_tentativa > 8 then
      raise exception 'Não foi possível gerar código de cupom de retorno.';
    end if;
  end loop;

  insert into public.cupons (
    codigo, tipo, valor, valor_minimo, validade,
    limite_uso, limite_por_cliente, usos, ativo,
    cliente_id, pedido_origem_id
  ) values (
    v_codigo,
    'percentual',
    10,
    null,
    (timezone('America/Sao_Paulo', now())::date + 7),
    1,
    1,
    0,
    true,
    new.cliente_id,
    new.id
  );

  return new;
end;
$$;

drop trigger if exists trg_gerar_cupom_retorno_ao_entregue on public.pedidos;
create trigger trg_gerar_cupom_retorno_ao_entregue
  after update of status on public.pedidos
  for each row
  execute function public.gerar_cupom_retorno_ao_entregue();

-- Valida se agendado_para é hoje (SP), dentro do horário e no futuro.
create or replace function public.validar_agendamento_delivery(p_agendado_para timestamptz)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_config public.loja_config%rowtype;
  v_horario public.loja_horarios%rowtype;
  v_agora timestamp;
  v_slot timestamp;
  v_dia smallint;
  v_hora time;
  v_ok boolean := false;
begin
  if p_agendado_para is null then
    return;
  end if;

  select * into v_config from public.loja_config where id = 1;
  if v_config.pausado then
    raise exception 'LOJA_FECHADA: %',
      coalesce(nullif(trim(v_config.mensagem_pausa), ''),
        'Estamos em pausa no momento. Voltamos já!');
  end if;

  v_agora := timezone('America/Sao_Paulo', now());
  v_slot := timezone('America/Sao_Paulo', p_agendado_para);

  if v_slot::date is distinct from v_agora::date then
    raise exception 'AGENDAMENTO_INVALIDO: Só é possível agendar para hoje.';
  end if;

  if v_slot <= v_agora then
    raise exception 'AGENDAMENTO_INVALIDO: Escolha um horário futuro.';
  end if;

  -- Slot alinhado a 15 minutos.
  if extract(minute from v_slot)::integer % 15 <> 0
     or extract(second from v_slot)::integer <> 0 then
    raise exception 'AGENDAMENTO_INVALIDO: Use intervalos de 15 minutos.';
  end if;

  v_dia := extract(dow from v_slot)::smallint;
  v_hora := v_slot::time;

  select * into v_horario from public.loja_horarios where dia_semana = v_dia;
  if not found or not v_horario.aberto then
    raise exception 'AGENDAMENTO_INVALIDO: A loja não abre hoje.';
  end if;

  if v_horario.abre < v_horario.fecha then
    v_ok := v_hora >= v_horario.abre and v_hora < v_horario.fecha;
  else
    v_ok := v_hora >= v_horario.abre or v_hora < v_horario.fecha;
  end if;

  if not v_ok then
    raise exception 'AGENDAMENTO_INVALIDO: Horário fora do funcionamento de hoje (% às %).',
      to_char(v_horario.abre, 'HH24:MI'),
      to_char(v_horario.fecha, 'HH24:MI');
  end if;
end;
$$;

grant execute on function public.validar_agendamento_delivery(timestamptz)
  to anon, authenticated;

-- Recria criar_pedido_delivery com p_agendado_para.
drop function if exists public.criar_pedido_delivery(
  text, text, uuid, uuid, numeric, text, numeric, numeric, jsonb,
  text, text, numeric, numeric, text, jsonb, numeric, numeric, numeric
);

create or replace function public.criar_pedido_delivery(
  p_cliente_nome text,
  p_cliente_celular text,
  p_cliente_id uuid,
  p_cupom_id uuid,
  p_desconto numeric,
  p_identificador text,
  p_total numeric,
  p_valor_total numeric,
  p_itens jsonb,
  p_modalidade text,
  p_status_pagamento text,
  p_taxa_entrega numeric,
  p_subtotal_itens numeric,
  p_cpf_nota text,
  p_endereco_json jsonb,
  p_distancia_km numeric,
  p_desconto_frete numeric default 0,
  p_acrescimo_clima numeric default 0,
  p_agendado_para timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_status_loja jsonb;
  v_config public.loja_config%rowtype;
  v_delivery public.delivery_config%rowtype;
  v_pedidos_ativos integer;
  v_pedido_id uuid;
  v_sequencia integer;
  v_item jsonb;
  v_item_id uuid;
  v_adc jsonb;
  v_escolha jsonb;
  v_status_pedido public.tipo_status_pedido;
  v_dest_lat numeric;
  v_dest_lng numeric;
  v_distancia numeric;
  v_bairro jsonb;
  v_calc jsonb;
  v_taxa_piso numeric;
  v_modo text;
begin
  v_status_loja := public.loja_aberta_agora();

  if p_agendado_para is not null then
    perform public.validar_agendamento_delivery(p_agendado_para);
  elsif not (v_status_loja->>'aberta')::boolean then
    raise exception 'LOJA_FECHADA: %',
      coalesce(v_status_loja->>'motivo', 'Loja fechada no momento.');
  end if;

  select * into v_config from public.loja_config where id = 1;
  if v_config.limite_pedidos_ativos is not null
     and coalesce(p_status_pagamento, '') <> 'aguardando'
     and p_agendado_para is null then
    select count(*) into v_pedidos_ativos
    from public.pedidos
    where status in ('pendente', 'em_producao')
      and coalesce(status_pagamento::text, 'nao_aplicavel') <> 'aguardando'
      and agendado_para is null;

    if v_pedidos_ativos >= v_config.limite_pedidos_ativos then
      raise exception 'LOJA_CHEIA: Estamos com muitos pedidos agora. Tente novamente em alguns minutos.';
    end if;
  end if;

  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    raise exception 'Pedido sem itens.';
  end if;

  if p_modalidade not in ('entrega', 'retirada') then
    raise exception 'Modalidade inválida.';
  end if;

  if p_status_pagamento not in ('aguardando', 'pago', 'na_loja') then
    raise exception 'Status de pagamento inválido.';
  end if;

  if p_modalidade = 'entrega' then
    select * into v_delivery from public.delivery_config where id = 1;

    if not found or not coalesce(v_delivery.ativo, false) then
      raise exception 'DELIVERY_INDISPONIVEL: Entrega temporariamente indisponível.';
    end if;

    v_dest_lat := nullif(p_endereco_json->>'latitude', '')::numeric;
    v_dest_lng := nullif(p_endereco_json->>'longitude', '')::numeric;

    if v_dest_lat is null or v_dest_lng is null then
      raise exception 'FORA_AREA: Endereço sem localização. Busque o CEP novamente.';
    end if;

    v_modo := coalesce(v_delivery.modo_frete, 'distancia');

    if v_modo = 'bairro' then
      if v_delivery.loja_latitude is null or v_delivery.loja_longitude is null then
        raise exception 'DELIVERY_INDISPONIVEL: Loja sem coordenadas configuradas.';
      end if;

      v_bairro := public.localizar_bairro_frete(
        v_dest_lat::double precision,
        v_dest_lng::double precision
      );

      if v_bairro is null then
        raise exception 'FORA_AREA: Endereço fora dos bairros de entrega de Florianópolis.';
      end if;

      v_distancia := public.distancia_km_coords(
        v_delivery.loja_latitude::numeric,
        v_delivery.loja_longitude::numeric,
        v_dest_lat,
        v_dest_lng
      );

      if v_distancia is null then
        raise exception 'FORA_AREA: Não foi possível calcular a distância.';
      end if;

      v_calc := public.calcular_taxa_bairro_frete(
        (v_bairro->>'id')::uuid,
        v_distancia,
        coalesce(p_subtotal_itens, 0)
      );

      if coalesce((v_calc->>'ok')::boolean, false) is not true then
        raise exception 'FORA_AREA: %', coalesce(v_calc->>'erro', 'Entrega indisponível neste endereço.');
      end if;

      v_taxa_piso := (v_calc->>'taxa')::numeric;

      if coalesce(p_taxa_entrega, 0) + 0.01 < v_taxa_piso then
        raise exception 'TAXA_INVALIDA: Taxa de entrega inconsistente para o bairro %.',
          coalesce(v_calc->>'bairro_nome', v_bairro->>'nome', '');
      end if;

      p_distancia_km := round(v_distancia, 3);

      p_endereco_json := coalesce(p_endereco_json, '{}'::jsonb)
        || jsonb_build_object(
          'bairro_oficial', v_calc->>'bairro_nome',
          'bairro_slug', v_bairro->>'slug',
          'bairro_id', v_bairro->>'id',
          'taxa_faixa', v_calc->>'taxa_faixa',
          'taxa_piso_sem_chuva', v_taxa_piso
        );
    else
      if v_delivery.loja_latitude is null or v_delivery.loja_longitude is null then
        raise exception 'DELIVERY_INDISPONIVEL: Loja sem coordenadas configuradas.';
      end if;

      v_distancia := public.distancia_km_coords(
        v_delivery.loja_latitude::numeric,
        v_delivery.loja_longitude::numeric,
        v_dest_lat,
        v_dest_lng
      );

      if v_distancia is null or v_distancia > v_delivery.raio_km then
        raise exception 'FORA_AREA: Endereço fora da área de entrega (máx. % km).',
          trim(to_char(v_delivery.raio_km, 'FM999990.99'));
      end if;

      p_distancia_km := round(v_distancia, 3);
    end if;
  end if;

  if p_status_pagamento = 'aguardando' then
    v_status_pedido := 'aguardando_pagamento'::public.tipo_status_pedido;
  else
    v_status_pedido := 'pendente'::public.tipo_status_pedido;
  end if;

  insert into public.pedidos (
    cliente_nome, cliente_celular, cliente_id, cupom_id, desconto_aplicado,
    status, origem, identificador, total, valor_total,
    modalidade, status_pagamento, taxa_entrega, subtotal_itens,
    desconto_frete, acrescimo_clima,
    cpf_nota, endereco_json, distancia_km, agendado_para
  ) values (
    trim(p_cliente_nome),
    nullif(p_cliente_celular, ''),
    p_cliente_id,
    p_cupom_id,
    case when coalesce(p_desconto, 0) > 0 then p_desconto else null end,
    v_status_pedido,
    'delivery'::public.tipo_origem_pedido,
    p_identificador,
    p_total,
    p_valor_total,
    p_modalidade::public.tipo_modalidade_pedido,
    p_status_pagamento::public.tipo_status_pagamento,
    coalesce(p_taxa_entrega, 0),
    p_subtotal_itens,
    greatest(coalesce(p_desconto_frete, 0), 0),
    greatest(coalesce(p_acrescimo_clima, 0), 0),
    nullif(trim(coalesce(p_cpf_nota, '')), ''),
    p_endereco_json,
    p_distancia_km,
    p_agendado_para
  )
  returning id, sequencia_pedido into v_pedido_id, v_sequencia;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    insert into public.pedido_itens (
      pedido_id, produto_id, quantidade, preco_unitario, observacoes, modo_consumo
    ) values (
      v_pedido_id,
      (v_item->>'produto_id')::uuid,
      greatest((v_item->>'quantidade')::integer, 1),
      (v_item->>'preco_unitario')::numeric,
      nullif(trim(coalesce(v_item->>'observacoes', '')), ''),
      coalesce(v_item->>'modo_consumo', 'levar')
    )
    returning id into v_item_id;

    for v_adc in select * from jsonb_array_elements(coalesce(v_item->'adicionais', '[]'::jsonb))
    loop
      insert into public.pedido_item_adicionais (
        pedido_item_id, adicional_id, preco_aplicado
      ) values (
        v_item_id,
        (v_adc->>'adicional_id')::uuid,
        (v_adc->>'preco_aplicado')::numeric
      );
    end loop;

    for v_escolha in select * from jsonb_array_elements(coalesce(v_item->'combo_escolhas', '[]'::jsonb))
    loop
      insert into public.pedido_item_combo_escolhas (
        pedido_item_id, grupo_id, produto_escolhido_id,
        nome_grupo, nome_produto, delta_preco
      ) values (
        v_item_id,
        (v_escolha->>'grupo_id')::uuid,
        (v_escolha->>'produto_escolhido_id')::uuid,
        v_escolha->>'nome_grupo',
        v_escolha->>'nome_produto',
        coalesce((v_escolha->>'delta_preco')::numeric, 0)
      );
    end loop;
  end loop;

  perform public.processar_pedido_pos_criacao(v_pedido_id, p_cupom_id);

  if p_status_pagamento in ('pago', 'na_loja') then
    perform public.creditar_pontos_pedido(v_pedido_id);
  end if;

  return jsonb_build_object(
    'pedido_id', v_pedido_id,
    'sequencia_pedido', v_sequencia
  );
end;
$$;

grant execute on function public.criar_pedido_delivery(
  text, text, uuid, uuid, numeric, text, numeric, numeric, jsonb,
  text, text, numeric, numeric, text, jsonb, numeric, numeric, numeric, timestamptz
) to anon, authenticated;
