-- KDS: pedidos imediatos → em_producao; agendados → pendente (aba Novos).
-- Abertura temporária da loja (sobrepõe horários, espelho da pausa).

alter table public.loja_config
  add column if not exists abertura_temporaria boolean not null default false,
  add column if not exists abertura_temporaria_ate timestamptz;

comment on column public.loja_config.abertura_temporaria is
  'Força loja aberta fora do horário cadastrado (até abertura_temporaria_ate ou desligar).';
comment on column public.loja_config.abertura_temporaria_ate is
  'Se preenchido, a abertura temporária encerra neste instante.';

-- Pedido imediato nunca fica em pendente (vai direto para preparando).
create or replace function public.pedidos_status_kds_instantaneo()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'pendente'
     and new.agendado_para is null then
    new.status := 'em_producao';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pedidos_status_kds_instantaneo on public.pedidos;
create trigger trg_pedidos_status_kds_instantaneo
  before insert or update of status, agendado_para
  on public.pedidos
  for each row
  execute function public.pedidos_status_kds_instantaneo();

-- Mesa / balcão / totem: sempre em_producao ao criar.
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
  p_itens jsonb
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
  if v_config.limite_pedidos_ativos is not null then
    select count(*) into v_pedidos_ativos
    from public.pedidos
    where status in ('pendente', 'em_producao');

    if v_pedidos_ativos >= v_config.limite_pedidos_ativos then
      raise exception 'LOJA_CHEIA: Estamos com muitos pedidos agora. Tente novamente em alguns minutos.';
    end if;
  end if;

  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    raise exception 'Pedido sem itens.';
  end if;

  insert into public.pedidos (
    cliente_nome, cliente_celular, cliente_id, cupom_id, desconto_aplicado,
    status, origem, identificador, total, valor_total
  ) values (
    trim(p_cliente_nome),
    nullif(p_cliente_celular, ''),
    p_cliente_id,
    p_cupom_id,
    case when coalesce(p_desconto, 0) > 0 then p_desconto else null end,
    'em_producao',
    p_origem::public.tipo_origem_pedido,
    p_identificador,
    p_total,
    p_valor_total
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
      v_item->>'modo_consumo'
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
    'sequencia_pedido', v_sequencia
  );
end;
$$;

grant execute on function public.criar_pedido_completo(
  text, text, uuid, uuid, numeric, text, text, numeric, numeric, jsonb
) to anon, authenticated;

create or replace function public.loja_aberta_agora()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config public.loja_config%rowtype;
  v_horario public.loja_horarios%rowtype;
  v_agora timestamp;
  v_hora time;
  v_dia smallint;
  v_aberta boolean;
  v_motivo text;
  v_pausada boolean;
  v_abertura_forcada boolean;
begin
  update public.loja_config
  set
    pausado = false,
    pausado_ate = null,
    atualizado_em = now()
  where id = 1
    and pausado = true
    and pausado_ate is not null
    and pausado_ate <= now();

  update public.loja_config
  set
    abertura_temporaria = false,
    abertura_temporaria_ate = null,
    atualizado_em = now()
  where id = 1
    and abertura_temporaria = true
    and abertura_temporaria_ate is not null
    and abertura_temporaria_ate <= now();

  select * into v_config from public.loja_config where id = 1;

  v_pausada := v_config.pausado
    and (v_config.pausado_ate is null or v_config.pausado_ate > now());

  v_abertura_forcada := v_config.abertura_temporaria
    and (v_config.abertura_temporaria_ate is null
      or v_config.abertura_temporaria_ate > now());

  v_agora := (now() at time zone 'America/Sao_Paulo');
  v_hora := v_agora::time;
  v_dia := extract(dow from v_agora)::smallint;

  if v_pausada then
    return jsonb_build_object(
      'aberta', false,
      'motivo', coalesce(nullif(trim(v_config.mensagem_pausa), ''),
        'Estamos em pausa no momento. Voltamos já!'),
      'tempo_preparo_min', v_config.tempo_preparo_min,
      'atraso_primeiro_agendamento_min', v_config.atraso_primeiro_agendamento_min
    );
  end if;

  if v_abertura_forcada then
    return jsonb_build_object(
      'aberta', true,
      'motivo', null,
      'tempo_preparo_min', v_config.tempo_preparo_min,
      'atraso_primeiro_agendamento_min', v_config.atraso_primeiro_agendamento_min
    );
  end if;

  select * into v_horario from public.loja_horarios where dia_semana = v_dia;

  if not found or not v_horario.aberto then
    v_aberta := false;
    v_motivo := 'Estamos fechados hoje.';
  elsif v_horario.abre < v_horario.fecha then
    v_aberta := v_hora >= v_horario.abre and v_hora < v_horario.fecha;
    v_motivo := 'Nosso horário hoje é das '
      || to_char(v_horario.abre, 'HH24:MI') || ' às '
      || to_char(v_horario.fecha, 'HH24:MI') || '.';
  else
    v_aberta := v_hora >= v_horario.abre or v_hora < v_horario.fecha;
    v_motivo := 'Nosso horário hoje é das '
      || to_char(v_horario.abre, 'HH24:MI') || ' às '
      || to_char(v_horario.fecha, 'HH24:MI') || '.';
  end if;

  return jsonb_build_object(
    'aberta', v_aberta,
    'motivo', case when v_aberta then null else v_motivo end,
    'tempo_preparo_min', v_config.tempo_preparo_min,
    'atraso_primeiro_agendamento_min', v_config.atraso_primeiro_agendamento_min
  );
end;
$$;

grant execute on function public.loja_aberta_agora() to anon, authenticated;

-- Pedidos imediatos legados em "pendente" → preparando.
update public.pedidos
set status = 'em_producao'
where status = 'pendente'
  and agendado_para is null;
