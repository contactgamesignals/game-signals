-- Harden RLS helper functions and keep webhook destinations server-only.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = auth.uid()
  );
$$;

create or replace function private.can_manage_workspace(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

revoke all on function private.is_workspace_member(uuid) from public, anon;
revoke all on function private.can_manage_workspace(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_workspace_member(uuid) to authenticated, service_role;
grant execute on function private.can_manage_workspace(uuid) to authenticated, service_role;

-- Rebuild policies to use private helpers and init-plan auth.uid() where applicable.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select
using (id = (select auth.uid()));

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update
using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists "workspaces_select_member" on public.workspaces;
create policy "workspaces_select_member" on public.workspaces for select using (private.is_workspace_member(id));
drop policy if exists "workspaces_insert_owner" on public.workspaces;
create policy "workspaces_insert_owner" on public.workspaces for insert with check (owner_id = (select auth.uid()));
drop policy if exists "workspaces_update_manager" on public.workspaces;
create policy "workspaces_update_manager" on public.workspaces for update using (private.can_manage_workspace(id)) with check (private.can_manage_workspace(id));

drop policy if exists "members_select_member" on public.workspace_members;
create policy "members_select_member" on public.workspace_members for select using (private.is_workspace_member(workspace_id));
drop policy if exists "members_insert_manager" on public.workspace_members;
create policy "members_insert_manager" on public.workspace_members for insert with check (private.can_manage_workspace(workspace_id));
drop policy if exists "members_update_manager" on public.workspace_members;
create policy "members_update_manager" on public.workspace_members for update using (private.can_manage_workspace(workspace_id)) with check (private.can_manage_workspace(workspace_id));
drop policy if exists "members_delete_manager" on public.workspace_members;
create policy "members_delete_manager" on public.workspace_members for delete using (private.can_manage_workspace(workspace_id));

drop policy if exists "subscriptions_select_member" on public.subscriptions;
create policy "subscriptions_select_member" on public.subscriptions for select using (private.is_workspace_member(workspace_id));

drop policy if exists "games_select_member" on public.games;
create policy "games_select_member" on public.games for select using (private.is_workspace_member(workspace_id));
drop policy if exists "games_insert_member" on public.games;
create policy "games_insert_member" on public.games for insert with check (private.is_workspace_member(workspace_id));
drop policy if exists "games_update_member" on public.games;
create policy "games_update_member" on public.games for update using (private.is_workspace_member(workspace_id)) with check (private.is_workspace_member(workspace_id));
drop policy if exists "games_delete_manager" on public.games;
create policy "games_delete_manager" on public.games for delete using (private.can_manage_workspace(workspace_id));

drop policy if exists "aliases_select_member" on public.game_aliases;
create policy "aliases_select_member" on public.game_aliases for select using (
  exists (select 1 from public.games where games.id = game_aliases.game_id and private.is_workspace_member(games.workspace_id))
);
drop policy if exists "aliases_insert_member" on public.game_aliases;
create policy "aliases_insert_member" on public.game_aliases for insert with check (
  exists (select 1 from public.games where games.id = game_aliases.game_id and private.is_workspace_member(games.workspace_id))
);
drop policy if exists "aliases_update_member" on public.game_aliases;
create policy "aliases_update_member" on public.game_aliases for update using (
  exists (select 1 from public.games where games.id = game_aliases.game_id and private.is_workspace_member(games.workspace_id))
) with check (
  exists (select 1 from public.games where games.id = game_aliases.game_id and private.is_workspace_member(games.workspace_id))
);
drop policy if exists "aliases_delete_member" on public.game_aliases;
create policy "aliases_delete_member" on public.game_aliases for delete using (
  exists (select 1 from public.games where games.id = game_aliases.game_id and private.is_workspace_member(games.workspace_id))
);

drop policy if exists "mentions_select_member" on public.mentions;
create policy "mentions_select_member" on public.mentions for select using (
  exists (select 1 from public.games where games.id = mentions.game_id and private.is_workspace_member(games.workspace_id))
);

drop policy if exists "channels_select_member" on public.notification_channels;
create policy "channels_select_member" on public.notification_channels for select using (private.is_workspace_member(workspace_id));
drop policy if exists "channels_insert_manager" on public.notification_channels;
create policy "channels_insert_manager" on public.notification_channels for insert with check (private.can_manage_workspace(workspace_id));
drop policy if exists "channels_update_manager" on public.notification_channels;
create policy "channels_update_manager" on public.notification_channels for update using (private.can_manage_workspace(workspace_id)) with check (private.can_manage_workspace(workspace_id));
drop policy if exists "channels_delete_manager" on public.notification_channels;
create policy "channels_delete_manager" on public.notification_channels for delete using (private.can_manage_workspace(workspace_id));

drop policy if exists "deliveries_select_member" on public.delivered_notifications;
create policy "deliveries_select_member" on public.delivered_notifications for select using (
  exists (
    select 1 from public.notification_channels channel
    where channel.id = delivered_notifications.notification_channel_id
      and private.is_workspace_member(channel.workspace_id)
  )
);

drop policy if exists "scan_runs_select_member" on public.scan_runs;
create policy "scan_runs_select_member" on public.scan_runs for select using (
  game_id is not null and exists (
    select 1 from public.games where games.id = scan_runs.game_id and private.is_workspace_member(games.workspace_id)
  )
);

-- Destination values may contain Discord webhook secrets; keep the table server-only.
revoke all on public.notification_channels from authenticated;

-- Public helper functions are no longer needed after policies are migrated.
drop function if exists public.is_workspace_member(uuid);
drop function if exists public.can_manage_workspace(uuid);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
