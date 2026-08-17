create table if not exists public.account_legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  accepted_at timestamptz not null default now(),
  source text not null default 'signup',
  constraint account_legal_acceptances_source_check check (source in ('signup')),
  constraint account_legal_acceptances_unique unique (user_id, terms_version, privacy_version, source)
);

alter table public.account_legal_acceptances enable row level security;
revoke all on table public.account_legal_acceptances from anon, authenticated;
grant select, insert, update, delete on table public.account_legal_acceptances to service_role;

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

  insert into public.profiles (id, email, display_name)
  values (new.id, coalesce(new.email, ''), preferred_name)
  on conflict (id) do nothing;

  if coalesce(new.raw_user_meta_data ->> 'terms_accepted', 'false') = 'true'
     and coalesce(new.raw_user_meta_data ->> 'privacy_acknowledged', 'false') = 'true'
     and accepted_terms_version is not null
     and acknowledged_privacy_version is not null then
    insert into public.account_legal_acceptances (user_id, terms_version, privacy_version, source)
    values (new.id, accepted_terms_version, acknowledged_privacy_version, 'signup')
    on conflict (user_id, terms_version, privacy_version, source) do nothing;
  end if;

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
