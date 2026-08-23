begin;

-- Keep the existing authenticated HTTP commands and only change cadence.
do $$
declare
  v_youtube_command text;
  v_email_command text;
begin
  select command into v_youtube_command
  from cron.job
  where jobname = 'gamesignal-youtube-every-15-minutes'
  limit 1;

  if v_youtube_command is null then
    select command into v_youtube_command
    from cron.job
    where jobname = 'gamesignal-youtube-every-minute'
    limit 1;
  end if;

  if v_youtube_command is null then
    raise exception 'Existing YouTube cron command was not found.';
  end if;

  perform cron.unschedule(jobid)
  from cron.job
  where jobname in ('gamesignal-youtube-every-15-minutes', 'gamesignal-youtube-every-minute');

  perform cron.schedule(
    'gamesignal-youtube-every-minute',
    '* * * * *',
    v_youtube_command
  );

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

  -- The worker itself refuses to send before 06:00 UTC. Running each minute
  -- from 06:00 through 11:59 lets 25-recipient batches drain quickly while
  -- keeping the rest of the day free of no-op invocations.
  perform cron.schedule(
    'gamesignal-email-every-minute',
    '* 6-11 * * *',
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
