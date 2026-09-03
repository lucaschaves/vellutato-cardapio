-- localizar_bairro_frete: desempate pelo bairro do CEP quando há overlap de polígonos
-- (ex.: Centro grande cobrindo Carvoeira → preferir Carvoeira se o hint bater).

create or replace function public.localizar_bairro_frete(
  p_lat double precision,
  p_lng double precision,
  p_bairro_hint text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_row public.delivery_bairros_frete%rowtype;
  v_pt extensions.geometry;
  v_hint text := nullif(trim(coalesce(p_bairro_hint, '')), '');
  v_hint_norm text;
begin
  if p_lat is null or p_lng is null then
    return null;
  end if;
  if p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    return null;
  end if;

  v_pt := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326);
  v_hint_norm := lower(v_hint);

  if v_hint_norm is not null then
    select * into v_row
    from public.delivery_bairros_frete b
    where ST_Covers(b.geom, v_pt)
      and (
        lower(b.nome) = v_hint_norm
        or lower(b.nome) like '%' || v_hint_norm || '%'
        or v_hint_norm like '%' || lower(b.nome) || '%'
      )
    order by ST_Area(b.geom::extensions.geography) asc
    limit 1;

    if found then
      return jsonb_build_object(
        'id', v_row.id,
        'slug', v_row.slug,
        'nome', v_row.nome,
        'regiao', v_row.regiao,
        'distrito', v_row.distrito,
        'taxa', v_row.taxa,
        'raio_km', v_row.raio_km,
        'faixas', coalesce(v_row.faixas, '[]'::jsonb),
        'descontos', coalesce(v_row.descontos, '[]'::jsonb)
      );
    end if;
  end if;

  select * into v_row
  from public.delivery_bairros_frete b
  where ST_Covers(b.geom, v_pt)
  order by ST_Area(b.geom::extensions.geography) asc
  limit 1;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'slug', v_row.slug,
    'nome', v_row.nome,
    'regiao', v_row.regiao,
    'distrito', v_row.distrito,
    'taxa', v_row.taxa,
    'raio_km', v_row.raio_km,
    'faixas', coalesce(v_row.faixas, '[]'::jsonb),
    'descontos', coalesce(v_row.descontos, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.localizar_bairro_frete(double precision, double precision, text)
  to anon, authenticated;

-- Assinatura de 2 args continua válida (hint null)
create or replace function public.localizar_bairro_frete(
  p_lat double precision,
  p_lng double precision
)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  select public.localizar_bairro_frete(p_lat, p_lng, null::text);
$$;

grant execute on function public.localizar_bairro_frete(double precision, double precision)
  to anon, authenticated;
