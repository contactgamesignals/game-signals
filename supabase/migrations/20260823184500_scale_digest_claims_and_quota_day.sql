begin;

-- YouTube daily quotas reset at midnight Pacific Time. Pace against the same
-- boundary so a UTC reset cannot spend tomorrow's quota several hours early.
insert into private.api_quota_usage(bucket, period_start, used)
select
  'youtube_search:day',
  date_trunc('day', now() at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles',
  count(*)::integer
from public.scan_runs
where platform::text = 'youtube'
  and started_at >= date_trunc('day', now() at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles'
on conflict (bucket, period_start) do update
set used = greatest(private.api_quota_usage.used, excluded.used),
    updated_at = now();

create or replace function public.reserve_monitoring_quota(
  p_bucket text,
  p_requested integer default 1
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_daily_key text;
  v_peak_key text;
  v_daily_default integer;
  v_peak_default integer;
  v_daily_limit integer;
  v_peak_limit integer;
  v_daily_value text;
  v_peak_value text;
  v_now timestamptz := now();
  v_day_start timestamptz := date_trunc('day', now() at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles';
  v_minute_start timestamptz := date_trunc('minute', now());
  v_day_used integer;
  v_minute_used integer;
  v_paced_cap integer;
  v_elapsed_seconds numeric;
  v_granted integer;
begin
  if p_bucket = 'youtube_search' then
    v_daily_key := 'youtube_search_daily_budget';
    v_peak_key := 'youtube_search_peak_per_minute';
    v_daily_default := 100;
    v_peak_default := 4;
  elsif p_bucket = 'youtube_general' then
    v_daily_key := 'youtube_general_daily_budget';
    v_peak_key := 'youtube_general_peak_per_minute';
    v_daily_default := 10000;
    v_peak_default := 120;
  else
    raise exception 'Unsupported monitoring quota bucket.' using errcode = '22023';
  end if;

  select value into v_daily_value from public.internal_settings where key = v_daily_key;
  select value into v_peak_value from public.internal_settings where key = v_peak_key;

  v_daily_limit := case
    when v_daily_value ~ '^[0-9]+$' then greatest(1, least(v_daily_value::integer, 1000000))
    else v_daily_default
  end;
  v_peak_limit := case
    when v_peak_value ~ '^[0-9]+$' then greatest(1, least(v_peak_value::integer, 10000))
    else v_peak_default
  end;

  insert into private.api_quota_usage(bucket, period_start, used)
  values (p_bucket || ':day', v_day_start, 0)
  on conflict do nothing;

  insert into private.api_quota_usage(bucket, period_start, used)
  values (p_bucket || ':minute', v_minute_start, 0)
  on conflict do nothing;

  select used into v_day_used
  from private.api_quota_usage
  where bucket = p_bucket || ':day' and period_start = v_day_start
  for update;

  select used into v_minute_used
  from private.api_quota_usage
  where bucket = p_bucket || ':minute' and period_start = v_minute_start
  for update;

  v_elapsed_seconds := least(86400::numeric, greatest(0::numeric, extract(epoch from (v_now - v_day_start)) + 60));
  v_paced_cap := least(
    v_daily_limit,
    ceil(v_daily_limit::numeric * v_elapsed_seconds / 86400::numeric)::integer
  );

  v_granted := greatest(
    0,
    least(
      greatest(0, coalesce(p_requested, 1)),
      greatest(0, v_daily_limit - v_day_used),
      greatest(0, v_paced_cap - v_day_used),
      greatest(0, v_peak_limit - v_minute_used)
    )
  );

  if v_granted > 0 then
    update private.api_quota_usage
    set used = used + v_granted, updated_at = now()
    where bucket = p_bucket || ':day' and period_start = v_day_start;

    update private.api_quota_usage
    set used = used + v_granted, updated_at = now()
    where bucket = p_bucket || ':minute' and period_start = v_minute_start;
  end if;

  return v_granted;
end;
$$;

revoke all on function public.reserve_monitoring_quota(text, integer) from public, anon, authenticated;
grant execute on function public.reserve_monitoring_quota(text, integer) to service_role;

-- Daily email work is leased in small batches. This lets one digest period serve
-- thousands of workspaces without requiring a single long-running Edge request.
alter table private.daily_digest_deliveries
  drop constraint if exists daily_digest_deliveries_status_check;

alter table private.daily_digest_deliveries
  add constraint daily_digest_deliveries_status_check
  check (status in ('processing', 'delivered', 'failed'));

create or replace function public.claim_email_digest_channels(
  p_period_date date,
  p_limit integer default 50
)
returns table(
  notification_channel_id uuid,
  workspace_id uuid,
  destination text,
  minimum_live_viewers integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with candidates as (
    select c.id
    from public.notification_channels c
    join public.subscriptions s on s.workspace_id = c.workspace_id
    left join private.daily_digest_deliveries d
      on d.notification_channel_id = c.id
     and d.period_date = p_period_date
    where c.type::text = 'email'
      and c.enabled
      and s.status::text in ('active', 'trialing')
      and s.plan::text <> 'free'
      and (
        d.notification_channel_id is null
        or d.status = 'failed'
        or (d.status = 'processing' and d.updated_at < now() - interval '10 minutes')
      )
    order by c.id
    for update of c skip locked
    limit greatest(1, least(coalesce(p_limit, 50), 250))
  ), claimed as (
    insert into private.daily_digest_deliveries(
      notification_channel_id,
      period_date,
      status,
      attempts,
      updated_at
    )
    select id, p_period_date, 'processing', 1, now()
    from candidates
    on conflict (notification_channel_id, period_date) do update
    set status = 'processing',
        attempts = private.daily_digest_deliveries.attempts + 1,
        error = null,
        updated_at = now()
    returning notification_channel_id
  )
  select
    c.id,
    c.workspace_id,
    c.destination,
    c.minimum_live_viewers
  from claimed cl
  join public.notification_channels c on c.id = cl.notification_channel_id
  order by c.id;
end;
$$;

revoke all on function public.claim_email_digest_channels(date, integer) from public, anon, authenticated;
grant execute on function public.claim_email_digest_channels(date, integer) to service_role;

commit;
