-- Encomenda programada: estoque pronto + encomenda com cutoff/horários por dia.

-- ---------------------------------------------------------------------------
-- Templates reutilizáveis
-- ---------------------------------------------------------------------------
create table if not exists public.encomenda_programada_templates (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.encomenda_programada_template_dias (
  template_id uuid not null references public.encomenda_programada_templates (id) on delete cascade,
  dia_semana smallint not null check (dia_semana between 0 and 6),
  ativo boolean not null default true,
  cutoff time not null default '12:00:00',
  horas_ate_retirada smallint not null default 2 check (horas_ate_retirada between 0 and 48),
  dias_apos_cutoff smallint not null default 1 check (dias_apos_cutoff between 0 and 30),
  limite_encomendas integer not null default 30 check (limite_encomendas >= 0),
  primary key (template_id, dia_semana)
);

alter table public.produtos
  add column if not exists encomenda_programada boolean not null default false,
  add column if not exists encomenda_template_id uuid references public.encomenda_programada_templates (id) on delete set null;

-- Override por produto (null = herda do template)
create table if not exists public.produto_encomenda_regras (
  produto_id uuid not null references public.produtos (id) on delete cascade,
  dia_semana smallint not null check (dia_semana between 0 and 6),
  ativo boolean,
  cutoff time,
  horas_ate_retirada smallint check (horas_ate_retirada is null or horas_ate_retirada between 0 and 48),
  dias_apos_cutoff smallint check (dias_apos_cutoff is null or dias_apos_cutoff between 0 and 30),
  limite_encomendas integer check (limite_encomendas is null or limite_encomendas >= 0),
  primary key (produto_id, dia_semana)
);

-- Estoque pronto do dia (venda imediata)
create table if not exists public.produto_estoque_pronto (
  produto_id uuid not null references public.produtos (id) on delete cascade,
  referencia_data date not null,
  quantidade integer not null default 0 check (quantidade >= 0),
  primary key (produto_id, referencia_data)
);

-- Contador de encomendas do dia
create table if not exists public.produto_encomenda_contador (
  produto_id uuid not null references public.produtos (id) on delete cascade,
  referencia_data date not null,
  quantidade integer not null default 0 check (quantidade >= 0),
  primary key (produto_id, referencia_data)
);

alter table public.pedido_itens
  add column if not exists modo_encomenda text check (modo_encomenda in ('pronto', 'encomenda'));

comment on column public.pedido_itens.modo_encomenda is
  'pronto = baixa estoque pronto; encomenda = incrementa contador diário.';

-- ---------------------------------------------------------------------------
-- Helpers fuso São Paulo
-- ---------------------------------------------------------------------------
create or replace function public.data_referencia_sp(p_ts timestamptz default now())
returns date
language sql
stable
as $$
  select (timezone('America/Sao_Paulo', p_ts))::date;
$$;

create or replace function public.dow_sp(p_ts timestamptz default now())
returns smallint
language sql
stable
as $$
  select extract(dow from timezone('America/Sao_Paulo', p_ts))::smallint;
$$;

create or replace function public.hora_sp(p_ts timestamptz default now())
returns time
language sql
stable
as $$
  select (timezone('America/Sao_Paulo', p_ts))::time;
$$;

-- Próximo dia (a partir de p_data) em que a loja abre, até 21 dias.
create or replace function public.proximo_dia_loja_aberta(p_data date)
returns date
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cursor date := p_data;
  v_dow smallint;
  v_h public.loja_horarios%rowtype;
  i integer;
begin
  for i in 0..21 loop
    v_dow := extract(dow from v_cursor)::smallint;
    select * into v_h
    from public.loja_horarios h
    where h.dia_semana = v_dow;
    if found and coalesce(v_h.aberto, false) then
      return v_cursor;
    end if;
    v_cursor := v_cursor + 1;
  end loop;
  return p_data;
end;
$$;

-- Regra efetiva produto × dia (override > template > defaults)
create or replace function public.regra_encomenda_produto(
  p_produto_id uuid,
  p_dia_semana smallint
)
returns table (
  ativo boolean,
  cutoff time,
  horas_ate_retirada smallint,
  dias_apos_cutoff smallint,
  limite_encomendas integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_prod public.produtos%rowtype;
  v_ov public.produto_encomenda_regras%rowtype;
  v_tpl public.encomenda_programada_template_dias%rowtype;
begin
  select * into v_prod from public.produtos where id = p_produto_id;
  if not found or not coalesce(v_prod.encomenda_programada, false) then
    return;
  end if;

  select * into v_ov
  from public.produto_encomenda_regras r
  where r.produto_id = p_produto_id and r.dia_semana = p_dia_semana;

  if v_prod.encomenda_template_id is not null then
    select * into v_tpl
    from public.encomenda_programada_template_dias d
    where d.template_id = v_prod.encomenda_template_id
      and d.dia_semana = p_dia_semana;
  end if;

  ativo := coalesce(v_ov.ativo, v_tpl.ativo, true);
  cutoff := coalesce(v_ov.cutoff, v_tpl.cutoff, time '12:00');
  horas_ate_retirada := coalesce(v_ov.horas_ate_retirada, v_tpl.horas_ate_retirada, 2);
  dias_apos_cutoff := coalesce(v_ov.dias_apos_cutoff, v_tpl.dias_apos_cutoff, 1);
  limite_encomendas := coalesce(v_ov.limite_encomendas, v_tpl.limite_encomendas, 30);
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- Disponibilidade: pronto | encomenda | indisponivel
-- Estoque pronto sempre vende normal, mesmo após cutoff ou limite de encomenda.
-- ---------------------------------------------------------------------------
create or replace function public.calcular_disponibilidade_encomenda(
  p_produto_id uuid,
  p_agora timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_prod public.produtos%rowtype;
  v_data date;
  v_dow smallint;
  v_pronto integer;
  v_contador integer;
  v_regra record;
  v_cutoff_ts timestamptz;
  v_retirada timestamptz;
  v_data_base date;
  v_hora_atual time;
  v_msg text;
begin
  select * into v_prod from public.produtos where id = p_produto_id;
  if not found then
    return jsonb_build_object('modo', 'indisponivel', 'mensagem', 'Produto não encontrado');
  end if;

  if not coalesce(v_prod.encomenda_programada, false) then
    if coalesce(v_prod.controlar_estoque, false)
       and coalesce(v_prod.quantidade_estoque, 0) <= 0 then
      return jsonb_build_object(
        'modo', 'indisponivel',
        'encomenda_programada', false,
        'mensagem', 'Produto esgotado'
      );
    end if;
    return jsonb_build_object(
      'modo', 'pronto',
      'encomenda_programada', false,
      'estoque_pronto', null,
      'mensagem', 'Disponível'
    );
  end if;

  v_data := public.data_referencia_sp(p_agora);
  v_dow := public.dow_sp(p_agora);
  v_hora_atual := public.hora_sp(p_agora);

  select coalesce(ep.quantidade, 0) into v_pronto
  from public.produto_estoque_pronto ep
  where ep.produto_id = p_produto_id and ep.referencia_data = v_data;

  if v_pronto > 0 then
    return jsonb_build_object(
      'modo', 'pronto',
      'encomenda_programada', true,
      'estoque_pronto', v_pronto,
      'mensagem', format('%s unidade(s) pronta(s) — disponível agora', v_pronto)
    );
  end if;

  select * into v_regra from public.regra_encomenda_produto(p_produto_id, v_dow);
  if not found or not coalesce(v_regra.ativo, false) then
    return jsonb_build_object(
      'modo', 'indisponivel',
      'encomenda_programada', true,
      'estoque_pronto', 0,
      'mensagem', 'Indisponível hoje'
    );
  end if;

  select coalesce(ec.quantidade, 0) into v_contador
  from public.produto_encomenda_contador ec
  where ec.produto_id = p_produto_id and ec.referencia_data = v_data;

  if v_contador >= v_regra.limite_encomendas then
    return jsonb_build_object(
      'modo', 'indisponivel',
      'encomenda_programada', true,
      'estoque_pronto', 0,
      'encomendas_restantes', 0,
      'mensagem', 'Encomendas de hoje esgotadas'
    );
  end if;

  if v_hora_atual <= v_regra.cutoff then
    v_retirada := p_agora + (v_regra.horas_ate_retirada || ' hours')::interval;
    v_msg := 'Sob encomenda — retirada estimada em breve';
  else
    v_data_base := v_data + v_regra.dias_apos_cutoff;
    v_data_base := public.proximo_dia_loja_aberta(v_data_base);
    v_retirada := (v_data_base::text || ' ' || v_hora_atual::text)::timestamp
      at time zone 'America/Sao_Paulo'
      + (v_regra.horas_ate_retirada || ' hours')::interval;
    v_msg := 'Sob encomenda — produção no próximo dia disponível';
  end if;

  return jsonb_build_object(
    'modo', 'encomenda',
    'encomenda_programada', true,
    'estoque_pronto', 0,
    'retirada_em', v_retirada,
    'encomendas_restantes', greatest(v_regra.limite_encomendas - v_contador, 0),
    'mensagem', v_msg
  );
end;
$$;

grant execute on function public.calcular_disponibilidade_encomenda(uuid, timestamptz) to anon, authenticated;

-- Valida retirada futura (encomenda programada)
create or replace function public.validar_retirada_encomenda(p_retirada timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_retirada is null then
    raise exception 'ENCOMENDA_INVALIDA: Horário de retirada obrigatório.';
  end if;
  if p_retirada <= now() then
    raise exception 'ENCOMENDA_INVALIDA: Retirada deve ser no futuro.';
  end if;
  if p_retirada > now() + interval '30 days' then
    raise exception 'ENCOMENDA_INVALIDA: Retirada muito distante.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Baixa estoque: pronto → produto_estoque_pronto; encomenda → contador
-- Produtos encomenda_programada não desativam ativo por quantidade_estoque.
-- ---------------------------------------------------------------------------
create or replace function public.baixar_estoque_pedido(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_nova_quantidade integer;
  v_origem text;
  v_data date;
  v_modo text;
  v_pronto integer;
  v_encomenda boolean;
begin
  if not exists (select 1 from public.pedidos where id = p_pedido_id) then
    raise exception 'Pedido não encontrado.';
  end if;

  select origem::text into v_origem from public.pedidos where id = p_pedido_id;
  v_data := public.data_referencia_sp(now());

  -- Itens simples com modo encomenda
  for r in
    select
      pi.id as pedido_item_id,
      pi.produto_id,
      pi.quantidade,
      pi.modo_encomenda,
      p.nome,
      coalesce(p.encomenda_programada, false) as encomenda_programada,
      coalesce(p.controlar_estoque, false) as controlar_estoque,
      coalesce(p.quantidade_estoque, 0)::integer as quantidade_estoque
    from public.pedido_itens pi
    join public.produtos p on p.id = pi.produto_id
    where pi.pedido_id = p_pedido_id
      and coalesce(p.tipo::text, 'simples') <> 'combo'
  loop
    v_modo := r.modo_encomenda;
    v_encomenda := r.encomenda_programada;

    if v_encomenda and v_modo = 'encomenda' then
      insert into public.produto_encomenda_contador (produto_id, referencia_data, quantidade)
      values (r.produto_id, v_data, r.quantidade)
      on conflict (produto_id, referencia_data)
      do update set quantidade = public.produto_encomenda_contador.quantidade + excluded.quantidade;
      continue;
    end if;

    if v_encomenda and (v_modo = 'pronto' or v_modo is null) then
      select coalesce(ep.quantidade, 0) into v_pronto
      from public.produto_estoque_pronto ep
      where ep.produto_id = r.produto_id and ep.referencia_data = v_data;

      if v_pronto < r.quantidade and v_origem is distinct from 'ifood' then
        raise exception
          'Estoque pronto insuficiente para "%". Disponível: %, solicitado: %',
          r.nome, v_pronto, r.quantidade;
      end if;

      insert into public.produto_estoque_pronto (produto_id, referencia_data, quantidade)
      values (r.produto_id, v_data, greatest(v_pronto - r.quantidade, 0))
      on conflict (produto_id, referencia_data)
      do update set quantidade = greatest(public.produto_estoque_pronto.quantidade - r.quantidade, 0);
      continue;
    end if;

    if not r.controlar_estoque then
      continue;
    end if;
    if v_origem is distinct from 'ifood'
       and r.quantidade_estoque < r.quantidade then
      raise exception
        'Estoque insuficiente para "%". Disponível: %, solicitado: %',
        r.nome, r.quantidade_estoque, r.quantidade;
    end if;
    v_nova_quantidade := r.quantidade_estoque - r.quantidade;
    update public.produtos
    set
      quantidade_estoque = v_nova_quantidade,
      ativo = case
        when coalesce(encomenda_programada, false) then ativo
        when v_nova_quantidade <= 0 then false
        else ativo
      end
    where id = r.produto_id;
  end loop;

  -- Combos (sem modo_encomenda no item — filhos)
  for r in
    select
      x.produto_id,
      sum(x.quantidade)::integer as quantidade,
      p.nome,
      coalesce(p.controlar_estoque, false) as controlar_estoque,
      coalesce(p.quantidade_estoque, 0)::integer as quantidade_estoque,
      coalesce(p.encomenda_programada, false) as encomenda_programada
    from (
      select c.produto_escolhido_id as produto_id, pi.quantidade
      from public.pedido_itens pi
      join public.produtos prod on prod.id = pi.produto_id
      join public.pedido_item_combo_escolhas c on c.pedido_item_id = pi.id
      where pi.pedido_id = p_pedido_id
        and prod.tipo = 'combo'
        and c.produto_escolhido_id is not null
    ) x
    join public.produtos p on p.id = x.produto_id
    where not coalesce(p.encomenda_programada, false)
    group by x.produto_id, p.nome, p.controlar_estoque, p.quantidade_estoque, p.encomenda_programada
  loop
    if not r.controlar_estoque then continue; end if;
    if v_origem is distinct from 'ifood' and r.quantidade_estoque < r.quantidade then
      raise exception
        'Estoque insuficiente para "%". Disponível: %, solicitado: %',
        r.nome, r.quantidade_estoque, r.quantidade;
    end if;
    v_nova_quantidade := r.quantidade_estoque - r.quantidade;
    update public.produtos
    set quantidade_estoque = v_nova_quantidade,
        ativo = case when v_nova_quantidade <= 0 then false else ativo end
    where id = r.produto_id;
  end loop;

  perform public.baixar_insumos_pedido(p_pedido_id);
end;
$$;

-- iFood: disponível se pronto ou encomenda
create or replace function public.produto_disponivel_ifood(p_produto_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (public.calcular_disponibilidade_encomenda(p_produto_id)->>'modo') in ('pronto', 'encomenda'),
    false
  )
  and exists (
    select 1 from public.produtos p
    where p.id = p_produto_id and coalesce(p.ativo, true)
  );
$$;

grant execute on function public.produto_disponivel_ifood(uuid) to anon, authenticated, service_role;

-- Lote para vitrine (feed)
create or replace function public.calcular_disponibilidade_encomenda_lote(
  p_produto_ids uuid[],
  p_agora timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_out jsonb := '{}'::jsonb;
begin
  if p_produto_ids is null then
    return v_out;
  end if;
  foreach v_id in array p_produto_ids
  loop
    v_out := v_out || jsonb_build_object(
      v_id::text,
      public.calcular_disponibilidade_encomenda(v_id, p_agora)
    );
  end loop;
  return v_out;
end;
$$;

grant execute on function public.calcular_disponibilidade_encomenda_lote(uuid[], timestamptz)
  to anon, authenticated;

-- Resolve modo por item e retorna maior retirada entre encomendas
create or replace function public.resolver_encomenda_itens(p_itens jsonb)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_prod public.produtos%rowtype;
  v_disp jsonb;
  v_modo text;
  v_solicitado text;
  v_retirada timestamptz;
  v_max timestamptz;
begin
  if p_itens is null then
    return null;
  end if;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    select * into v_prod
    from public.produtos
    where id = (v_item->>'produto_id')::uuid;

    if not found or not coalesce(v_prod.encomenda_programada, false) then
      continue;
    end if;

    v_disp := public.calcular_disponibilidade_encomenda(v_prod.id);
    v_solicitado := nullif(trim(coalesce(v_item->>'modo_encomenda', '')), '');

    if v_solicitado is not null then
      v_modo := v_solicitado;
    else
      v_modo := v_disp->>'modo';
    end if;

    if v_modo = 'indisponivel' then
      raise exception 'ENCOMENDA_INDISPONIVEL: "%" indisponível no momento.', v_prod.nome;
    end if;

    if v_modo = 'pronto' then
      if coalesce((v_disp->>'estoque_pronto')::integer, 0) < greatest((v_item->>'quantidade')::integer, 1) then
        raise exception 'Estoque pronto insuficiente para "%".', v_prod.nome;
      end if;
    elsif v_modo = 'encomenda' then
      if (v_disp->>'modo') = 'indisponivel' then
        raise exception 'ENCOMENDA_INDISPONIVEL: Encomendas esgotadas para "%".', v_prod.nome;
      end if;
      v_retirada := nullif(v_disp->>'retirada_em', '')::timestamptz;
      if v_retirada is null then
        raise exception 'ENCOMENDA_INVALIDA: Não foi possível calcular retirada para "%".', v_prod.nome;
      end if;
      if v_max is null or v_retirada > v_max then
        v_max := v_retirada;
      end if;
    else
      raise exception 'ENCOMENDA_INVALIDA: Modo inválido para "%".', v_prod.nome;
    end if;
  end loop;

  return v_max;
end;
$$;

-- Mesa / balcão / totem / admin com agendamento por encomenda
drop function if exists public.criar_pedido_completo(
  text, text, uuid, uuid, numeric, text, text, numeric, numeric, jsonb
);

create or replace function public.criar_pedido_completo(
  p_cliente_nome text,
  p_cliente_celular text,
  p_cliente_id uuid,
  p_cupom_id uuid,
  p_desconto numeric,
  p_origem text,
  p_identificador text,
  p_total numeric,
  p_valor_total numeric,
  p_itens jsonb,
  p_agendado_para timestamptz default null
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
  v_agendado timestamptz;
  v_status public.tipo_status_pedido;
  v_modo_item text;
  v_prod_encomenda boolean;
begin
  v_agendado := coalesce(p_agendado_para, public.resolver_encomenda_itens(p_itens));

  v_status_loja := public.loja_aberta_agora();
  if v_agendado is not null then
    perform public.validar_retirada_encomenda(v_agendado);
  elsif not (v_status_loja->>'aberta')::boolean then
    raise exception 'LOJA_FECHADA: %', coalesce(v_status_loja->>'motivo', 'Loja fechada no momento.');
  end if;

  select * into v_config from public.loja_config where id = 1;
  if v_config.limite_pedidos_ativos is not null and v_agendado is null then
    select count(*) into v_pedidos_ativos
    from public.pedidos
    where status in ('pendente', 'em_producao')
      and agendado_para is null;

    if v_pedidos_ativos >= v_config.limite_pedidos_ativos then
      raise exception 'LOJA_CHEIA: Estamos com muitos pedidos agora. Tente novamente em alguns minutos.';
    end if;
  end if;

  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    raise exception 'Pedido sem itens.';
  end if;

  v_status := case when v_agendado is not null then 'pendente'::public.tipo_status_pedido
                   else 'em_producao'::public.tipo_status_pedido end;

  insert into public.pedidos (
    cliente_nome, cliente_celular, cliente_id, cupom_id, desconto_aplicado,
    status, origem, identificador, total, valor_total, agendado_para
  ) values (
    trim(p_cliente_nome),
    nullif(p_cliente_celular, ''),
    p_cliente_id,
    p_cupom_id,
    case when coalesce(p_desconto, 0) > 0 then p_desconto else null end,
    v_status,
    p_origem::public.tipo_origem_pedido,
    p_identificador,
    p_total,
    p_valor_total,
    v_agendado
  )
  returning id, sequencia_pedido into v_pedido_id, v_sequencia;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    select coalesce(encomenda_programada, false) into v_prod_encomenda
    from public.produtos where id = (v_item->>'produto_id')::uuid;

    v_modo_item := null;
    if v_prod_encomenda then
      v_modo_item := coalesce(
        nullif(trim(v_item->>'modo_encomenda'), ''),
        (public.calcular_disponibilidade_encomenda((v_item->>'produto_id')::uuid)->>'modo')
      );
      if v_modo_item not in ('pronto', 'encomenda') then
        raise exception 'ENCOMENDA_INDISPONIVEL: Produto indisponível.';
      end if;
    end if;

    insert into public.pedido_itens (
      pedido_id, produto_id, quantidade, preco_unitario, observacoes, modo_consumo, modo_encomenda
    ) values (
      v_pedido_id,
      (v_item->>'produto_id')::uuid,
      greatest((v_item->>'quantidade')::integer, 1),
      (v_item->>'preco_unitario')::numeric,
      nullif(trim(coalesce(v_item->>'observacoes', '')), ''),
      v_item->>'modo_consumo',
      v_modo_item
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

  return jsonb_build_object(
    'pedido_id', v_pedido_id,
    'sequencia_pedido', v_sequencia,
    'agendado_para', v_agendado
  );
end;
$$;

grant execute on function public.criar_pedido_completo(
  text, text, uuid, uuid, numeric, text, text, numeric, numeric, jsonb, timestamptz
) to anon, authenticated;

-- Delivery: mescla agendamento da loja com retirada mínima da encomenda
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
  v_agendado timestamptz;
  v_min_encomenda timestamptz;
  v_modo_item text;
  v_prod_encomenda boolean;
begin
  v_min_encomenda := public.resolver_encomenda_itens(p_itens);
  v_agendado := case
    when v_min_encomenda is null then p_agendado_para
    when p_agendado_para is null then v_min_encomenda
    when v_min_encomenda > p_agendado_para then v_min_encomenda
    else p_agendado_para
  end;

  v_status_loja := public.loja_aberta_agora();

  if v_agendado is not null then
    if v_min_encomenda is not null then
      perform public.validar_retirada_encomenda(v_agendado);
    else
      perform public.validar_agendamento_delivery(v_agendado);
    end if;
  elsif not (v_status_loja->>'aberta')::boolean then
    raise exception 'LOJA_FECHADA: %',
      coalesce(v_status_loja->>'motivo', 'Loja fechada no momento.');
  end if;

  select * into v_config from public.loja_config where id = 1;
  if v_config.limite_pedidos_ativos is not null
     and coalesce(p_status_pagamento, '') <> 'aguardando'
     and v_agendado is null then
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
    v_agendado
  )
  returning id, sequencia_pedido into v_pedido_id, v_sequencia;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    select coalesce(encomenda_programada, false) into v_prod_encomenda
    from public.produtos where id = (v_item->>'produto_id')::uuid;

    v_modo_item := null;
    if v_prod_encomenda then
      v_modo_item := coalesce(
        nullif(trim(v_item->>'modo_encomenda'), ''),
        (public.calcular_disponibilidade_encomenda((v_item->>'produto_id')::uuid)->>'modo')
      );
      if v_modo_item not in ('pronto', 'encomenda') then
        raise exception 'ENCOMENDA_INDISPONIVEL: Produto indisponível.';
      end if;
    end if;

    insert into public.pedido_itens (
      pedido_id, produto_id, quantidade, preco_unitario, observacoes, modo_consumo, modo_encomenda
    ) values (
      v_pedido_id,
      (v_item->>'produto_id')::uuid,
      greatest((v_item->>'quantidade')::integer, 1),
      (v_item->>'preco_unitario')::numeric,
      nullif(trim(coalesce(v_item->>'observacoes', '')), ''),
      coalesce(v_item->>'modo_consumo', 'levar'),
      v_modo_item
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
    'sequencia_pedido', v_sequencia,
    'agendado_para', v_agendado
  );
end;
$$;

grant execute on function public.criar_pedido_delivery(
  text, text, uuid, uuid, numeric, text, numeric, numeric, jsonb,
  text, text, numeric, numeric, text, jsonb, numeric, numeric, numeric, timestamptz
) to anon, authenticated;

-- Template padrão
insert into public.encomenda_programada_templates (id, nome)
values ('00000000-0000-4000-8000-000000000001', 'Padrão')
on conflict (id) do nothing;

insert into public.encomenda_programada_template_dias (
  template_id, dia_semana, ativo, cutoff, horas_ate_retirada, dias_apos_cutoff, limite_encomendas
)
select
  '00000000-0000-4000-8000-000000000001',
  d,
  true,
  time '12:00',
  2,
  1,
  30
from generate_series(0, 6) as d
on conflict (template_id, dia_semana) do nothing;

-- RLS
alter table public.encomenda_programada_templates enable row level security;
alter table public.encomenda_programada_template_dias enable row level security;
alter table public.produto_encomenda_regras enable row level security;
alter table public.produto_estoque_pronto enable row level security;
alter table public.produto_encomenda_contador enable row level security;

drop policy if exists encomenda_templates_admin on public.encomenda_programada_templates;
create policy encomenda_templates_admin on public.encomenda_programada_templates
  for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists encomenda_template_dias_admin on public.encomenda_programada_template_dias;
create policy encomenda_template_dias_admin on public.encomenda_programada_template_dias
  for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists produto_encomenda_regras_admin on public.produto_encomenda_regras;
create policy produto_encomenda_regras_admin on public.produto_encomenda_regras
  for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists produto_estoque_pronto_admin on public.produto_estoque_pronto;
create policy produto_estoque_pronto_admin on public.produto_estoque_pronto
  for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists produto_encomenda_contador_admin on public.produto_encomenda_contador;
create policy produto_encomenda_contador_admin on public.produto_encomenda_contador
  for all to authenticated using (public.eh_admin()) with check (public.eh_admin());
