create or replace function public.game_limit_for_plan(input_plan public.subscription_plan)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select case input_plan
    when 'free' then 1
    when 'indie' then 1
    when 'studio' then 3
    when 'publisher' then 10
  end;
$$;
