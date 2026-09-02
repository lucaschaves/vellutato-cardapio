-- Fechamento manual da loja (fora do horário cadastrado ou antes do fechamento previsto).

alter table public.loja_config
  add column if not exists fechado_manual boolean not null default false,
  add column if not exists mensagem_fechamento text;

comment on column public.loja_config.fechado_manual is
  'Força loja fechada até desligar manualmente, mesmo dentro do horário.';
comment on column public.loja_config.mensagem_fechamento is
  'Mensagem exibida ao cliente quando fechado_manual está ativo.';

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

  if v_config.fechado_manual then
    return jsonb_build_object(
      'aberta', false,
      'motivo', coalesce(nullif(trim(v_config.mensagem_fechamento), ''),
        'Estamos fechados no momento.'),
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

create or replace function public.validar_agendamento_delivery(p_agendado_para timestamptz)
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

  if v_slot::date is distinct from v_agora::date then
    raise exception 'AGENDAMENTO_INVALIDO: Só é possível agendar para hoje.';
  end if;

  if v_slot <= v_agora then
    raise exception 'AGENDAMENTO_INVALIDO: Escolha um horário futuro.';
  end if;

  if extract(minute from v_slot)::integer % 15 <> 0
     or extract(second from v_slot)::integer <> 0 then
    raise exception 'AGENDAMENTO_INVALIDO: Use intervalos de 15 minutos.';
  end if;

  v_dia := extract(dow from v_slot)::smallint;
  v_hora := v_slot::time;

  select * into v_horario from public.loja_horarios where dia_semana = v_dia;
  if not found or not v_horario.aberto then
    raise exception 'AGENDAMENTO_INVALIDO: A loja não abre hoje.';
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

grant execute on function public.loja_aberta_agora() to anon, authenticated;
grant execute on function public.validar_agendamento_delivery(timestamptz)
  to anon, authenticated;
