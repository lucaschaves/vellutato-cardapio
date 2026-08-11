-- =============================================================================
-- Insumos (estoque operacional) + lista de compras + histórico de preços
-- Unidades em pacote/lata/etc. (inteiros). Não misturar com estoque do cardápio.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.insumos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  unidade text NOT NULL DEFAULT 'unidade'
    CHECK (unidade IN ('pacote', 'lata', 'unidade', 'caixa', 'garrafa', 'saco', 'bandeja')),
  quantidade_atual integer NOT NULL DEFAULT 0 CHECK (quantidade_atual >= 0),
  estoque_minimo integer NOT NULL DEFAULT 0 CHECK (estoque_minimo >= 0),
  imagem_url text NULL,
  preco_atual numeric(12, 2) NULL CHECK (preco_atual IS NULL OR preco_atual >= 0),
  preco_atualizado_em timestamptz NULL,
  observacao text NULL,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS insumos_ativo_nome_idx
  ON public.insumos (ativo, nome);

COMMENT ON TABLE public.insumos IS
  'Insumos / matérias-primas (pacotes, latas). Independente do estoque do cardápio.';

-- Alternativas: ambos são insumos reais
CREATE TABLE IF NOT EXISTS public.insumo_alternativas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insumo_id uuid NOT NULL REFERENCES public.insumos (id) ON DELETE CASCADE,
  alternativa_id uuid NOT NULL REFERENCES public.insumos (id) ON DELETE CASCADE,
  ordem integer NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT insumo_alternativas_diferentes CHECK (insumo_id <> alternativa_id),
  CONSTRAINT insumo_alternativas_unique UNIQUE (insumo_id, alternativa_id)
);

CREATE INDEX IF NOT EXISTS insumo_alternativas_insumo_idx
  ON public.insumo_alternativas (insumo_id, ordem);

COMMENT ON TABLE public.insumo_alternativas IS
  'Substitutos aceitos na compra (ex.: manteiga → marcas X/Y).';

CREATE TABLE IF NOT EXISTS public.lista_compras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'aberta'
    CHECK (status IN ('aberta', 'finalizada', 'cancelada')),
  titulo text NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  finalizada_em timestamptz NULL
);

CREATE INDEX IF NOT EXISTS lista_compras_status_criado_idx
  ON public.lista_compras (status, criado_em DESC);

CREATE TABLE IF NOT EXISTS public.lista_compras_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lista_id uuid NOT NULL REFERENCES public.lista_compras (id) ON DELETE CASCADE,
  insumo_id uuid NOT NULL REFERENCES public.insumos (id) ON DELETE RESTRICT,
  quantidade_planejada integer NOT NULL DEFAULT 1 CHECK (quantidade_planejada > 0),
  quantidade_comprada integer NULL CHECK (quantidade_comprada IS NULL OR quantidade_comprada > 0),
  marcado boolean NOT NULL DEFAULT false,
  comprado boolean NOT NULL DEFAULT false,
  insumo_comprado_id uuid NULL REFERENCES public.insumos (id) ON DELETE SET NULL,
  preco_unitario numeric(12, 2) NULL CHECK (preco_unitario IS NULL OR preco_unitario >= 0),
  observacao text NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lista_compras_itens_unique UNIQUE (lista_id, insumo_id)
);

CREATE INDEX IF NOT EXISTS lista_compras_itens_lista_idx
  ON public.lista_compras_itens (lista_id);

CREATE TABLE IF NOT EXISTS public.insumo_estoque_movimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insumo_id uuid NOT NULL REFERENCES public.insumos (id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('entrada', 'saida', 'ajuste')),
  quantidade integer NOT NULL CHECK (quantidade > 0),
  origem text NOT NULL DEFAULT 'manual'
    CHECK (origem IN ('compra', 'uso', 'manual', 'ajuste')),
  lista_compra_item_id uuid NULL REFERENCES public.lista_compras_itens (id) ON DELETE SET NULL,
  observacao text NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS insumo_estoque_movimentos_insumo_idx
  ON public.insumo_estoque_movimentos (insumo_id, criado_em DESC);

CREATE TABLE IF NOT EXISTS public.insumo_precos_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insumo_id uuid NOT NULL REFERENCES public.insumos (id) ON DELETE CASCADE,
  preco_unitario numeric(12, 2) NOT NULL CHECK (preco_unitario >= 0),
  quantidade integer NULL CHECK (quantidade IS NULL OR quantidade > 0),
  lista_compra_item_id uuid NULL REFERENCES public.lista_compras_itens (id) ON DELETE SET NULL,
  observacao text NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS insumo_precos_historico_insumo_idx
  ON public.insumo_precos_historico (insumo_id, criado_em DESC);

