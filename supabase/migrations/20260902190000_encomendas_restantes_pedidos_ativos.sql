-- Vagas de encomenda: conta pedidos já agendados no dia (fonte da verdade),
-- não só produto_encomenda_contador (que não era estornado no cancelamento).

create or replace function public.encomendas_consumidas_no_dia(
  p_produto_id uuid,
  p_data date
)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_live integer := 0;
begin
  -- Pedidos ativos (não cancelados) com item em modo encomenda na data.
  select coalesce(sum(pi.quantidade), 0)::integer
  into v_live
  from public.pedido_itens pi
  join public.pedidos p on p.id = pi.pedido_id
  where pi.produto_id = p_produto_id
    and coalesce(pi.modo_encomenda, '') = 'encomenda'
    and p.agendado_para is not null
    and public.data_referencia_sp(p.agendado_para) = p_data
    and p.status is distinct from 'cancelado'
    and coalesce(p.status_pagamento::text, 'nao_aplicavel')
      not in ('cancelado', 'expirado');

  return coalesce(v_live, 0);
end;
$$;

create or replace function public.encomendas_restantes_no_dia(
  p_produto_id uuid,
  p_data date
)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_dow smallint;
  v_regra record;
  v_limite integer;
  v_consumidas integer;
begin
  v_dow := extract(dow from p_data)::smallint;
  select * into v_regra from public.regra_encomenda_produto(p_produto_id, v_dow);
  if not found or not coalesce(v_regra.ativo, false) then
    return 0;
  end if;
  v_limite := greatest(coalesce(v_regra.limite_encomendas, 30), 0);
  v_consumidas := public.encomendas_consumidas_no_dia(p_produto_id, p_data);
  return greatest(v_limite - v_consumidas, 0);
end;
$$;

