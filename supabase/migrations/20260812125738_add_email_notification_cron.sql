do $$
begin
  if not exists (select 1 from cron.job where jobname = 'gamesignal-email-every-minute') then
    perform cron.schedule(
      'gamesignal-email-every-minute',
      '* * * * *',
      $cron$
      select net.http_post(
        url := 'https://mgaufxduaaobrlyzdrdo.supabase.co/functions/v1/notify-email',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'gamesignal_cron_secret' limit 1)
        ),
        body := '{}'::jsonb
      );
      $cron$
    );
  end if;

  perform cron.alter_job(
    (select jobid from cron.job where jobname = 'gamesignal-email-every-minute' limit 1),
    active := false
  );
end $$;
