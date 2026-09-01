-- Cupons e descontos no frete consideram apenas o subtotal dos produtos (sem taxa de entrega).

comment on function public.validar_cupom(text, numeric, uuid) is
  'Valida cupom. p_subtotal = soma dos itens (produtos + adicionais + combos), sem frete.';

create or replace function public.subtotal_itens_from_json(p_itens jsonb)
returns numeric
language sql
immutable
as $$
  select round(coalesce(sum(
    (
      coalesce(nullif(item->>'preco_unitario', '')::numeric, 0)
      + coalesce((
          select sum(coalesce(nullif(adc->>'preco_aplicado', '')::numeric, 0))
          from jsonb_array_elements(coalesce(item->'adicionais', '[]'::jsonb)) adc
        ), 0)
      + coalesce((
          select sum(coalesce(nullif(esc->>'delta_preco', '')::numeric, 0))
          from jsonb_array_elements(coalesce(item->'combo_escolhas', '[]'::jsonb)) esc
        ), 0)
    ) * greatest(coalesce(nullif(item->>'quantidade', '')::integer, 1), 1)
  ), 0), 2)
  from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) item;
$$;

comment on function public.subtotal_itens_from_json(jsonb) is
  'Subtotal dos itens do pedido (JSON do checkout), sem frete nem cupom.';

create or replace function public.bairro_frete_aplicar_desconto(
  p_taxa_com_base numeric,
  p_distancia numeric,
  p_subtotal numeric,
  p_descontos jsonb
)
returns numeric
language plpgsql
immutable
as $$
declare
  v_item jsonb;
  v_min numeric;
  v_ate numeric;
  v_tipo text;
  v_valor numeric;
  v_desc numeric;
  v_melhor numeric := 0;
begin
  -- p_subtotal = somente produtos; frete não entra no pedido mínimo do desconto.
  if p_taxa_com_base is null or p_taxa_com_base < 0 then
    return 0;
  end if;
  if p_descontos is null or jsonb_typeof(p_descontos) <> 'array' then
    return round(p_taxa_com_base, 2);
  end if;

  for v_item in select * from jsonb_array_elements(p_descontos)
  loop
    v_min := coalesce(nullif(v_item->>'pedido_minimo', '')::numeric, 0);
    if coalesce(p_subtotal, 0) < v_min then
      continue;
    end if;

    if v_item ? 'ate_km' and nullif(v_item->>'ate_km', '') is not null then
      v_ate := (v_item->>'ate_km')::numeric;
      if p_distancia is null or p_distancia > v_ate then
        continue;
      end if;
    end if;

    v_tipo := coalesce(v_item->>'tipo', 'fixo');
    v_valor := coalesce(nullif(v_item->>'valor', '')::numeric, 0);

    if v_tipo = 'gratis' then
      v_desc := p_taxa_com_base;
    elsif v_tipo = 'percentual' then
      v_desc := round((p_taxa_com_base * greatest(v_valor, 0) / 100.0)::numeric, 2);
    else
      v_desc := round(greatest(v_valor, 0), 2);
    end if;

    if v_desc > v_melhor then
      v_melhor := v_desc;
    end if;
  end loop;

  return round(greatest(p_taxa_com_base - v_melhor, 0), 2);
end;
$$;

drop function if exists public.criar_pedido_delivery(
  text, text, uuid, uuid, numeric, text, numeric, numeric, jsonb,
  text, text, numeric, numeric, text, jsonb, numeric, numeric, numeric, timestamptz
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
  v_subtotal_itens numeric;
  v_cupom public.cupons%rowtype;
  v_cupom_result jsonb;
  v_desconto_esperado numeric;
  v_total_esperado numeric;
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

  v_subtotal_itens := public.subtotal_itens_from_json(p_itens);

  if abs(coalesce(p_subtotal_itens, 0) - v_subtotal_itens) > 0.02 then
    raise exception 'SUBTOTAL_INVALIDO: Subtotal dos itens inconsistente.';
  end if;

  if p_cupom_id is not null then
    select * into v_cupom from public.cupons where id = p_cupom_id;
    if not found then
      raise exception 'CUPOM_INVALIDO: Cupom não encontrado.';
    end if;

    v_cupom_result := public.validar_cupom(
      v_cupom.codigo,
      v_subtotal_itens,
      p_cliente_id
    );

    if coalesce((v_cupom_result->>'ok')::boolean, false) is not true then
      raise exception 'CUPOM_INVALIDO: %',
        coalesce(v_cupom_result->>'erro', 'Cupom inválido.');
    end if;

    v_desconto_esperado := coalesce(
      nullif(v_cupom_result->'cupom'->>'desconto', '')::numeric,
      0
    );

    if abs(coalesce(p_desconto, 0) - v_desconto_esperado) > 0.02 then
      raise exception 'CUPOM_INVALIDO: Desconto do cupom inconsistente.';
    end if;
  elsif coalesce(p_desconto, 0) > 0 then
    raise exception 'CUPOM_INVALIDO: Desconto informado sem cupom.';
  end if;

  v_total_esperado := round(
    greatest(v_subtotal_itens - coalesce(p_desconto, 0), 0)
    + case
        when p_modalidade = 'entrega' then coalesce(p_taxa_entrega, 0)
        else 0
      end,
    2
  );

  if abs(coalesce(p_total, 0) - v_total_esperado) > 0.02 then
    raise exception 'TOTAL_INVALIDO: Total do pedido inconsistente (desconto só sobre itens, frete à parte).';
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
        v_subtotal_itens
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
    v_subtotal_itens,
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

grant execute on function public.subtotal_itens_from_json(jsonb)
  to anon, authenticated, service_role;

grant execute on function public.criar_pedido_delivery(
  text, text, uuid, uuid, numeric, text, numeric, numeric, jsonb,
  text, text, numeric, numeric, text, jsonb, numeric, numeric, numeric, timestamptz
) to anon, authenticated;
