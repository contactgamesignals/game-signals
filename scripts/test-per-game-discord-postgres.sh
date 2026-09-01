#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER="gamesignal-per-game-discord-$RANDOM-$RANDOM"
TMP_DIR="$(mktemp -d)"
SQL="$TMP_DIR/per-game-discord-test.sql"
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
  echo "PostgreSQL did not become stably ready for the per-game Discord test." >&2
  docker logs "$CONTAINER" >&2 || true
  exit 2
fi

cat >"$SQL" <<'SQL'
\set ON_ERROR_STOP on

create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema private;
create extension if not exists pgcrypto;

create type public.subscription_plan as enum ('free', 'indie', 'studio', 'publisher', 'crazy');
create type public.mention_platform as enum ('youtube', 'twitch', 'kick');
create type public.notification_channel_type as enum ('email', 'discord');

create table public.workspaces (
  id uuid primary key,
  name text not null
);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.mentions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  platform public.mention_platform not null,
  external_id text not null,
  creator_name text not null,
  title text not null,
  url text not null,
  thumbnail_url text,
  viewer_count integer,
  view_count bigint,
  detected_at timestamptz not null default now()
);

create table public.notification_channels (
  id uuid primary key default gen_random_uuid(),
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
  status text not null default 'pending' check (status in ('pending', 'processing', 'delivered', 'failed', 'skipped')),
  error text,
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key(mention_id, notification_channel_id)
);

create or replace function private.effective_product_plan(p_workspace_id uuid)
returns public.subscription_plan
language sql
stable
set search_path = ''
as $$ select 'studio'::public.subscription_plan; $$;

create or replace function private.enqueue_discord_delivery()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  return new;
end;
$$;

create trigger mentions_enqueue_discord_delivery
after insert on public.mentions
for each row
execute function private.enqueue_discord_delivery();

insert into public.workspaces(id, name) values
  ('00000000-0000-0000-0000-000000000101', 'Studio workspace'),
  ('00000000-0000-0000-0000-000000000102', 'Other workspace');

insert into public.games(id, workspace_id, title, enabled) values
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000101', 'Game Alpha', true),
  ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000101', 'Game Beta', true),
  ('00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000102', 'Other Game', true);

insert into public.notification_channels(id, workspace_id, type, destination, enabled, minimum_live_viewers) values
  ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000101', 'discord', 'https://discord.com/api/webhooks/legacy/workspace', true, 10);
SQL

cat "$ROOT_DIR/supabase/migrations/20260901025500_add_per_game_discord_channels.sql" >>"$SQL"

cat >>"$SQL" <<'SQL'

-- The legacy workspace webhook must be copied to every existing game in that workspace.
do $$
begin
  if (select count(*) from public.game_discord_channels where workspace_id = '00000000-0000-0000-0000-000000000101') <> 2 then
    raise exception 'Legacy Discord webhook was not backfilled to both games.';
  end if;
  if exists (
    select 1 from public.game_discord_channels
    where workspace_id = '00000000-0000-0000-0000-000000000101'
      and destination <> 'https://discord.com/api/webhooks/legacy/workspace'
  ) then
    raise exception 'Backfilled Discord destination changed unexpectedly.';
  end if;
end;
$$;

-- The workspace guard must reject a game owned by another workspace.
do $$
begin
  begin
    insert into public.game_discord_channels(workspace_id, game_id, destination)
    values (
      '00000000-0000-0000-0000-000000000101',
      '00000000-0000-0000-0000-000000000203',
      'https://discord.com/api/webhooks/wrong/workspace'
    );
    raise exception 'Cross-workspace Discord mapping was accepted.';
  exception
    when sqlstate '23514' then null;
  end;
end;
$$;

-- Give the two games different Discord destinations and Twitch thresholds.
update public.game_discord_channels
set destination = 'https://discord.com/api/webhooks/alpha/channel', minimum_live_viewers = 0
where game_id = '00000000-0000-0000-0000-000000000201';

update public.game_discord_channels
set destination = 'https://discord.com/api/webhooks/beta/channel', minimum_live_viewers = 100
where game_id = '00000000-0000-0000-0000-000000000202';

insert into public.mentions(
  id, game_id, workspace_id, platform, external_id, creator_name, title, url, detected_at
) values (
  '00000000-0000-0000-0000-000000000501',
  '00000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000101',
  'youtube',
  'alpha-youtube',
  'AlphaCreator',
  'Alpha video',
  'https://youtube.com/watch?v=alpha',
  now()
);

