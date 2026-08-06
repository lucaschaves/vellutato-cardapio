-- Frete híbrido por bairro: raio + faixas de km + descontos progressivos (linhas).
-- Ordem de cálculo no app: taxa_faixa → +chuva → −desconto → max(0, …).
-- No banco (sem Open-Meteo): valida taxa_faixa − desconto (piso sem chuva).

alter table public.delivery_bairros_frete
  add column if not exists raio_km numeric(10, 2),
  add column if not exists faixas jsonb not null default '[]'::jsonb,
  add column if not exists descontos jsonb not null default '[]'::jsonb;

comment on column public.delivery_bairros_frete.raio_km is
  'Raio máximo de entrega dentro deste bairro (km). Null = usa maior ate_km das faixas.';
comment on column public.delivery_bairros_frete.faixas is
  '[{ "ate_km": 2, "taxa": 7 }, ...] — preço por distância no bairro.';
comment on column public.delivery_bairros_frete.descontos is
  '[{ "id", "pedido_minimo", "ate_km"|null, "tipo": "fixo"|"percentual"|"gratis", "valor" }]';

-- Migra taxa única legada → uma faixa cobrindo o raio.
update public.delivery_bairros_frete
set
  raio_km = coalesce(raio_km, 50),
  faixas = jsonb_build_array(
    jsonb_build_object(
      'ate_km', coalesce(raio_km, 50),
      'taxa', round(taxa, 2)
    )
  ),
  atualizado_em = now()
where taxa is not null
  and (
    faixas is null
    or faixas = '[]'::jsonb
    or jsonb_typeof(faixas) <> 'array'
    or jsonb_array_length(faixas) = 0
  );

-- ---------------------------------------------------------------------------
-- Helpers de normalização / cálculo (sem chuva)
-- ---------------------------------------------------------------------------
create or replace function public.bairro_frete_raio_efetivo(
  p_raio numeric,
  p_faixas jsonb
)
returns numeric
language plpgsql
immutable
as $$
declare
  v_max numeric := 0;
  v_item jsonb;
  v_ate numeric;
begin
  if p_raio is not null and p_raio > 0 then
    return p_raio;
  end if;
  if p_faixas is null or jsonb_typeof(p_faixas) <> 'array' then
    return null;
  end if;
  for v_item in select * from jsonb_array_elements(p_faixas)
  loop
    v_ate := nullif(v_item->>'ate_km', '')::numeric;
    if v_ate is not null and v_ate > v_max then
      v_max := v_ate;
    end if;
  end loop;
  if v_max <= 0 then
    return null;
  end if;
  return v_max;
end;
$$;

create or replace function public.bairro_frete_taxa_faixa(
  p_distancia numeric,
  p_faixas jsonb
)
returns numeric
language plpgsql
immutable
as $$
declare
  v_item jsonb;
  v_ate numeric;
  v_taxa numeric;
  v_best_ate numeric := null;
  v_best_taxa numeric := null;
begin
  if p_distancia is null or p_faixas is null or jsonb_typeof(p_faixas) <> 'array' then
    return null;
  end if;

  for v_item in
    select value
    from jsonb_array_elements(p_faixas) as t(value)
    order by nullif(value->>'ate_km', '')::numeric asc nulls last
  loop
    v_ate := nullif(v_item->>'ate_km', '')::numeric;
    v_taxa := nullif(v_item->>'taxa', '')::numeric;
    if v_ate is null or v_taxa is null then
      continue;
    end if;
    if p_distancia <= v_ate then
      return round(v_taxa, 2);
    end if;
    v_best_ate := v_ate;
    v_best_taxa := v_taxa;
  end loop;

  -- além da última faixa
  return null;
end;
$$;

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
      -- fixo
      v_desc := round(greatest(v_valor, 0), 2);
    end if;

    if v_desc > v_melhor then
      v_melhor := v_desc;
    end if;
  end loop;

  return round(greatest(p_taxa_com_base - v_melhor, 0), 2);
end;
$$;

