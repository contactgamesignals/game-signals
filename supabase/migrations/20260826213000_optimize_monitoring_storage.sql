-- Keep the customer-facing monitoring behavior unchanged while bounding storage growth.
-- Twitch provider payloads are redundant with normalized mention columns, so new/upserted
-- Twitch rows no longer retain them. Detailed Twitch history is kept for at least 48 hours,
-- the newest 10,000 Twitch signals per workspace, and the newest 500 per game. Older detail
-- is compacted into small all-time rollups used by dashboard stats. YouTube detail is unchanged.

create table if not exists public.signal_archive_rollups (
  game_id uuid not null references public.games(id) on delete cascade,
  platform public.mention_platform not null,
  bucket_date date not null,
  signal_count bigint not null default 0 check (signal_count >= 0),
  total_reach numeric not null default 0 check (total_reach >= 0),
  primary key (game_id, platform, bucket_date)
);

alter table public.signal_archive_rollups enable row level security;

drop policy if exists signal_archive_rollups_select_member on public.signal_archive_rollups;
create policy signal_archive_rollups_select_member
  on public.signal_archive_rollups
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.games g
      where g.id = signal_archive_rollups.game_id
        and private.is_workspace_member(g.workspace_id)
    )
  );

revoke all on table public.signal_archive_rollups from anon, authenticated;
grant select on table public.signal_archive_rollups to authenticated;
grant all on table public.signal_archive_rollups to service_role;

create table if not exists public.signal_archive_creators (
  game_id uuid not null references public.games(id) on delete cascade,
  creator_key text not null,
  primary key (game_id, creator_key)
);

alter table public.signal_archive_creators enable row level security;

drop policy if exists signal_archive_creators_select_member on public.signal_archive_creators;
create policy signal_archive_creators_select_member
  on public.signal_archive_creators
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.games g
      where g.id = signal_archive_creators.game_id
        and private.is_workspace_member(g.workspace_id)
    )
  );

revoke all on table public.signal_archive_creators from anon, authenticated;
grant select on table public.signal_archive_creators to authenticated;
grant all on table public.signal_archive_creators to service_role;

create table if not exists private.monitoring_storage_state (
  id smallint primary key check (id = 1),
  checked_at timestamptz not null,
  database_bytes bigint not null check (database_bytes >= 0),
  warning_threshold_bytes bigint not null check (warning_threshold_bytes > 0),
  warning_active boolean not null
);

revoke all on table private.monitoring_storage_state from public, anon, authenticated;
grant select, insert, update on table private.monitoring_storage_state to service_role;

create or replace function private.strip_twitch_raw_payload()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.platform::text = 'twitch' then
    new.raw_payload := null;
  end if;
  return new;
end;
$$;

revoke all on function private.strip_twitch_raw_payload() from public, anon, authenticated;
grant execute on function private.strip_twitch_raw_payload() to service_role;

drop trigger if exists mentions_strip_twitch_raw_payload_before_insert on public.mentions;
create trigger mentions_strip_twitch_raw_payload_before_insert
before insert on public.mentions
for each row execute function private.strip_twitch_raw_payload();

drop trigger if exists mentions_strip_twitch_raw_payload_before_update on public.mentions;
create trigger mentions_strip_twitch_raw_payload_before_update
before update of platform, raw_payload on public.mentions
for each row execute function private.strip_twitch_raw_payload();