-- Beta below its own 100-viewer threshold must not enter the Discord queue.
insert into public.mentions(
  id, game_id, workspace_id, platform, external_id, creator_name, title, url, viewer_count, detected_at
) values (
  '00000000-0000-0000-0000-000000000502',
  '00000000-0000-0000-0000-000000000202',
  '00000000-0000-0000-0000-000000000101',
  'twitch',
  'beta-low',
  'BetaLow',
  'Beta low stream',
  'https://twitch.tv/beta-low',
  50,
  now()
);

-- Beta above its own threshold must be queued.
insert into public.mentions(
  id, game_id, workspace_id, platform, external_id, creator_name, title, url, viewer_count, detected_at
) values (
  '00000000-0000-0000-0000-000000000503',
  '00000000-0000-0000-0000-000000000202',
  '00000000-0000-0000-0000-000000000101',
  'twitch',
  'beta-high',
  'BetaHigh',
  'Beta high stream',
  'https://twitch.tv/beta-high',
  150,
  now()
);

do $$
begin
  if not exists (select 1 from public.delivered_notifications where mention_id = '00000000-0000-0000-0000-000000000501') then
    raise exception 'Alpha YouTube alert was not queued.';
  end if;
  if exists (select 1 from public.delivered_notifications where mention_id = '00000000-0000-0000-0000-000000000502') then
    raise exception 'Beta below-threshold Twitch alert was queued.';
  end if;
  if not exists (select 1 from public.delivered_notifications where mention_id = '00000000-0000-0000-0000-000000000503') then
    raise exception 'Beta above-threshold Twitch alert was not queued.';
  end if;
end;
$$;

create temporary table discord_claims as
select * from public.claim_discord_deliveries(10, 120);

do $$
begin
  if (select destination from discord_claims where mention_id = '00000000-0000-0000-0000-000000000501')
     <> 'https://discord.com/api/webhooks/alpha/channel' then
    raise exception 'Alpha alert did not resolve to Alpha webhook.';
  end if;

  if (select destination from discord_claims where mention_id = '00000000-0000-0000-0000-000000000503')
     <> 'https://discord.com/api/webhooks/beta/channel' then
    raise exception 'Beta alert did not resolve to Beta webhook.';
  end if;
end;
$$;

-- Removing Alpha's child mapping must stop Alpha only and leave Beta configured.
delete from public.game_discord_channels
where workspace_id = '00000000-0000-0000-0000-000000000101'
  and game_id = '00000000-0000-0000-0000-000000000201';

insert into public.mentions(
  id, game_id, workspace_id, platform, external_id, creator_name, title, url, detected_at
) values (
  '00000000-0000-0000-0000-000000000504',
  '00000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000101',
  'youtube',
  'alpha-after-remove',
  'AlphaCreator',
  'Alpha after remove',
  'https://youtube.com/watch?v=alpha-after-remove',
  now()
);

insert into public.mentions(
  id, game_id, workspace_id, platform, external_id, creator_name, title, url, detected_at
) values (
  '00000000-0000-0000-0000-000000000505',
  '00000000-0000-0000-0000-000000000202',
  '00000000-0000-0000-0000-000000000101',
  'youtube',
  'beta-after-alpha-remove',
  'BetaCreator',
  'Beta after Alpha remove',
  'https://youtube.com/watch?v=beta-after-alpha-remove',
  now()
);

do $$
begin
  if exists (select 1 from public.delivered_notifications where mention_id = '00000000-0000-0000-0000-000000000504') then
    raise exception 'Alpha still queued after its Discord mapping was removed.';
  end if;
  if not exists (select 1 from public.delivered_notifications where mention_id = '00000000-0000-0000-0000-000000000505') then
    raise exception 'Removing Alpha Discord mapping also disabled Beta.';
  end if;
  if not exists (
    select 1 from public.game_discord_channels
    where game_id = '00000000-0000-0000-0000-000000000202'
      and destination = 'https://discord.com/api/webhooks/beta/channel'
  ) then
    raise exception 'Beta Discord mapping was altered when Alpha was removed.';
  end if;
end;
$$;

-- Child routing data must stay inaccessible to browser roles.
do $$
begin
  if has_table_privilege('anon', 'public.game_discord_channels', 'SELECT') then
    raise exception 'Anon can read per-game Discord destinations.';
  end if;
  if has_table_privilege('authenticated', 'public.game_discord_channels', 'SELECT') then
    raise exception 'Authenticated users can read per-game Discord destinations directly.';
  end if;
  if not has_table_privilege('service_role', 'public.game_discord_channels', 'SELECT') then
    raise exception 'Service role cannot read per-game Discord destinations.';
  end if;
end;
$$;

select 'per-game Discord PostgreSQL regression passed' as result;
SQL

docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d gamesignal_test <"$SQL"
