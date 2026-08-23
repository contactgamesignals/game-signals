#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER="gamesignal-monitoring-scale-$RANDOM-$RANDOM"
TMP_DIR="$(mktemp -d)"
SQL="$TMP_DIR/monitoring-scale-test.sql"
trap 'docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; rm -rf "$TMP_DIR"' EXIT

docker run -d --rm \
  --name "$CONTAINER" \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=gamesignal_test \
  postgres:17-alpine >/dev/null

ready_streak=0
for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" pg_isready -U postgres -d gamesignal_test >/dev/null 2>&1; then
    ready_streak=$((ready_streak + 1))
    if [ "$ready_streak" -ge 3 ]; then
      break
    fi
  else
    ready_streak=0
  fi
  sleep 0.5
done

if [ "$ready_streak" -lt 3 ]; then
  echo "PostgreSQL did not become stably ready for the monitoring scale test." >&2
  docker logs "$CONTAINER" >&2 || true
  exit 2
fi

cat >"$SQL" <<'SQL'
\set ON_ERROR_STOP on

create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema extensions;
create schema private;
create extension pgcrypto with schema extensions;

create type public.subscription_plan as enum ('free', 'indie', 'studio', 'publisher', 'crazy');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'canceled', 'incomplete', 'blocked_tax');
create type public.mention_platform as enum ('youtube', 'twitch', 'kick');
create type public.notification_channel_type as enum ('email', 'discord');
create type public.scan_status as enum ('queued', 'running', 'success', 'failed');

create or replace function private.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
as $$ select true; $$;

create table public.workspaces (
  id uuid primary key,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscriptions (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  plan public.subscription_plan not null default 'free',
  status public.subscription_status not null default 'trialing',
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.games (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  steam_url text,
  twitch_game_id text,
  kick_category_id text,
  enabled boolean not null default true,
  youtube_last_scanned_at timestamptz,
  twitch_last_scanned_at timestamptz,
  kick_last_scanned_at timestamptz,
  youtube_next_scan_at timestamptz not null default now(),
  twitch_next_scan_at timestamptz not null default now(),
  kick_next_scan_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, title)
);

create table public.mentions (
  id uuid primary key default extensions.gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  platform public.mention_platform not null,
  external_id text not null,
  creator_external_id text,
  creator_name text not null,
  title text not null,
  url text not null,
  thumbnail_url text,
  viewer_count integer,
  view_count bigint,
  language text,
  published_at timestamptz,
  detected_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  signal_score integer not null default 0,
  raw_payload jsonb,
  unique(game_id, platform, external_id)
);

alter table public.mentions enable row level security;
create policy mentions_select_member
on public.mentions
for select
to authenticated
using (private.is_workspace_member((select workspace_id from public.games where id = game_id)));

create table public.notification_channels (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  type public.notification_channel_type not null,
  destination text not null,
  enabled boolean not null default true,
  minimum_signal_score integer not null default 0,
  minimum_live_viewers integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, type)
);

create table public.delivered_notifications (
  mention_id uuid not null references public.mentions(id) on delete cascade,
  notification_channel_id uuid not null references public.notification_channels(id) on delete cascade,
  delivered_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'delivered', 'failed')),
  error text,
  attempts integer not null default 0,
  primary key(mention_id, notification_channel_id)
);

create table public.scan_runs (
  id uuid primary key default extensions.gen_random_uuid(),
  game_id uuid references public.games(id) on delete cascade,
  platform public.mention_platform not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status public.scan_status not null default 'running',
  results_count integer not null default 0,
  error text,
  metadata jsonb
);

create table public.internal_settings (
  key text primary key,
  value text not null
);

insert into public.workspaces(id, name) values
  ('00000000-0000-0000-0000-000000000101', 'Paid one'),
  ('00000000-0000-0000-0000-000000000102', 'Paid two'),
  ('00000000-0000-0000-0000-000000000103', 'Free');

insert into public.subscriptions(workspace_id, plan, status) values
  ('00000000-0000-0000-0000-000000000101', 'studio', 'active'),
  ('00000000-0000-0000-0000-000000000102', 'publisher', 'trialing'),
  ('00000000-0000-0000-0000-000000000103', 'free', 'trialing');

insert into public.games(
  id, workspace_id, title, enabled, youtube_next_scan_at, twitch_next_scan_at
) values
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000101', 'Base paid game', true, now() + interval '1 day', now() + interval '1 day'),
  ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000102', 'Second paid game', true, now() + interval '1 day', now() + interval '1 day'),
  ('00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000103', 'Base free game', true, now() + interval '1 day', now() + interval '1 day');