-- RLS (admin autenticado)
ALTER TABLE public.insumos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insumo_alternativas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lista_compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lista_compras_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insumo_estoque_movimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insumo_precos_historico ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'insumos',
    'insumo_alternativas',
    'lista_compras',
    'lista_compras_itens',
    'insumo_estoque_movimentos',
    'insumo_precos_historico'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select_auth', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
      t || '_select_auth', t
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert_auth', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (true)',
      t || '_insert_auth', t
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update_auth', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)',
      t || '_update_auth', t
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete_auth', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (true)',
      t || '_delete_auth', t
    );
  END LOOP;
END $$;

-- Movimenta estoque de insumo (uso / ajuste / compra)
CREATE OR REPLACE FUNCTION public.ajustar_estoque_insumo(
  p_insumo_id uuid,
  p_delta integer,
  p_origem text DEFAULT 'manual',
  p_observacao text DEFAULT NULL,
  p_lista_compra_item_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_atual integer;
  v_nova integer;
  v_tipo text;
BEGIN
  IF p_delta = 0 THEN
    RAISE EXCEPTION 'Delta deve ser diferente de zero.';
  END IF;

  IF p_origem NOT IN ('compra', 'uso', 'manual', 'ajuste') THEN
    RAISE EXCEPTION 'Origem inválida.';
  END IF;

  SELECT quantidade_atual INTO v_atual
  FROM public.insumos
  WHERE id = p_insumo_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insumo não encontrado.';
  END IF;

  v_nova := v_atual + p_delta;
  IF v_nova < 0 THEN
    RAISE EXCEPTION 'Estoque insuficiente. Atual: %, delta: %', v_atual, p_delta;
  END IF;

  UPDATE public.insumos
  SET
    quantidade_atual = v_nova,
    atualizado_em = now()
  WHERE id = p_insumo_id;

  v_tipo := CASE WHEN p_delta > 0 THEN 'entrada' ELSE 'saida' END;

  INSERT INTO public.insumo_estoque_movimentos (
    insumo_id, tipo, quantidade, origem, observacao, lista_compra_item_id
  ) VALUES (
    p_insumo_id,
    v_tipo,
    ABS(p_delta),
    p_origem,
    p_observacao,
    p_lista_compra_item_id
  );

  RETURN v_nova;
END;
$$;

-- Finaliza compra dos itens marcados: entram no estoque.
-- Se sobrar item não marcado, a lista permanece aberta.
CREATE OR REPLACE FUNCTION public.finalizar_lista_compras(p_lista_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_insumo uuid;
  v_qtd integer;
  v_count integer := 0;
  v_status text;
  v_restantes integer;
BEGIN
  SELECT status INTO v_status
  FROM public.lista_compras
  WHERE id = p_lista_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lista de compras não encontrada.';
  END IF;

  IF v_status <> 'aberta' THEN
    RAISE EXCEPTION 'Lista já foi finalizada ou cancelada.';
  END IF;

  FOR r IN
    SELECT *
    FROM public.lista_compras_itens
    WHERE lista_id = p_lista_id
      AND marcado = true
      AND comprado = false
    FOR UPDATE
  LOOP
    v_insumo := COALESCE(r.insumo_comprado_id, r.insumo_id);
    v_qtd := COALESCE(r.quantidade_comprada, r.quantidade_planejada);

    PERFORM public.ajustar_estoque_insumo(
      v_insumo,
      v_qtd,
      'compra',
      'Entrada pela lista de compras',
      r.id
    );

    IF r.preco_unitario IS NOT NULL THEN
      INSERT INTO public.insumo_precos_historico (
        insumo_id, preco_unitario, quantidade, lista_compra_item_id
      ) VALUES (
        v_insumo, r.preco_unitario, v_qtd, r.id
      );

      UPDATE public.insumos
      SET
        preco_atual = r.preco_unitario,
        preco_atualizado_em = now(),
        atualizado_em = now()
      WHERE id = v_insumo;
    END IF;

    UPDATE public.lista_compras_itens
    SET
      comprado = true,
      quantidade_comprada = v_qtd
    WHERE id = r.id;

    v_count := v_count + 1;
  END LOOP;

  SELECT COUNT(*)::integer INTO v_restantes
  FROM public.lista_compras_itens
  WHERE lista_id = p_lista_id
    AND comprado = false;

  IF v_restantes = 0 THEN
    UPDATE public.lista_compras
    SET
      status = 'finalizada',
      finalizada_em = now()
    WHERE id = p_lista_id;
  END IF;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ajustar_estoque_insumo(uuid, integer, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalizar_lista_compras(uuid) TO authenticated;
