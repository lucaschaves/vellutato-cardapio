-- =============================================================================
-- Financeiro: categorias, lançamentos (despesa/receita), recorrências, parcelas
-- Não executar automaticamente neste passo — o usuário aplica depois.
-- =============================================================================

create table if not exists public.financeiro_categorias (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null default 'despesa'
    check (tipo in ('despesa', 'receita', 'ambos')),
  ordem integer not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create index if not exists financeiro_categorias_ativo_ordem_idx
  on public.financeiro_categorias (ativo, ordem, nome);

create table if not exists public.financeiro_recorrencias (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid not null
    references public.financeiro_categorias (id) on delete restrict,
  descricao text not null,
  valor numeric(12, 2) not null check (valor > 0),
  dia_vencimento smallint not null default 10
    check (dia_vencimento between 1 and 28),
  forma_pagamento text null,
  observacao text null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists financeiro_recorrencias_ativo_idx
  on public.financeiro_recorrencias (ativo);

create table if not exists public.financeiro_parcelamentos (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid not null
    references public.financeiro_categorias (id) on delete restrict,
  descricao text not null,
  valor_total numeric(12, 2) not null check (valor_total > 0),
  n_parcelas integer not null check (n_parcelas between 2 and 120),
  forma_pagamento text null,
  observacao text null,
  criado_em timestamptz not null default now()
);

create table if not exists public.financeiro_lancamentos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('despesa', 'receita')),
  categoria_id uuid not null
    references public.financeiro_categorias (id) on delete restrict,
  descricao text not null,
  valor numeric(12, 2) not null check (valor > 0),
  -- 1º dia do mês de competência
  competencia date not null,
  vencimento date not null,
  data_pagamento date null,
  status text not null default 'prevista'
    check (status in ('prevista', 'atrasada', 'paga', 'cancelada')),
  forma_pagamento text null,
  observacao text null,
  recorrencia_id uuid null
    references public.financeiro_recorrencias (id) on delete set null,
  parcelamento_id uuid null
    references public.financeiro_parcelamentos (id) on delete cascade,
  parcela_numero integer null check (parcela_numero is null or parcela_numero >= 1),
  parcela_total integer null check (parcela_total is null or parcela_total >= 2),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint financeiro_lancamentos_parcela_ok check (
    (parcelamento_id is null and parcela_numero is null and parcela_total is null)
    or (
      parcelamento_id is not null
      and parcela_numero is not null
      and parcela_total is not null
      and parcela_numero <= parcela_total
    )
  ),
  constraint financeiro_lancamentos_pago_ok check (
    status <> 'paga' or data_pagamento is not null
  )
);

create index if not exists financeiro_lancamentos_competencia_idx
  on public.financeiro_lancamentos (competencia desc, tipo, status);

create index if not exists financeiro_lancamentos_vencimento_idx
  on public.financeiro_lancamentos (vencimento, status);

create index if not exists financeiro_lancamentos_recorrencia_idx
  on public.financeiro_lancamentos (recorrencia_id, competencia);

create unique index if not exists financeiro_lancamentos_recorrencia_mes_uidx
  on public.financeiro_lancamentos (recorrencia_id, competencia)
  where recorrencia_id is not null and status <> 'cancelada';

create index if not exists financeiro_lancamentos_parcelamento_idx
  on public.financeiro_lancamentos (parcelamento_id, parcela_numero);

-- RLS: só admin
alter table public.financeiro_categorias enable row level security;
alter table public.financeiro_recorrencias enable row level security;
alter table public.financeiro_parcelamentos enable row level security;
alter table public.financeiro_lancamentos enable row level security;

drop policy if exists financeiro_categorias_admin_all on public.financeiro_categorias;
create policy financeiro_categorias_admin_all
  on public.financeiro_categorias for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists financeiro_recorrencias_admin_all on public.financeiro_recorrencias;
create policy financeiro_recorrencias_admin_all
  on public.financeiro_recorrencias for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists financeiro_parcelamentos_admin_all on public.financeiro_parcelamentos;
create policy financeiro_parcelamentos_admin_all
  on public.financeiro_parcelamentos for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists financeiro_lancamentos_admin_all on public.financeiro_lancamentos;
create policy financeiro_lancamentos_admin_all
  on public.financeiro_lancamentos for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

-- Seed categorias padrão (idempotente por nome)
insert into public.financeiro_categorias (nome, tipo, ordem)
select v.nome, v.tipo, v.ordem
from (
  values
    ('Aluguel', 'despesa', 10),
    ('Pró-labore', 'despesa', 20),
    ('Energia', 'despesa', 30),
    ('Água', 'despesa', 40),
    ('Internet / telefone', 'despesa', 50),
    ('Marketing', 'despesa', 60),
    ('Software / assinaturas', 'despesa', 70),
    ('Impostos / contador', 'despesa', 80),
    ('Manutenção', 'despesa', 90),
    ('Equipamentos', 'despesa', 100),
    ('Taxas / tarifas', 'despesa', 110),
    ('Outras despesas', 'despesa', 200),
    ('Receitas avulsas', 'receita', 10),
    ('Reembolsos', 'receita', 20),
    ('Outras receitas', 'receita', 200)
) as v(nome, tipo, ordem)
where not exists (
  select 1 from public.financeiro_categorias c where c.nome = v.nome
);

comment on table public.financeiro_lancamentos is
  'Lançamentos financeiros internos (despesas/receitas). Competência = 1º dia do mês.';
comment on table public.financeiro_recorrencias is
  'Regras de despesa recorrente sem fim; gera lançamentos sob demanda.';
comment on table public.financeiro_parcelamentos is
  'Grupo de compra/despesa parcelada; cada parcela é um lançamento.';