insert into public.notification_channels(
  id, workspace_id, type, destination, enabled, minimum_live_viewers
) values
  ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000101', 'discord', 'https://discord.com/api/webhooks/test/one', true, 10),
  ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000101', 'email', 'Scale@Test.Example', true, 10),
  ('00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000102', 'email', 'scale@test.example', true, 0);

insert into public.mentions(
  id, game_id, platform, external_id, creator_name, title, url, detected_at, last_seen_at
) values (
  '00000000-0000-0000-0000-000000000501',
  '00000000-0000-0000-0000-000000000201',
  'youtube',
  'pre-migration-video',
  'PreMigrationCreator',
  'Pre migration coverage',
  'https://www.youtube.com/watch?v=pre-migration-video',
  now() - interval '2 hours',
  now() - interval '2 hours'
);
SQL

cat "$ROOT_DIR/supabase/migrations/20260823184000_scale_monitoring_to_1000_games.sql" >>"$SQL"
cat "$ROOT_DIR/supabase/migrations/20260823184500_scale_digest_claims_and_quota_day.sql" >>"$SQL"
cat "$ROOT_DIR/supabase/migrations/20260823185000_scale_digest_by_destination.sql" >>"$SQL"

cat >>"$SQL" <<'SQL'

-- Existing mentions must be backfilled with direct workspace ownership.
do $$
begin
  if (select workspace_id from public.mentions where id = '00000000-0000-0000-0000-000000000501')
     <> '00000000-0000-0000-0000-000000000101'::uuid then
    raise exception 'Mention workspace backfill failed.';
  end if;
end;
$$;

-- A recent pre-migration mention must be added to the durable Discord queue.
do $$
begin
  if not exists (
    select 1 from public.delivered_notifications
    where mention_id = '00000000-0000-0000-0000-000000000501'
      and notification_channel_id = '00000000-0000-0000-0000-000000000301'
      and status = 'pending'
  ) then
    raise exception 'Discord backfill queue failed.';
  end if;
end;
$$;

-- Build a real 1000-game due backlog plus free games that must never be claimed.
insert into public.games(workspace_id, title, enabled, youtube_next_scan_at, twitch_next_scan_at)
select
  '00000000-0000-0000-0000-000000000101',
  'Scale Paid Game ' || gs,
  true,
  now() - interval '1 hour',
  now() - interval '1 hour'
from generate_series(1, 1000) gs;

insert into public.games(workspace_id, title, enabled, youtube_next_scan_at, twitch_next_scan_at)
select
  '00000000-0000-0000-0000-000000000103',
  'Scale Free Game ' || gs,
  true,
  now() - interval '1 hour',
  now() - interval '1 hour'
from generate_series(1, 50) gs;

create temporary table youtube_claim_one as
select id, workspace_id from public.claim_due_youtube_games(80, 120);
create temporary table youtube_claim_two as
select id, workspace_id from public.claim_due_youtube_games(80, 120);

create temporary table twitch_claim_one as
select id, workspace_id from public.claim_due_twitch_games(120, 120);
create temporary table twitch_claim_two as
select id, workspace_id from public.claim_due_twitch_games(120, 120);

do $$
begin
  if (select count(*) from youtube_claim_one) <> 80 then raise exception 'First YouTube claim did not return 80 games.'; end if;
  if (select count(*) from youtube_claim_two) <> 80 then raise exception 'Second YouTube claim did not return 80 games.'; end if;
  if exists (select 1 from youtube_claim_one a join youtube_claim_two b using(id)) then raise exception 'YouTube leases claimed the same game twice.'; end if;
  if exists (select 1 from youtube_claim_one where workspace_id = '00000000-0000-0000-0000-000000000103') then raise exception 'Free game entered YouTube worker queue.'; end if;
  if exists (select 1 from youtube_claim_two where workspace_id = '00000000-0000-0000-0000-000000000103') then raise exception 'Free game entered second YouTube worker queue.'; end if;

  if (select count(*) from twitch_claim_one) <> 120 then raise exception 'First Twitch claim did not return 120 games.'; end if;
  if (select count(*) from twitch_claim_two) <> 120 then raise exception 'Second Twitch claim did not return 120 games.'; end if;
  if exists (select 1 from twitch_claim_one a join twitch_claim_two b using(id)) then raise exception 'Twitch leases claimed the same game twice.'; end if;
  if exists (select 1 from twitch_claim_one where workspace_id = '00000000-0000-0000-0000-000000000103') then raise exception 'Free game entered Twitch worker queue.'; end if;
end;
$$;

