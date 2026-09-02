-- Corrige encomendas_restantes = 0 quando nada foi encomendado.
-- Causa: SELECT INTO sem linha deixa a variável NULL; greatest(limite - NULL, 0) = 0.
-- Também: depois do cutoff, o limite/contador passam a ser do dia da retirada.

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
  v_pronto integer := 0;
  v_contador integer := 0;
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
  if not found then
    v_pronto := 0;
  end if;

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

  -- Dia cujo limite/contador vale: hoje (antes do cutoff) ou dia da retirada (depois).
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

  select coalesce(ec.quantidade, 0) into v_contador
  from public.produto_encomenda_contador ec
  where ec.produto_id = p_produto_id and ec.referencia_data = v_data_ref;
  if not found then
    v_contador := 0;
  end if;
  v_contador := coalesce(v_contador, 0);

  if v_contador >= v_limite then
    return jsonb_build_object(
      'modo', 'indisponivel',
      'encomenda_programada', true,
      'estoque_pronto', 0,
      'encomendas_restantes', 0,
      'mensagem', 'Encomendas esgotadas para a data de retirada'
    );
  end if;

  return jsonb_build_object(
    'modo', 'encomenda',
    'encomenda_programada', true,
    'estoque_pronto', 0,
    'retirada_em', v_retirada,
    'encomendas_restantes', greatest(v_limite - v_contador, 0),
    'mensagem', v_msg
  );
end;
$$;

-- Contador de encomenda: conta no dia da retirada (agendado_para), não só "hoje".
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
  v_data_contador date;
  v_agendado timestamptz;
  v_modo text;
  v_pronto integer;
  v_encomenda boolean;
begin
  if not exists (select 1 from public.pedidos where id = p_pedido_id) then
    raise exception 'Pedido não encontrado.';
  end if;

  select origem::text, agendado_para
  into v_origem, v_agendado
  from public.pedidos
  where id = p_pedido_id;

  v_data := public.data_referencia_sp(now());
  v_data_contador := case
    when v_agendado is not null then public.data_referencia_sp(v_agendado)
    else v_data
  end;

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
      values (r.produto_id, v_data_contador, r.quantidade)
      on conflict (produto_id, referencia_data)
      do update set quantidade = public.produto_encomenda_contador.quantidade + excluded.quantidade;
      continue;
    end if;

    if v_encomenda and (v_modo = 'pronto' or v_modo is null) then
      select coalesce(ep.quantidade, 0) into v_pronto
      from public.produto_estoque_pronto ep
      where ep.produto_id = r.produto_id and ep.referencia_data = v_data;
      if not found then
        v_pronto := 0;
      end if;
      v_pronto := coalesce(v_pronto, 0);

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

grant execute on function public.calcular_disponibilidade_encomenda(uuid, timestamptz) to anon, authenticated;
grant execute on function public.baixar_estoque_pedido(uuid) to authenticated;
