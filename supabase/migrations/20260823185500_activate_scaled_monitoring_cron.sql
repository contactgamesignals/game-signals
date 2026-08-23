begin;

-- The scaled workers and queues are safe to deploy before the external YouTube
-- Search Queries quota is raised. Keep the existing YouTube scheduler cadence
-- unchanged here so a future normal migration push cannot accidentally enable
-- the one-minute scheduler while production is still budgeted for 100/day.
--
-- Once Google explicitly approves enough Search Queries quota for the intended
-- portfolio size, enable the faster scheduler in a separate, reviewed rollout.
do $$
declare
  v_email_command text;
begin
  if not exists (
    select 1
    from cron.job
    where jobname in ('gamesignal-youtube-every-15-minutes', 'gamesignal-youtube-every-minute')
      and active
  ) then
    raise exception 'Existing active YouTube cron command was not found.';
  end if;

  select command into v_email_command
  from cron.job
  where jobname = 'gamesignal-email-every-minute'
  limit 1;

  if v_email_command is null then
    raise exception 'Existing email cron command was not found.';
  end if;

  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'gamesignal-email-every-minute';

  -- The digest worker is destination-queued and idempotent. Five-minute batches
  -- from 06:00 through 11:59 UTC can drain up to 1,800 recipients/day at the
  -- current 25-recipient claim size, while avoiding 360 no-op invocations/day.
  perform cron.schedule(
    'gamesignal-email-every-minute',
    '*/5 6-11 * * *',
    v_email_command
  );
end
$$;

select cron.unschedule(jobid)
from cron.job
where jobname = 'gamesignal-monitoring-cleanup-daily';

select cron.schedule(
  'gamesignal-monitoring-cleanup-daily',
  '30 5 * * *',
  $$select private.cleanup_monitoring_internal_data();$$
);

commit;
