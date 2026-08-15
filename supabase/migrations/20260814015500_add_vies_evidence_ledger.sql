-- EU VIES verification evidence for Company billing review.
-- Additive only. A VIES result is evidence; this table never decides VAT,
-- reverse charge, or customer taxable-person status by itself.

create table public.billing_vies_evidence (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  stripe_invoice_id text,
  stripe_customer_id text,
  target_country_code text not null check (char_length(target_country_code) = 2),
  target_vat_number text not null,
  requester_country_code text check (requester_country_code is null or char_length(requester_country_code) = 2),
  requester_vat_number text,
  verification_status text not null default 'pending' check (verification_status in ('pending', 'valid', 'invalid', 'unavailable')),
  request_date timestamptz,
  request_identifier text,
  returned_name text,
  returned_address text,
  match_evidence jsonb not null default '{}'::jsonb,
  audit_strength text not null default 'validity_only' check (audit_strength in ('validity_only', 'request_identifier_present')),
  checked_at timestamptz,
  last_error text,
  needs_accounting_review boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, stripe_invoice_id, target_country_code, target_vat_number)
);

create index billing_vies_evidence_workspace_created_idx
  on public.billing_vies_evidence(workspace_id, created_at desc);

create index billing_vies_evidence_invoice_idx
  on public.billing_vies_evidence(stripe_invoice_id)
  where stripe_invoice_id is not null;

create trigger billing_vies_evidence_set_updated_at before update on public.billing_vies_evidence
for each row execute function public.set_updated_at();

alter table public.billing_vies_evidence enable row level security;

create policy "billing_vies_evidence_select_manager"
on public.billing_vies_evidence
for select
to authenticated
using (private.can_manage_workspace(workspace_id));

revoke all on public.billing_vies_evidence from anon;
revoke insert, update, delete on public.billing_vies_evidence from authenticated;
grant select on public.billing_vies_evidence to authenticated;
grant select, insert, update, delete on public.billing_vies_evidence to service_role;
