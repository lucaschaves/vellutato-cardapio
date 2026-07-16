-- =============================================================================
-- Disponibilidade do produto (loja / levar / ambos) + modo por item do pedido
-- Execute no SQL Editor do Supabase.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'disponibilidade_produto'
  ) THEN
    CREATE TYPE public.disponibilidade_produto AS ENUM ('loja', 'levar', 'ambos');
  END IF;
END $$;

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS disponibilidade public.disponibilidade_produto
  NOT NULL DEFAULT 'ambos';

CREATE INDEX IF NOT EXISTS produtos_disponibilidade_idx
  ON public.produtos (disponibilidade);

ALTER TABLE public.pedido_itens
  ADD COLUMN IF NOT EXISTS modo_consumo text NOT NULL DEFAULT 'loja';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pedido_itens_modo_consumo_check'
  ) THEN
    ALTER TABLE public.pedido_itens
      ADD CONSTRAINT pedido_itens_modo_consumo_check
      CHECK (modo_consumo IN ('loja', 'levar'));
  END IF;
END $$;
