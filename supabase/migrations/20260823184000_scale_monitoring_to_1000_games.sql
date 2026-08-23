begin;

-- Keep workspace ownership directly on mentions so dashboard, Realtime, notification
-- and digest queries do not need to authorize every row through a games join.
alter table public.mentions
  add column if not exists workspace_id uuid;

update public.mentions m
set workspace_id = g.workspace_id
from public.games g
where g.id = m.game_id
  and m.workspace_id is distinct from g.workspace_id;

alter table public.mentions
  alter column workspace_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.mentions'::regclass
      and conname = 'mentions_workspace_id_fkey'
  ) then
    alter table public.mentions
      add constraint mentions_workspace_id_fkey
      foreign key (workspace_id) references public.workspaces(id) on delete cascade;
  end if;
end
$$;

create index if not exists mentions_workspace_platform_detected_idx
  on public.mentions (workspace_id, platform, detected_at desc);

create index if not exists mentions_workspace_twitch_last_seen_idx
  on public.mentions (workspace_id, last_seen_at desc)
  where platform = 'twitch'::public.mention_platform;

create or replace function private.set_mention_workspace_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
begin
  select g.workspace_id
    into v_workspace_id
  from public.games g
  where g.id = new.game_id;

  if v_workspace_id is null then
    raise exception 'Mention game does not exist.' using errcode = '23503';
  end if;

  new.workspace_id := v_workspace_id;
  return new;
end;
$$;

revoke all on function private.set_mention_workspace_id() from public, anon, authenticated;

 drop trigger if exists mentions_set_workspace_before_insert on public.mentions;
create trigger mentions_set_workspace_before_insert
before insert on public.mentions
for each row execute function private.set_mention_workspace_id();

 drop trigger if exists mentions_set_workspace_before_game_change on public.mentions;
create trigger mentions_set_workspace_before_game_change
before update of game_id, workspace_id on public.mentions
for each row execute function private.set_mention_workspace_id();

 drop policy if exists mentions_select_member on public.mentions;
create policy mentions_select_member
on public.mentions
for select
to authenticated
using (private.is_workspace_member(workspace_id));

-- Per-platform leases prevent overlapping cron invocations from scanning the same game.
-- YouTube continuation state freezes a search window while page tokens are consumed.
alter table public.games
  add column if not exists youtube_claimed_until timestamptz,
  add column if not exists twitch_claimed_until timestamptz,
  add column if not exists youtube_scan_window_start timestamptz,
  add column if not exists youtube_scan_window_end timestamptz,
  add column if not exists youtube_scan_page_token text,
  add column if not exists youtube_scan_pages_completed integer not null default 0,
  add column if not exists youtube_last_revalidated_at timestamptz,
  add column if not exists twitch_category_ids text[] not null default '{}'::text[],
  add column if not exists twitch_category_names text[] not null default '{}'::text[],
  add column if not exists twitch_category_checked_at timestamptz;

create index if not exists games_youtube_due_claim_idx
  on public.games (youtube_next_scan_at, youtube_claimed_until)
  where enabled;

create index if not exists games_twitch_due_claim_idx
  on public.games (twitch_next_scan_at, twitch_claimed_until)
  where enabled;

create or replace function public.claim_due_youtube_games(
  p_limit integer default 80,
  p_lease_seconds integer default 120
)
returns setof public.games
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with candidates as (
    select g.id
    from public.games g
    join public.subscriptions s on s.workspace_id = g.workspace_id
    where g.enabled
      and s.status::text in ('active', 'trialing')
      and s.plan::text <> 'free'
      and (g.youtube_scan_page_token is not null or g.youtube_next_scan_at <= now())
      and (g.youtube_claimed_until is null or g.youtube_claimed_until < now())
    order by (g.youtube_scan_page_token is not null) desc, g.youtube_next_scan_at, g.id
    for update of g skip locked
    limit greatest(1, least(coalesce(p_limit, 80), 200))
  )
  update public.games g
  set youtube_claimed_until = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 120), 300)))
  from candidates c
  where g.id = c.id
  returning g.*;
