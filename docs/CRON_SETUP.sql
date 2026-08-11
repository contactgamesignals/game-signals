-- Production provisioning for GameSignal cron authentication and schedules.
-- The cron secret is generated inside Postgres and stored in Supabase Vault.
-- Its plaintext is never written to source control.

create extension if not exists pgcrypto;
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Create or reuse the internal cron secret, then store only its SHA-256
-- in the service-role-only runtime settings table.
do $$
declare
  secret_value text;
  secret_hash text;
begin
  select decrypted_secret
    into secret_value
  from vault.decrypted_secrets
  where name = 'gamesignal_cron_secret'
  limit 1;

  if secret_value is null then
    secret_value := encode(gen_random_bytes(48), 'hex');
    perform vault.create_secret(
      secret_value,
      'gamesignal_cron_secret',
      'GameSignal internal cron authentication'
    );
  end if;

  secret_hash := encode(digest(secret_value, 'sha256'), 'hex');

  insert into public.internal_settings (key, value)
  values ('cron_secret_sha256', secret_hash)
  on conflict (key) do update
    set value = excluded.value,
        updated_at = now();
end $$;

-- Recreate the Discord delivery job idempotently.
do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'gamesignal-discord-every-minute'
  limit 1;

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
end $$;

select cron.schedule(
  'gamesignal-discord-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://mgaufxduaaobrlyzdrdo.supabase.co/functions/v1/notify-discord',
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

-- Enable these only after the corresponding external API credentials exist.
-- Twitch recommended starting cadence: every 3 minutes.
-- YouTube recommended starting cadence: every 15 minutes; the worker itself
-- selects only due games and defaults to one game per run to conserve quota.