-- Worker RPCs must remain service-role only.
do $$
begin
  if has_function_privilege('authenticated', 'public.claim_due_youtube_games(integer,integer)', 'EXECUTE') then raise exception 'Authenticated role can execute YouTube worker claim.'; end if;
  if has_function_privilege('anon', 'public.claim_due_twitch_games(integer,integer)', 'EXECUTE') then raise exception 'Anon role can execute Twitch worker claim.'; end if;
  if has_function_privilege('authenticated', 'public.reserve_monitoring_quota(text,integer)', 'EXECUTE') then raise exception 'Authenticated role can reserve monitoring quota.'; end if;
  if not has_function_privilege('service_role', 'public.claim_due_youtube_games(integer,integer)', 'EXECUTE') then raise exception 'Service role cannot execute YouTube claim.'; end if;
end;
$$;

-- Quota reservations must share a Pacific-day bucket and enforce the per-minute ceiling.
update public.internal_settings set value = '1000000' where key = 'youtube_search_daily_budget';
update public.internal_settings set value = '120' where key = 'youtube_search_peak_per_minute';
delete from private.api_quota_usage where bucket like 'youtube_search:%';

create temporary table quota_test(first_grant integer, second_grant integer);
insert into quota_test
select public.reserve_monitoring_quota('youtube_search', 200), public.reserve_monitoring_quota('youtube_search', 200);

