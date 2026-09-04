-- Remove a sobrecarga de 2 args. Com p_bairro_hint default, as duas
-- assinaturas tornavam localizar_bairro_frete(lat, lng) ambígua.

drop function if exists public.localizar_bairro_frete(double precision, double precision);

grant execute on function public.localizar_bairro_frete(double precision, double precision, text)
  to anon, authenticated;
