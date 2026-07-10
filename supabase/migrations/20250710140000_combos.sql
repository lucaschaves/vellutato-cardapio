-- =============================================================================
-- Combos: produto com grupos (slots) e opções (produtos existentes) + delta
--
-- Exemplo: Caixinha Degustação (preço base R$ 45)
--   Grupo "Cookie"  → Cookie Tradicional (delta 0) | Cookie Dubai (delta +4)
--   Grupo "Brownie" → opções...
--   Grupo "Café"    → opções...
--
-- Preço cobrado = preco do combo + soma dos deltas das escolhas
-- Execute no SQL Editor do Supabase.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tipo do produto
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'tipo_produto'
  ) THEN
    CREATE TYPE public.tipo_produto AS ENUM ('simples', 'combo');
  END IF;
END $$;

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS tipo public.tipo_produto NOT NULL DEFAULT 'simples';

CREATE INDEX IF NOT EXISTS produtos_tipo_idx
  ON public.produtos (tipo);

-- -----------------------------------------------------------------------------
-- 2. Grupos do combo (slots: "Cookie", "Brownie", "Café")
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.combo_grupos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  combo_produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text,
  -- Quantas escolhas o cliente deve/pode fazer neste grupo
  min_escolhas integer NOT NULL DEFAULT 1 CHECK (min_escolhas >= 0),
  max_escolhas integer NOT NULL DEFAULT 1 CHECK (max_escolhas >= 1),
  -- Preço "incluso" no valor base do combo (ex.: cookie tradicional = 14).
  -- Usado para sugerir delta = max(0, preco_opcao - preco_referencia).
  preco_referencia numeric(10,2) NOT NULL DEFAULT 0,
  ordem integer NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT combo_grupos_min_max_check CHECK (min_escolhas <= max_escolhas)
);

CREATE INDEX IF NOT EXISTS combo_grupos_combo_idx
  ON public.combo_grupos (combo_produto_id, ordem);

-- -----------------------------------------------------------------------------
-- 3. Opções de cada grupo (produtos já cadastrados)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.combo_opcoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid NOT NULL REFERENCES public.combo_grupos(id) ON DELETE CASCADE,
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
  -- NULL = calcular automaticamente: max(0, preco_produto - preco_referencia do grupo)
  -- Valor explícito = override (ex.: +4.00 para Cookie Dubai)
  delta_preco numeric(10,2),
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT combo_opcoes_grupo_produto_unique UNIQUE (grupo_id, produto_id)
);

CREATE INDEX IF NOT EXISTS combo_opcoes_grupo_idx
  ON public.combo_opcoes (grupo_id, ordem);

CREATE INDEX IF NOT EXISTS combo_opcoes_produto_idx
  ON public.combo_opcoes (produto_id);

-- -----------------------------------------------------------------------------
-- 4. Snapshot das escolhas no pedido (KDS / histórico)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pedido_item_combo_escolhas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_item_id uuid NOT NULL REFERENCES public.pedido_itens(id) ON DELETE CASCADE,
  grupo_id uuid REFERENCES public.combo_grupos(id) ON DELETE SET NULL,
  produto_escolhido_id uuid REFERENCES public.produtos(id) ON DELETE SET NULL,
  -- Snapshots (não dependem do cadastro mudar depois)
  nome_grupo text NOT NULL,
  nome_produto text NOT NULL,
  delta_preco numeric(10,2) NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pedido_item_combo_escolhas_item_idx
  ON public.pedido_item_combo_escolhas (pedido_item_id);

-- -----------------------------------------------------------------------------
-- 5. Helper: delta efetivo de uma opção
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calcular_delta_combo_opcao(p_opcao_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delta numeric;
  v_preco_ref numeric;
  v_preco_prod numeric;
BEGIN
  SELECT
    o.delta_preco,
    g.preco_referencia,
    CASE
      WHEN p.em_promocao AND p.preco_promocional IS NOT NULL THEN p.preco_promocional
      ELSE p.preco
    END
  INTO v_delta, v_preco_ref, v_preco_prod
  FROM public.combo_opcoes o
  JOIN public.combo_grupos g ON g.id = o.grupo_id
  JOIN public.produtos p ON p.id = o.produto_id
  WHERE o.id = p_opcao_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  IF v_delta IS NOT NULL THEN
    RETURN v_delta;
  END IF;

  RETURN GREATEST(COALESCE(v_preco_prod, 0) - COALESCE(v_preco_ref, 0), 0);
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. Permissões + RLS (ver também 20250710160000_combos_rls.sql)
-- -----------------------------------------------------------------------------
GRANT SELECT ON public.combo_grupos TO anon, authenticated;
GRANT SELECT ON public.combo_opcoes TO anon, authenticated;
GRANT SELECT ON public.pedido_item_combo_escolhas TO anon, authenticated;

GRANT INSERT, UPDATE, DELETE ON public.combo_grupos TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.combo_opcoes TO authenticated;
GRANT INSERT ON public.pedido_item_combo_escolhas TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.calcular_delta_combo_opcao(uuid) TO anon, authenticated;

-- Exemplo de uso (não execute automaticamente — só referência):
--
-- UPDATE produtos SET tipo = 'combo', preco = 45 WHERE nome ILIKE '%caixinha%degusta%';
--
-- INSERT INTO combo_grupos (combo_produto_id, nome, preco_referencia, ordem)
-- VALUES ('<combo_id>', 'Cookie', 14, 1);
--
-- INSERT INTO combo_opcoes (grupo_id, produto_id, delta_preco, ordem)
-- VALUES
--   ('<grupo_id>', '<cookie_tradicional_id>', 0, 1),
--   ('<grupo_id>', '<cookie_dubai_id>', 4, 2);
