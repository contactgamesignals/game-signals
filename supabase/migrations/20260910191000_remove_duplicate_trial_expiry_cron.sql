-- The five-minute trial-expiry job is the current lifecycle cleanup schedule.
-- Remove only the older 15-minute duplicate so the same idempotent cleanup is not run twice.
do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'gamesignal-trial-expiry-every-15-minutes'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end;
$$;
