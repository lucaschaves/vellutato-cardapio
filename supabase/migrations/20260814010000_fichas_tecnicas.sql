-- Fichas técnicas: estoque de insumo em unidade base, CRUD, explosão, snapshot e baixa.

-- ---------------------------------------------------------------------------
-- 1) Estoque de insumo em kg / L / un (antes: embalagens de compra)
-- ---------------------------------------------------------------------------
alter table public.insumos drop constraint if exists insumos_quantidade_atual_check;

update public.insumos
set
  quantidade_atual = case
    when tipo = 'peso' and conteudo_unidade = 'g'
      then round(quantidade_atual * conteudo_valor / 1000.0, 4)
    when tipo = 'peso' and conteudo_unidade = 'kg'
      then round(quantidade_atual * conteudo_valor, 4)
    when tipo = 'volume' and conteudo_unidade = 'ml'
      then round(quantidade_atual * conteudo_valor / 1000.0, 4)
    when tipo = 'volume' and conteudo_unidade = 'L'
      then round(quantidade_atual * conteudo_valor, 4)
    else quantidade_atual
  end,
  estoque_minimo = case
    when tipo = 'peso' and conteudo_unidade = 'g'
      then round(estoque_minimo * conteudo_valor / 1000.0, 4)
    when tipo = 'peso' and conteudo_unidade = 'kg'
      then round(estoque_minimo * conteudo_valor, 4)
    when tipo = 'volume' and conteudo_unidade = 'ml'
      then round(estoque_minimo * conteudo_valor / 1000.0, 4)
    when tipo = 'volume' and conteudo_unidade = 'L'
      then round(estoque_minimo * conteudo_valor, 4)
    else estoque_minimo
  end;

comment on column public.insumos.quantidade_atual is
  'Estoque na unidade base: kg (peso), L (volume) ou un (contagem).';

-- ---------------------------------------------------------------------------
-- 2) Movimentos: pedido_id + ajuste que permite negativo
-- ---------------------------------------------------------------------------
alter table public.insumo_estoque_movimentos
  add column if not exists pedido_id uuid references public.pedidos (id) on delete set null;

create index if not exists insumo_estoque_movimentos_pedido_idx
  on public.insumo_estoque_movimentos (pedido_id)
  where pedido_id is not null;

drop function if exists public.ajustar_estoque_insumo(uuid, numeric, text, text, uuid);

