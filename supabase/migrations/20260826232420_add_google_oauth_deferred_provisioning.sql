-- Allow Google OAuth identities to authenticate before product provisioning, while keeping
-- email/password signup fail-closed on the current Terms and Privacy versions.
-- A brand-new Google user gets only a profile row from the auth trigger. The default
-- workspace, membership, legal evidence and free subscription are created atomically only
-- after the authenticated user accepts the current legal documents in the app.

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
  signup_enabled boolean;
  is_google_oauth boolean;
begin
  select coalesce(value = 'true', false)
    into signup_enabled
    from public.internal_settings
   where key = 'public_signup_enabled';

  if coalesce(signup_enabled, false) is not true then
    raise exception 'Public signup is temporarily closed while final launch contact information is configured.';
  end if;

  preferred_name := coalesce(
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'name', '')), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Creator'
  );

  is_google_oauth :=
    coalesce(new.raw_app_meta_data ->> 'provider', '') = 'google'
    or coalesce(new.raw_app_meta_data -> 'providers', '[]'::jsonb) ? 'google';

  if is_google_oauth then
    insert into public.profiles (id, email, display_name)
    values (new.id, coalesce(new.email, ''), preferred_name)
    on conflict (id) do nothing;

    return new;
  end if;

  accepted_terms_version := nullif(trim(coalesce(new.raw_user_meta_data ->> 'terms_version', '')), '');
  acknowledged_privacy_version := nullif(trim(coalesce(new.raw_user_meta_data ->> 'privacy_version', '')), '');

  if coalesce(new.raw_user_meta_data ->> 'terms_accepted', 'false') <> 'true'
     or coalesce(new.raw_user_meta_data ->> 'privacy_acknowledged', 'false') <> 'true'
     or accepted_terms_version is distinct from '2026-08-24-v2'
     or acknowledged_privacy_version is distinct from '2026-08-24-v2' then
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

create or replace function public.complete_google_oauth_signup(
  p_user_id uuid,
  p_terms_version text,
  p_privacy_version text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_user_meta jsonb;
  v_preferred_name text;
  v_workspace_id uuid;
begin
  if p_terms_version is distinct from '2026-08-24-v2'
     or p_privacy_version is distinct from '2026-08-24-v2' then
    raise exception 'Current Terms and Privacy Policy must be acknowledged before signup.';
  end if;

  select u.email, coalesce(u.raw_user_meta_data, '{}'::jsonb)
    into v_email, v_user_meta
    from auth.users u
   where u.id = p_user_id
   for update;

  if not found then
    raise exception 'Authenticated user not found.';
  end if;

  if not exists (
    select 1
      from auth.identities i
     where i.user_id = p_user_id
       and i.provider = 'google'
  ) then
    raise exception 'Google identity required for deferred signup completion.';
  end if;

  select wm.workspace_id
    into v_workspace_id
    from public.workspace_members wm
   where wm.user_id = p_user_id
   order by wm.created_at asc
   limit 1;

  if v_workspace_id is not null then
    return v_workspace_id;
  end if;

  v_preferred_name := coalesce(
    (
      select nullif(trim(coalesce(p.display_name, '')), '')
        from public.profiles p
       where p.id = p_user_id
    ),
    nullif(trim(coalesce(v_user_meta ->> 'display_name', '')), ''),
    nullif(trim(coalesce(v_user_meta ->> 'full_name', '')), ''),
    nullif(trim(coalesce(v_user_meta ->> 'name', '')), ''),
    nullif(split_part(coalesce(v_email, ''), '@', 1), ''),
    'Creator'
  );

  insert into public.profiles (id, email, display_name)
  values (p_user_id, coalesce(v_email, ''), v_preferred_name)
  on conflict (id) do nothing;

  insert into public.account_legal_acceptances (user_id, terms_version, privacy_version, source)
  values (p_user_id, p_terms_version, p_privacy_version, 'signup')
  on conflict (user_id, terms_version, privacy_version, source) do nothing;

  insert into public.workspaces (owner_id, name)
  values (p_user_id, v_preferred_name || '''s workspace')
  returning id into v_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace_id, p_user_id, 'owner');

  insert into public.subscriptions (workspace_id, plan, status, stripe_status_raw, billing_provider)
  values (v_workspace_id, 'free', 'trialing', 'trialing', 'paddle');

  return v_workspace_id;
end;
$$;

revoke all on function public.complete_google_oauth_signup(uuid, text, text) from public, anon, authenticated;
grant execute on function public.complete_google_oauth_signup(uuid, text, text) to service_role;

comment on function public.complete_google_oauth_signup(uuid, text, text) is
  'Service-role-only, idempotent provisioning step for a new Google OAuth user after current Terms and Privacy acceptance.';
