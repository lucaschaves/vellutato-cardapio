-- Corrige cálculo de retirada da encomenda:
-- • Antes do cutoff: pedido + X h, respeitando abertura do dia
-- • Depois do cutoff: abertura do próximo dia disponível + X h (não o horário da compra)

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
  v_retirada timestamptz;
  v_data_base date;
  v_hora_atual time;
  v_abre_loja time;
  v_min_retirada timestamptz;
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

  select h.abre into v_abre_loja
  from public.loja_horarios h
  where h.dia_semana = v_dow
    and coalesce(h.aberto, false);

  if v_hora_atual <= v_regra.cutoff then
    v_retirada := p_agora + (v_regra.horas_ate_retirada || ' hours')::interval;
    if v_abre_loja is not null then
      v_min_retirada := (v_data::text || ' ' || v_abre_loja::text)::timestamp
        at time zone 'America/Sao_Paulo'
        + (v_regra.horas_ate_retirada || ' hours')::interval;
      if v_retirada < v_min_retirada then
        v_retirada := v_min_retirada;
      end if;
    end if;
    v_msg := 'Sob encomenda — retirada estimada em breve';
  else
    v_data_base := public.proximo_dia_loja_aberta(v_data + v_regra.dias_apos_cutoff);

    select h.abre into v_abre_loja
    from public.loja_horarios h
    where h.dia_semana = extract(dow from v_data_base)::smallint
      and coalesce(h.aberto, false);

    if not found then
      v_abre_loja := time '08:00';
    end if;

    v_retirada := (v_data_base::text || ' ' || v_abre_loja::text)::timestamp
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
