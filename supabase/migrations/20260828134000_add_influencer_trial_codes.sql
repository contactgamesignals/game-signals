create table private.trial_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  label text not null,
  duration_days integer not null default 7 check (duration_days between 1 and 30),
  max_redemptions integer not null default 100 check (max_redemptions between 1 and 10000),
  redemption_count integer not null default 0 check (redemption_count >= 0),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (char_length(code) between 4 and 32),
  check (char_length(label) between 1 and 120),
  check (expires_at is null or expires_at > starts_at)
);

create unique index trial_codes_normalized_code_unique
  on private.trial_codes (upper(code));

create table private.trial_redemptions (
  id uuid primary key default gen_random_uuid(),
  trial_code_id uuid not null references private.trial_codes(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  redeemed_by_user_id uuid not null,
  redeemed_at timestamptz not null default now(),
  ends_at timestamptz not null,
  unique (workspace_id),
  unique (redeemed_by_user_id),
  check (ends_at > redeemed_at)
);

create index trial_redemptions_active_lookup_idx
  on private.trial_redemptions (workspace_id, ends_at);

comment on table private.trial_codes is
  'Operator-managed influencer/campaign codes that grant a temporary product trial without creating a billing subscription.';
comment on table private.trial_redemptions is
  'Immutable one-trial-per-workspace/user redemption records. Trial access expires at ends_at and never auto-renews.';

create or replace function private.effective_product_plan(p_workspace_id uuid)
returns public.subscription_plan
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (
      select 1
      from public.subscriptions s
      where s.workspace_id = p_workspace_id
        and s.status::text in ('active', 'trialing')
        and s.plan::text <> 'free'
    ) then (
      select s.plan
      from public.subscriptions s
      where s.workspace_id = p_workspace_id
        and s.status::text in ('active', 'trialing')
        and s.plan::text <> 'free'
      limit 1
    )
    when exists (
      select 1
      from private.trial_redemptions r
      where r.workspace_id = p_workspace_id
        and r.ends_at > now()
    ) then 'indie'::public.subscription_plan
    else 'free'::public.subscription_plan
  end;
$$;

revoke all on function private.effective_product_plan(uuid) from public, anon, authenticated, service_role;

create or replace function private.active_trial_end(p_workspace_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select r.ends_at
  from private.trial_redemptions r
  where r.workspace_id = p_workspace_id
    and r.ends_at > now()
  order by r.ends_at desc
  limit 1;
$$;

revoke all on function private.active_trial_end(uuid) from public, anon, authenticated, service_role;

create or replace function private.reconcile_workspace_games_to_effective_limit(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allowed integer;
begin
  perform 1
  from public.workspaces
  where id = p_workspace_id
  for update;

  v_allowed := public.game_limit_for_plan(private.effective_product_plan(p_workspace_id));

  with ranked as (
    select g.id,
           row_number() over (order by g.created_at asc, g.id asc) as position
    from public.games g
    where g.workspace_id = p_workspace_id
      and g.enabled = true
  )
  update public.games g
  set enabled = false
  from ranked r
  where g.id = r.id
    and r.position > v_allowed;
end;
$$;

revoke all on function private.reconcile_workspace_games_to_effective_limit(uuid) from public, anon, authenticated, service_role;

create or replace function private.pause_games_without_product_access()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  update public.games g
  set enabled = false
  where g.enabled = true
    and private.effective_product_plan(g.workspace_id) = 'free'::public.subscription_plan;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke all on function private.pause_games_without_product_access() from public, anon, authenticated, service_role;

create or replace function public.workspace_product_access(p_workspace_id uuid)
returns table(
  effective_plan public.subscription_plan,
  access_kind text,
  trial_ends_at timestamptz,
  allowed_games integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text := auth.role();
  v_plan public.subscription_plan;
  v_trial_end timestamptz;
  v_paid boolean;
begin
  if v_role is distinct from 'service_role' then
    if v_user_id is null or not exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = p_workspace_id
        and wm.user_id = v_user_id
    ) then
      raise exception 'WORKSPACE_ACCESS_FORBIDDEN' using errcode = '42501';
    end if;
  end if;

  select exists (
    select 1
    from public.subscriptions s
    where s.workspace_id = p_workspace_id
      and s.status::text in ('active', 'trialing')
      and s.plan::text <> 'free'
  ) into v_paid;

  v_plan := private.effective_product_plan(p_workspace_id);
  v_trial_end := private.active_trial_end(p_workspace_id);

  return query
  select
    v_plan,
    case when v_paid then 'paid' when v_trial_end is not null then 'trial' else 'none' end,
    case when v_paid then null::timestamptz else v_trial_end end,
    public.game_limit_for_plan(v_plan);
end;
$$;

revoke all on function public.workspace_product_access(uuid) from public, anon;
grant execute on function public.workspace_product_access(uuid) to authenticated, service_role;

create or replace function public.workspace_product_access_batch(p_workspace_ids uuid[])
returns table(
  workspace_id uuid,
  effective_plan public.subscription_plan,
  access_kind text,
  trial_ends_at timestamptz,
  allowed_games integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  return query
  select
    w.id,
    private.effective_product_plan(w.id),
    case
      when exists (
        select 1 from public.subscriptions s
        where s.workspace_id = w.id
          and s.status::text in ('active', 'trialing')
          and s.plan::text <> 'free'
      ) then 'paid'
      when private.active_trial_end(w.id) is not null then 'trial'
      else 'none'
    end,
    case
      when exists (
        select 1 from public.subscriptions s
        where s.workspace_id = w.id
          and s.status::text in ('active', 'trialing')
          and s.plan::text <> 'free'
      ) then null::timestamptz
      else private.active_trial_end(w.id)
    end,
    public.game_limit_for_plan(private.effective_product_plan(w.id))
  from public.workspaces w
  where w.id = any(coalesce(p_workspace_ids, array[]::uuid[]));
end;
$$;

revoke all on function public.workspace_product_access_batch(uuid[]) from public, anon, authenticated;
grant execute on function public.workspace_product_access_batch(uuid[]) to service_role;

create or replace function public.redeem_trial_code(p_workspace_id uuid, p_code text)
returns table(
  trial_ends_at timestamptz,
  effective_plan public.subscription_plan,
  allowed_games integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_normalized_code text := upper(trim(coalesce(p_code, '')));
  v_code private.trial_codes%rowtype;
  v_ends_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'TRIAL_UNAUTHORIZED' using errcode = '42501';
  end if;

  if v_normalized_code !~ '^[A-Z0-9][A-Z0-9-]{3,31}$' then
    raise exception 'TRIAL_CODE_INVALID' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = v_user_id
      and wm.role::text in ('owner', 'admin')
  ) then
    raise exception 'TRIAL_FORBIDDEN' using errcode = '42501';
  end if;

  perform 1
  from public.workspaces
  where id = p_workspace_id
  for update;

  if exists (
    select 1
    from public.subscriptions s
    where s.workspace_id = p_workspace_id
      and s.status::text in ('active', 'trialing')
      and s.plan::text <> 'free'
  ) then
    raise exception 'TRIAL_PAID_PLAN_ACTIVE' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from private.trial_redemptions r
    where r.workspace_id = p_workspace_id
       or r.redeemed_by_user_id = v_user_id
  ) then
    raise exception 'TRIAL_ALREADY_USED' using errcode = 'P0001';
  end if;

  select c.*
  into v_code
  from private.trial_codes c
  where upper(c.code) = v_normalized_code
  for update;

  if not found
     or not v_code.active
     or v_code.starts_at > now()
     or (v_code.expires_at is not null and v_code.expires_at <= now())
     or v_code.redemption_count >= v_code.max_redemptions then
    raise exception 'TRIAL_CODE_INVALID' using errcode = 'P0001';
  end if;

  v_ends_at := now() + make_interval(days => v_code.duration_days);

  insert into private.trial_redemptions(
    trial_code_id,
    workspace_id,
    redeemed_by_user_id,
    ends_at
  ) values (
    v_code.id,
    p_workspace_id,
    v_user_id,
    v_ends_at
  );

  update private.trial_codes
  set redemption_count = redemption_count + 1
  where id = v_code.id;

  perform private.reconcile_workspace_games_to_effective_limit(p_workspace_id);

  return query
  select
    v_ends_at,
    'indie'::public.subscription_plan,
    public.game_limit_for_plan('indie'::public.subscription_plan);
end;
$$;

revoke all on function public.redeem_trial_code(uuid, text) from public, anon, service_role;
grant execute on function public.redeem_trial_code(uuid, text) to authenticated;

create or replace function private.create_trial_code(
  p_label text,
  p_code text default null,
  p_max_redemptions integer default 100,
  p_expires_at timestamptz default null,
  p_duration_days integer default 7
)
returns table(
  id uuid,
  code text,
  label text,
  duration_days integer,
  max_redemptions integer,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := upper(trim(coalesce(p_code, '')));
  v_expires_at timestamptz := coalesce(p_expires_at, now() + interval '30 days');
begin
  if trim(coalesce(p_label, '')) = '' or char_length(trim(p_label)) > 120 then
    raise exception 'TRIAL_LABEL_INVALID' using errcode = '22023';
  end if;
  if p_duration_days not between 1 and 30 then
    raise exception 'TRIAL_DURATION_INVALID' using errcode = '22023';
  end if;
  if p_max_redemptions not between 1 and 10000 then
    raise exception 'TRIAL_MAX_REDEMPTIONS_INVALID' using errcode = '22023';
  end if;
  if v_expires_at <= now() then
    raise exception 'TRIAL_CODE_EXPIRY_INVALID' using errcode = '22023';
  end if;

  if v_code = '' then
    v_code := 'WPMG-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  end if;

  if v_code !~ '^[A-Z0-9][A-Z0-9-]{3,31}$' then
    raise exception 'TRIAL_CODE_FORMAT_INVALID' using errcode = '22023';
  end if;

  return query
  insert into private.trial_codes(code, label, duration_days, max_redemptions, expires_at)
  values (v_code, trim(p_label), p_duration_days, p_max_redemptions, v_expires_at)
  returning trial_codes.id, trial_codes.code, trial_codes.label,
            trial_codes.duration_days, trial_codes.max_redemptions, trial_codes.expires_at;
end;
$$;

revoke all on function private.create_trial_code(text, text, integer, timestamptz, integer) from public, anon, authenticated, service_role;

create or replace function public.enforce_workspace_game_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_plan public.subscription_plan;
  current_count integer;
  cooldown_count integer;
  allowed_count integer;
begin
  if not new.enabled then
    return new;
  end if;

  perform 1
  from public.workspaces
  where id = new.workspace_id
  for update;

  current_plan := private.effective_product_plan(new.workspace_id);
  allowed_count := public.game_limit_for_plan(current_plan);

  select count(*)::integer
    into current_count
  from public.games g
  where g.workspace_id = new.workspace_id
    and g.enabled = true
    and (tg_op = 'INSERT' or g.id <> new.id);

  select count(*)::integer
    into cooldown_count
  from private.game_slot_cooldowns c
  where c.workspace_id = new.workspace_id
    and c.expires_at > now();

  if current_count + cooldown_count >= allowed_count then
    if cooldown_count > 0 and current_count < allowed_count then
      raise exception 'GAME_SLOT_COOLDOWN' using errcode = 'P0001';
    end if;

    raise exception 'Active game limit reached for plan % (% games).', current_plan, allowed_count
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create or replace function public.workspace_game_slot_cooldown_state(p_workspace_id uuid)
returns table(
  active_games integer,
  cooldown_slots integer,
  allowed_slots integer,
  effective_used_slots integer,
  available_slots integer,
  next_slot_available_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  effective_plan public.subscription_plan;
  v_active_games integer;
  v_cooldown_slots integer;
  v_allowed_slots integer;
  needed_expirations integer;
  v_next_slot_available_at timestamptz;
begin
  effective_plan := private.effective_product_plan(p_workspace_id);
  v_allowed_slots := public.game_limit_for_plan(effective_plan);

  select count(*)::integer
    into v_active_games
  from public.games g
  where g.workspace_id = p_workspace_id
    and g.enabled = true;

  select count(*)::integer
    into v_cooldown_slots
  from private.game_slot_cooldowns c
  where c.workspace_id = p_workspace_id
    and c.expires_at > now();

  v_next_slot_available_at := null;
  if v_allowed_slots > 0
     and v_cooldown_slots > 0
     and v_active_games < v_allowed_slots
     and v_active_games + v_cooldown_slots >= v_allowed_slots then
    needed_expirations := v_active_games + v_cooldown_slots - v_allowed_slots + 1;

    if needed_expirations between 1 and v_cooldown_slots then
      select c.expires_at
        into v_next_slot_available_at
      from private.game_slot_cooldowns c
      where c.workspace_id = p_workspace_id
        and c.expires_at > now()
      order by c.expires_at asc, c.id asc
      offset (needed_expirations - 1)
      limit 1;
    end if;
  end if;

  return query
  select
    v_active_games,
    v_cooldown_slots,
    v_allowed_slots,
    v_active_games + v_cooldown_slots,
    greatest(v_allowed_slots - v_active_games - v_cooldown_slots, 0),
    v_next_slot_available_at;
end;
$$;

create or replace function public.reconcile_workspace_active_game_limit()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
begin
  perform private.reconcile_workspace_games_to_effective_limit(new.workspace_id);
  return new;
end;
$$;

create or replace function public.claim_due_twitch_games(p_limit integer default 120, p_lease_seconds integer default 120)
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
    where g.enabled
      and private.effective_product_plan(g.workspace_id) <> 'free'::public.subscription_plan
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

create or replace function public.claim_due_youtube_games(p_limit integer default 80, p_lease_seconds integer default 120)
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
    where g.enabled
      and private.effective_product_plan(g.workspace_id) <> 'free'::public.subscription_plan
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

create or replace function public.claim_youtube_detail_candidates(p_limit integer default 500, p_lease_seconds integer default 120)
returns table(game_id uuid, external_id text, raw_payload jsonb, attempts integer)
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
    where g.enabled
      and private.effective_product_plan(g.workspace_id) <> 'free'::public.subscription_plan
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
  set claimed_at = now()
  from candidates q
  where c.game_id = q.game_id
    and c.external_id = q.external_id
  returning c.game_id, c.external_id, c.raw_payload, c.attempts;
end;
$$;

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
  select new.id, c.id, 'pending', 0, now(), now()
  from public.notification_channels c
  where c.workspace_id = new.workspace_id
    and c.type::text = 'discord'
    and c.enabled
    and private.effective_product_plan(c.workspace_id) <> 'free'::public.subscription_plan
    and (new.platform::text = 'youtube' or coalesce(new.viewer_count, 0) >= c.minimum_live_viewers)
  on conflict (mention_id, notification_channel_id) do nothing;

  return new;
end;
$$;

create or replace function public.claim_discord_deliveries(p_limit integer default 250, p_lease_seconds integer default 120)
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
  update public.delivered_notifications d
  set status = 'skipped', claimed_at = null, error = 'Skipped because the current live-viewer threshold is higher.'
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
    where c.type::text = 'discord'
      and c.enabled
      and private.effective_product_plan(c.workspace_id) <> 'free'::public.subscription_plan
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
    set status = 'processing', claimed_at = now(), attempts = d.attempts + 1
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
  where c.type::text = 'email'
    and c.enabled
    and trim(c.destination) <> ''
    and private.effective_product_plan(c.workspace_id) <> 'free'::public.subscription_plan
  group by lower(trim(c.destination))
  on conflict (destination_key, period_date) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

create or replace function public.claim_email_digest_channels(p_period_date date, p_limit integer default 50)
returns table(notification_channel_id uuid, workspace_id uuid, destination text, minimum_live_viewers integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with candidates as (
    select c.id
    from public.notification_channels c
    left join private.daily_digest_deliveries d
      on d.notification_channel_id = c.id
     and d.period_date = p_period_date
    where c.type::text = 'email'
      and c.enabled
      and private.effective_product_plan(c.workspace_id) <> 'free'::public.subscription_plan
      and (
        d.notification_channel_id is null
        or d.status = 'failed'
        or (d.status = 'processing' and d.updated_at < now() - interval '10 minutes')
      )
    order by c.id
    for update of c skip locked
    limit greatest(1, least(coalesce(p_limit, 50), 250))
  ), claimed as (
    insert into private.daily_digest_deliveries(notification_channel_id, period_date, status, attempts, updated_at)
    select id, p_period_date, 'processing', 1, now()
    from candidates
    on conflict (notification_channel_id, period_date) do update
      set status = 'processing',
          attempts = private.daily_digest_deliveries.attempts + 1,
          error = null,
          updated_at = now()
    returning notification_channel_id
  )
  select c.id, c.workspace_id, c.destination, c.minimum_live_viewers
  from claimed cl
  join public.notification_channels c on c.id = cl.notification_channel_id
  order by c.id;
end;
$$;

create or replace function public.email_digest_channels_for_destination(p_destination text)
returns table(notification_channel_id uuid, workspace_id uuid, destination text, minimum_live_viewers integer)
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
  where c.type::text = 'email'
    and c.enabled
    and lower(trim(c.destination)) = lower(trim(p_destination))
    and private.effective_product_plan(c.workspace_id) <> 'free'::public.subscription_plan
  order by c.workspace_id;
$$;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid from cron.job where jobname = 'gamesignal-trial-expiry-every-15-minutes'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'gamesignal-trial-expiry-every-15-minutes',
    '*/15 * * * *',
    'select private.pause_games_without_product_access();'
  );
end;
$$;
