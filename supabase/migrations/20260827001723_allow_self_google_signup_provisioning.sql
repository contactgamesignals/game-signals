-- Complete deferred Google OAuth signup without requiring a Vercel service-role secret.
-- The RPC remains SECURITY DEFINER, but an authenticated caller may provision only their
-- own account. Google identity and current legal-version checks remain enforced inside
-- the database transaction.

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
  if auth.uid() is null or auth.uid() is distinct from p_user_id then
    raise exception 'Authenticated user may only complete their own Google signup.'
      using errcode = '42501';
  end if;

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

revoke all on function public.complete_google_oauth_signup(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.complete_google_oauth_signup(uuid, text, text) to authenticated;

comment on function public.complete_google_oauth_signup(uuid, text, text) is
  'Idempotent deferred Google OAuth provisioning. Authenticated callers may complete only their own account after current Terms and Privacy acceptance.';
