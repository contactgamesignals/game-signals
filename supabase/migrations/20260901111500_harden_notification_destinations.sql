-- Notification destinations contain Discord webhook URLs or recipient email addresses.
-- Keep row-level metadata visible under the existing workspace RLS policies, but do
-- not let browser clients select the secret destination column directly.
revoke select on table public.notification_channels from public, anon, authenticated;

grant select (
  id,
  workspace_id,
  type,
  enabled,
  minimum_signal_score,
  minimum_live_viewers,
  created_at,
  updated_at
) on public.notification_channels to anon, authenticated;

-- Background delivery and management Edge Functions continue to use service_role.
grant select on table public.notification_channels to service_role;
