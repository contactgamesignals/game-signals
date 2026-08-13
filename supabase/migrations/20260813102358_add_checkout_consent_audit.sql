-- Auditable legal/billing consent record for GameSignal checkout.
create type public.billing_buyer_type as enum ('individual', 'company');

create table public.billing_checkout_consents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  buyer_type public.billing_buyer_type not null,
  plan public.subscription_plan not null,
  billing_period text not null check (billing_period in ('monthly', 'yearly')),
  terms_version text not null check (char_length(terms_version) between 1 and 80),
  privacy_version text not null check (char_length(privacy_version) between 1 and 80),
  terms_accepted boolean not null,
  recurring_billing_accepted boolean not null,
  immediate_service_requested boolean not null default false,
  stripe_checkout_session_id text unique,
  user_agent text,
  created_at timestamptz not null default now(),
  check (buyer_type = 'company' or immediate_service_requested)
);

create index billing_checkout_consents_workspace_created_idx
  on public.billing_checkout_consents(workspace_id, created_at desc);

alter table public.billing_checkout_consents enable row level security;

-- Consent evidence is server-managed. Clients cannot insert, edit or delete it.
revoke all on public.billing_checkout_consents from anon, authenticated;
grant select, insert, update, delete on public.billing_checkout_consents to service_role;
