-- Agendamento com unidades prontas:
-- - Hoje + estoque pronto → modo pronto
-- - Dia futuro (ou hoje sem prontas) → modo encomenda
-- - Disponibilidade híbrida: pronto + dados de encomenda (pode_agendar / retirada_em)

-- ---------------------------------------------------------------------------
-- Cota restante num dia específico
-- ---------------------------------------------------------------------------
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
  v_contador integer := 0;
  v_limite integer;
begin
  v_dow := extract(dow from p_data)::smallint;
  select * into v_regra from public.regra_encomenda_produto(p_produto_id, v_dow);
  if not found or not coalesce(v_regra.ativo, false) then
    return 0;
  end if;
  v_limite := greatest(coalesce(v_regra.limite_encomendas, 30), 0);

  select coalesce(ec.quantidade, 0) into v_contador
  from public.produto_encomenda_contador ec
  where ec.produto_id = p_produto_id and ec.referencia_data = p_data;
  if not found then
    v_contador := 0;
  end if;

  return greatest(v_limite - coalesce(v_contador, 0), 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- Calcula ramo de encomenda (retirada_em + restantes), independente do pronto
-- ---------------------------------------------------------------------------
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
  v_contador integer := 0;
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

  select coalesce(ec.quantidade, 0) into v_contador
  from public.produto_encomenda_contador ec
  where ec.produto_id = p_produto_id and ec.referencia_data = v_data_ref;
  if not found then
    v_contador := 0;
  end if;
  v_contador := coalesce(v_contador, 0);

  if v_contador >= v_limite then
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
    'encomendas_restantes', greatest(v_limite - v_contador, 0),
    'mensagem', v_msg
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Disponibilidade híbrida
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
  v_pronto integer := 0;
  v_ramo jsonb;
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
      'pode_agendar', false,
      'mensagem', 'Disponível'
    );
  end if;

  v_data := public.data_referencia_sp(p_agora);

  select coalesce(ep.quantidade, 0) into v_pronto
  from public.produto_estoque_pronto ep
  where ep.produto_id = p_produto_id and ep.referencia_data = v_data;
  if not found then
    v_pronto := 0;
  end if;
  v_pronto := coalesce(v_pronto, 0);

  v_ramo := public.calcular_ramo_encomenda(p_produto_id, p_agora);

  if v_pronto > 0 then
    return jsonb_build_object(
      'modo', 'pronto',
      'encomenda_programada', true,
      'estoque_pronto', v_pronto,
      'pode_agendar', coalesce((v_ramo->>'pode_agendar')::boolean, false),
      'retirada_em', nullif(v_ramo->>'retirada_em', '')::timestamptz,
      'encomendas_restantes', coalesce((v_ramo->>'encomendas_restantes')::integer, 0),
      'mensagem', format(
        '%s unidade(s) prontas hoje — pode retirar agora ou agendar',
        v_pronto
      )
    );
  end if;

  if not coalesce((v_ramo->>'pode_agendar')::boolean, false) then
    return jsonb_build_object(
      'modo', 'indisponivel',
      'encomenda_programada', true,
      'estoque_pronto', 0,
      'pode_agendar', false,
      'retirada_em', nullif(v_ramo->>'retirada_em', '')::timestamptz,
      'encomendas_restantes', coalesce((v_ramo->>'encomendas_restantes')::integer, 0),
      'mensagem', coalesce(v_ramo->>'mensagem', 'Indisponível no momento')
    );
  end if;

  return jsonb_build_object(
    'modo', 'encomenda',
    'encomenda_programada', true,
    'estoque_pronto', 0,
    'pode_agendar', true,
    'retirada_em', nullif(v_ramo->>'retirada_em', '')::timestamptz,
    'encomendas_restantes', coalesce((v_ramo->>'encomendas_restantes')::integer, 0),
    'mensagem', coalesce(v_ramo->>'mensagem', 'Sob encomenda')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Modo pelo dia do agendamento (fonte da verdade no create)
-- ---------------------------------------------------------------------------
create or replace function public.modo_encomenda_por_agendamento(
  p_produto_id uuid,
  p_quantidade integer,
  p_agendado_para timestamptz default null
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_prod public.produtos%rowtype;
  v_disp jsonb;
  v_hoje date;
  v_data_ag date;
  v_pronto integer;
  v_qtd integer;
  v_restantes integer;
  v_min timestamptz;
begin
  select * into v_prod from public.produtos where id = p_produto_id;
  if not found or not coalesce(v_prod.encomenda_programada, false) then
    return null;
  end if;

  v_qtd := greatest(coalesce(p_quantidade, 1), 1);
  v_disp := public.calcular_disponibilidade_encomenda(p_produto_id);
  v_hoje := public.data_referencia_sp(now());
  v_data_ag := case
    when p_agendado_para is null then v_hoje
    else public.data_referencia_sp(p_agendado_para)
  end;
  v_pronto := coalesce((v_disp->>'estoque_pronto')::integer, 0);

  -- Hoje (ou "quanto antes") com unidades prontas → pronto
  if v_data_ag = v_hoje and v_pronto >= v_qtd then
    return 'pronto';
  end if;

  if v_data_ag < v_hoje then
    raise exception 'AGENDAMENTO_INVALIDO: Data de retirada no passado.';
  end if;

  -- Dia futuro ou sem estoque suficiente → encomenda
  if v_data_ag = v_hoje then
    if not coalesce((v_disp->>'pode_agendar')::boolean, false)
       and (v_disp->>'modo') is distinct from 'encomenda' then
      raise exception 'ENCOMENDA_INDISPONIVEL: "%" indisponível no momento.', v_prod.nome;
    end if;
  else
    v_restantes := public.encomendas_restantes_no_dia(p_produto_id, v_data_ag);
    if v_restantes < v_qtd then
      raise exception
        'ENCOMENDA_INDISPONIVEL: Sem vagas de encomenda para "%" na data escolhida.',
        v_prod.nome;
    end if;
  end if;

  if p_agendado_para is not null then
    v_min := nullif(v_disp->>'retirada_em', '')::timestamptz;
    if v_min is not null and p_agendado_para < v_min then
      raise exception
        'AGENDAMENTO_INVALIDO: Horário antes do mínimo da encomenda para "%".',
        v_prod.nome;
    end if;
  end if;

  return 'encomenda';
end;
$$;

-- Resolve modo por item e retorna maior retirada entre encomendas
drop function if exists public.resolver_encomenda_itens(jsonb);
create or replace function public.resolver_encomenda_itens(
  p_itens jsonb,
  p_agendado_para timestamptz default null
)
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
  v_retirada timestamptz;
  v_max timestamptz;
  v_qtd integer;
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

    v_qtd := greatest(coalesce((v_item->>'quantidade')::integer, 1), 1);
    v_modo := public.modo_encomenda_por_agendamento(v_prod.id, v_qtd, p_agendado_para);

    if v_modo = 'pronto' then
      continue;
    end if;

    if v_modo is distinct from 'encomenda' then
      raise exception 'ENCOMENDA_INDISPONIVEL: "%" indisponível no momento.', v_prod.nome;
    end if;

    v_disp := public.calcular_disponibilidade_encomenda(v_prod.id);
    v_retirada := nullif(v_disp->>'retirada_em', '')::timestamptz;
    if v_retirada is null then
      raise exception 'ENCOMENDA_INVALIDA: Não foi possível calcular retirada para "%".', v_prod.nome;
    end if;
    if v_max is null or v_retirada > v_max then
      v_max := v_retirada;
    end if;
  end loop;

  return v_max;
end;
$$;

-- ---------------------------------------------------------------------------
-- Valida horário dentro do funcionamento (qualquer dia aberto, ≤ 30 dias)
-- ---------------------------------------------------------------------------
create or replace function public.validar_horario_funcionamento_loja(
  p_agendado_para timestamptz
)
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
  v_pausada boolean;
  v_atraso integer;
  v_primeiro_slot time;
begin
  if p_agendado_para is null then
    return;
  end if;

  select * into v_config from public.loja_config where id = 1;
  v_pausada := v_config.pausado
    and (v_config.pausado_ate is null or v_config.pausado_ate > now());
  if v_pausada then
    raise exception 'LOJA_FECHADA: %',
      coalesce(nullif(trim(v_config.mensagem_pausa), ''),
        'Estamos em pausa no momento. Voltamos já!');
  end if;

  if v_config.fechado_manual then
    raise exception 'LOJA_FECHADA: %',
      coalesce(nullif(trim(v_config.mensagem_fechamento), ''),
        'Estamos fechados no momento.');
  end if;

  v_agora := timezone('America/Sao_Paulo', now());
  v_slot := timezone('America/Sao_Paulo', p_agendado_para);

  if v_slot <= v_agora then
    raise exception 'AGENDAMENTO_INVALIDO: Escolha um horário futuro.';
  end if;

  if v_slot::date > (v_agora::date + 30) then
    raise exception 'AGENDAMENTO_INVALIDO: Retirada muito distante.';
  end if;

  if extract(minute from v_slot)::integer % 15 <> 0
     or extract(second from v_slot)::integer <> 0 then
    raise exception 'AGENDAMENTO_INVALIDO: Use intervalos de 15 minutos.';
  end if;

  v_dia := extract(dow from v_slot)::smallint;
  v_hora := v_slot::time;

  select * into v_horario from public.loja_horarios where dia_semana = v_dia;
  if not found or not v_horario.aberto then
    raise exception 'AGENDAMENTO_INVALIDO: A loja não abre neste dia.';
  end if;

  v_atraso := greatest(0, coalesce(v_config.atraso_primeiro_agendamento_min, 0));
  v_primeiro_slot := (v_horario.abre + make_interval(mins => v_atraso))::time;

  if v_horario.abre < v_horario.fecha then
    v_ok := v_hora >= v_primeiro_slot and v_hora < v_horario.fecha;
  else
    if v_hora >= v_horario.abre then
      v_ok := v_hora >= v_primeiro_slot;
    else
      v_ok := v_hora < v_horario.fecha;
    end if;
  end if;

  if not v_ok then
    raise exception
      'AGENDAMENTO_INVALIDO: Horário fora do permitido (a partir de %; funcionamento % às %).',
      to_char(v_primeiro_slot, 'HH24:MI'),
      to_char(v_horario.abre, 'HH24:MI'),
      to_char(v_horario.fecha, 'HH24:MI');
  end if;
end;
$$;

-- Agendamento delivery: permite qualquer dia aberto (não só hoje)
create or replace function public.validar_agendamento_delivery(p_agendado_para timestamptz)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.validar_horario_funcionamento_loja(p_agendado_para);
end;
$$;

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
  perform public.validar_horario_funcionamento_loja(p_retirada);
end;
$$;

-- Recalcula modo_encomenda pelo dia de agendado_para antes da baixa
create or replace function public.sincronizar_modos_encomenda_pedido(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_agendado timestamptz;
  v_modo text;
begin
  select agendado_para into v_agendado from public.pedidos where id = p_pedido_id;
  if not found then
    return;
  end if;

  for r in
    select pi.id, pi.produto_id, pi.quantidade,
           coalesce(p.encomenda_programada, false) as enc
    from public.pedido_itens pi
    join public.produtos p on p.id = pi.produto_id
    where pi.pedido_id = p_pedido_id
  loop
    if not r.enc then
      continue;
    end if;
    v_modo := public.modo_encomenda_por_agendamento(
      r.produto_id, r.quantidade, v_agendado
    );
    update public.pedido_itens
    set modo_encomenda = v_modo
    where id = r.id;
  end loop;
end;
$$;

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

  perform public.sincronizar_modos_encomenda_pedido(p_pedido_id);

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

grant execute on function public.encomendas_restantes_no_dia(uuid, date) to anon, authenticated;
grant execute on function public.calcular_ramo_encomenda(uuid, timestamptz) to anon, authenticated;
grant execute on function public.calcular_disponibilidade_encomenda(uuid, timestamptz) to anon, authenticated;
grant execute on function public.modo_encomenda_por_agendamento(uuid, integer, timestamptz)
  to anon, authenticated;
grant execute on function public.resolver_encomenda_itens(jsonb, timestamptz) to anon, authenticated;
grant execute on function public.validar_horario_funcionamento_loja(timestamptz)
  to anon, authenticated;
grant execute on function public.validar_agendamento_delivery(timestamptz) to anon, authenticated;
grant execute on function public.sincronizar_modos_encomenda_pedido(uuid) to authenticated;
grant execute on function public.baixar_estoque_pedido(uuid) to authenticated;
