-- Garante pedidos no Realtime (status pós-Asaas / KDS)
do $$
begin
  alter publication supabase_realtime add table public.pedidos;
exception
  when duplicate_object then null;
  when others then
    -- already member / publication quirks
    null;
end $$;
