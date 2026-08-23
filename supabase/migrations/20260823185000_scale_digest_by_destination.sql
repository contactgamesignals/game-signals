begin;

create table if not exists private.daily_digest_destination_deliveries (
  destination_key text not null,
  period_date date not null,
  destination text not null,
  status text not null check (status in ('pending', 'processing', 'delivered', 'failed')),
  attempts integer not null default 0,
  provider_message_id text,
  error text,
  delivered_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (destination_key, period_date)
);

revoke all on table private.daily_digest_destination_deliveries from public, anon, authenticated;

create index if not exists daily_digest_destination_queue_idx
  on private.daily_digest_destination_deliveries (period_date, status, updated_at);

create or replace function public.prepare_email_digest_period(p_period_date date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer;
begin
  insert into private.daily_digest_destination_deliveries(
    destination_key,
    period_date,
    destination,
    status,
    attempts,
    updated_at
  )
  select
    encode(extensions.digest(lower(trim(c.destination)), 'sha256'), 'hex'),
    p_period_date,
    lower(trim(c.destination)),
    'pending',
    0,
    now()
  from public.notification_channels c
  join public.subscriptions s on s.workspace_id = c.workspace_id
  where c.type::text = 'email'
    and c.enabled
    and trim(c.destination) <> ''
    and s.status::text in ('active', 'trialing')
    and s.plan::text <> 'free'
  group by lower(trim(c.destination))
  on conflict (destination_key, period_date) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke all on function public.prepare_email_digest_period(date) from public, anon, authenticated;
grant execute on function public.prepare_email_digest_period(date) to service_role;

create or replace function public.claim_email_digest_destinations(
  p_period_date date,
  p_limit integer default 25
)
returns table(
  destination_key text,
  destination text,
  attempts integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with candidates as (
    select d.destination_key
    from private.daily_digest_destination_deliveries d
    where d.period_date = p_period_date
      and (
        d.status in ('pending', 'failed')
        or (d.status = 'processing' and d.updated_at < now() - interval '10 minutes')
      )
      and d.attempts < 5
    order by d.updated_at, d.destination_key
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 25), 100))
  )
  update private.daily_digest_destination_deliveries d
  set status = 'processing',
      attempts = d.attempts + 1,
      error = null,
      updated_at = now()
  from candidates c
  where d.destination_key = c.destination_key
    and d.period_date = p_period_date
  returning d.destination_key, d.destination, d.attempts;
end;
$$;

revoke all on function public.claim_email_digest_destinations(date, integer) from public, anon, authenticated;
grant execute on function public.claim_email_digest_destinations(date, integer) to service_role;

create or replace function public.email_digest_channels_for_destination(p_destination text)
returns table(
  notification_channel_id uuid,
  workspace_id uuid,
  destination text,
  minimum_live_viewers integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    c.workspace_id,
    c.destination,
    c.minimum_live_viewers
  from public.notification_channels c
  join public.subscriptions s on s.workspace_id = c.workspace_id
  where c.type::text = 'email'
    and c.enabled
    and lower(trim(c.destination)) = lower(trim(p_destination))
    and s.status::text in ('active', 'trialing')
    and s.plan::text <> 'free'
  order by c.workspace_id;
$$;

revoke all on function public.email_digest_channels_for_destination(text) from public, anon, authenticated;
grant execute on function public.email_digest_channels_for_destination(text) to service_role;

create or replace function public.complete_email_digest_destination(
  p_destination_key text,
  p_period_date date,
  p_success boolean,
  p_provider_message_id text default null,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.daily_digest_destination_deliveries
  set status = case when p_success then 'delivered' else 'failed' end,
      provider_message_id = case when p_success then p_provider_message_id else provider_message_id end,
      error = case when p_success then null else left(coalesce(p_error, 'Digest delivery failed.'), 1000) end,
      delivered_at = case when p_success then now() else null end,
      updated_at = now()
  where destination_key = p_destination_key
    and period_date = p_period_date;
end;
$$;

revoke all on function public.complete_email_digest_destination(text, date, boolean, text, text) from public, anon, authenticated;
grant execute on function public.complete_email_digest_destination(text, date, boolean, text, text) to service_role;

create or replace function private.cleanup_monitoring_internal_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.scan_runs
  where started_at < now() - interval '14 days';

  delete from public.delivered_notifications
  where status in ('delivered', 'skipped')
    and coalesce(delivered_at, created_at) < now() - interval '30 days';

  delete from private.api_quota_usage
  where period_start < now() - interval '7 days';

  delete from private.daily_digest_deliveries
  where period_date < current_date - 180;

  delete from private.daily_digest_destination_deliveries
  where period_date < current_date - 180;
end;
$$;

revoke all on function private.cleanup_monitoring_internal_data() from public, anon, authenticated;

commit;
