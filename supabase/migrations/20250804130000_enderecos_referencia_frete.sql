-- Endereços de referência para calibrar frete com plataformas externas
alter table public.delivery_config
  add column if not exists enderecos_referencia jsonb not null default '[]'::jsonb;

comment on column public.delivery_config.enderecos_referencia is
  'Endereços salvos (faixa km + texto) para copiar e calibrar preços em apps externos.';
