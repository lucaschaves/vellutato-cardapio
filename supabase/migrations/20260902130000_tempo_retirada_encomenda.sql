-- Prazo de retirada como intervalo (aceita 02:30) e cálculo correto após o cutoff:
-- dia da retirada = hoje + N dias (próximo dia aberto);
-- horário = horário limite DAQUELE dia + prazo (ex.: 12:00 + 02:00 → 14:00).
-- Antes: usava abertura da loja + horas → 14:00 + 2h = 16:00.

alter table public.encomenda_programada_template_dias
  add column if not exists tempo_ate_retirada interval;

update public.encomenda_programada_template_dias
set tempo_ate_retirada = make_interval(hours => coalesce(horas_ate_retirada, 2))
where tempo_ate_retirada is null;

alter table public.encomenda_programada_template_dias
  alter column tempo_ate_retirada set default interval '2 hours',
  alter column tempo_ate_retirada set not null;

alter table public.produto_encomenda_regras
  add column if not exists tempo_ate_retirada interval;

update public.produto_encomenda_regras
set tempo_ate_retirada = make_interval(hours => horas_ate_retirada)
where tempo_ate_retirada is null
  and horas_ate_retirada is not null;

-- Mantém horas_ate_retirada por compatibilidade (espelho em horas cheias) até limpeza futura.
comment on column public.encomenda_programada_template_dias.tempo_ate_retirada is
  'Prazo até a retirada (ex.: 02:30). Antes do cutoff: pedido + prazo. Depois: cutoff do dia da retirada + prazo.';
comment on column public.produto_encomenda_regras.tempo_ate_retirada is
  'Override do prazo até a retirada (interval). Null = herda do template.';

drop function if exists public.regra_encomenda_produto(uuid, smallint);

create or replace function public.regra_encomenda_produto(
  p_produto_id uuid,
  p_dia_semana smallint
)
returns table (
  ativo boolean,
  cutoff time,
  tempo_ate_retirada interval,
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
  tempo_ate_retirada := coalesce(
    v_ov.tempo_ate_retirada,
    case when v_ov.horas_ate_retirada is not null
      then make_interval(hours => v_ov.horas_ate_retirada) end,
    v_tpl.tempo_ate_retirada,
    case when v_tpl.horas_ate_retirada is not null
      then make_interval(hours => v_tpl.horas_ate_retirada) end,
    interval '2 hours'
  );
  dias_apos_cutoff := coalesce(v_ov.dias_apos_cutoff, v_tpl.dias_apos_cutoff, 1);
  limite_encomendas := coalesce(v_ov.limite_encomendas, v_tpl.limite_encomendas, 30);
  return next;
end;
$$;

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
  v_regra_dia record;
  v_retirada timestamptz;
  v_data_base date;
  v_dow_base smallint;
  v_hora_atual time;
  v_cutoff_base time;
  v_tempo interval;
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
    -- Antes do limite: pedido + prazo (aceita horas quebradas).
    v_retirada := p_agora + v_regra.tempo_ate_retirada;
    v_msg := 'Sob encomenda — retirada estimada em breve';
  else
    -- Depois do limite: dia = hoje + N (próximo dia aberto).
    -- Horário = horário limite do dia da retirada + prazo desse dia
    -- (ex.: qui 12:00 + 02:00 → qui 14:00).
    v_data_base := public.proximo_dia_loja_aberta(v_data + v_regra.dias_apos_cutoff);
    v_dow_base := extract(dow from v_data_base)::smallint;

    select * into v_regra_dia
    from public.regra_encomenda_produto(p_produto_id, v_dow_base);

    if found and coalesce(v_regra_dia.ativo, false) then
      v_cutoff_base := v_regra_dia.cutoff;
      v_tempo := v_regra_dia.tempo_ate_retirada;
    else
      v_cutoff_base := v_regra.cutoff;
      v_tempo := v_regra.tempo_ate_retirada;
    end if;

    v_retirada := (v_data_base::text || ' ' || v_cutoff_base::text)::timestamp
      at time zone 'America/Sao_Paulo'
      + v_tempo;
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

grant execute on function public.regra_encomenda_produto(uuid, smallint) to anon, authenticated;
grant execute on function public.calcular_disponibilidade_encomenda(uuid, timestamptz) to anon, authenticated;
