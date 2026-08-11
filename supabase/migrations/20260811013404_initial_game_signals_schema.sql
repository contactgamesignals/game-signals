-- GameSignal foundation schema
create extension if not exists pgcrypto;

create type public.workspace_role as enum ('owner', 'admin', 'member', 'viewer');
create type public.game_alias_type as enum ('include', 'exclude');
create type public.mention_platform as enum ('youtube', 'twitch', 'kick');
create type public.notification_channel_type as enum ('email', 'discord');
create type public.subscription_plan as enum ('free', 'indie', 'studio', 'publisher');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'canceled', 'incomplete');
create type public.scan_status as enum ('queued', 'running', 'success', 'failed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.workspace_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.subscriptions (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  plan public.subscription_plan not null default 'free',
  status public.subscription_status not null default 'trialing',
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 180),
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
  unique (workspace_id, title)
);

create index games_workspace_id_idx on public.games(workspace_id);
create index games_twitch_due_idx on public.games(twitch_next_scan_at) where enabled;
create index games_youtube_due_idx on public.games(youtube_next_scan_at) where enabled;

create table public.game_aliases (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  phrase text not null check (char_length(phrase) between 1 and 180),
  type public.game_alias_type not null default 'include',
  created_at timestamptz not null default now(),
  unique (game_id, phrase, type)
);

create table public.mentions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  platform public.mention_platform not null,
  external_id text not null,
  creator_external_id text,
  creator_name text not null,
  title text not null,
  url text not null,
  thumbnail_url text,
  viewer_count integer check (viewer_count is null or viewer_count >= 0),
  view_count bigint check (view_count is null or view_count >= 0),
  language text,
  published_at timestamptz,
  detected_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  signal_score integer not null default 0 check (signal_score between 0 and 100),
  raw_payload jsonb,
  unique (platform, external_id)
);

create index mentions_game_detected_idx on public.mentions(game_id, detected_at desc);
create index mentions_platform_detected_idx on public.mentions(platform, detected_at desc);

create table public.notification_channels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  type public.notification_channel_type not null,
  destination text not null,
  enabled boolean not null default true,
  minimum_signal_score integer not null default 0 check (minimum_signal_score between 0 and 100),
  minimum_live_viewers integer not null default 0 check (minimum_live_viewers >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.delivered_notifications (
  mention_id uuid not null references public.mentions(id) on delete cascade,
  notification_channel_id uuid not null references public.notification_channels(id) on delete cascade,
  delivered_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'delivered', 'failed')),
  error text,
  attempts integer not null default 0,
  primary key (mention_id, notification_channel_id)
);

create table public.scan_runs (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references public.games(id) on delete cascade,
  platform public.mention_platform not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status public.scan_status not null default 'running',
  results_count integer not null default 0,
  error text,
  metadata jsonb
);

create index scan_runs_game_started_idx on public.scan_runs(game_id, started_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger workspaces_set_updated_at before update on public.workspaces
for each row execute function public.set_updated_at();
create trigger subscriptions_set_updated_at before update on public.subscriptions
for each row execute function public.set_updated_at();
create trigger games_set_updated_at before update on public.games
for each row execute function public.set_updated_at();
create trigger notification_channels_set_updated_at before update on public.notification_channels
for each row execute function public.set_updated_at();

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace_id and user_id = auth.uid()
  );
$$;

