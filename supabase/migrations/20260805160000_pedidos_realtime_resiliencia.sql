-- Realtime resiliente para KDS, impressão e alerta sonoro.
-- FULL inclui as colunas anteriores no payload.old dos UPDATEs.
alter table public.pedidos replica identity full;

-- Não mascara erros reais: só adiciona se ainda não pertencer à publicação.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'pedidos'
  ) then
    alter publication supabase_realtime add table public.pedidos;
  end if;
end
$$;
