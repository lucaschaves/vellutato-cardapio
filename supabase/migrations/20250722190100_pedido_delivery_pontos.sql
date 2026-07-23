-- Pontos + pedido delivery (rodar após 20250722190000_delivery_online.sql)

-- Credita pontos 1:1 sobre subtotal de itens (pedido pago / na_loja)
create or replace function public.creditar_pontos_pedido(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido public.pedidos%rowtype;
  v_pontos integer;
  v_cfg public.delivery_config%rowtype;
begin
  select * into v_pedido from public.pedidos where id = p_pedido_id;
  if not found then return; end if;
  if v_pedido.cliente_id is null then return; end if;
  if v_pedido.status_pagamento not in ('pago', 'na_loja') then return; end if;

  if exists (
    select 1 from public.pontos_extrato
    where pedido_id = p_pedido_id and tipo = 'credito'
  ) then
    return;
  end if;

  select * into v_cfg from public.delivery_config where id = 1;
  v_pontos := floor(
    coalesce(v_pedido.subtotal_itens, v_pedido.total, 0)
    * coalesce(v_cfg.pontos_por_real, 1)
  )::integer;

  if v_pontos <= 0 then return; end if;

  insert into public.cliente_pontos (cliente_id, saldo, atualizado_em)
  values (v_pedido.cliente_id, v_pontos, now())
  on conflict (cliente_id) do update
    set saldo = public.cliente_pontos.saldo + excluded.saldo,
        atualizado_em = now();

  insert into public.pontos_extrato (cliente_id, pedido_id, pontos, tipo, descricao)
  values (
    v_pedido.cliente_id,
    p_pedido_id,
    v_pontos,
    'credito',
    'Pontos do pedido #' || coalesce(v_pedido.sequencia_pedido::text, '')
  );
end;
$$;

grant execute on function public.creditar_pontos_pedido(uuid) to anon, authenticated;

-- Pedido delivery: cria com campos de frete/pagamento; aguardando não conta no limite de cozinha.
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
  v_pedidos_ativos integer;
  v_pedido_id uuid;
  v_sequencia integer;
  v_item jsonb;
  v_item_id uuid;
  v_adc jsonb;
  v_escolha jsonb;
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
    'pendente'::public.tipo_status_pedido,
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

-- Resgate: debita pontos e cria cupom
create or replace function public.resgatar_pontos(p_cliente_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg public.delivery_config%rowtype;
  v_saldo integer;
  v_codigo text;
  v_cupom_id uuid;
begin
  select * into v_cfg from public.delivery_config where id = 1;
  select coalesce(saldo, 0) into v_saldo
  from public.cliente_pontos where cliente_id = p_cliente_id;

  if coalesce(v_saldo, 0) < v_cfg.resgate_pontos then
    raise exception 'Pontos insuficientes. Necessário % pontos.', v_cfg.resgate_pontos;
  end if;

  update public.cliente_pontos
  set saldo = saldo - v_cfg.resgate_pontos,
      atualizado_em = now()
  where cliente_id = p_cliente_id;

  insert into public.pontos_extrato (cliente_id, pontos, tipo, descricao)
  values (
    p_cliente_id,
    -v_cfg.resgate_pontos,
    'debito',
    'Resgate por cupom de R$ ' || v_cfg.resgate_valor_reais::text
  );

  v_codigo := 'PTS' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into public.cupons (
    codigo, tipo, valor, ativo, limite_uso, usos, cliente_id
  ) values (
    v_codigo,
    'fixo',
    v_cfg.resgate_valor_reais,
    true,
    1,
    0,
    p_cliente_id
  )
  returning id into v_cupom_id;

  return jsonb_build_object(
    'cupom_id', v_cupom_id,
    'codigo', v_codigo,
    'valor', v_cfg.resgate_valor_reais,
    'pontos_debitados', v_cfg.resgate_pontos
  );
end;
$$;

grant execute on function public.resgatar_pontos(uuid) to authenticated, anon;
