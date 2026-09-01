-- Fechamento automático do caixa às 23:59 (America/Sao_Paulo).

create extension if not exists pg_cron with schema pg_catalog;

create or replace function public.caixa_fechar_contas_automatico()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_qtd integer;
  v_hora integer;
  v_minuto integer;
begin
  v_hora := extract(hour from timezone('America/Sao_Paulo', now()))::integer;
  v_minuto := extract(minute from timezone('America/Sao_Paulo', now()))::integer;

  -- Margem para drift do cron (UTC → SP): 23:59–00:02
  if not (
    (v_hora = 23 and v_minuto >= 59)
    or (v_hora = 0 and v_minuto <= 2)
  ) then
    return 0;
  end if;

  update public.pedidos
  set status = 'pago'
  where status not in ('pago', 'cancelado');

  get diagnostics v_qtd = row_count;
  return v_qtd;
end;
$$;

comment on function public.caixa_fechar_contas_automatico() is
  'Marca como pago todos os pedidos em aberto. Executado via pg_cron às 23:59 America/Sao_Paulo.';

revoke all on function public.caixa_fechar_contas_automatico() from public;
grant execute on function public.caixa_fechar_contas_automatico() to postgres;
grant execute on function public.caixa_fechar_contas_automatico() to service_role;

do $$
declare
  jid bigint;
begin
  for jid in
    select jobid from cron.job where jobname = 'caixa-fechar-contas-2359'
  loop
    perform cron.unschedule(jid);
  end loop;

  -- 23:59 America/Sao_Paulo (UTC-3) = 02:59 UTC
  perform cron.schedule(
    'caixa-fechar-contas-2359',
    '59 2 * * *',
    $cron$ select public.caixa_fechar_contas_automatico(); $cron$
  );
end;
$$;
