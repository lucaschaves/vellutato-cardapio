-- Frete dinâmico: regras por dia/horário + config de clima
alter table public.delivery_config
  add column if not exists regras_frete jsonb not null default '[]'::jsonb;

alter table public.delivery_config
  add column if not exists clima_frete jsonb not null default '{"ativo":false,"acrescimo_tipo":"fixo","acrescimo_valor":3}'::jsonb;

comment on column public.delivery_config.regras_frete is
  'Regras de frete por dia da semana e faixa horária (faixas km/taxa).';

comment on column public.delivery_config.clima_frete is
  'Acréscimo de frete em chuva (Open-Meteo): ativo, acrescimo_tipo, acrescimo_valor.';

-- Migra faixas atuais para uma regra “todos os dias, dia inteiro” se ainda não houver regras
update public.delivery_config
set regras_frete = jsonb_build_array(
  jsonb_build_object(
    'id', gen_random_uuid()::text,
    'dias', jsonb_build_array(0, 1, 2, 3, 4, 5, 6),
    'inicio', '00:00',
    'fim', '23:59',
    'faixas', faixas_frete,
    'rotulo', 'Padrão (migrado)'
  )
)
where id = 1
  and (
    regras_frete is null
    or regras_frete = '[]'::jsonb
  )
  and faixas_frete is not null
  and jsonb_typeof(faixas_frete) = 'array'
  and jsonb_array_length(faixas_frete) > 0;
