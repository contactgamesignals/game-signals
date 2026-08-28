-- Keep promotional Indie trials on the normal paid YouTube cadence even while
-- the scan worker still reads billing subscriptions for its cadence label.
create or replace function private.enforce_trial_youtube_cadence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.youtube_last_scanned_at is distinct from old.youtube_last_scanned_at
     and new.youtube_next_scan_at is not null
     and new.youtube_next_scan_at > now() + interval '35 minutes'
     and private.active_trial_end(new.workspace_id) is not null then
    new.youtube_next_scan_at := now() + interval '30 minutes';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_trial_youtube_cadence() from public, anon, authenticated, service_role;

drop trigger if exists enforce_trial_youtube_cadence on public.games;
create trigger enforce_trial_youtube_cadence
before update of youtube_last_scanned_at, youtube_next_scan_at on public.games
for each row
execute function private.enforce_trial_youtube_cadence();

-- Claims already stop immediately at trial expiry because they use
-- private.effective_product_plan(). This small cleanup job also flips stale enabled
-- game rows to paused shortly after access ends, closing the direct/manual-scan gap.
do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid from cron.job where jobname = 'gamesignal-trial-expiry-every-five-minutes'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'gamesignal-trial-expiry-every-five-minutes',
    '*/5 * * * *',
    'select private.pause_games_without_product_access();'
  );
end;
$$;
