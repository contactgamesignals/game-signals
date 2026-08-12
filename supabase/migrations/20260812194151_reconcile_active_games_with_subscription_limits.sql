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
  if not new.enabled then
    return new;
  end if;

  perform 1
  from public.workspaces
  where id = new.workspace_id
  for update;

  select case
           when s.status in ('active'::public.subscription_status, 'trialing'::public.subscription_status)
             then coalesce(s.plan, 'free'::public.subscription_plan)
           else 'free'::public.subscription_plan
         end
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
  where g.workspace_id = new.workspace_id
    and g.enabled = true
    and (tg_op = 'INSERT' or g.id <> new.id);

  if current_count >= allowed_count then
    raise exception 'Active game limit reached for plan % (% games).', current_plan, allowed_count
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_workspace_game_limit_before_insert on public.games;
drop trigger if exists enforce_workspace_game_limit_before_write on public.games;

create trigger enforce_workspace_game_limit_before_write
before insert or update of enabled, workspace_id on public.games
for each row execute function public.enforce_workspace_game_limit();

create or replace function public.reconcile_workspace_active_game_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  effective_plan public.subscription_plan;
  allowed_count integer;
begin
  perform 1
  from public.workspaces
  where id = new.workspace_id
  for update;

  effective_plan := case
    when new.status in ('active'::public.subscription_status, 'trialing'::public.subscription_status)
      then coalesce(new.plan, 'free'::public.subscription_plan)
    else 'free'::public.subscription_plan
  end;
  allowed_count := public.game_limit_for_plan(effective_plan);

  with ranked as (
    select g.id,
           row_number() over (order by g.created_at asc, g.id asc) as position
    from public.games g
    where g.workspace_id = new.workspace_id
      and g.enabled = true
  )
  update public.games g
  set enabled = false
  from ranked r
  where g.id = r.id
    and r.position > allowed_count;

  return new;
end;
$$;

drop trigger if exists reconcile_workspace_active_game_limit_after_subscription on public.subscriptions;

create trigger reconcile_workspace_active_game_limit_after_subscription
after insert or update of plan, status on public.subscriptions
for each row execute function public.reconcile_workspace_active_game_limit();
