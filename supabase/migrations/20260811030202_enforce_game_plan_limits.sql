create or replace function public.game_limit_for_plan(input_plan public.subscription_plan)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select case input_plan
    when 'free' then 1
    when 'indie' then 3
    when 'studio' then 10
    when 'publisher' then 50
  end;
$$;

create or replace function public.enforce_workspace_game_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_plan public.subscription_plan;
  current_count integer;
  allowed_count integer;
begin
  select coalesce(s.plan, 'free'::public.subscription_plan)
    into current_plan
  from public.workspaces w
  left join public.subscriptions s on s.workspace_id = w.id
  where w.id = new.workspace_id;

  if current_plan is null then
    current_plan := 'free'::public.subscription_plan;
  end if;

  allowed_count := public.game_limit_for_plan(current_plan);

  select count(*)::integer
    into current_count
  from public.games g
  where g.workspace_id = new.workspace_id;

  if current_count >= allowed_count then
    raise exception 'Game limit reached for plan % (% games).', current_plan, allowed_count
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_workspace_game_limit() from public, anon, authenticated;
grant execute on function public.enforce_workspace_game_limit() to postgres, service_role;

revoke all on function public.game_limit_for_plan(public.subscription_plan) from public, anon;
grant execute on function public.game_limit_for_plan(public.subscription_plan) to authenticated, service_role;

drop trigger if exists enforce_workspace_game_limit_before_insert on public.games;
create trigger enforce_workspace_game_limit_before_insert
before insert on public.games
for each row execute function public.enforce_workspace_game_limit();

create unique index if not exists games_workspace_lower_title_key
on public.games (workspace_id, lower(title));
