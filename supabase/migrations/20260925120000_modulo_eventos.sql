-- Módulo Eventos: colunas e valores de enum.
-- As funções ficam na migration seguinte: valor novo de enum só pode
-- ser usado depois do commit desta migration.

do $$
begin
  begin
    alter type public.tipo_origem_pedido add value if not exists 'evento';
  exception when others then
    begin
      alter type public.tipo_origem_pedido add value 'evento';
    exception when duplicate_object then null;
    end;
  end;
  begin
    alter type public.tipo_status_pagamento add value if not exists 'sinal';
  exception when others then
    begin
      alter type public.tipo_status_pagamento add value 'sinal';
    exception when duplicate_object then null;
    end;
  end;
end $$;

alter table public.produtos
  add column if not exists canal_evento boolean not null default false,
  add column if not exists evento_unidades_caixa integer,
  add column if not exists evento_sabores jsonb not null default '[]'::jsonb,
  add column if not exists evento_min_sabores integer not null default 1,
  add column if not exists evento_max_sabores integer not null default 1,
  add column if not exists evento_descontos jsonb not null default '[]'::jsonb,
  add column if not exists evento_limite_caixas_dia integer,
  add column if not exists evento_dias_antecedencia integer not null default 2;

alter table public.pedidos
  add column if not exists evento_json jsonb;

comment on column public.pedidos.evento_json is
  'Pedido de evento: percentual de entrada, quem retira, caixas e avisos.';