end;
$$;

revoke all on function public.claim_due_youtube_games(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_due_youtube_games(integer, integer) to service_role;

create or replace function public.claim_due_twitch_games(
  p_limit integer default 120,
  p_lease_seconds integer default 120
)
returns setof public.games
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with candidates as (
    select g.id
    from public.games g
    join public.subscriptions s on s.workspace_id = g.workspace_id
    where g.enabled
      and s.status::text in ('active', 'trialing')
      and s.plan::text <> 'free'
      and g.twitch_next_scan_at <= now()
      and (g.twitch_claimed_until is null or g.twitch_claimed_until < now())
    order by g.twitch_next_scan_at, g.id
    for update of g skip locked
    limit greatest(1, least(coalesce(p_limit, 120), 250))
  )
  update public.games g
  set twitch_claimed_until = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 120), 300)))
  from candidates c
  where g.id = c.id
  returning g.*;
end;
$$;

revoke all on function public.claim_due_twitch_games(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_due_twitch_games(integer, integer) to service_role;

-- Quota reservations pace YouTube calls across the whole UTC day instead of
-- burning the daily allowance immediately when a backlog exists.
create table if not exists private.api_quota_usage (
  bucket text not null,
  period_start timestamptz not null,
  used integer not null default 0 check (used >= 0),
  updated_at timestamptz not null default now(),
  primary key (bucket, period_start)
);

revoke all on table private.api_quota_usage from public, anon, authenticated;

insert into public.internal_settings(key, value)
values
  ('youtube_search_daily_budget', '100'),
  ('youtube_search_peak_per_minute', '4'),
  ('youtube_general_daily_budget', '10000'),
  ('youtube_general_peak_per_minute', '120')
on conflict (key) do nothing;

insert into private.api_quota_usage(bucket, period_start, used)
select
  'youtube_search:day',
  date_trunc('day', now()),
  count(*)::integer
from public.scan_runs
where platform::text = 'youtube'
  and started_at >= date_trunc('day', now())
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
  v_day_start timestamptz := date_trunc('day', now());
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

-- Durable Discord queue: a mention is queued once at INSERT time. The worker
-- claims pending rows with SKIP LOCKED, so a burst can be delayed but not lost
-- because it fell outside a "latest 500" window.
alter table public.delivered_notifications
  add column if not exists available_at timestamptz not null default now(),
  add column if not exists claimed_at timestamptz,
  add column if not exists created_at timestamptz not null default now();

update public.delivered_notifications d
set created_at = coalesce(d.delivered_at, m.detected_at, d.created_at)
from public.mentions m
where m.id = d.mention_id;

alter table public.delivered_notifications
  drop constraint if exists delivered_notifications_status_check;

alter table public.delivered_notifications
  add constraint delivered_notifications_status_check
  check (status = any (array['pending'::text, 'processing'::text, 'delivered'::text, 'failed'::text, 'skipped'::text]));

create index if not exists delivered_notifications_queue_idx
  on public.delivered_notifications (available_at, created_at)
  where status in ('pending', 'failed', 'processing');

create or replace function private.enqueue_discord_delivery()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.platform::text not in ('youtube', 'twitch') then
    return new;
  end if;

  insert into public.delivered_notifications(
    mention_id,
    notification_channel_id,
    status,
    attempts,
    available_at,
    created_at
  )
  select
    new.id,
    c.id,
    'pending',
    0,
    now(),
    now()
  from public.notification_channels c
  join public.subscriptions s on s.workspace_id = c.workspace_id
  where c.workspace_id = new.workspace_id
    and c.type::text = 'discord'
    and c.enabled
    and s.status::text in ('active', 'trialing')
    and s.plan::text <> 'free'
    and (
      new.platform::text = 'youtube'
      or coalesce(new.viewer_count, 0) >= c.minimum_live_viewers
    )
  on conflict (mention_id, notification_channel_id) do nothing;

  return new;
end;
$$;

revoke all on function private.enqueue_discord_delivery() from public, anon, authenticated;

 drop trigger if exists mentions_enqueue_discord_after_insert on public.mentions;
create trigger mentions_enqueue_discord_after_insert
after insert on public.mentions
for each row execute function private.enqueue_discord_delivery();

-- Backfill only recent undelivered alerts so the migration cannot create an
-- unbounded historical notification storm.
insert into public.delivered_notifications(
  mention_id,
  notification_channel_id,
  status,
  attempts,
  available_at,
  created_at
)
select
  m.id,
  c.id,
  'pending',
  0,
  now(),
  m.detected_at
from public.mentions m
join public.notification_channels c
  on c.workspace_id = m.workspace_id
join public.subscriptions s
  on s.workspace_id = m.workspace_id
where m.detected_at >= now() - interval '24 hours'
  and m.platform::text in ('youtube', 'twitch')
  and c.type::text = 'discord'
  and c.enabled
  and s.status::text in ('active', 'trialing')
  and s.plan::text <> 'free'
  and (m.platform::text = 'youtube' or coalesce(m.viewer_count, 0) >= c.minimum_live_viewers)
on conflict (mention_id, notification_channel_id) do nothing;

create or replace function public.claim_discord_deliveries(
  p_limit integer default 250,
  p_lease_seconds integer default 120
)
returns table(
  mention_id uuid,
  notification_channel_id uuid,
  destination text,
  platform text,
  creator_name text,
  content_title text,
  content_url text,
  thumbnail_url text,
  viewer_count integer,
  view_count bigint,
  detected_at timestamptz,
  game_title text,
  workspace_id uuid,
  attempts integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A threshold may have been raised after a job was queued. Skip it instead
  -- of letting it sit forever or sending an alert the user no longer wants.
  update public.delivered_notifications d
  set status = 'skipped',
      claimed_at = null,
      error = 'Skipped because the current live-viewer threshold is higher.'
  from public.mentions m, public.notification_channels c
  where d.mention_id = m.id
    and d.notification_channel_id = c.id
    and d.status in ('pending', 'failed')
    and c.type::text = 'discord'
    and m.platform::text = 'twitch'
    and coalesce(m.viewer_count, 0) < c.minimum_live_viewers;

  return query
  with candidates as (
    select d.mention_id, d.notification_channel_id
    from public.delivered_notifications d
    join public.mentions m on m.id = d.mention_id
    join public.notification_channels c on c.id = d.notification_channel_id
    join public.subscriptions s on s.workspace_id = c.workspace_id
    where c.type::text = 'discord'
      and c.enabled
      and s.status::text in ('active', 'trialing')
      and s.plan::text <> 'free'
      and d.attempts < 5
      and d.available_at <= now()
      and (
        d.status in ('pending', 'failed')
        or (d.status = 'processing' and d.claimed_at < now() - interval '5 minutes')
      )
    order by d.created_at, d.mention_id
    for update of d skip locked
    limit greatest(1, least(coalesce(p_limit, 250), 1000))
  ), claimed as (
    update public.delivered_notifications d
    set status = 'processing',
        claimed_at = now(),
        attempts = d.attempts + 1
    from candidates c
    where d.mention_id = c.mention_id
      and d.notification_channel_id = c.notification_channel_id
    returning d.mention_id, d.notification_channel_id, d.attempts
  )
  select
    cl.mention_id,
    cl.notification_channel_id,
    nc.destination,
    m.platform::text,
    m.creator_name,
    m.title,
    m.url,
    m.thumbnail_url,
    m.viewer_count,
    m.view_count,
    m.detected_at,
    g.title,
    m.workspace_id,
    cl.attempts
  from claimed cl
  join public.mentions m on m.id = cl.mention_id
  join public.games g on g.id = m.game_id
  join public.notification_channels nc on nc.id = cl.notification_channel_id
  order by m.detected_at;
end;
$$;

revoke all on function public.claim_discord_deliveries(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_discord_deliveries(integer, integer) to service_role;

create or replace function public.complete_discord_delivery(
  p_mention_id uuid,
  p_notification_channel_id uuid,
  p_success boolean,
  p_error text default null,
  p_retry_after_seconds integer default 60
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.delivered_notifications
  set status = case when p_success then 'delivered' else 'failed' end,
      delivered_at = case when p_success then now() else null end,
      claimed_at = null,
      available_at = case
        when p_success then available_at
        else now() + make_interval(secs => greatest(5, least(coalesce(p_retry_after_seconds, 60), 3600)))
      end,
      error = case when p_success then null else left(coalesce(p_error, 'Delivery failed.'), 1000) end
  where mention_id = p_mention_id
    and notification_channel_id = p_notification_channel_id;
end;
$$;

revoke all on function public.complete_discord_delivery(uuid, uuid, boolean, text, integer) from public, anon, authenticated;
grant execute on function public.complete_discord_delivery(uuid, uuid, boolean, text, integer) to service_role;

-- Daily digests are aggregated in SQL per workspace. We persist one delivery
-- marker per email channel/day instead of one marker for every mention.
create table if not exists private.daily_digest_deliveries (
  notification_channel_id uuid not null references public.notification_channels(id) on delete cascade,
  period_date date not null,
  status text not null check (status in ('delivered', 'failed')),
  destination_hash text,
  provider_message_id text,
  error text,
  attempts integer not null default 0,
  delivered_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (notification_channel_id, period_date)
);

revoke all on table private.daily_digest_deliveries from public, anon, authenticated;

create or replace function public.email_digest_delivered_channels(
  p_channel_ids uuid[],
  p_period_date date
)
returns table(notification_channel_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select d.notification_channel_id
  from private.daily_digest_deliveries d
  where d.period_date = p_period_date
    and d.status = 'delivered'
    and d.notification_channel_id = any(coalesce(p_channel_ids, '{}'::uuid[]));
$$;

revoke all on function public.email_digest_delivered_channels(uuid[], date) from public, anon, authenticated;
grant execute on function public.email_digest_delivered_channels(uuid[], date) to service_role;

create or replace function public.mark_email_digest_delivery(
  p_channel_ids uuid[],
  p_period_date date,
  p_success boolean,
  p_destination_hash text default null,
  p_provider_message_id text default null,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.daily_digest_deliveries(
    notification_channel_id,
    period_date,
    status,
    destination_hash,
    provider_message_id,
    error,
    attempts,
    delivered_at,
    updated_at
  )
  select
    channel_id,
    p_period_date,
    case when p_success then 'delivered' else 'failed' end,
    p_destination_hash,
    p_provider_message_id,
    case when p_success then null else left(coalesce(p_error, 'Digest delivery failed.'), 1000) end,
    1,
    case when p_success then now() else null end,
    now()
  from unnest(coalesce(p_channel_ids, '{}'::uuid[])) channel_id
  on conflict (notification_channel_id, period_date) do update
  set status = excluded.status,
      destination_hash = excluded.destination_hash,
      provider_message_id = excluded.provider_message_id,
      error = excluded.error,
      attempts = private.daily_digest_deliveries.attempts + 1,
      delivered_at = excluded.delivered_at,
      updated_at = now();
end;
$$;

revoke all on function public.mark_email_digest_delivery(uuid[], date, boolean, text, text, text) from public, anon, authenticated;
grant execute on function public.mark_email_digest_delivery(uuid[], date, boolean, text, text, text) to service_role;

create or replace function public.email_digest_workspace_summary(
  p_workspace_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_minimum_live_viewers integer default 0
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with base as (
    select
      m.id,
      m.platform::text as platform,
      m.creator_name,
      m.title,
      m.url,
      m.viewer_count,
      m.view_count,
      m.detected_at,
      g.title as game_title,
      coalesce(m.view_count, m.viewer_count::bigint, 0::bigint) as reach
    from public.mentions m
    join public.games g on g.id = m.game_id
    where m.workspace_id = p_workspace_id
      and m.detected_at >= p_period_start
      and m.detected_at < p_period_end
      and m.platform::text in ('youtube', 'twitch')
      and (
        m.platform::text = 'youtube'
        or coalesce(m.viewer_count, 0) >= greatest(0, coalesce(p_minimum_live_viewers, 0))
      )
  ),
  totals as (
    select
      count(*)::bigint as total,
      count(*) filter (where platform = 'youtube')::bigint as youtube,
      count(*) filter (where platform = 'twitch')::bigint as twitch
    from base
  ),
  game_counts as (
    select
      game_title,
      count(*)::bigint as total,
      count(*) filter (where platform = 'youtube')::bigint as youtube,
      count(*) filter (where platform = 'twitch')::bigint as twitch
    from base
    group by game_title
    order by total desc, game_title
    limit 12
  ),
  creator_counts as (
    select
      max(creator_name) as creator_name,
      count(*)::bigint as total
    from base
    group by lower(creator_name)
    order by total desc, max(creator_name)
    limit 8
  ),
  top_signals as (
    select id, platform, creator_name, title, url, game_title, reach, detected_at
    from base
    order by reach desc, detected_at desc
    limit 12
  )
  select jsonb_build_object(
    'total', totals.total,
    'youtube', totals.youtube,
    'twitch', totals.twitch,
    'games', coalesce((
      select jsonb_agg(jsonb_build_object(
        'game_title', gc.game_title,
        'total', gc.total,
        'youtube', gc.youtube,
        'twitch', gc.twitch
      ) order by gc.total desc, gc.game_title)
      from game_counts gc
    ), '[]'::jsonb),
    'creators', coalesce((
      select jsonb_agg(jsonb_build_object(
        'creator_name', cc.creator_name,
        'total', cc.total
      ) order by cc.total desc, cc.creator_name)
      from creator_counts cc
    ), '[]'::jsonb),
    'signals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ts.id,
        'platform', ts.platform,
        'creator_name', ts.creator_name,
        'title', ts.title,
        'url', ts.url,
        'game_title', ts.game_title,
        'reach', ts.reach,
        'detected_at', ts.detected_at
      ) order by ts.reach desc, ts.detected_at desc)
      from top_signals ts
    ), '[]'::jsonb)
  )
  from totals;
$$;

revoke all on function public.email_digest_workspace_summary(uuid, timestamptz, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.email_digest_workspace_summary(uuid, timestamptz, timestamptz, integer) to service_role;

-- Faster dashboard stats with direct workspace filtering. This preserves the
-- current all-time semantics without the previous games join.
create or replace function public.dashboard_signal_stats(p_workspace_id uuid)
returns table(
  signal_count bigint,
  live_now_count bigint,
  creator_count bigint,
  total_reach numeric
)
language sql
stable
set search_path = ''
as $$
  select
    count(*)::bigint as signal_count,
    count(*) filter (
      where m.platform::text = 'twitch'
        and m.last_seen_at >= now() - interval '6 minutes'
    )::bigint as live_now_count,
    count(distinct lower(m.creator_name))::bigint as creator_count,
    coalesce(sum(coalesce(m.view_count, m.viewer_count::bigint, 0::bigint)), 0)::numeric as total_reach
  from public.mentions m
  where m.workspace_id = p_workspace_id;
$$;

-- Internal diagnostics must not grow forever at 1000-game cadence.
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
end;
$$;

revoke all on function private.cleanup_monitoring_internal_data() from public, anon, authenticated;

commit;
