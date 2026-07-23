-- Medida do produto (peso/volume) para tag no cardápio: ex. 85g, 250ml
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'unidade_medida_produto'
  ) THEN
    CREATE TYPE public.unidade_medida_produto AS ENUM ('g', 'kg', 'ml', 'L');
  END IF;
END $$;

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS medida_valor numeric(10, 3) NULL,
  ADD COLUMN IF NOT EXISTS medida_unidade public.unidade_medida_produto NULL;

COMMENT ON COLUMN public.produtos.medida_valor IS
  'Valor numérico da medida (peso/volume). Null = não exibir tag.';
COMMENT ON COLUMN public.produtos.medida_unidade IS
  'Unidade da medida: g, kg, ml ou L.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'produtos_medida_completa_check'
  ) THEN
    ALTER TABLE public.produtos
      ADD CONSTRAINT produtos_medida_completa_check
      CHECK (
        (medida_valor IS NULL AND medida_unidade IS NULL)
        OR (
          medida_valor IS NOT NULL
          AND medida_valor > 0
          AND medida_unidade IS NOT NULL
        )
      );
  END IF;
END $$;