create or replace function public.ajustar_estoque_insumo(
  p_insumo_id uuid,
  p_delta numeric,
  p_origem text default 'manual',
  p_observacao text default null,
  p_lista_compra_item_id uuid default null,
  p_permitir_negativo boolean default false,
  p_pedido_id uuid default null
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
  perform public.exigir_admin();
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
  if v_nova < 0 and not p_permitir_negativo then
    raise exception 'Estoque insuficiente. Atual: %, delta: %', v_atual, p_delta;
  end if;

  update public.insumos
  set quantidade_atual = v_nova, atualizado_em = now()
  where id = p_insumo_id;

  v_tipo := case when p_delta > 0 then 'entrada' else 'saida' end;
  insert into public.insumo_estoque_movimentos (
    insumo_id, tipo, quantidade, origem, observacao, lista_compra_item_id, pedido_id
  ) values (
    p_insumo_id, v_tipo, abs(p_delta), p_origem, p_observacao, p_lista_compra_item_id, p_pedido_id
  );
  return v_nova;
end;
$$;

grant execute on function public.ajustar_estoque_insumo(
  uuid, numeric, text, text, uuid, boolean, uuid
) to authenticated;

-- Compra (embalagens) → estoque base
create or replace function public.insumo_compra_para_base(
  p_tipo text,
  p_conteudo_valor numeric,
  p_conteudo_unidade text,
  p_qtd_compra numeric
)
returns numeric
language plpgsql
immutable
as $$
declare
  v_por_un numeric;
begin
  if p_tipo = 'contagem' or p_conteudo_valor is null or p_conteudo_valor <= 0 then
    return round(p_qtd_compra, 4);
  end if;
  if p_conteudo_unidade in ('kg', 'L') then
    v_por_un := p_conteudo_valor;
  else
    v_por_un := p_conteudo_valor / 1000.0;
  end if;
  return round(p_qtd_compra * v_por_un, 4);
end;
$$;

grant execute on function public.insumo_compra_para_base(text, numeric, text, numeric)
  to authenticated;

create or replace function public.finalizar_lista_compras(p_lista_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_insumo uuid;
  v_qtd_compra numeric;
  v_qtd_base numeric;
  v_count integer := 0;
  v_status text;
  v_restantes integer;
  v_tipo text;
  v_conteudo numeric;
  v_conteudo_un text;
  v_preco_base numeric;
begin
  perform public.exigir_admin();

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
    v_insumo := r.insumo_id;
    v_qtd_compra := coalesce(r.quantidade_comprada, r.quantidade_planejada);

    select tipo, conteudo_valor, conteudo_unidade
      into v_tipo, v_conteudo, v_conteudo_un
    from public.insumos
    where id = v_insumo;

    v_qtd_base := public.insumo_compra_para_base(
      coalesce(v_tipo, 'contagem'),
      v_conteudo,
      v_conteudo_un,
      v_qtd_compra
    );

    perform public.ajustar_estoque_insumo(
      v_insumo,
      v_qtd_base,
      'compra',
      'Entrada pela lista de compras',
      r.id,
      false,
      null
    );

    if r.preco_unitario is not null then
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
        v_qtd_compra,
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
    set comprado = true, quantidade_comprada = v_qtd_compra
    where id = r.id;

    v_count := v_count + 1;
  end loop;

  select count(*)::integer into v_restantes
  from public.lista_compras_itens
  where lista_id = p_lista_id and comprado = false;

  if v_restantes = 0 then
    update public.lista_compras
    set status = 'finalizada', finalizada_em = now()
    where id = p_lista_id;
  end if;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Tabelas de ficha
-- ---------------------------------------------------------------------------
create table if not exists public.fichas_tecnicas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  observacao text,
  tipo text not null check (tipo in ('produto', 'adicional', 'embalagem')),
  status text not null default 'rascunho'
    check (status in ('rascunho', 'teste', 'ativa', 'arquivada')),
  rendimento numeric(12, 4) not null default 1 check (rendimento > 0),
  escopo text check (escopo is null or escopo in ('item', 'pedido')),
  custo_calculado numeric(12, 4),
  custo_atualizado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint fichas_embalagem_escopo_check check (
    (tipo = 'embalagem' and escopo is not null)
    or (tipo <> 'embalagem' and escopo is null)
  )
);

create index if not exists fichas_tecnicas_tipo_status_idx
  on public.fichas_tecnicas (tipo, status, nome);

create table if not exists public.ficha_tecnica_itens (
  id uuid primary key default gen_random_uuid(),
  ficha_id uuid not null references public.fichas_tecnicas (id) on delete cascade,
  insumo_id uuid references public.insumos (id) on delete restrict,
  ficha_filha_id uuid references public.fichas_tecnicas (id) on delete restrict,
  quantidade numeric(12, 4) not null check (quantidade > 0),
  unidade text,
  observacao text,
  constraint ficha_item_alvo_xor check (
    (insumo_id is not null and ficha_filha_id is null and unidade is not null)
    or (insumo_id is null and ficha_filha_id is not null and unidade is null)
  ),
  constraint ficha_item_unidade_check check (
    unidade is null or unidade in ('g', 'kg', 'ml', 'L', 'un')
  )
);

create unique index if not exists ficha_tecnica_itens_insumo_uidx
  on public.ficha_tecnica_itens (ficha_id, insumo_id)
  where insumo_id is not null;

create unique index if not exists ficha_tecnica_itens_filha_uidx
  on public.ficha_tecnica_itens (ficha_id, ficha_filha_id)
  where ficha_filha_id is not null;

create or replace function public.ficha_tecnica_itens_validar()
returns trigger
language plpgsql
as $$
declare
  v_tipo text;
  v_tipo_filha text;
  v_tem_neta boolean;
begin
  if new.ficha_filha_id is not null then
    if new.ficha_filha_id = new.ficha_id then
      raise exception 'A ficha não pode incluir a si mesma.';
    end if;
    if exists (
      select 1 from public.ficha_tecnica_itens
      where ficha_filha_id = new.ficha_id
    ) then
      raise exception 'Esta ficha já é sub-receita e não pode ter sub-fichas.';
    end if;
    select tipo into v_tipo_filha from public.fichas_tecnicas where id = new.ficha_filha_id;
    if v_tipo_filha is null then
      raise exception 'Sub-ficha não encontrada.';
    end if;
    select exists (
      select 1 from public.ficha_tecnica_itens
      where ficha_id = new.ficha_filha_id and ficha_filha_id is not null
    ) into v_tem_neta;
    if v_tem_neta then
      raise exception 'Sub-ficha só pode ter insumos (1 nível).';
    end if;
  end if;

  if new.insumo_id is not null then
    select tipo into v_tipo from public.insumos where id = new.insumo_id;
    if v_tipo is null then
      raise exception 'Insumo não encontrado.';
    end if;
    if v_tipo = 'peso' and new.unidade not in ('g', 'kg') then
      raise exception 'Insumo de peso exige unidade g ou kg.';
    end if;
    if v_tipo = 'volume' and new.unidade not in ('ml', 'L') then
      raise exception 'Insumo de volume exige unidade ml ou L.';
    end if;
    if v_tipo = 'contagem' and new.unidade <> 'un' then
      raise exception 'Insumo de contagem exige unidade un.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ficha_tecnica_itens_validar on public.ficha_tecnica_itens;
create trigger trg_ficha_tecnica_itens_validar
  before insert or update on public.ficha_tecnica_itens
  for each row execute function public.ficha_tecnica_itens_validar();

alter table public.produtos
  add column if not exists ficha_produto_id uuid references public.fichas_tecnicas (id) on delete set null,
  add column if not exists ficha_embalagem_viagem_id uuid references public.fichas_tecnicas (id) on delete set null,
  add column if not exists ficha_embalagem_delivery_id uuid references public.fichas_tecnicas (id) on delete set null,
  add column if not exists ficha_embalagem_levar_rapido_id uuid references public.fichas_tecnicas (id) on delete set null;

alter table public.adicionais
  add column if not exists ficha_id uuid references public.fichas_tecnicas (id) on delete set null;

alter table public.loja_config
  add column if not exists ficha_embalagem_pedido_delivery_id uuid
    references public.fichas_tecnicas (id) on delete set null,
  add column if not exists ficha_embalagem_pedido_retirada_id uuid
    references public.fichas_tecnicas (id) on delete set null,
  add column if not exists capacidade_embalagem_pedido_delivery integer
    not null default 4 check (capacidade_embalagem_pedido_delivery > 0),
  add column if not exists capacidade_embalagem_pedido_retirada integer
    not null default 4 check (capacidade_embalagem_pedido_retirada > 0);

create table if not exists public.pedido_insumo_consumos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos (id) on delete cascade,
  insumo_id uuid not null references public.insumos (id) on delete restrict,
  quantidade numeric(12, 4) not null check (quantidade > 0),
  estornado boolean not null default false,
  criado_em timestamptz not null default now(),
  unique (pedido_id, insumo_id)
);

