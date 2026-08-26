-- Bound pg_cron technical log growth without reducing monitoring coverage.
-- Keep successful runs for 7 days and failed runs for 30 days.

create or replace function private.cleanup_monitoring_internal_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.archive_compact_twitch_mentions();

  delete from public.scan_runs
  where
    (status = 'success'::public.scan_status and started_at < now() - interval '48 hours')
    or (status = 'failed'::public.scan_status and started_at < now() - interval '5 days')
    or (status in ('queued'::public.scan_status, 'running'::public.scan_status)
        and started_at < now() - interval '7 days');

  delete from public.delivered_notifications
  where status in ('delivered', 'skipped')
    and coalesce(delivered_at, created_at) < now() - interval '7 days';

  delete from public.youtube_detail_candidates
  where first_seen_at < now() - interval '30 days';

  delete from private.api_quota_usage
  where period_start < now() - interval '7 days';

  delete from private.daily_digest_deliveries
  where period_date < current_date - 180;

  if to_regclass('private.daily_digest_destination_deliveries') is not null then
    delete from private.daily_digest_destination_deliveries
    where period_date < current_date - 180;
  end if;

  delete from cron.job_run_details
  where status = 'succeeded'
    and end_time < now() - interval '7 days';

  delete from cron.job_run_details
  where status = 'failed'
    and end_time < now() - interval '30 days';

  perform private.refresh_monitoring_storage_state();
end;
$$;

revoke all on function private.cleanup_monitoring_internal_data() from public, anon, authenticated;
grant execute on function private.cleanup_monitoring_internal_data() to service_role;

-- Apply the same retention once now instead of waiting for the next daily cleanup.
delete from cron.job_run_details
where status = 'succeeded'
  and end_time < now() - interval '7 days';

delete from cron.job_run_details
where status = 'failed'
  and end_time < now() - interval '30 days';
