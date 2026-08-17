do $$
declare
  legacy_job_id bigint;
begin
  select jobid into legacy_job_id
  from cron.job
  where jobname = 'gamesignal-stripe-tax-id-every-5-minutes'
  limit 1;

  if legacy_job_id is not null then
    perform cron.alter_job(legacy_job_id, active := false);
  end if;
end;
$$;
