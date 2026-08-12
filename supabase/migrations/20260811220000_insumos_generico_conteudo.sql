-- Insumo genérico (manteiga, farinha) + conteúdo da embalagem + estoque decimal.
-- Marcas viram lista de texto (não são produtos com estoque próprio).
-- preco_atual passa a ser preço por unidade base: R$/kg, R$/L ou R$/un.

alter table public.insumos
  add column if not exists tipo text not null default 'contagem';

alter table public.insumos
  drop constraint if exists insumos_tipo_check;

alter table public.insumos
  add constraint insumos_tipo_check
  check (tipo in ('peso', 'volume', 'contagem'));

alter table public.insumos
  add column if not exists conteudo_valor numeric(12, 4);

alter table public.insumos
  add column if not exists conteudo_unidade text;

alter table public.insumos
  drop constraint if exists insumos_conteudo_unidade_check;

alter table public.insumos
  add constraint insumos_conteudo_unidade_check
  check (
    conteudo_unidade is null
    or conteudo_unidade in ('g', 'kg', 'ml', 'L')
  );

alter table public.insumos
  drop constraint if exists insumos_conteudo_coerente_check;

alter table public.insumos
  add constraint insumos_conteudo_coerente_check
  check (
    (
      tipo = 'contagem'
      and conteudo_valor is null
      and conteudo_unidade is null
    )
    or (
      tipo = 'peso'
      and conteudo_valor is not null
      and conteudo_valor > 0
      and conteudo_unidade in ('g', 'kg')
    )
    or (
      tipo = 'volume'
      and conteudo_valor is not null
      and conteudo_valor > 0
      and conteudo_unidade in ('ml', 'L')
    )
  );

alter table public.insumos
  add column if not exists marcas text[] not null default '{}';

comment on column public.insumos.tipo is
  'peso (g/kg), volume (ml/L) ou contagem (só unidade).';
comment on column public.insumos.conteudo_valor is
  'Quanto de g/kg/ml/L tem em 1 unidade de compra.';
comment on column public.insumos.marcas is
  'Marcas aceitas na compra (ex.: Batavo, Tirol). Sem estoque próprio.';
comment on column public.insumos.preco_atual is
  'Preço por unidade base: R$/kg (peso), R$/L (volume) ou R$/un (contagem).';

-- Estoque e mínimos passam a aceitar decimal (0,5 tablete, 1,5 kg → un).
alter table public.insumos
  alter column quantidade_atual type numeric(12, 4)
  using quantidade_atual::numeric(12, 4);

alter table public.insumos
  alter column estoque_minimo type numeric(12, 4)
  using estoque_minimo::numeric(12, 4);

alter table public.lista_compras_itens
  alter column quantidade_planejada type numeric(12, 4)
  using quantidade_planejada::numeric(12, 4);

alter table public.lista_compras_itens
  alter column quantidade_comprada type numeric(12, 4)
  using quantidade_comprada::numeric(12, 4);

alter table public.insumo_estoque_movimentos
  alter column quantidade type numeric(12, 4)
  using quantidade::numeric(12, 4);

alter table public.insumo_precos_historico
  alter column quantidade type numeric(12, 4)
  using quantidade::numeric(12, 4);

-- Recria RPC com delta numeric. Estoque sempre no insumo genérico.
drop function if exists public.ajustar_estoque_insumo(uuid, integer, text, text, uuid);

