-- Bloqueia no servidor pedidos de entrega fora do raio configurado.
-- O front já avisa, mas a RPC é a única barreira confiável.

create or replace function public.distancia_km_coords(
  p_lat1 numeric,
  p_lng1 numeric,
  p_lat2 numeric,
  p_lng2 numeric
)
returns numeric
language plpgsql
immutable
as $$
declare
  v_raio_terra constant numeric := 6371;
  v_dlat double precision;
  v_dlng double precision;
  v_a double precision;
begin
  if p_lat1 is null or p_lng1 is null or p_lat2 is null or p_lng2 is null then
    return null;
  end if;

  v_dlat := radians(p_lat2 - p_lat1);
  v_dlng := radians(p_lng2 - p_lng1);

  v_a := sin(v_dlat / 2) * sin(v_dlat / 2)
    + cos(radians(p_lat1)) * cos(radians(p_lat2))
    * sin(v_dlng / 2) * sin(v_dlng / 2);

  return (v_raio_terra * 2 * atan2(sqrt(v_a), sqrt(1 - v_a)))::numeric;
end;
$$;

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
  p_distancia_km numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
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
begin
  v_status_loja := public.loja_aberta_agora();
  if not (v_status_loja->>'aberta')::boolean then
    raise exception 'LOJA_FECHADA: %', coalesce(v_status_loja->>'motivo', 'Loja fechada no momento.');
  end if;

  select * into v_config from public.loja_config where id = 1;
  if v_config.limite_pedidos_ativos is not null
     and coalesce(p_status_pagamento, '') <> 'aguardando' then
    select count(*) into v_pedidos_ativos
    from public.pedidos
    where status in ('pendente', 'em_producao')
      and coalesce(status_pagamento::text, 'nao_aplicavel') <> 'aguardando';

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

    if v_delivery.loja_latitude is null or v_delivery.loja_longitude is null then
      raise exception 'DELIVERY_INDISPONIVEL: Loja sem coordenadas configuradas.';
    end if;

    -- Recalcula no banco: distância enviada pelo cliente não é confiável.
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

  -- Só vai para a fila da cozinha após pagamento (ou pagar na loja).
  if p_status_pagamento = 'aguardando' then
    v_status_pedido := 'aguardando_pagamento'::public.tipo_status_pedido;
  else
    v_status_pedido := 'pendente'::public.tipo_status_pedido;
  end if;

  insert into public.pedidos (
    cliente_nome, cliente_celular, cliente_id, cupom_id, desconto_aplicado,
    status, origem, identificador, total, valor_total,
    modalidade, status_pagamento, taxa_entrega, subtotal_itens,
    cpf_nota, endereco_json, distancia_km
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
    nullif(trim(coalesce(p_cpf_nota, '')), ''),
    p_endereco_json,
    p_distancia_km
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
  text, text, numeric, numeric, text, jsonb, numeric
) to anon, authenticated;
