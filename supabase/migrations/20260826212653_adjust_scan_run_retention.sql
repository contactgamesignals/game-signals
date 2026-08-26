-- Reduce technical scan log storage without changing monitoring behavior.
-- Successful scans are retained for 48 hours, failed scans for 5 days.
-- Rare queued/running rows keep the previous 7-day retention as a conservative fallback.

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

  perform private.refresh_monitoring_storage_state();
end;
$$;

revoke all on function private.cleanup_monitoring_internal_data() from public, anon, authenticated;
grant execute on function private.cleanup_monitoring_internal_data() to service_role;
