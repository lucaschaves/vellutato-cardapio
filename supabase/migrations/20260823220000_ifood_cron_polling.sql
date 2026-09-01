-- Cron iFood: pg_cron a cada 1 min → Edge Function com duplo poll (~30s).

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create or replace function public.ifood_disparar_poll()
returns bigint
language plpgsql
security definer
set search_path = public, net, extensions
as $$
declare
  v_secret text;
  v_url text :=
    'https://uhaapfxdxivmwhvnuyie.supabase.co/functions/v1/ifood-poll-pedidos?duplo=1';
  v_request_id bigint;
begin
  select nullif(trim(valor), '')
  into v_secret
  from public.integracoes_config
  where chave = 'IFOOD_POLL_SECRET';

  if v_secret is null then
    raise warning
      '[ifood] IFOOD_POLL_SECRET ausente em integracoes_config — cron ignorado';
    return null;
  end if;

  select net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-ifood-poll-secret', v_secret
    ),
    body := jsonb_build_object('origem', 'pg_cron'),
    timeout_milliseconds := 55000
  )
  into v_request_id;

  return v_request_id;
end;
$$;

comment on function public.ifood_disparar_poll() is
  'Dispara polling iFood (Edge Function). Requer IFOOD_POLL_SECRET em integracoes_config.';

revoke all on function public.ifood_disparar_poll() from public;
grant execute on function public.ifood_disparar_poll() to postgres;
grant execute on function public.ifood_disparar_poll() to service_role;

-- Reagenda (idempotente)
do $$
declare
  jid bigint;
begin
  for jid in
    select jobid from cron.job where jobname = 'ifood-poll-pedidos'
  loop
    perform cron.unschedule(jid);
  end loop;

  perform cron.schedule(
    'ifood-poll-pedidos',
    '* * * * *',
    $cron$ select public.ifood_disparar_poll(); $cron$
  );
end;
$$;