-- Calcula frete do bairro SEM chuva (piso para validar pedido).
create or replace function public.calcular_taxa_bairro_frete(
  p_bairro_id uuid,
  p_distancia numeric,
  p_subtotal numeric
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public.delivery_bairros_frete%rowtype;
  v_raio numeric;
  v_taxa_faixa numeric;
  v_taxa_final numeric;
begin
  select * into v_row
  from public.delivery_bairros_frete
  where id = p_bairro_id;

  if not found then
    return jsonb_build_object('ok', false, 'erro', 'Bairro não encontrado.');
  end if;

  if v_row.faixas is null
     or jsonb_typeof(v_row.faixas) <> 'array'
     or jsonb_array_length(v_row.faixas) = 0 then
    return jsonb_build_object(
      'ok', false,
      'erro', format('Não entregamos no bairro %s.', v_row.nome),
      'bairro_nome', v_row.nome
    );
  end if;

  v_raio := public.bairro_frete_raio_efetivo(v_row.raio_km, v_row.faixas);
  if v_raio is null or p_distancia is null or p_distancia > v_raio then
    return jsonb_build_object(
      'ok', false,
      'erro', format(
        'Fora do raio de entrega do bairro %s (máx. %s km).',
        v_row.nome,
        trim(to_char(coalesce(v_raio, 0), 'FM999990.99'))
      ),
      'bairro_nome', v_row.nome,
      'raio_km', v_raio
    );
  end if;

  v_taxa_faixa := public.bairro_frete_taxa_faixa(p_distancia, v_row.faixas);
  if v_taxa_faixa is null then
    return jsonb_build_object(
      'ok', false,
      'erro', format('Não há faixa de frete para esta distância no bairro %s.', v_row.nome),
      'bairro_nome', v_row.nome
    );
  end if;

  v_taxa_final := public.bairro_frete_aplicar_desconto(
    v_taxa_faixa,
    p_distancia,
    p_subtotal,
    v_row.descontos
  );

  return jsonb_build_object(
    'ok', true,
    'bairro_id', v_row.id,
    'bairro_nome', v_row.nome,
    'bairro_slug', v_row.slug,
    'distancia_km', round(p_distancia, 3),
    'raio_km', v_raio,
    'taxa_faixa', v_taxa_faixa,
    'taxa', v_taxa_final
  );
end;
$$;

grant execute on function public.calcular_taxa_bairro_frete(uuid, numeric, numeric)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Listagem GeoJSON com config híbrida
-- ---------------------------------------------------------------------------
create or replace function public.listar_bairros_frete_geojson()
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce(
    jsonb_build_object(
      'type', 'FeatureCollection',
      'features', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'type', 'Feature',
              'id', b.id,
              'properties', jsonb_build_object(
                'id', b.id,
                'slug', b.slug,
                'nome', b.nome,
                'regiao', b.regiao,
                'distrito', b.distrito,
                'taxa', b.taxa,
                'raio_km', b.raio_km,
                'faixas', coalesce(b.faixas, '[]'::jsonb),
                'descontos', coalesce(b.descontos, '[]'::jsonb),
                'ativo', (
                  b.faixas is not null
                  and jsonb_typeof(b.faixas) = 'array'
                  and jsonb_array_length(b.faixas) > 0
                )
              ),
              'geometry', ST_AsGeoJSON(b.geom)::jsonb
            )
            order by b.regiao, b.distrito, b.nome
          )
          from public.delivery_bairros_frete b
        ),
        '[]'::jsonb
      )
    ),
    jsonb_build_object('type', 'FeatureCollection', 'features', '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------------
-- Localizar bairro: inclui config
-- ---------------------------------------------------------------------------
create or replace function public.localizar_bairro_frete(
  p_lat double precision,
  p_lng double precision
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_row public.delivery_bairros_frete%rowtype;
  v_pt extensions.geometry;
begin
  if p_lat is null or p_lng is null then
    return null;
  end if;
  if p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    return null;
  end if;

  v_pt := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326);

  select * into v_row
  from public.delivery_bairros_frete b
  where ST_Covers(b.geom, v_pt)
  order by ST_Area(b.geom::extensions.geography) asc
  limit 1;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'slug', v_row.slug,
    'nome', v_row.nome,
    'regiao', v_row.regiao,
    'distrito', v_row.distrito,
    'taxa', v_row.taxa,
    'raio_km', v_row.raio_km,
    'faixas', coalesce(v_row.faixas, '[]'::jsonb),
    'descontos', coalesce(v_row.descontos, '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Salvar config completa do bairro
-- ---------------------------------------------------------------------------
create or replace function public.atualizar_config_bairro_frete(
  p_id uuid,
  p_raio_km numeric,
  p_faixas jsonb,
  p_descontos jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.delivery_bairros_frete%rowtype;
  v_faixas jsonb := coalesce(p_faixas, '[]'::jsonb);
  v_descontos jsonb := coalesce(p_descontos, '[]'::jsonb);
  v_taxa_min numeric := null;
  v_item jsonb;
  v_t numeric;
begin
  if p_raio_km is not null and p_raio_km <= 0 then
    raise exception 'Raio do bairro inválido.';
  end if;

  if jsonb_typeof(v_faixas) <> 'array' then
    raise exception 'Faixas inválidas.';
  end if;
  if jsonb_typeof(v_descontos) <> 'array' then
    raise exception 'Descontos inválidos.';
  end if;

  for v_item in select * from jsonb_array_elements(v_faixas)
  loop
    if nullif(v_item->>'ate_km', '')::numeric is null
       or nullif(v_item->>'taxa', '')::numeric is null
       or (v_item->>'ate_km')::numeric <= 0
       or (v_item->>'taxa')::numeric < 0 then
      raise exception 'Cada faixa precisa de ate_km > 0 e taxa ≥ 0.';
    end if;
    v_t := (v_item->>'taxa')::numeric;
    if v_taxa_min is null or v_t < v_taxa_min then
      v_taxa_min := v_t;
    end if;
  end loop;

  if jsonb_array_length(v_faixas) = 0 then
    v_taxa_min := null;
  end if;

  update public.delivery_bairros_frete
  set
    raio_km = p_raio_km,
    faixas = v_faixas,
    descontos = v_descontos,
    taxa = case when v_taxa_min is null then null else round(v_taxa_min, 2) end,
    atualizado_em = now()
  where id = p_id
  returning * into v_row;

  if not found then
    raise exception 'Bairro não encontrado.';
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'slug', v_row.slug,
    'nome', v_row.nome,
    'regiao', v_row.regiao,
    'distrito', v_row.distrito,
    'taxa', v_row.taxa,
    'raio_km', v_row.raio_km,
    'faixas', coalesce(v_row.faixas, '[]'::jsonb),
    'descontos', coalesce(v_row.descontos, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.atualizar_config_bairro_frete(uuid, numeric, jsonb, jsonb)
  to authenticated;

-- Mantém RPC antiga: taxa única → uma faixa (compat).
create or replace function public.atualizar_taxa_bairro_frete(
  p_id uuid,
  p_taxa numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.delivery_bairros_frete%rowtype;
  v_raio numeric;
begin
  if p_taxa is not null and p_taxa < 0 then
    raise exception 'Taxa de frete inválida.';
  end if;

  select * into v_row from public.delivery_bairros_frete where id = p_id;
  if not found then
    raise exception 'Bairro não encontrado.';
  end if;

  v_raio := coalesce(v_row.raio_km, public.bairro_frete_raio_efetivo(v_row.raio_km, v_row.faixas), 50);

  if p_taxa is null then
    return public.atualizar_config_bairro_frete(p_id, v_raio, '[]'::jsonb, '[]'::jsonb);
  end if;

  return public.atualizar_config_bairro_frete(
    p_id,
    v_raio,
    jsonb_build_array(jsonb_build_object('ate_km', v_raio, 'taxa', round(p_taxa, 2))),
    coalesce(v_row.descontos, '[]'::jsonb)
  );
end;
$$;

-- Taxa mínima entre bairros (menor taxa de qualquer faixa)
create or replace function public.taxa_minima_bairro_frete()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(min((f->>'taxa')::numeric), 0)
  from public.delivery_bairros_frete b
  cross join lateral jsonb_array_elements(coalesce(b.faixas, '[]'::jsonb)) as f
  where nullif(f->>'taxa', '') is not null;
$$;

-- ---------------------------------------------------------------------------
-- criar_pedido_delivery: valida híbrido no modo bairro
-- ---------------------------------------------------------------------------
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

      -- Chuva só aumenta a base antes do desconto; piso = cálculo sem chuva.
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
