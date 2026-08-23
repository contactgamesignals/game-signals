create or replace function private.reserve_deleted_active_game_slot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not old.enabled then
    return old;
  end if;

  perform 1
  from public.workspaces
  where id = old.workspace_id
  for update;

  -- A workspace cascade deletes its games after the parent workspace is already
  -- disappearing. In that path there is no reusable slot to reserve, and trying
  -- to insert a cooldown would violate the workspace foreign key.
  if not found then
    return old;
  end if;

  delete from private.game_slot_cooldowns
  where workspace_id = old.workspace_id
    and expires_at <= now();

  insert into private.game_slot_cooldowns (
    workspace_id,
    source_game_id,
    source_game_title,
    expires_at
  ) values (
    old.workspace_id,
    old.id,
    old.title,
    now() + interval '12 hours'
  )
  on conflict (source_game_id) do nothing;

  return old;
end;
$$;

revoke all on function private.reserve_deleted_active_game_slot() from public, anon, authenticated;
