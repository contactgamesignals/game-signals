begin;

-- Ambiguous search results are persisted before the scan window advances. This
-- lets search.list scale independently from the general YouTube quota used for
-- full videos.list metadata validation.
create table if not exists public.youtube_detail_candidates (
  game_id uuid not null references public.games(id) on delete cascade,
  external_id text not null,
  raw_payload jsonb not null,
  first_seen_at timestamptz not null default now(),
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  primary key (game_id, external_id)
);

alter table public.youtube_detail_candidates enable row level security;
revoke all on table public.youtube_detail_candidates from public, anon, authenticated;
grant select, insert, update, delete on table public.youtube_detail_candidates to service_role;

create index if not exists youtube_detail_candidates_queue_idx
  on public.youtube_detail_candidates (available_at, first_seen_at)
  where claimed_at is null;

create or replace function public.claim_youtube_detail_candidates(
  p_limit integer default 500,
  p_lease_seconds integer default 120
)
returns table(
  game_id uuid,
  external_id text,
  raw_payload jsonb,
  attempts integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with candidates as (
    select c.game_id, c.external_id
    from public.youtube_detail_candidates c
    join public.games g on g.id = c.game_id
    join public.subscriptions s on s.workspace_id = g.workspace_id
    where g.enabled
      and s.status::text in ('active', 'trialing')
      and s.plan::text <> 'free'
      and c.available_at <= now()
      and (
        c.claimed_at is null
        or c.claimed_at < now() - make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 120), 600)))
      )
      and c.attempts < 10
    order by c.first_seen_at, c.game_id, c.external_id
    for update of c skip locked
    limit greatest(1, least(coalesce(p_limit, 500), 1000))
  )
  update public.youtube_detail_candidates c
  set claimed_at = now(),
      attempts = c.attempts + 1
  from candidates q
  where c.game_id = q.game_id
    and c.external_id = q.external_id
  returning c.game_id, c.external_id, c.raw_payload, c.attempts;
end;
$$;

revoke all on function public.claim_youtube_detail_candidates(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_youtube_detail_candidates(integer, integer) to service_role;

create or replace function public.complete_youtube_detail_candidates(p_pairs jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  with requested as (
    select x.game_id, x.external_id
    from jsonb_to_recordset(coalesce(p_pairs, '[]'::jsonb)) as x(game_id uuid, external_id text)
  )
  delete from public.youtube_detail_candidates c
  using requested r
  where c.game_id = r.game_id
    and c.external_id = r.external_id;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.complete_youtube_detail_candidates(jsonb) from public, anon, authenticated;
grant execute on function public.complete_youtube_detail_candidates(jsonb) to service_role;

create or replace function public.release_youtube_detail_candidates(
  p_pairs jsonb,
  p_retry_after_seconds integer default 60
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  with requested as (
    select x.game_id, x.external_id
    from jsonb_to_recordset(coalesce(p_pairs, '[]'::jsonb)) as x(game_id uuid, external_id text)
  )
  update public.youtube_detail_candidates c
  set claimed_at = null,
      available_at = now() + make_interval(secs => greatest(5, least(coalesce(p_retry_after_seconds, 60), 3600)))
  from requested r
  where c.game_id = r.game_id
    and c.external_id = r.external_id;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke all on function public.release_youtube_detail_candidates(jsonb, integer) from public, anon, authenticated;
grant execute on function public.release_youtube_detail_candidates(jsonb, integer) to service_role;

-- batchGetStats has its own granular quota bucket as of June 2026. Statistics
-- enrichment is best-effort and must never block creator detection.
insert into public.internal_settings(key, value)
values
  ('youtube_stats_daily_budget', '10000'),
  ('youtube_stats_peak_per_minute', '120')
on conflict (key) do nothing;

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
  elsif p_bucket = 'youtube_stats' then
    v_daily_key := 'youtube_stats_daily_budget';
    v_peak_key := 'youtube_stats_peak_per_minute';
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
end;
$$;

revoke all on function private.cleanup_monitoring_internal_data() from public, anon, authenticated;

commit;
