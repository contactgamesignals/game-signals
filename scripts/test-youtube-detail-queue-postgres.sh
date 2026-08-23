#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER="gamesignal-youtube-detail-$RANDOM-$RANDOM"
TMP_DIR="$(mktemp -d)"
SQL="$TMP_DIR/youtube-detail-test.sql"
trap 'docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; rm -rf "$TMP_DIR"' EXIT

docker run -d --rm \
  --name "$CONTAINER" \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=gamesignal_test \
  postgres:17-alpine >/dev/null

for _ in $(seq 1 40); do
  if docker exec "$CONTAINER" pg_isready -U postgres -d gamesignal_test >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

docker exec "$CONTAINER" pg_isready -U postgres -d gamesignal_test >/dev/null

cat >"$SQL" <<'SQL'
\set ON_ERROR_STOP on

create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema private;

create type public.subscription_plan as enum ('free', 'indie', 'studio', 'publisher', 'crazy');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'canceled', 'incomplete', 'blocked_tax');

create table public.workspaces(id uuid primary key);
create table public.subscriptions(
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  plan public.subscription_plan not null,
  status public.subscription_status not null
);
create table public.games(
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  enabled boolean not null default true
);
create table public.internal_settings(key text primary key, value text not null);
create table private.api_quota_usage(
  bucket text not null,
  period_start timestamptz not null,
  used integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key(bucket, period_start)
);
create table public.scan_runs(
  id bigserial primary key,
  started_at timestamptz not null default now()
);
create table public.delivered_notifications(
  id bigserial primary key,
  status text not null,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);
create table private.daily_digest_deliveries(
  notification_channel_id uuid,
  period_date date not null
);
create table private.daily_digest_destination_deliveries(
  destination_key text,
  period_date date not null
);

insert into public.workspaces(id) values
  ('00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000102');
insert into public.subscriptions(workspace_id, plan, status) values
  ('00000000-0000-0000-0000-000000000101', 'studio', 'active'),
  ('00000000-0000-0000-0000-000000000102', 'free', 'trialing');
insert into public.games(id, workspace_id, enabled) values
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000101', true),
  ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000102', true);

-- These settings normally come from the base scale migration.
insert into public.internal_settings(key, value) values
  ('youtube_search_daily_budget', '1000000'),
  ('youtube_search_peak_per_minute', '120'),
  ('youtube_general_daily_budget', '1000000'),
  ('youtube_general_peak_per_minute', '120');
SQL

cat "$ROOT_DIR/supabase/migrations/20260823185200_scale_youtube_detail_queue.sql" >>"$SQL"
cat "$ROOT_DIR/supabase/migrations/20260823185300_fix_youtube_detail_attempts.sql" >>"$SQL"

cat >>"$SQL" <<'SQL'

-- Worker queue functions must be private to service_role.
do $$
begin
  if has_function_privilege('authenticated', 'public.enqueue_youtube_detail_candidates(jsonb)', 'EXECUTE') then
    raise exception 'Authenticated role can enqueue YouTube detail jobs.';
  end if;
  if has_function_privilege('anon', 'public.claim_youtube_detail_candidates(integer,integer)', 'EXECUTE') then
    raise exception 'Anon role can claim YouTube detail jobs.';
  end if;
  if has_function_privilege('authenticated', 'public.release_youtube_detail_candidates(jsonb,integer,boolean)', 'EXECUTE') then
    raise exception 'Authenticated role can release YouTube detail jobs.';
  end if;
  if not has_function_privilege('service_role', 'public.complete_youtube_detail_candidates(jsonb)', 'EXECUTE') then
    raise exception 'Service role cannot complete YouTube detail jobs.';
  end if;
  if to_regprocedure('public.release_youtube_detail_candidates(jsonb,integer)') is not null then
    raise exception 'Superseded two-argument release helper still exists.';
  end if;
end;
$$;

select public.enqueue_youtube_detail_candidates(
  jsonb_build_array(
    jsonb_build_object('game_id','00000000-0000-0000-0000-000000000201','external_id','paid-a','raw_payload',jsonb_build_object('id',jsonb_build_object('videoId','paid-a'))),
    jsonb_build_object('game_id','00000000-0000-0000-0000-000000000201','external_id','paid-b','raw_payload',jsonb_build_object('id',jsonb_build_object('videoId','paid-b'))),
    jsonb_build_object('game_id','00000000-0000-0000-0000-000000000202','external_id','free-a','raw_payload',jsonb_build_object('id',jsonb_build_object('videoId','free-a')))
  )
);