create index if not exists pedido_insumo_consumos_pedido_idx
  on public.pedido_insumo_consumos (pedido_id);

-- RLS
alter table public.fichas_tecnicas enable row level security;
alter table public.ficha_tecnica_itens enable row level security;
alter table public.pedido_insumo_consumos enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['fichas_tecnicas', 'ficha_tecnica_itens', 'pedido_insumo_consumos']
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.eh_admin())',
      t || '_select_admin', t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.eh_admin())',
      t || '_insert_admin', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.eh_admin()) with check (public.eh_admin())',
      t || '_update_admin', t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.eh_admin())',
      t || '_delete_admin', t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4) Explosão + baixa
-- ---------------------------------------------------------------------------
create or replace function public.ficha_qtd_para_base(
  p_quantidade numeric,
  p_unidade text,
  p_tipo text
)
returns numeric
language plpgsql
immutable
as $$
begin
  if p_tipo = 'contagem' then
    return round(p_quantidade, 6);
  end if;
  if p_tipo = 'peso' then
    if p_unidade = 'g' then return round(p_quantidade / 1000.0, 6); end if;
    if p_unidade = 'kg' then return round(p_quantidade, 6); end if;
  end if;
  if p_tipo = 'volume' then
    if p_unidade = 'ml' then return round(p_quantidade / 1000.0, 6); end if;
    if p_unidade = 'L' then return round(p_quantidade, 6); end if;
  end if;
  raise exception 'Unidade % incompatível com tipo %', p_unidade, p_tipo;
