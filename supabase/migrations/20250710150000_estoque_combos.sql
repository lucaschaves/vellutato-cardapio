-- =============================================================================
-- Estoque de combos: baixa/restaura os produtos escolhidos nos slots
--
-- Itens simples  → baixa o produto do pedido_itens (como antes)
-- Itens combo    → baixa cada produto em pedido_item_combo_escolhas
--                  (quantidade = qtd do item do pedido)
--
-- Execute no SQL Editor do Supabase.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.baixar_estoque_pedido(p_pedido_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_nova_quantidade integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.pedidos WHERE id = p_pedido_id) THEN
    RAISE EXCEPTION 'Pedido não encontrado.';
  END IF;

  FOR r IN
    SELECT
      x.produto_id,
      SUM(x.quantidade)::integer AS quantidade,
      p.nome,
      COALESCE(p.controlar_estoque, false) AS controlar_estoque,
      COALESCE(p.quantidade_estoque, 0)::integer AS quantidade_estoque
    FROM (
      -- Produtos simples (não-combo): baixa o próprio item
      SELECT pi.produto_id, pi.quantidade
      FROM public.pedido_itens pi
      JOIN public.produtos prod ON prod.id = pi.produto_id
      WHERE pi.pedido_id = p_pedido_id
        AND COALESCE(prod.tipo::text, 'simples') <> 'combo'

      UNION ALL

      -- Combos: baixa cada componente escolhido
      SELECT c.produto_escolhido_id AS produto_id, pi.quantidade
      FROM public.pedido_itens pi
      JOIN public.produtos prod ON prod.id = pi.produto_id
      JOIN public.pedido_item_combo_escolhas c ON c.pedido_item_id = pi.id
      WHERE pi.pedido_id = p_pedido_id
        AND prod.tipo = 'combo'
        AND c.produto_escolhido_id IS NOT NULL
    ) x
    JOIN public.produtos p ON p.id = x.produto_id
    GROUP BY x.produto_id, p.nome, p.controlar_estoque, p.quantidade_estoque
  LOOP
    IF NOT r.controlar_estoque THEN
      CONTINUE;
    END IF;

    IF r.quantidade_estoque < r.quantidade THEN
      RAISE EXCEPTION
        'Estoque insuficiente para "%". Disponível: %, solicitado: %',
        r.nome, r.quantidade_estoque, r.quantidade;
    END IF;

    v_nova_quantidade := r.quantidade_estoque - r.quantidade;

    UPDATE public.produtos
    SET
      quantidade_estoque = v_nova_quantidade,
      ativo = CASE
        WHEN v_nova_quantidade <= 0 THEN false
        ELSE ativo
      END
    WHERE id = r.produto_id;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancelar_pedido_com_estoque(p_pedido_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_pedido public.pedidos%ROWTYPE;
BEGIN
  SELECT * INTO v_pedido
  FROM public.pedidos
  WHERE id = p_pedido_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado.';
  END IF;

  IF v_pedido.status = 'cancelado' THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT
      x.produto_id,
      SUM(x.quantidade)::integer AS quantidade,
      COALESCE(p.controlar_estoque, false) AS controlar_estoque
    FROM (
      SELECT pi.produto_id, pi.quantidade
      FROM public.pedido_itens pi
      JOIN public.produtos prod ON prod.id = pi.produto_id
      WHERE pi.pedido_id = p_pedido_id
        AND COALESCE(prod.tipo::text, 'simples') <> 'combo'

      UNION ALL

      SELECT c.produto_escolhido_id AS produto_id, pi.quantidade
      FROM public.pedido_itens pi
      JOIN public.produtos prod ON prod.id = pi.produto_id
      JOIN public.pedido_item_combo_escolhas c ON c.pedido_item_id = pi.id
      WHERE pi.pedido_id = p_pedido_id
        AND prod.tipo = 'combo'
        AND c.produto_escolhido_id IS NOT NULL
    ) x
    JOIN public.produtos p ON p.id = x.produto_id
    GROUP BY x.produto_id, p.controlar_estoque
  LOOP
    IF NOT r.controlar_estoque THEN
      CONTINUE;
    END IF;

    UPDATE public.produtos
    SET
      quantidade_estoque = COALESCE(quantidade_estoque, 0) + r.quantidade,
      ativo = true
    WHERE id = r.produto_id;
  END LOOP;

  IF v_pedido.cliente_id IS NOT NULL THEN
    PERFORM public.atualizar_stats_cliente_pedido(
      v_pedido.cliente_id,
      -COALESCE(v_pedido.total, 0),
      -1
    );
  END IF;

  UPDATE public.pedidos
  SET status = 'cancelado'
  WHERE id = p_pedido_id;
END;
$$;