create or replace function public.ajustar_estoque_insumo(
  p_insumo_id uuid,
  p_delta numeric,
  p_origem text default 'manual',
  p_observacao text default null,
  p_lista_compra_item_id uuid default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_atual numeric;
  v_nova numeric;
  v_tipo text;
begin
  if p_delta = 0 then
    raise exception 'Delta deve ser diferente de zero.';
  end if;

  if p_origem not in ('compra', 'uso', 'manual', 'ajuste') then
    raise exception 'Origem inválida.';
  end if;

  select quantidade_atual into v_atual
  from public.insumos
  where id = p_insumo_id
  for update;

  if not found then
    raise exception 'Insumo não encontrado.';
  end if;

  v_nova := round(v_atual + p_delta, 4);
  if v_nova < 0 then
    raise exception 'Estoque insuficiente. Atual: %, delta: %', v_atual, p_delta;
  end if;

  update public.insumos
  set
    quantidade_atual = v_nova,
    atualizado_em = now()
  where id = p_insumo_id;

  v_tipo := case when p_delta > 0 then 'entrada' else 'saida' end;

  insert into public.insumo_estoque_movimentos (
    insumo_id, tipo, quantidade, origem, observacao, lista_compra_item_id
  ) values (
    p_insumo_id,
    v_tipo,
    abs(p_delta),
    p_origem,
    p_observacao,
    p_lista_compra_item_id
  );

  return v_nova;
end;
$$;

create or replace function public.insumo_preco_base_da_embalagem(
  p_tipo text,
  p_conteudo_valor numeric,
  p_conteudo_unidade text,
  p_preco_embalagem numeric
)
returns numeric
language plpgsql
immutable
as $$
declare
  v_canon numeric;
  v_base numeric;
begin
  if p_preco_embalagem is null then
    return null;
  end if;

  if p_tipo = 'contagem' or p_conteudo_valor is null or p_conteudo_valor <= 0 then
    return round(p_preco_embalagem, 4);
  end if;

  if p_conteudo_unidade in ('kg', 'L') then
    v_canon := p_conteudo_valor * 1000;
  else
    v_canon := p_conteudo_valor;
  end if;

  if v_canon <= 0 then
    return round(p_preco_embalagem, 4);
  end if;

  -- peso → R$/kg; volume → R$/L (canonico g ou ml / 1000)
  v_base := p_preco_embalagem / (v_canon / 1000.0);
  return round(v_base, 4);
end;
$$;

create or replace function public.finalizar_lista_compras(p_lista_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_insumo uuid;
  v_qtd numeric;
  v_count integer := 0;
  v_status text;
  v_restantes integer;
  v_tipo text;
  v_conteudo numeric;
  v_conteudo_un text;
  v_preco_base numeric;
begin
  select status into v_status
  from public.lista_compras
  where id = p_lista_id
  for update;

  if not found then
    raise exception 'Lista de compras não encontrada.';
  end if;

  if v_status <> 'aberta' then
    raise exception 'Lista já foi finalizada ou cancelada.';
  end if;

  for r in
    select *
    from public.lista_compras_itens
    where lista_id = p_lista_id
      and marcado = true
      and comprado = false
    for update
  loop
    -- Estoque sempre no genérico (marcas não são SKUs).
    v_insumo := r.insumo_id;
    v_qtd := coalesce(r.quantidade_comprada, r.quantidade_planejada);

    perform public.ajustar_estoque_insumo(
      v_insumo,
      v_qtd,
      'compra',
      'Entrada pela lista de compras',
      r.id
    );

    if r.preco_unitario is not null then
      select tipo, conteudo_valor, conteudo_unidade
        into v_tipo, v_conteudo, v_conteudo_un
      from public.insumos
      where id = v_insumo;

      v_preco_base := public.insumo_preco_base_da_embalagem(
        coalesce(v_tipo, 'contagem'),
        v_conteudo,
        v_conteudo_un,
        r.preco_unitario
      );

      insert into public.insumo_precos_historico (
        insumo_id, preco_unitario, quantidade, lista_compra_item_id, observacao
      ) values (
        v_insumo,
        v_preco_base,
        v_qtd,
        r.id,
        'Preço da embalagem R$ ' || r.preco_unitario::text
      );

      update public.insumos
      set
        preco_atual = v_preco_base,
        preco_atualizado_em = now(),
        atualizado_em = now()
      where id = v_insumo;
    end if;

    update public.lista_compras_itens
    set
      comprado = true,
      quantidade_comprada = v_qtd
    where id = r.id;

    v_count := v_count + 1;
  end loop;

  select count(*)::integer into v_restantes
  from public.lista_compras_itens
  where lista_id = p_lista_id
    and comprado = false;

  if v_restantes = 0 then
    update public.lista_compras
    set
      status = 'finalizada',
      finalizada_em = now()
    where id = p_lista_id;
  end if;

  return v_count;
end;
$$;

grant execute on function public.ajustar_estoque_insumo(uuid, numeric, text, text, uuid) to authenticated;
grant execute on function public.finalizar_lista_compras(uuid) to authenticated;
grant execute on function public.insumo_preco_base_da_embalagem(text, numeric, text, numeric) to authenticated;