create temporary table claim_one as
select * from public.claim_youtube_detail_candidates(10, 120);

do $$
begin
  if (select count(*) from claim_one) <> 2 then raise exception 'Detail queue did not claim exactly the two paid-game candidates.'; end if;
  if exists (select 1 from claim_one where game_id = '00000000-0000-0000-0000-000000000202') then raise exception 'Free-game detail candidate was claimed.'; end if;
  if exists (select 1 from claim_one where attempts <> 0) then raise exception 'Claiming detail candidates consumed attempts.'; end if;
end;
$$;

-- Quota deferral must release without consuming attempts.
select public.release_youtube_detail_candidates(
  jsonb_build_array(jsonb_build_object('game_id','00000000-0000-0000-0000-000000000201','external_id','paid-a')),
  5,
  false
);

-- Actual provider/metadata failure increments attempts exactly once.
select public.release_youtube_detail_candidates(
  jsonb_build_array(jsonb_build_object('game_id','00000000-0000-0000-0000-000000000201','external_id','paid-b')),
  5,
  true
);

do $$
begin
  if (select attempts from public.youtube_detail_candidates where external_id='paid-a') <> 0 then raise exception 'Quota deferral consumed a detail attempt.'; end if;
  if (select attempts from public.youtube_detail_candidates where external_id='paid-b') <> 1 then raise exception 'Actual detail failure did not increment attempts exactly once.'; end if;
end;
$$;

-- Make released rows immediately claimable for the rest of the regression.
update public.youtube_detail_candidates
set available_at = now() - interval '1 second'
where game_id = '00000000-0000-0000-0000-000000000201';

create temporary table claim_two as
select * from public.claim_youtube_detail_candidates(10, 120);

do $$
begin
  if (select count(*) from claim_two) <> 2 then raise exception 'Released paid detail candidates were not claimable again.'; end if;
  if (select attempts from claim_two where external_id='paid-a') <> 0 then raise exception 'Quota-deferred candidate attempt count changed on re-claim.'; end if;
  if (select attempts from claim_two where external_id='paid-b') <> 1 then raise exception 'Failed candidate attempt count changed on re-claim.'; end if;
end;
$$;

select public.complete_youtube_detail_candidates(
  jsonb_build_array(
    jsonb_build_object('game_id','00000000-0000-0000-0000-000000000201','external_id','paid-a'),
    jsonb_build_object('game_id','00000000-0000-0000-0000-000000000201','external_id','paid-b')
  )
);

do $$
begin
  if exists (select 1 from public.youtube_detail_candidates where game_id='00000000-0000-0000-0000-000000000201') then
    raise exception 'Completed YouTube detail candidates were not removed.';
  end if;
  if not exists (select 1 from public.youtube_detail_candidates where external_id='free-a') then
    raise exception 'Unclaimed free-game candidate disappeared unexpectedly.';
  end if;
end;
$$;

-- Stats quota uses its own Pacific-day bucket and cannot consume general quota.
delete from private.api_quota_usage;
update public.internal_settings set value='120' where key='youtube_stats_peak_per_minute';
create temporary table stats_quota as
select public.reserve_monitoring_quota('youtube_stats', 200) as granted;

do $$
declare
  v_pacific_start timestamptz := date_trunc('day', now() at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles';
begin
  if (select granted from stats_quota) <> 120 then raise exception 'Stats quota peak was not enforced independently.'; end if;
  if not exists (select 1 from private.api_quota_usage where bucket='youtube_stats:day' and period_start=v_pacific_start and used=120) then
    raise exception 'Stats quota did not use the Pacific day bucket.';
  end if;
  if exists (select 1 from private.api_quota_usage where bucket='youtube_general:day') then
    raise exception 'Stats enrichment consumed the general quota bucket.';
  end if;
end;
$$;

-- Queue retention is bounded.
update public.youtube_detail_candidates set first_seen_at = now() - interval '31 days' where external_id='free-a';
select private.cleanup_monitoring_internal_data();

do $$
begin
  if exists (select 1 from public.youtube_detail_candidates where external_id='free-a') then
    raise exception 'Old detail queue row survived cleanup.';
  end if;
end;
$$;

select 'YouTube detail queue PostgreSQL regression passed.' as result;
SQL

docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d gamesignal_test <"$SQL"