create or replace function private.archive_compact_twitch_mentions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer := 0;
begin
  with ranked as materialized (
    select
      m.id,
      m.game_id,
      m.workspace_id,
      m.creator_name,
      m.detected_at,
      coalesce(m.last_seen_at, m.detected_at) as last_seen_at,
      coalesce(m.view_count, m.viewer_count::bigint, 0::bigint) as reach,
      row_number() over (
        partition by m.workspace_id
        order by m.detected_at desc, m.id desc
      ) as workspace_rank,
      row_number() over (
        partition by m.game_id
        order by m.detected_at desc, m.id desc
      ) as game_rank
    from public.mentions m
    where m.platform::text = 'twitch'
  ),
  candidates as materialized (
    select r.*
    from ranked r
    where r.last_seen_at < now() - interval '48 hours'
      and r.workspace_rank > 10000
      and r.game_rank > 500
      and not exists (
        select 1
        from public.delivered_notifications d
        where d.mention_id = r.id
          and d.status in ('pending', 'processing', 'failed')
      )
  ),
  rollup as (
    insert into public.signal_archive_rollups (
      game_id,
      platform,
      bucket_date,
      signal_count,
      total_reach
    )
    select
      c.game_id,
      'twitch'::public.mention_platform,
      (c.detected_at at time zone 'UTC')::date,
      count(*)::bigint,
      coalesce(sum(c.reach), 0)::numeric
    from candidates c
    group by c.game_id, (c.detected_at at time zone 'UTC')::date
    on conflict (game_id, platform, bucket_date) do update
      set signal_count = public.signal_archive_rollups.signal_count + excluded.signal_count,
          total_reach = public.signal_archive_rollups.total_reach + excluded.total_reach
    returning 1
  ),
  creators as (
    insert into public.signal_archive_creators (game_id, creator_key)
    select distinct c.game_id, lower(c.creator_name)
    from candidates c
    on conflict (game_id, creator_key) do nothing
    returning 1
  ),
  deleted as (
    delete from public.mentions m
    using candidates c
    where m.id = c.id
    returning m.id
  )
  select count(*)::integer into v_deleted from deleted;

  return v_deleted;
end;
$$;

revoke all on function private.archive_compact_twitch_mentions() from public, anon, authenticated;
grant execute on function private.archive_compact_twitch_mentions() to service_role;

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
  with current_stats as (
    select
      count(*)::bigint as signal_count,
      count(*) filter (
        where m.platform::text = 'twitch'
          and m.last_seen_at >= now() - interval '6 minutes'
      )::bigint as live_now_count,
      coalesce(sum(coalesce(m.view_count, m.viewer_count::bigint, 0::bigint)), 0)::numeric as total_reach
    from public.mentions m
    where m.workspace_id = p_workspace_id
  ),
  archived_stats as (
    select
      coalesce(sum(r.signal_count), 0)::bigint as signal_count,
      coalesce(sum(r.total_reach), 0)::numeric as total_reach
    from public.signal_archive_rollups r
    join public.games g on g.id = r.game_id
    where g.workspace_id = p_workspace_id
  ),
  creators as (
    select lower(m.creator_name) as creator_key
    from public.mentions m
    where m.workspace_id = p_workspace_id
    union
    select a.creator_key
    from public.signal_archive_creators a
    join public.games g on g.id = a.game_id
    where g.workspace_id = p_workspace_id
  )
  select
    (c.signal_count + a.signal_count)::bigint,
    c.live_now_count,
    (select count(*)::bigint from creators),
    (c.total_reach + a.total_reach)::numeric
  from current_stats c
  cross join archived_stats a;
$$;

create or replace function private.refresh_monitoring_storage_state()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_database_bytes bigint;
  v_warning_threshold_bytes bigint := 367001600; -- 350 MiB
  v_warning_active boolean;
begin
  v_database_bytes := pg_database_size(current_database());
  v_warning_active := v_database_bytes >= v_warning_threshold_bytes;

  insert into private.monitoring_storage_state (
    id,
    checked_at,
    database_bytes,
    warning_threshold_bytes,
    warning_active
  ) values (
    1,
    now(),
    v_database_bytes,
    v_warning_threshold_bytes,
    v_warning_active
  )
  on conflict (id) do update
    set checked_at = excluded.checked_at,
        database_bytes = excluded.database_bytes,
        warning_threshold_bytes = excluded.warning_threshold_bytes,
        warning_active = excluded.warning_active;

  if v_warning_active then
    raise warning 'WPMG database storage warning: % bytes is at or above % bytes',
      v_database_bytes,
      v_warning_threshold_bytes;
  end if;
end;
$$;

revoke all on function private.refresh_monitoring_storage_state() from public, anon, authenticated;
grant execute on function private.refresh_monitoring_storage_state() to service_role;

create or replace function private.cleanup_monitoring_internal_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.archive_compact_twitch_mentions();

  delete from public.scan_runs
  where started_at < now() - interval '7 days';

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

select private.refresh_monitoring_storage_state();