end;
$$;

create or replace function public.explodir_ficha_insumos(
  p_ficha_id uuid,
  p_porcoes numeric,
  p_so_ativa boolean default true
)
returns table (insumo_id uuid, quantidade_base numeric)
language plpgsql
stable
as $$
declare
  v_status text;
  v_rendimento numeric;
  v_fator numeric;
  r record;
  f record;
  v_tipo text;
  v_rend_filha numeric;
  v_fator_filha numeric;
begin
  if p_ficha_id is null or p_porcoes <= 0 then
    return;
  end if;

  select status, rendimento into v_status, v_rendimento
  from public.fichas_tecnicas
  where id = p_ficha_id;

  if not found then
    return;
  end if;
  if p_so_ativa and v_status is distinct from 'ativa' then
    return;
  end if;
  if v_rendimento is null or v_rendimento <= 0 then
    return;
  end if;

  v_fator := p_porcoes / v_rendimento;

  for r in
    select i.*, ins.tipo as insumo_tipo
    from public.ficha_tecnica_itens i
    left join public.insumos ins on ins.id = i.insumo_id
    where i.ficha_id = p_ficha_id
  loop
    if r.insumo_id is not null then
      insumo_id := r.insumo_id;
      quantidade_base := public.ficha_qtd_para_base(r.quantidade, r.unidade, r.insumo_tipo) * v_fator;
      return next;
    elsif r.ficha_filha_id is not null then
      select rendimento, status into v_rend_filha, v_status
      from public.fichas_tecnicas
      where id = r.ficha_filha_id;
      if not found then
        continue;
      end if;
      if p_so_ativa and v_status is distinct from 'ativa' then
        continue;
      end if;
      if v_rend_filha is null or v_rend_filha <= 0 then
        continue;
      end if;
      v_fator_filha := (r.quantidade * v_fator) / v_rend_filha;
      for f in
        select fi.insumo_id, fi.quantidade, fi.unidade, ins.tipo as insumo_tipo
        from public.ficha_tecnica_itens fi
        join public.insumos ins on ins.id = fi.insumo_id
        where fi.ficha_id = r.ficha_filha_id
          and fi.insumo_id is not null
      loop
        insumo_id := f.insumo_id;
        quantidade_base := public.ficha_qtd_para_base(f.quantidade, f.unidade, f.insumo_tipo) * v_fator_filha;
        return next;
      end loop;
    end if;
  end loop;
end;
$$;

create or replace function public.perfil_embalagem_item(
  p_origem text,
  p_modalidade text,
  p_modo_consumo text
)
returns text
language plpgsql
immutable
as $$
begin
  if coalesce(p_modo_consumo, '') = 'loja' then
    return null;
  end if;
  if p_origem = 'delivery' and coalesce(p_modalidade, '') = 'entrega' then
    return 'delivery';
  end if;
  if p_origem = 'delivery' then
    return 'levar_rapido';
  end if;
  if p_origem in ('balcao', 'totem') and coalesce(p_modo_consumo, '') = 'levar' then
    return 'viagem';
  end if;
  return null;
end;
$$;

create or replace function public.acumular_consumo_ficha(
  p_ficha_id uuid,
  p_porcoes numeric
)
returns void
language plpgsql
as $$
declare
  cons record;
