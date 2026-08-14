-- Privacy-minimal location evidence for cross-border billing review.
-- Additive only. This table intentionally does NOT store card number, last4,
-- fingerprint, raw IP address, or other payment credentials.

create table public.billing_location_evidence (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  stripe_charge_id text not null unique,
  stripe_payment_intent_id text,
  stripe_customer_id text,
  billing_country text check (billing_country is null or char_length(billing_country) = 2),
  payment_method_country text check (payment_method_country is null or char_length(payment_method_country) = 2),
  payment_method_type text,
  evidence_consistency text not null check (evidence_consistency in ('match', 'mismatch', 'insufficient')),
  evidence_source text not null default 'stripe_charge' check (evidence_source = 'stripe_charge'),
  livemode boolean not null default false,
  charge_created_at timestamptz,
  last_stripe_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index billing_location_evidence_workspace_created_idx
  on public.billing_location_evidence(workspace_id, charge_created_at desc);

create index billing_location_evidence_customer_idx
  on public.billing_location_evidence(stripe_customer_id)
  where stripe_customer_id is not null;

create trigger billing_location_evidence_set_updated_at before update on public.billing_location_evidence
for each row execute function public.set_updated_at();

alter table public.billing_location_evidence enable row level security;

create policy "billing_location_evidence_select_manager"
on public.billing_location_evidence
for select
to authenticated
using (private.can_manage_workspace(workspace_id));

revoke all on public.billing_location_evidence from anon;
revoke insert, update, delete on public.billing_location_evidence from authenticated;
grant select on public.billing_location_evidence to authenticated;
grant select, insert, update, delete on public.billing_location_evidence to service_role;