do $$
declare
  expected_start timestamptz := date_trunc('day', now() at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles';
begin
  if (select first_grant from quota_test) <> 120 then raise exception 'Quota peak did not cap first grant at 120.'; end if;
  if (select second_grant from quota_test) <> 0 then raise exception 'Quota peak allowed a second same-minute grant.'; end if;
  if not exists (
    select 1 from private.api_quota_usage
    where bucket = 'youtube_search:day' and period_start = expected_start
  ) then
    raise exception 'YouTube daily quota does not use the Pacific reset boundary.';
  end if;
end;
$$;

-- Trigger ownership and durable Discord queue behavior.
insert into public.mentions(
  id, game_id, platform, external_id, creator_name, title, url, view_count, detected_at, last_seen_at
) values (
  '00000000-0000-0000-0000-000000000502',
  '00000000-0000-0000-0000-000000000201',
  'youtube',
  'new-youtube-video',
  'YouTubeCreator',
  'New YouTube coverage',
  'https://www.youtube.com/watch?v=new-youtube-video',
  500,
  now(),
  now()
);

insert into public.mentions(
  id, game_id, platform, external_id, creator_name, title, url, viewer_count, detected_at, last_seen_at
) values
  ('00000000-0000-0000-0000-000000000503', '00000000-0000-0000-0000-000000000201', 'twitch', 'low-live', 'LowLive', 'Low live', 'https://www.twitch.tv/low-live', 5, now(), now()),
  ('00000000-0000-0000-0000-000000000504', '00000000-0000-0000-0000-000000000201', 'twitch', 'high-live', 'HighLive', 'High live', 'https://www.twitch.tv/high-live', 50, now(), now());

insert into public.mentions(
  id, game_id, platform, external_id, creator_name, title, url, view_count, detected_at, last_seen_at
) values (
  '00000000-0000-0000-0000-000000000505',
  '00000000-0000-0000-0000-000000000202',
  'youtube',
  'second-workspace-video',
  'SecondCreator',
  'Second workspace coverage',
  'https://www.youtube.com/watch?v=second-workspace-video',
  250,
  now(),
  now()
);

do $$
begin
  if (select workspace_id from public.mentions where id = '00000000-0000-0000-0000-000000000502')
     <> '00000000-0000-0000-0000-000000000101'::uuid then
    raise exception 'Mention ownership trigger failed.';
  end if;
  if not exists (select 1 from public.delivered_notifications where mention_id = '00000000-0000-0000-0000-000000000502') then
    raise exception 'YouTube Discord job was not queued.';
  end if;
  if exists (select 1 from public.delivered_notifications where mention_id = '00000000-0000-0000-0000-000000000503') then
    raise exception 'Below-threshold Twitch job was queued.';
  end if;
  if not exists (select 1 from public.delivered_notifications where mention_id = '00000000-0000-0000-0000-000000000504') then
    raise exception 'Above-threshold Twitch job was not queued.';
  end if;
end;
$$;

create temporary table discord_claims as
select * from public.claim_discord_deliveries(20, 120);

do $$
begin
  if not exists (select 1 from discord_claims where mention_id = '00000000-0000-0000-0000-000000000502') then raise exception 'YouTube Discord job was not claimable.'; end if;
  if not exists (select 1 from discord_claims where mention_id = '00000000-0000-0000-0000-000000000504') then raise exception 'Twitch Discord job was not claimable.'; end if;
  if exists (select 1 from discord_claims where mention_id = '00000000-0000-0000-0000-000000000503') then raise exception 'Below-threshold Twitch job became claimable.'; end if;
end;
$$;

select public.complete_discord_delivery('00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000301', true, null, 0);
select public.complete_discord_delivery('00000000-0000-0000-0000-000000000504', '00000000-0000-0000-0000-000000000301', false, 'test retry', 90);

do $$
begin
  if (select status from public.delivered_notifications where mention_id = '00000000-0000-0000-0000-000000000502' and notification_channel_id = '00000000-0000-0000-0000-000000000301') <> 'delivered' then raise exception 'Discord success completion failed.'; end if;
  if (select status from public.delivered_notifications where mention_id = '00000000-0000-0000-0000-000000000504' and notification_channel_id = '00000000-0000-0000-0000-000000000301') <> 'failed' then raise exception 'Discord retry completion failed.'; end if;
  if (select available_at from public.delivered_notifications where mention_id = '00000000-0000-0000-0000-000000000504' and notification_channel_id = '00000000-0000-0000-0000-000000000301') <= now() then raise exception 'Discord failure did not schedule a future retry.'; end if;
end;
$$;

-- Same recipient across two workspaces must produce one digest destination.
select public.prepare_email_digest_period(current_date);
create temporary table digest_claim as
select * from public.claim_email_digest_destinations(current_date, 25);
create temporary table digest_channels as
select * from public.email_digest_channels_for_destination('scale@test.example');
create temporary table digest_paid_one as
select public.email_digest_workspace_summary(
  '00000000-0000-0000-0000-000000000101', now() - interval '4 hours', now() + interval '1 hour', 10
) as value;
create temporary table digest_paid_two as
select public.email_digest_workspace_summary(
  '00000000-0000-0000-0000-000000000102', now() - interval '4 hours', now() + interval '1 hour', 0
) as value;

do $$
begin
  if (select count(*) from digest_claim where destination = 'scale@test.example') <> 1 then raise exception 'Digest destination was not deduplicated.'; end if;
  if (select count(*) from digest_channels) <> 2 then raise exception 'Digest recipient did not resolve both workspaces.'; end if;
  if coalesce(((select value from digest_paid_one)->>'total')::integer, 0) < 3 then raise exception 'Paid-one digest summary missed recent signals.'; end if;
  if coalesce(((select value from digest_paid_two)->>'total')::integer, 0) < 1 then raise exception 'Paid-two digest summary missed recent signals.'; end if;
end;
$$;

select public.complete_email_digest_destination(
  (select destination_key from digest_claim where destination = 'scale@test.example'),
  current_date,
  true,
  'provider-test-id',
  null
);

create temporary table digest_reclaim as
select * from public.claim_email_digest_destinations(current_date, 25);

do $$
begin
  if exists (select 1 from digest_reclaim where destination = 'scale@test.example') then raise exception 'Delivered digest destination was reclaimed.'; end if;
end;
$$;

-- Direct workspace dashboard stats must stay tenant-scoped.
create temporary table stats_one as
select * from public.dashboard_signal_stats('00000000-0000-0000-0000-000000000101');
create temporary table stats_two as
select * from public.dashboard_signal_stats('00000000-0000-0000-0000-000000000102');

do $$
begin
  if (select signal_count from stats_one) < 4 then raise exception 'Dashboard stats missed paid-one signals.'; end if;
  if (select signal_count from stats_two) <> 1 then raise exception 'Dashboard stats leaked or missed paid-two signals.'; end if;
end;
$$;

-- Retention keeps high-frequency diagnostic tables bounded.
insert into public.scan_runs(
  id, game_id, platform, started_at, finished_at, status
) values (
  '00000000-0000-0000-0000-000000000601',
  '00000000-0000-0000-0000-000000000201',
  'youtube',
  now() - interval '20 days',
  now() - interval '20 days',
  'success'
);

insert into public.delivered_notifications(
  mention_id, notification_channel_id, delivered_at, status, attempts, available_at, created_at
) values (
  '00000000-0000-0000-0000-000000000503',
  '00000000-0000-0000-0000-000000000301',
  now() - interval '31 days',
  'delivered',
  1,
  now() - interval '31 days',
  now() - interval '31 days'
);

select private.cleanup_monitoring_internal_data();

do $$
begin
  if exists (select 1 from public.scan_runs where id = '00000000-0000-0000-0000-000000000601') then raise exception 'Old scan run survived monitoring cleanup.'; end if;
  if exists (select 1 from public.delivered_notifications where mention_id = '00000000-0000-0000-0000-000000000503' and notification_channel_id = '00000000-0000-0000-0000-000000000301') then raise exception 'Old delivered job survived monitoring cleanup.'; end if;
end;
$$;

select 'Who Plays My Game 1000-game monitoring SQL regression passed.' as result;
SQL

docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d gamesignal_test <"$SQL"
