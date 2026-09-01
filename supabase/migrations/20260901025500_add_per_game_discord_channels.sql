create table if not exists public.game_discord_channels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  destination text not null check (char_length(destination) between 1 and 2048),
  enabled boolean not null default true,
  minimum_live_viewers integer not null default 0 check (minimum_live_viewers >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, game_id)
);

create index if not exists game_discord_channels_game_id_idx
  on public.game_discord_channels(game_id);

alter table public.game_discord_channels enable row level security;
revoke all on table public.game_discord_channels from public, anon, authenticated;
grant select, insert, update, delete on table public.game_discord_channels to service_role;

create or replace function private.guard_game_discord_channel_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.games g
    where g.id = new.game_id
      and g.workspace_id = new.workspace_id
  ) then
    raise exception 'Discord game channel must reference a game in the same workspace.' using errcode = '23514';
  end if;

  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.guard_game_discord_channel_workspace() from public;

drop trigger if exists game_discord_channels_workspace_guard on public.game_discord_channels;
create trigger game_discord_channels_workspace_guard
before insert or update of workspace_id, game_id, destination, enabled, minimum_live_viewers
on public.game_discord_channels
for each row
execute function private.guard_game_discord_channel_workspace();

-- Preserve every existing Discord setup by copying the current workspace webhook
-- to each game that already exists. The original workspace channel remains as the
-- durable delivery parent so already queued notifications keep their foreign key.
insert into public.game_discord_channels (
  workspace_id,
  game_id,
  destination,
  enabled,
  minimum_live_viewers,
  created_at,
  updated_at
)
select
  c.workspace_id,
  g.id,
  c.destination,
  c.enabled,
  c.minimum_live_viewers,
  c.created_at,
  now()
from public.notification_channels c
join public.games g on g.workspace_id = c.workspace_id
where c.type::text = 'discord'
on conflict (workspace_id, game_id) do nothing;

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
  join public.game_discord_channels gc
    on gc.workspace_id = c.workspace_id
   and gc.game_id = new.game_id
  where c.workspace_id = new.workspace_id
    and c.type::text = 'discord'
    and c.enabled
    and gc.enabled
    and private.effective_product_plan(c.workspace_id) <> 'free'::public.subscription_plan
    and (new.platform::text = 'youtube' or coalesce(new.viewer_count, 0) >= gc.minimum_live_viewers)
  on conflict (mention_id, notification_channel_id) do nothing;

  return new;
end;
$$;

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
  update public.delivered_notifications d
  set status = 'skipped',
      claimed_at = null,
      error = 'Skipped because Discord is no longer configured for this game.'
  from public.mentions m, public.notification_channels c
  where d.mention_id = m.id
    and d.notification_channel_id = c.id
    and d.status in ('pending', 'failed')
    and c.type::text = 'discord'
    and not exists (
      select 1
      from public.game_discord_channels gc
      where gc.workspace_id = m.workspace_id
        and gc.game_id = m.game_id
        and gc.enabled
    );

  update public.delivered_notifications d
  set status = 'skipped',
      claimed_at = null,
      error = 'Skipped because the current live-viewer threshold is higher.'
  from public.mentions m, public.notification_channels c, public.game_discord_channels gc
  where d.mention_id = m.id
    and d.notification_channel_id = c.id
    and d.status in ('pending', 'failed')
    and c.type::text = 'discord'
    and gc.workspace_id = m.workspace_id
    and gc.game_id = m.game_id
    and gc.enabled
    and m.platform::text = 'twitch'
    and coalesce(m.viewer_count, 0) < gc.minimum_live_viewers;

  return query
  with candidates as (
    select d.mention_id, d.notification_channel_id
    from public.delivered_notifications d
    join public.mentions m on m.id = d.mention_id
    join public.notification_channels c on c.id = d.notification_channel_id
    join public.game_discord_channels gc
      on gc.workspace_id = m.workspace_id
     and gc.game_id = m.game_id
     and gc.enabled
    where c.type::text = 'discord'
      and c.enabled
      and private.effective_product_plan(c.workspace_id) <> 'free'::public.subscription_plan
      and d.attempts < 5
      and d.available_at <= now()
      and (m.platform::text = 'youtube' or coalesce(m.viewer_count, 0) >= gc.minimum_live_viewers)
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
    gc.destination,
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
  join public.game_discord_channels gc
    on gc.workspace_id = m.workspace_id
   and gc.game_id = m.game_id
   and gc.enabled
  order by m.detected_at;
end;
$$;
