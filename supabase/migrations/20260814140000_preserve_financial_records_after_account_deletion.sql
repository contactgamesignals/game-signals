-- Preserve seller-side billing/accounting evidence independently from the user's
-- product workspace. Account deletion may remove Auth/workspace/monitoring data, but
-- it must not cascade-delete invoices, adjustments or checkout evidence that the
-- seller may need for accounting, tax, disputes or legal claims.
--
-- This migration is deliberately additive/forward-only. Existing financial rows are
-- backfilled to an internal billing account before any FK is changed.

create table public.billing_accounts (
  id uuid primary key default gen_random_uuid(),
  -- Immutable internal reference to the workspace that originally created this billing account.
  -- It is intentionally NOT a foreign key so it survives workspace deletion without retaining
  -- the workspace row itself.
  workspace_reference uuid not null unique,
  -- Live product link. Becomes NULL when the workspace is deleted.
  workspace_id uuid unique references public.workspaces(id) on delete set null,
  -- Stable Stripe-side routing needed for post-deletion refunds/disputes/webhook evidence.
  stripe_customer_id text unique,
  latest_stripe_subscription_id text unique,
  account_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index billing_accounts_deleted_idx
  on public.billing_accounts(account_deleted_at)
  where account_deleted_at is not null;

create trigger billing_accounts_set_updated_at before update on public.billing_accounts
for each row execute function public.set_updated_at();

alter table public.billing_accounts enable row level security;

-- Internal seller/accounting state only. Product users keep access to their invoice/export
-- rows through the existing workspace-scoped policies while the workspace exists.
revoke all on public.billing_accounts from anon, authenticated;
grant select, insert, update, delete on public.billing_accounts to service_role;

-- Create an internal billing account for every existing workspace. This is intentionally
-- broader than only already-paid workspaces so old and new billing functions can rely on
-- the mapping without races at first Checkout.
insert into public.billing_accounts (
  workspace_reference,
  workspace_id,
  stripe_customer_id,
  latest_stripe_subscription_id
)
select
  w.id,
  w.id,
  s.stripe_customer_id,
  s.stripe_subscription_id
from public.workspaces w
left join public.subscriptions s on s.workspace_id = w.id
on conflict (workspace_reference) do update
set workspace_id = excluded.workspace_id,
    stripe_customer_id = coalesce(excluded.stripe_customer_id, public.billing_accounts.stripe_customer_id),
    latest_stripe_subscription_id = coalesce(excluded.latest_stripe_subscription_id, public.billing_accounts.latest_stripe_subscription_id),
    updated_at = now();

create or replace function private.ensure_billing_account_for_workspace()
returns trigger
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
begin
  insert into public.billing_accounts (workspace_reference, workspace_id)
  values (new.id, new.id)
  on conflict (workspace_reference) do update
  set workspace_id = excluded.workspace_id,
      updated_at = now();
  return new;
end;
$$;

revoke all on function private.ensure_billing_account_for_workspace() from public, anon, authenticated;
grant execute on function private.ensure_billing_account_for_workspace() to service_role;

drop trigger if exists ensure_billing_account_after_workspace_insert on public.workspaces;
create trigger ensure_billing_account_after_workspace_insert
after insert on public.workspaces
for each row execute function private.ensure_billing_account_for_workspace();

create or replace function private.sync_billing_account_from_subscription()
returns trigger
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
begin
  insert into public.billing_accounts (
    workspace_reference,
    workspace_id,
    stripe_customer_id,
    latest_stripe_subscription_id
  ) values (
    new.workspace_id,
    new.workspace_id,
    new.stripe_customer_id,
    new.stripe_subscription_id
  )
  on conflict (workspace_reference) do update
  set workspace_id = excluded.workspace_id,
      stripe_customer_id = coalesce(excluded.stripe_customer_id, public.billing_accounts.stripe_customer_id),
      latest_stripe_subscription_id = coalesce(excluded.latest_stripe_subscription_id, public.billing_accounts.latest_stripe_subscription_id),
      updated_at = now();
  return new;
end;
$$;

revoke all on function private.sync_billing_account_from_subscription() from public, anon, authenticated;
grant execute on function private.sync_billing_account_from_subscription() to service_role;

drop trigger if exists sync_billing_account_after_subscription on public.subscriptions;
create trigger sync_billing_account_after_subscription
after insert or update of stripe_customer_id, stripe_subscription_id on public.subscriptions
for each row execute function private.sync_billing_account_from_subscription();

-- Add the durable billing-account reference to all retained financial/evidence tables.
alter table public.billing_invoice_records
  add column if not exists billing_account_id uuid references public.billing_accounts(id) on delete restrict;
alter table public.billing_adjustment_records
  add column if not exists billing_account_id uuid references public.billing_accounts(id) on delete restrict;
alter table public.billing_checkout_consents
  add column if not exists billing_account_id uuid references public.billing_accounts(id) on delete restrict;
alter table public.billing_location_evidence
  add column if not exists billing_account_id uuid references public.billing_accounts(id) on delete restrict;
alter table public.billing_dispute_records
  add column if not exists billing_account_id uuid references public.billing_accounts(id) on delete restrict;
alter table public.billing_vies_evidence
  add column if not exists billing_account_id uuid references public.billing_accounts(id) on delete restrict;

update public.billing_invoice_records r
set billing_account_id = a.id
from public.billing_accounts a
where r.billing_account_id is null
  and r.workspace_id = a.workspace_reference;

update public.billing_adjustment_records r
set billing_account_id = a.id
from public.billing_accounts a
where r.billing_account_id is null
  and r.workspace_id = a.workspace_reference;

update public.billing_checkout_consents r
set billing_account_id = a.id
from public.billing_accounts a
where r.billing_account_id is null
  and r.workspace_id = a.workspace_reference;

update public.billing_location_evidence r
set billing_account_id = a.id
from public.billing_accounts a
where r.billing_account_id is null
  and r.workspace_id = a.workspace_reference;

update public.billing_dispute_records r
set billing_account_id = a.id
from public.billing_accounts a
where r.billing_account_id is null
  and r.workspace_id = a.workspace_reference;

update public.billing_vies_evidence r
set billing_account_id = a.id
from public.billing_accounts a
where r.billing_account_id is null
  and r.workspace_id = a.workspace_reference;

-- Every retained financial/evidence row must have a durable seller-side owner.
alter table public.billing_invoice_records alter column billing_account_id set not null;
alter table public.billing_adjustment_records alter column billing_account_id set not null;
alter table public.billing_checkout_consents alter column billing_account_id set not null;
alter table public.billing_location_evidence alter column billing_account_id set not null;
alter table public.billing_dispute_records alter column billing_account_id set not null;
alter table public.billing_vies_evidence alter column billing_account_id set not null;

create index billing_invoice_records_billing_account_idx on public.billing_invoice_records(billing_account_id, created_at desc);
create index billing_adjustment_records_billing_account_idx on public.billing_adjustment_records(billing_account_id, created_at desc);
create index billing_checkout_consents_billing_account_idx on public.billing_checkout_consents(billing_account_id, created_at desc);
create index billing_location_evidence_billing_account_idx on public.billing_location_evidence(billing_account_id, created_at desc);
create index billing_dispute_records_billing_account_idx on public.billing_dispute_records(billing_account_id, created_at desc);
create index billing_vies_evidence_billing_account_idx on public.billing_vies_evidence(billing_account_id, checked_at desc);

-- Old v7/v10 and the draft v8/v11 write workspace_id. This trigger attaches the durable
-- billing account automatically, so the migration is compatible during a controlled
-- function cutover and billing_account_id can remain NOT NULL from day one.
create or replace function private.attach_billing_account_to_financial_record()
returns trigger
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
begin
  if new.billing_account_id is null and new.workspace_id is not null then
    select a.id
      into new.billing_account_id
    from public.billing_accounts a
    where a.workspace_reference = new.workspace_id;
  end if;

  if new.billing_account_id is null then
    raise exception 'A durable billing account is required for retained financial evidence.';
  end if;

  return new;
end;
$$;

revoke all on function private.attach_billing_account_to_financial_record() from public, anon, authenticated;
grant execute on function private.attach_billing_account_to_financial_record() to service_role;

drop trigger if exists attach_billing_account_invoice on public.billing_invoice_records;
create trigger attach_billing_account_invoice
before insert or update of workspace_id, billing_account_id on public.billing_invoice_records
for each row execute function private.attach_billing_account_to_financial_record();

drop trigger if exists attach_billing_account_adjustment on public.billing_adjustment_records;
create trigger attach_billing_account_adjustment
before insert or update of workspace_id, billing_account_id on public.billing_adjustment_records
for each row execute function private.attach_billing_account_to_financial_record();

drop trigger if exists attach_billing_account_consent on public.billing_checkout_consents;
create trigger attach_billing_account_consent
before insert or update of workspace_id, billing_account_id on public.billing_checkout_consents
for each row execute function private.attach_billing_account_to_financial_record();

drop trigger if exists attach_billing_account_location on public.billing_location_evidence;
create trigger attach_billing_account_location
before insert or update of workspace_id, billing_account_id on public.billing_location_evidence
for each row execute function private.attach_billing_account_to_financial_record();

drop trigger if exists attach_billing_account_dispute on public.billing_dispute_records;
create trigger attach_billing_account_dispute
before insert or update of workspace_id, billing_account_id on public.billing_dispute_records
for each row execute function private.attach_billing_account_to_financial_record();

drop trigger if exists attach_billing_account_vies on public.billing_vies_evidence;
create trigger attach_billing_account_vies
before insert or update of workspace_id, billing_account_id on public.billing_vies_evidence
for each row execute function private.attach_billing_account_to_financial_record();

-- Detach retained evidence from deletable product/auth rows instead of cascading it.
alter table public.billing_invoice_records alter column workspace_id drop not null;
alter table public.billing_adjustment_records alter column workspace_id drop not null;
alter table public.billing_checkout_consents alter column workspace_id drop not null;
alter table public.billing_checkout_consents alter column user_id drop not null;
alter table public.billing_location_evidence alter column workspace_id drop not null;
alter table public.billing_dispute_records alter column workspace_id drop not null;
alter table public.billing_vies_evidence alter column workspace_id drop not null;

alter table public.billing_invoice_records drop constraint if exists billing_invoice_records_workspace_id_fkey;
alter table public.billing_invoice_records
  add constraint billing_invoice_records_workspace_id_fkey
  foreign key (workspace_id) references public.workspaces(id) on delete set null;

alter table public.billing_adjustment_records drop constraint if exists billing_adjustment_records_workspace_id_fkey;
alter table public.billing_adjustment_records
  add constraint billing_adjustment_records_workspace_id_fkey
  foreign key (workspace_id) references public.workspaces(id) on delete set null;

alter table public.billing_checkout_consents drop constraint if exists billing_checkout_consents_workspace_id_fkey;
alter table public.billing_checkout_consents
  add constraint billing_checkout_consents_workspace_id_fkey
  foreign key (workspace_id) references public.workspaces(id) on delete set null;

alter table public.billing_checkout_consents drop constraint if exists billing_checkout_consents_user_id_fkey;
alter table public.billing_checkout_consents
  add constraint billing_checkout_consents_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

alter table public.billing_location_evidence drop constraint if exists billing_location_evidence_workspace_id_fkey;
alter table public.billing_location_evidence
  add constraint billing_location_evidence_workspace_id_fkey
  foreign key (workspace_id) references public.workspaces(id) on delete set null;

alter table public.billing_dispute_records drop constraint if exists billing_dispute_records_workspace_id_fkey;
alter table public.billing_dispute_records
  add constraint billing_dispute_records_workspace_id_fkey
  foreign key (workspace_id) references public.workspaces(id) on delete set null;

alter table public.billing_vies_evidence drop constraint if exists billing_vies_evidence_workspace_id_fkey;
alter table public.billing_vies_evidence
  add constraint billing_vies_evidence_workspace_id_fkey
  foreign key (workspace_id) references public.workspaces(id) on delete set null;

-- Mark the seller-side billing account as archived before the product workspace disappears.
create or replace function private.archive_billing_account_before_workspace_delete()
returns trigger
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
begin
  update public.billing_accounts a
  set workspace_id = null,
      account_deleted_at = coalesce(a.account_deleted_at, now()),
      updated_at = now()
  where a.workspace_reference = old.id;
  return old;
end;
$$;

revoke all on function private.archive_billing_account_before_workspace_delete() from public, anon, authenticated;
grant execute on function private.archive_billing_account_before_workspace_delete() to service_role;

drop trigger if exists archive_billing_account_before_workspace_delete on public.workspaces;
create trigger archive_billing_account_before_workspace_delete
before delete on public.workspaces
for each row execute function private.archive_billing_account_before_workspace_delete();

-- Internal resolver for later Stripe events after the product workspace has been deleted.
create or replace function public.resolve_billing_account_from_stripe(
  p_stripe_customer_id text default null,
  p_stripe_subscription_id text default null
)
returns table (
  billing_account_id uuid,
  workspace_id uuid,
  workspace_reference uuid,
  account_deleted_at timestamptz
)
language sql
security invoker
set search_path = public, pg_temp
as $$
  select a.id, a.workspace_id, a.workspace_reference, a.account_deleted_at
  from public.billing_accounts a
  where (p_stripe_customer_id is not null and a.stripe_customer_id = p_stripe_customer_id)
     or (p_stripe_subscription_id is not null and a.latest_stripe_subscription_id = p_stripe_subscription_id)
  order by case when p_stripe_customer_id is not null and a.stripe_customer_id = p_stripe_customer_id then 0 else 1 end
  limit 1;
$$;

revoke all on function public.resolve_billing_account_from_stripe(text, text) from public, anon, authenticated;
grant execute on function public.resolve_billing_account_from_stripe(text, text) to service_role;