create or replace function public.can_manage_workspace(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  workspace_id uuid;
  preferred_name text;
begin
  preferred_name := coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1));

  insert into public.profiles (id, email, display_name)
  values (new.id, coalesce(new.email, ''), preferred_name)
  on conflict (id) do nothing;

  insert into public.workspaces (owner_id, name)
  values (new.id, preferred_name || '''s workspace')
  returning id into workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (workspace_id, new.id, 'owner');

  insert into public.subscriptions (workspace_id, plan, status)
  values (workspace_id, 'free', 'trialing');

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.subscriptions enable row level security;
alter table public.games enable row level security;
alter table public.game_aliases enable row level security;
alter table public.mentions enable row level security;
alter table public.notification_channels enable row level security;
alter table public.delivered_notifications enable row level security;
alter table public.scan_runs enable row level security;

create policy "profiles_select_own" on public.profiles for select using (id = auth.uid());
create policy "profiles_update_own" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy "workspaces_select_member" on public.workspaces for select using (public.is_workspace_member(id));
create policy "workspaces_insert_owner" on public.workspaces for insert with check (owner_id = auth.uid());
create policy "workspaces_update_manager" on public.workspaces for update using (public.can_manage_workspace(id)) with check (public.can_manage_workspace(id));

create policy "members_select_member" on public.workspace_members for select using (public.is_workspace_member(workspace_id));
create policy "members_insert_manager" on public.workspace_members for insert with check (public.can_manage_workspace(workspace_id));
create policy "members_update_manager" on public.workspace_members for update using (public.can_manage_workspace(workspace_id)) with check (public.can_manage_workspace(workspace_id));
create policy "members_delete_manager" on public.workspace_members for delete using (public.can_manage_workspace(workspace_id));

create policy "subscriptions_select_member" on public.subscriptions for select using (public.is_workspace_member(workspace_id));

create policy "games_select_member" on public.games for select using (public.is_workspace_member(workspace_id));
create policy "games_insert_member" on public.games for insert with check (public.is_workspace_member(workspace_id));
create policy "games_update_member" on public.games for update using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "games_delete_manager" on public.games for delete using (public.can_manage_workspace(workspace_id));

create policy "aliases_select_member" on public.game_aliases for select using (
  exists (select 1 from public.games where games.id = game_aliases.game_id and public.is_workspace_member(games.workspace_id))
);
create policy "aliases_insert_member" on public.game_aliases for insert with check (
  exists (select 1 from public.games where games.id = game_aliases.game_id and public.is_workspace_member(games.workspace_id))
);
create policy "aliases_update_member" on public.game_aliases for update using (
  exists (select 1 from public.games where games.id = game_aliases.game_id and public.is_workspace_member(games.workspace_id))
) with check (
  exists (select 1 from public.games where games.id = game_aliases.game_id and public.is_workspace_member(games.workspace_id))
);
create policy "aliases_delete_member" on public.game_aliases for delete using (
  exists (select 1 from public.games where games.id = game_aliases.game_id and public.is_workspace_member(games.workspace_id))
);

create policy "mentions_select_member" on public.mentions for select using (
  exists (select 1 from public.games where games.id = mentions.game_id and public.is_workspace_member(games.workspace_id))
);

create policy "channels_select_member" on public.notification_channels for select using (public.is_workspace_member(workspace_id));
create policy "channels_insert_manager" on public.notification_channels for insert with check (public.can_manage_workspace(workspace_id));
create policy "channels_update_manager" on public.notification_channels for update using (public.can_manage_workspace(workspace_id)) with check (public.can_manage_workspace(workspace_id));
create policy "channels_delete_manager" on public.notification_channels for delete using (public.can_manage_workspace(workspace_id));

create policy "deliveries_select_member" on public.delivered_notifications for select using (
  exists (
    select 1 from public.notification_channels channel
    where channel.id = delivered_notifications.notification_channel_id
      and public.is_workspace_member(channel.workspace_id)
  )
);

create policy "scan_runs_select_member" on public.scan_runs for select using (
  game_id is not null and exists (
    select 1 from public.games where games.id = scan_runs.game_id and public.is_workspace_member(games.workspace_id)
  )
);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.workspaces to authenticated;
grant select, insert, update, delete on public.workspace_members to authenticated;
grant select on public.subscriptions to authenticated;
grant select, insert, update, delete on public.games to authenticated;
grant select, insert, update, delete on public.game_aliases to authenticated;
grant select on public.mentions to authenticated;
-- Discord webhook destinations are intentionally server-only.
revoke all on public.notification_channels from authenticated;
grant select on public.delivered_notifications to authenticated;
grant select on public.scan_runs to authenticated;


do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mentions'
  ) then
    alter publication supabase_realtime add table public.mentions;
  end if;
end $$;
