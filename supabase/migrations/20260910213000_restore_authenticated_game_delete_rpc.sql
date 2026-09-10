-- Delete a game through the caller's authenticated session without requiring a
-- Supabase service-role key in the web application. Authorization is enforced
-- again inside the SECURITY DEFINER function so the API route is not the only gate.
create or replace function public.delete_workspace_game(p_game_id uuid)
returns table (
  id uuid,
  workspace_id uuid,
  title text,
  enabled boolean
)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '30s'
as $$
declare
  v_user_id uuid := auth.uid();
  v_workspace_id uuid;
begin
  if v_user_id is null then
    raise exception 'GAME_DELETE_UNAUTHORIZED' using errcode = '42501';
  end if;

  select g.workspace_id
    into v_workspace_id
  from public.games g
  where g.id = p_game_id;

  if not found then
    return;
  end if;

  if not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = v_workspace_id
      and wm.user_id = v_user_id
      and wm.role::text in ('owner', 'admin')
  ) then
    raise exception 'GAME_DELETE_FORBIDDEN' using errcode = '42501';
  end if;

  return query
  delete from public.games g
  where g.id = p_game_id
  returning g.id, g.workspace_id, g.title, g.enabled;
end;
$$;

revoke all on function public.delete_workspace_game(uuid) from public, anon, service_role;
grant execute on function public.delete_workspace_game(uuid) to authenticated;

comment on function public.delete_workspace_game(uuid) is
  'Deletes one game for an authenticated workspace owner/admin with a bounded timeout; does not require web-app service-role credentials.';

notify pgrst, 'reload schema';
