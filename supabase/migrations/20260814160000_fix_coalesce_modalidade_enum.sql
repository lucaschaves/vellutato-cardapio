-- coalesce(enum, '') tenta converter "" para tipo_modalidade_pedido (22P02).

create or replace function public.baixar_insumos_pedido(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido public.pedidos%rowtype;
  v_cfg public.loja_config%rowtype;
  item_row record;
  escolha record;
  adic record;
  v_perfil text;
  v_ficha uuid;
  v_itens_embalaveis numeric := 0;
  v_n integer;
  v_ficha_pedido uuid;
  v_sacolas numeric;
  cons record;
begin
  if exists (
    select 1 from public.pedido_insumo_consumos where pedido_id = p_pedido_id
  ) then
    return;
  end if;

  select * into v_pedido from public.pedidos where id = p_pedido_id;
  if not found then
    raise exception 'Pedido não encontrado.';
  end if;
  if v_pedido.status = 'aguardando_pagamento' then
    return;
  end if;

  select * into v_cfg from public.loja_config where id = 1;

  drop table if exists tmp_consumo_insumo;
  create temporary table tmp_consumo_insumo (
    insumo_id uuid primary key,
    quantidade numeric
  ) on commit drop;

  for item_row in
    select
      pi.id,
      pi.produto_id,
      pi.quantidade,
      pi.modo_consumo,
      p.tipo as produto_tipo,
      p.ficha_produto_id,
      p.ficha_embalagem_viagem_id,
      p.ficha_embalagem_delivery_id,
      p.ficha_embalagem_levar_rapido_id
    from public.pedido_itens pi
    join public.produtos p on p.id = pi.produto_id
    where pi.pedido_id = p_pedido_id
  loop
    v_perfil := public.perfil_embalagem_item(
      v_pedido.origem::text,
      v_pedido.modalidade,
      item_row.modo_consumo
    );
    if v_perfil is not null then
      v_itens_embalaveis := v_itens_embalaveis + item_row.quantidade;
    end if;

    if coalesce(item_row.produto_tipo::text, 'simples') <> 'combo' then
      perform public.acumular_consumo_ficha(item_row.ficha_produto_id, item_row.quantidade);
      v_ficha := case v_perfil
        when 'viagem' then item_row.ficha_embalagem_viagem_id
        when 'delivery' then item_row.ficha_embalagem_delivery_id
        when 'levar_rapido' then item_row.ficha_embalagem_levar_rapido_id
        else null
      end;
      perform public.acumular_consumo_ficha(v_ficha, item_row.quantidade);
    else
      for escolha in
        select
          pr.ficha_produto_id,
          pr.ficha_embalagem_viagem_id,
          pr.ficha_embalagem_delivery_id,
          pr.ficha_embalagem_levar_rapido_id
        from public.pedido_item_combo_escolhas c
        join public.produtos pr on pr.id = c.produto_escolhido_id
        where c.pedido_item_id = item_row.id
          and c.produto_escolhido_id is not null
      loop
        perform public.acumular_consumo_ficha(escolha.ficha_produto_id, item_row.quantidade);
        v_ficha := case v_perfil
          when 'viagem' then escolha.ficha_embalagem_viagem_id
          when 'delivery' then escolha.ficha_embalagem_delivery_id
          when 'levar_rapido' then escolha.ficha_embalagem_levar_rapido_id
          else null
        end;
        perform public.acumular_consumo_ficha(v_ficha, item_row.quantidade);
      end loop;
    end if;

    for adic in
      select a.ficha_id
      from public.pedido_item_adicionais pia
      join public.adicionais a on a.id = pia.adicional_id
      where pia.pedido_item_id = item_row.id
        and a.ficha_id is not null
    loop
      perform public.acumular_consumo_ficha(adic.ficha_id, item_row.quantidade);
    end loop;
  end loop;

  if v_itens_embalaveis > 0 and v_cfg.id is not null then
    if v_pedido.origem::text = 'delivery' and v_pedido.modalidade = 'entrega' then
      v_n := coalesce(v_cfg.capacidade_embalagem_pedido_delivery, 4);
      v_ficha_pedido := v_cfg.ficha_embalagem_pedido_delivery_id;
    elsif v_pedido.origem::text = 'delivery' then
      v_n := coalesce(v_cfg.capacidade_embalagem_pedido_retirada, 4);
      v_ficha_pedido := v_cfg.ficha_embalagem_pedido_retirada_id;
    else
      v_n := null;
      v_ficha_pedido := null;
    end if;

    if v_ficha_pedido is not null and v_n is not null and v_n > 0 then
      v_sacolas := ceil(v_itens_embalaveis / v_n::numeric);
      perform public.acumular_consumo_ficha(v_ficha_pedido, v_sacolas);
    end if;
  end if;

  for cons in select * from tmp_consumo_insumo where quantidade > 0
  loop
    insert into public.pedido_insumo_consumos (pedido_id, insumo_id, quantidade)
    values (p_pedido_id, cons.insumo_id, round(cons.quantidade, 4));

    update public.insumos
    set
      quantidade_atual = round(quantidade_atual - cons.quantidade, 4),
      atualizado_em = now()
    where id = cons.insumo_id;

    insert into public.insumo_estoque_movimentos (
      insumo_id, tipo, quantidade, origem, observacao, pedido_id
    ) values (
      cons.insumo_id, 'saida', round(cons.quantidade, 4), 'uso',
      'Baixa por ficha técnica', p_pedido_id
    );
  end loop;
end;
$$;
