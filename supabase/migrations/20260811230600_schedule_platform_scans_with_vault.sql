do $$
declare
  existing_job record;
begin
  for existing_job in
    select jobid from cron.job
    where jobname in (
      'gamesignal-twitch-every-minute',
      'gamesignal-youtube-every-15-minutes'
    )
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
end
$$;

select cron.schedule(
  'gamesignal-twitch-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://mgaufxduaaobrlyzdrdo.supabase.co/functions/v1/scan-twitch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'gamesignal_cron_secret'
        limit 1
      )
    ),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'gamesignal-youtube-every-15-minutes',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://mgaufxduaaobrlyzdrdo.supabase.co/functions/v1/scan-youtube',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'gamesignal_cron_secret'
        limit 1
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
