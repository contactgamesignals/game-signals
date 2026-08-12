do $$
begin
  if exists (select 1 from cron.job where jobname = 'gamesignal-email-every-minute') then
    perform cron.alter_job(
      (select jobid from cron.job where jobname = 'gamesignal-email-every-minute' limit 1),
      active := false
    );
  end if;
end $$;

update public.notification_channels
set enabled = false, updated_at = now()
where type = 'email' and enabled = true;
