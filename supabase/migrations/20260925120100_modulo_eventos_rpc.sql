-- RPCs do módulo Eventos (depois do commit do valor de enum).

create or replace function public.caixas_evento_reservadas(
  p_produto_id uuid,
  p_data date
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(i.quantidade), 0)::integer
  from public.pedido_itens i
  join public.pedidos p on p.id = i.pedido_id
  where i.produto_id = p_produto_id
    and p.origem = 'evento'
    and p.status not in ('cancelado')
    and (p.agendado_para at time zone 'America/Sao_Paulo')::date = p_data;
$$;

grant execute on function public.caixas_evento_reservadas(uuid, date)
  to anon, authenticated;

create or replace function public.criar_pedido_evento(
  p_cliente_nome text,
  p_cliente_celular text,
  p_cliente_id uuid,
  p_quem_retira text,
  p_cpf text,
  p_data_retirada date,
  p_percentual_entrada integer,
  p_identificador text,
  p_itens jsonb,
  p_desconto numeric,
  p_subtotal numeric,
  p_total numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_seq integer;
  v_item jsonb;
  v_avisos text[] := '{}';
  v_limite integer;
  v_ja integer;
  v_qtd integer;
  v_prod record;
  v_obs text;
  v_vistos uuid[] := '{}';
begin
  if p_percentual_entrada not in (50, 100) then
    raise exception 'PAGAMENTO_INVALIDO: Escolha 50%% ou 100%%.';
  end if;
  if p_data_retirada is null or p_data_retirada < (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'DATA_INVALIDA: Informe uma data de retirada válida.';
  end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'ITENS_VAZIOS: Adicione ao menos uma caixa.';
  end if;

  for v_item in select value from jsonb_array_elements(p_itens)
  loop
    select id, nome, canal_evento, evento_dias_antecedencia, evento_limite_caixas_dia
      into v_prod
    from public.produtos
    where id = (v_item->>'produto_id')::uuid;

    if not found or not coalesce(v_prod.canal_evento, false) then
      raise exception 'PRODUTO_INVALIDO: Um dos itens não é produto de evento.';
    end if;

    if p_data_retirada <
      ((now() at time zone 'America/Sao_Paulo')::date
        + make_interval(days => coalesce(v_prod.evento_dias_antecedencia, 2)))
    then
      raise exception 'PRAZO_INVALIDO: % exige % dia(s) de antecedência.',
        v_prod.nome, coalesce(v_prod.evento_dias_antecedencia, 2);
    end if;

    if v_prod.id = any (v_vistos) then
      continue;
    end if;
    v_vistos := array_append(v_vistos, v_prod.id);

    select coalesce(sum((x->>'quantidade')::integer), 0)
      into v_qtd
    from jsonb_array_elements(p_itens) x
    where (x->>'produto_id')::uuid = v_prod.id;

    v_limite := v_prod.evento_limite_caixas_dia;
    if v_limite is not null and v_limite > 0 then
      v_ja := public.caixas_evento_reservadas(v_prod.id, p_data_retirada);
      if v_ja + v_qtd > v_limite then
        v_avisos := array_append(
          v_avisos,
          format(
            '%s: limite do dia é %s caixa(s); já há %s reservada(s) e este pedido pede mais %s.',
            v_prod.nome, v_limite, v_ja, v_qtd
          )
        );
      end if;
    end if;
  end loop;

  insert into public.pedidos (
    cliente_nome,
    cliente_celular,
    cliente_id,
    identificador,
    origem,
    modalidade,
    status,
    status_pagamento,
    subtotal_itens,
    desconto_aplicado,
    taxa_entrega,
    total,
    valor_total,
    cpf_nota,
    agendado_para,
    evento_json
  ) values (
    trim(p_cliente_nome),
    nullif(regexp_replace(coalesce(p_cliente_celular, ''), '\D', '', 'g'), ''),
    p_cliente_id,
    coalesce(nullif(trim(p_identificador), ''), 'Evento'),
    'evento',
    'retirada',
    'aguardando_pagamento',
    'aguardando',
    p_subtotal,
    p_desconto,
    0,
    p_total,
    p_total,
    nullif(regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g'), ''),
    (p_data_retirada::timestamp + time '12:00') at time zone 'America/Sao_Paulo',
    jsonb_build_object(
      'percentual_entrada', p_percentual_entrada,
      'quem_retira', trim(p_quem_retira),
      'data_retirada', p_data_retirada,
      'avisos_limite', to_jsonb(v_avisos),
      'valor_entrada', round(p_total * p_percentual_entrada / 100.0, 2),
      'valor_restante', round(p_total * (100 - p_percentual_entrada) / 100.0, 2)
    )
  )
  returning id, sequencia_pedido into v_id, v_seq;

  for v_item in select value from jsonb_array_elements(p_itens)
  loop
    v_obs := coalesce(v_item->>'observacoes', '');
    insert into public.pedido_itens (
      pedido_id, produto_id, quantidade, preco_unitario, observacoes, modo_consumo, modo_encomenda
    ) values (
      v_id,
      (v_item->>'produto_id')::uuid,
      (v_item->>'quantidade')::integer,
      (v_item->>'preco_unitario')::numeric,
      nullif(v_obs, ''),
      'levar',
      'encomenda'
    );
  end loop;

  return jsonb_build_object(
    'pedido_id', v_id,
    'sequencia_pedido', v_seq,
    'avisos', to_jsonb(v_avisos)
  );
end;
$$;

grant execute on function public.criar_pedido_evento(
  text, text, uuid, text, text, date, integer, text, jsonb, numeric, numeric, numeric
) to anon, authenticated;
