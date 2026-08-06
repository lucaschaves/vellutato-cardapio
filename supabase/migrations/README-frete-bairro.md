# Frete por bairro (Florianópolis)

## Migrations

Aplique no Supabase (SQL Editor ou CLI), nesta ordem:

1. `20260805200000_frete_por_bairro.sql` — PostGIS, `modo_frete`, tabela e RPCs base
2. `20260805200100_seed_floripa_bairros.sql` — 56 bairros oficiais
3. `20260806120000_frete_bairro_hibrido.sql` — raio + faixas de km + descontos por carrinho
4. `20260806140000_corrigir_geoms_bairros_osm.sql` — polígonos OSM corrigidos (bairro vs distrito/lago)

## Modo híbrido (bairro)

Em cada bairro:

- **Raio** — até quantos km atende naquele polígono
- **Faixas de km** — preço por distância
- **Descontos** — linhas separadas (pedido mínimo + opcional até km + tipo grátis / −R$ / −%)

Cálculo: `taxa_faixa → +chuva → −melhor desconto → max(0, …)`.

Entre linhas que qualificam, vale a de **maior desconto em R$**.

## Uso

1. Admin → Delivery → Frete → Por bairro → Salvar
2. Clique no bairro no mapa e configure raio, faixas e descontos
3. Checkout resolve o bairro pelas coordenadas e aplica o motor híbrido