create or replace function public.calcular_ramo_encomenda(
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
  v_data date;
  v_dow smallint;
  v_regra record;
  v_regra_limite record;
  v_retirada timestamptz;
  v_data_ref date;
  v_data_retirada date;
  v_dow_retirada smallint;
  v_hora_atual time;
  v_cutoff_base time;
  v_tempo interval;
  v_limite integer;
  v_consumidas integer := 0;
  v_msg text;
begin
  v_data := public.data_referencia_sp(p_agora);
  v_dow := public.dow_sp(p_agora);
  v_hora_atual := public.hora_sp(p_agora);

  select * into v_regra from public.regra_encomenda_produto(p_produto_id, v_dow);
  if not found or not coalesce(v_regra.ativo, false) then
    return jsonb_build_object(
      'pode_agendar', false,
      'retirada_em', null,
      'encomendas_restantes', 0,
      'mensagem', 'Indisponível para encomenda hoje'
    );
  end if;

  if v_hora_atual <= v_regra.cutoff then
    v_data_ref := v_data;
    v_regra_limite := v_regra;
    v_retirada := p_agora + v_regra.tempo_ate_retirada;
    v_msg := 'Sob encomenda — retirada estimada em breve';
  else
    v_data_retirada := public.proximo_dia_loja_aberta(v_data + v_regra.dias_apos_cutoff);
    v_dow_retirada := extract(dow from v_data_retirada)::smallint;
    v_data_ref := v_data_retirada;

    select * into v_regra_limite
    from public.regra_encomenda_produto(p_produto_id, v_dow_retirada);

    if not found or not coalesce(v_regra_limite.ativo, false) then
      v_regra_limite := v_regra;
      v_cutoff_base := v_regra.cutoff;
      v_tempo := v_regra.tempo_ate_retirada;
    else
      v_cutoff_base := v_regra_limite.cutoff;
      v_tempo := v_regra_limite.tempo_ate_retirada;
    end if;

    v_retirada := (v_data_retirada::text || ' ' || v_cutoff_base::text)::timestamp
      at time zone 'America/Sao_Paulo'
      + v_tempo;
    v_msg := 'Sob encomenda — produção no próximo dia disponível';
  end if;

  v_limite := greatest(coalesce(v_regra_limite.limite_encomendas, 30), 0);
  v_consumidas := public.encomendas_consumidas_no_dia(p_produto_id, v_data_ref);

  if v_consumidas >= v_limite then
    return jsonb_build_object(
      'pode_agendar', false,
      'retirada_em', v_retirada,
      'encomendas_restantes', 0,
      'mensagem', 'Encomendas esgotadas para a data de retirada'
    );
  end if;

  return jsonb_build_object(
    'pode_agendar', true,
    'retirada_em', v_retirada,
    'encomendas_restantes', greatest(v_limite - v_consumidas, 0),
    'mensagem', v_msg
  );
end;
$$;

-- Estorna contador + estoque pronto ao cancelar
create or replace function public.cancelar_pedido_com_estoque(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_pedido public.pedidos%rowtype;
  v_data date;
  v_data_contador date;
  v_pronto integer;
begin
  select * into v_pedido
  from public.pedidos
  where id = p_pedido_id
  for update;

  if not found then
    raise exception 'Pedido não encontrado.';
  end if;
  if v_pedido.status = 'cancelado' then
    return;
  end if;

  v_data := public.data_referencia_sp(now());
  v_data_contador := case
    when v_pedido.agendado_para is not null
      then public.data_referencia_sp(v_pedido.agendado_para)
    else v_data
  end;

  for r in
    select
      pi.produto_id,
      pi.quantidade,
      pi.modo_encomenda,
      coalesce(p.encomenda_programada, false) as encomenda_programada,
      coalesce(p.controlar_estoque, false) as controlar_estoque,
      coalesce(p.tipo::text, 'simples') as tipo
    from public.pedido_itens pi
    join public.produtos p on p.id = pi.produto_id
    where pi.pedido_id = p_pedido_id
      and coalesce(p.tipo::text, 'simples') <> 'combo'
  loop
    if r.encomenda_programada and r.modo_encomenda = 'encomenda' then
      update public.produto_encomenda_contador
      set quantidade = greatest(quantidade - r.quantidade, 0)
      where produto_id = r.produto_id
        and referencia_data = v_data_contador;
      continue;
    end if;

    if r.encomenda_programada
       and (r.modo_encomenda = 'pronto' or r.modo_encomenda is null) then
      select coalesce(ep.quantidade, 0) into v_pronto
      from public.produto_estoque_pronto ep
      where ep.produto_id = r.produto_id and ep.referencia_data = v_data;
      if not found then
        v_pronto := 0;
      end if;
      insert into public.produto_estoque_pronto (produto_id, referencia_data, quantidade)
      values (r.produto_id, v_data, v_pronto + r.quantidade)
      on conflict (produto_id, referencia_data)
      do update set quantidade = public.produto_estoque_pronto.quantidade + excluded.quantidade;
      continue;
    end if;

    if not r.controlar_estoque then
      continue;
    end if;
    update public.produtos
    set
      quantidade_estoque = coalesce(quantidade_estoque, 0) + r.quantidade,
      ativo = true
    where id = r.produto_id;
  end loop;

  -- Combos (filhos sem encomenda)
  for r in
    select
      x.produto_id,
      sum(x.quantidade)::integer as quantidade,
      coalesce(p.controlar_estoque, false) as controlar_estoque
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
    group by x.produto_id, p.controlar_estoque
  loop
    if not r.controlar_estoque then
      continue;
    end if;
    update public.produtos
    set
      quantidade_estoque = coalesce(quantidade_estoque, 0) + r.quantidade,
      ativo = true
    where id = r.produto_id;
  end loop;

  perform public.estornar_insumos_pedido(p_pedido_id);

  if v_pedido.cliente_id is not null then
    perform public.atualizar_stats_cliente_pedido(
      v_pedido.cliente_id,
      -coalesce(v_pedido.total, 0),
      -1
    );
  end if;

  update public.pedidos
  set status = 'cancelado'
  where id = p_pedido_id;
end;
$$;

grant execute on function public.encomendas_consumidas_no_dia(uuid, date)
  to anon, authenticated;
grant execute on function public.encomendas_restantes_no_dia(uuid, date)
  to anon, authenticated;
