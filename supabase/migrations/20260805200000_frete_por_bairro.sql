-- Frete por bairro (Florianópolis) + switch de modo.
-- Fonte dos nomes: Decreto nº 29.142/2026 (Prefeitura de Florianópolis).

create extension if not exists postgis with schema extensions;

-- ---------------------------------------------------------------------------
-- delivery_config: modo de cálculo do frete
-- ---------------------------------------------------------------------------
alter table public.delivery_config
  add column if not exists modo_frete text not null default 'distancia';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'delivery_config_modo_frete_check'
  ) then
    alter table public.delivery_config
      add constraint delivery_config_modo_frete_check
      check (modo_frete in ('distancia', 'bairro'));
  end if;
end $$;

comment on column public.delivery_config.modo_frete is
  'distancia = faixas por km; bairro = preço por polígono oficial';

-- ---------------------------------------------------------------------------
-- Tabela de bairros com polígono
-- ---------------------------------------------------------------------------
create table if not exists public.delivery_bairros_frete (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  nome text not null,
  regiao text not null default '',
  distrito text not null default '',
  geom extensions.geometry(MultiPolygon, 4326) not null,
  taxa numeric(10, 2),
  atualizado_em timestamptz not null default now()
);

create index if not exists delivery_bairros_frete_geom_idx
  on public.delivery_bairros_frete
  using gist (geom);

create index if not exists delivery_bairros_frete_nome_idx
  on public.delivery_bairros_frete (nome);

alter table public.delivery_bairros_frete enable row level security;

drop policy if exists delivery_bairros_frete_select_todos on public.delivery_bairros_frete;
create policy delivery_bairros_frete_select_todos
  on public.delivery_bairros_frete
  for select
  to anon, authenticated
  using (true);

drop policy if exists delivery_bairros_frete_update_admin on public.delivery_bairros_frete;
create policy delivery_bairros_frete_update_admin
  on public.delivery_bairros_frete
  for update
  to authenticated
  using (true)
  with check (true);

grant select on public.delivery_bairros_frete to anon, authenticated;
grant update (taxa, atualizado_em) on public.delivery_bairros_frete to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: listar bairros como GeoJSON FeatureCollection (para o mapa admin)
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
                'taxa', b.taxa
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

grant execute on function public.listar_bairros_frete_geojson() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: localizar bairro por coordenadas (ST_Covers)
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
    'taxa', v_row.taxa
  );
end;
$$;

grant execute on function public.localizar_bairro_frete(double precision, double precision)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: atualizar taxa de um bairro
-- ---------------------------------------------------------------------------
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
begin
  if p_taxa is not null and p_taxa < 0 then
    raise exception 'Taxa de frete inválida.';
  end if;

  update public.delivery_bairros_frete
  set
    taxa = case when p_taxa is null then null else round(p_taxa, 2) end,
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
    'taxa', v_row.taxa
  );
end;
$$;

grant execute on function public.atualizar_taxa_bairro_frete(uuid, numeric)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Helper: taxa mínima entre bairros configurados
-- ---------------------------------------------------------------------------
create or replace function public.taxa_minima_bairro_frete()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(min(taxa), 0)
  from public.delivery_bairros_frete
  where taxa is not null;
$$;

grant execute on function public.taxa_minima_bairro_frete() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- criar_pedido_delivery: valida raio (modo distancia) ou bairro (modo bairro)
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
  v_taxa_base numeric;
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
      v_bairro := public.localizar_bairro_frete(
        v_dest_lat::double precision,
        v_dest_lng::double precision
      );

      if v_bairro is null then
        raise exception 'FORA_AREA: Endereço fora dos bairros de entrega de Florianópolis.';
      end if;

      if v_bairro->>'taxa' is null then
        raise exception 'FORA_AREA: Não entregamos no bairro %.',
          coalesce(v_bairro->>'nome', 'informado');
      end if;

      v_taxa_base := (v_bairro->>'taxa')::numeric;

      -- Cliente não pode pagar menos que a taxa-base do bairro (acréscimo de chuva ok).
      if coalesce(p_taxa_entrega, 0) + 0.01 < v_taxa_base then
        raise exception 'TAXA_INVALIDA: Taxa de entrega inconsistente para o bairro %.',
          coalesce(v_bairro->>'nome', '');
      end if;

      -- Mantém distância informativa quando a loja tem coordenadas.
      if v_delivery.loja_latitude is not null and v_delivery.loja_longitude is not null then
        v_distancia := public.distancia_km_coords(
          v_delivery.loja_latitude::numeric,
          v_delivery.loja_longitude::numeric,
          v_dest_lat,
          v_dest_lng
        );
        p_distancia_km := case when v_distancia is null then null else round(v_distancia, 3) end;
      end if;

      -- Snapshot do bairro resolvido no servidor (não confiar no texto do cliente).
      p_endereco_json := coalesce(p_endereco_json, '{}'::jsonb)
        || jsonb_build_object(
          'bairro_oficial', v_bairro->>'nome',
          'bairro_slug', v_bairro->>'slug',
          'bairro_id', v_bairro->>'id'
        );
    else
      -- Modo distância (legado): valida raio Haversine.
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