begin
  if p_ficha_id is null or p_porcoes <= 0 then
    return;
  end if;
  for cons in
    select insumo_id, quantidade_base
    from public.explodir_ficha_insumos(p_ficha_id, p_porcoes, true)
  loop
    insert into tmp_consumo_insumo (insumo_id, quantidade)
    values (cons.insumo_id, cons.quantidade_base)
    on conflict (insumo_id) do update
      set quantidade = tmp_consumo_insumo.quantidade + excluded.quantidade;
  end loop;
end;
$$;

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

  create temporary table if not exists tmp_consumo_insumo (
    insumo_id uuid primary key,
    quantidade numeric
  ) on commit drop;
  delete from tmp_consumo_insumo;

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
    if v_pedido.origem::text = 'delivery' and coalesce(v_pedido.modalidade, '') = 'entrega' then
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

create or replace function public.estornar_insumos_pedido(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select * from public.pedido_insumo_consumos
    where pedido_id = p_pedido_id and estornado = false
    for update
  loop
    update public.insumos
    set
      quantidade_atual = round(quantidade_atual + r.quantidade, 4),
      atualizado_em = now()
    where id = r.insumo_id;

    insert into public.insumo_estoque_movimentos (
      insumo_id, tipo, quantidade, origem, observacao, pedido_id
    ) values (
      r.insumo_id, 'entrada', r.quantidade, 'uso',
      'Estorno por cancelamento', p_pedido_id
    );

    update public.pedido_insumo_consumos
    set estornado = true
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
begin
  if not exists (select 1 from public.pedidos where id = p_pedido_id) then
    raise exception 'Pedido não encontrado.';
  end if;

  for r in
    select
      x.produto_id,
      sum(x.quantidade)::integer as quantidade,
      p.nome,
      coalesce(p.controlar_estoque, false) as controlar_estoque,
      coalesce(p.quantidade_estoque, 0)::integer as quantidade_estoque
    from (
      select pi.produto_id, pi.quantidade
      from public.pedido_itens pi
      join public.produtos prod on prod.id = pi.produto_id
      where pi.pedido_id = p_pedido_id
        and coalesce(prod.tipo::text, 'simples') <> 'combo'
      union all
      select c.produto_escolhido_id as produto_id, pi.quantidade
      from public.pedido_itens pi
      join public.produtos prod on prod.id = pi.produto_id
      join public.pedido_item_combo_escolhas c on c.pedido_item_id = pi.id
      where pi.pedido_id = p_pedido_id
        and prod.tipo = 'combo'
        and c.produto_escolhido_id is not null
    ) x
    join public.produtos p on p.id = x.produto_id
    group by x.produto_id, p.nome, p.controlar_estoque, p.quantidade_estoque
  loop
    if not r.controlar_estoque then
      continue;
    end if;
    if r.quantidade_estoque < r.quantidade then
      raise exception
        'Estoque insuficiente para "%". Disponível: %, solicitado: %',
        r.nome, r.quantidade_estoque, r.quantidade;
    end if;
    v_nova_quantidade := r.quantidade_estoque - r.quantidade;
    update public.produtos
    set
      quantidade_estoque = v_nova_quantidade,
      ativo = case when v_nova_quantidade <= 0 then false else ativo end
    where id = r.produto_id;
  end loop;

  perform public.baixar_insumos_pedido(p_pedido_id);
end;
$$;

create or replace function public.cancelar_pedido_com_estoque(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_pedido public.pedidos%rowtype;
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

  for r in
    select
      x.produto_id,
      sum(x.quantidade)::integer as quantidade,
      coalesce(p.controlar_estoque, false) as controlar_estoque
    from (
      select pi.produto_id, pi.quantidade
      from public.pedido_itens pi
      join public.produtos prod on prod.id = pi.produto_id
      where pi.pedido_id = p_pedido_id
        and coalesce(prod.tipo::text, 'simples') <> 'combo'
      union all
      select c.produto_escolhido_id as produto_id, pi.quantidade
      from public.pedido_itens pi
      join public.produtos prod on prod.id = pi.produto_id
      join public.pedido_item_combo_escolhas c on c.pedido_item_id = pi.id
      where pi.pedido_id = p_pedido_id
        and prod.tipo = 'combo'
        and c.produto_escolhido_id is not null
    ) x
    join public.produtos p on p.id = x.produto_id
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
