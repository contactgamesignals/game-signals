create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  workspace_id uuid;
  preferred_name text;
  accepted_terms_version text;
  acknowledged_privacy_version text;
begin
  preferred_name := coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1));
  accepted_terms_version := nullif(trim(coalesce(new.raw_user_meta_data ->> 'terms_version', '')), '');
  acknowledged_privacy_version := nullif(trim(coalesce(new.raw_user_meta_data ->> 'privacy_version', '')), '');

  if coalesce(new.raw_user_meta_data ->> 'terms_accepted', 'false') <> 'true'
     or coalesce(new.raw_user_meta_data ->> 'privacy_acknowledged', 'false') <> 'true'
     or accepted_terms_version is distinct from '2026-08-17-v1'
     or acknowledged_privacy_version is distinct from '2026-08-17-v1' then
    raise exception 'Current Terms and Privacy Policy must be acknowledged before signup.';
  end if;

  insert into public.profiles (id, email, display_name)
  values (new.id, coalesce(new.email, ''), preferred_name)
  on conflict (id) do nothing;

  insert into public.account_legal_acceptances (user_id, terms_version, privacy_version, source)
  values (new.id, accepted_terms_version, acknowledged_privacy_version, 'signup')
  on conflict (user_id, terms_version, privacy_version, source) do nothing;

  insert into public.workspaces (owner_id, name)
  values (new.id, preferred_name || '''s workspace')
  returning id into workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (workspace_id, new.id, 'owner');

  insert into public.subscriptions (workspace_id, plan, status, stripe_status_raw, billing_provider)
  values (workspace_id, 'free', 'trialing', 'trialing', 'paddle');

  return new;
end;
$$;
