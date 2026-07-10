-- =============================================================================
-- RLS para tabelas de combo (corrige erro 42501 no INSERT de combo_grupos)
--
-- Mesmo padrão de mesas: GRANT não basta com RLS ligado.
-- Execute no SQL Editor do Supabase.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- combo_grupos
-- -----------------------------------------------------------------------------
ALTER TABLE public.combo_grupos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "combo_grupos_select_anon" ON public.combo_grupos;
DROP POLICY IF EXISTS "combo_grupos_select_authenticated" ON public.combo_grupos;
DROP POLICY IF EXISTS "combo_grupos_insert_authenticated" ON public.combo_grupos;
DROP POLICY IF EXISTS "combo_grupos_update_authenticated" ON public.combo_grupos;
DROP POLICY IF EXISTS "combo_grupos_delete_authenticated" ON public.combo_grupos;

CREATE POLICY "combo_grupos_select_anon"
ON public.combo_grupos FOR SELECT TO anon
USING (true);

CREATE POLICY "combo_grupos_select_authenticated"
ON public.combo_grupos FOR SELECT TO authenticated
USING (true);

CREATE POLICY "combo_grupos_insert_authenticated"
ON public.combo_grupos FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "combo_grupos_update_authenticated"
ON public.combo_grupos FOR UPDATE TO authenticated
USING (true) WITH CHECK (true);

CREATE POLICY "combo_grupos_delete_authenticated"
ON public.combo_grupos FOR DELETE TO authenticated
USING (true);

-- -----------------------------------------------------------------------------
-- combo_opcoes
-- -----------------------------------------------------------------------------
ALTER TABLE public.combo_opcoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "combo_opcoes_select_anon" ON public.combo_opcoes;
DROP POLICY IF EXISTS "combo_opcoes_select_authenticated" ON public.combo_opcoes;
DROP POLICY IF EXISTS "combo_opcoes_insert_authenticated" ON public.combo_opcoes;
DROP POLICY IF EXISTS "combo_opcoes_update_authenticated" ON public.combo_opcoes;
DROP POLICY IF EXISTS "combo_opcoes_delete_authenticated" ON public.combo_opcoes;

CREATE POLICY "combo_opcoes_select_anon"
ON public.combo_opcoes FOR SELECT TO anon
USING (true);

CREATE POLICY "combo_opcoes_select_authenticated"
ON public.combo_opcoes FOR SELECT TO authenticated
USING (true);

CREATE POLICY "combo_opcoes_insert_authenticated"
ON public.combo_opcoes FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "combo_opcoes_update_authenticated"
ON public.combo_opcoes FOR UPDATE TO authenticated
USING (true) WITH CHECK (true);

CREATE POLICY "combo_opcoes_delete_authenticated"
ON public.combo_opcoes FOR DELETE TO authenticated
USING (true);

-- -----------------------------------------------------------------------------
-- pedido_item_combo_escolhas (cliente no checkout + leitura admin/KDS)
-- -----------------------------------------------------------------------------
ALTER TABLE public.pedido_item_combo_escolhas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pedido_item_combo_escolhas_select_anon" ON public.pedido_item_combo_escolhas;
DROP POLICY IF EXISTS "pedido_item_combo_escolhas_select_authenticated" ON public.pedido_item_combo_escolhas;
DROP POLICY IF EXISTS "pedido_item_combo_escolhas_insert_anon" ON public.pedido_item_combo_escolhas;
DROP POLICY IF EXISTS "pedido_item_combo_escolhas_insert_authenticated" ON public.pedido_item_combo_escolhas;

CREATE POLICY "pedido_item_combo_escolhas_select_anon"
ON public.pedido_item_combo_escolhas FOR SELECT TO anon
USING (true);

CREATE POLICY "pedido_item_combo_escolhas_select_authenticated"
ON public.pedido_item_combo_escolhas FOR SELECT TO authenticated
USING (true);

CREATE POLICY "pedido_item_combo_escolhas_insert_anon"
ON public.pedido_item_combo_escolhas FOR INSERT TO anon
WITH CHECK (true);

CREATE POLICY "pedido_item_combo_escolhas_insert_authenticated"
ON public.pedido_item_combo_escolhas FOR INSERT TO authenticated
WITH CHECK (true);

-- Grants (idempotente)
GRANT SELECT ON public.combo_grupos TO anon, authenticated;
GRANT SELECT ON public.combo_opcoes TO anon, authenticated;
GRANT SELECT ON public.pedido_item_combo_escolhas TO anon, authenticated;

GRANT INSERT, UPDATE, DELETE ON public.combo_grupos TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.combo_opcoes TO authenticated;
GRANT INSERT ON public.pedido_item_combo_escolhas TO anon, authenticated;
