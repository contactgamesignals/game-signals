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

  insert into public.subscriptions (workspace_id, plan, status, stripe_status_raw)
  values (workspace_id, 'free', 'trialing', 'trialing');

  return new;
end;
$$;
