#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER="gamesignal-retention-$RANDOM-$RANDOM"
TMP_DIR="$(mktemp -d)"
SQL="$TMP_DIR/retention-test.sql"
trap 'docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; rm -rf "$TMP_DIR"' EXIT

docker run -d --rm \
  --name "$CONTAINER" \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=gamesignal_test \
  postgres:17-alpine >/dev/null

ready_streak=0
for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" pg_isready -U postgres -d gamesignal_test >/dev/null 2>&1; then
    ready_streak=$((ready_streak + 1))
    if [ "$ready_streak" -ge 3 ]; then
      break
    fi
  else
    ready_streak=0
  fi
  sleep 0.5
done

if [ "$ready_streak" -lt 3 ]; then
  echo "PostgreSQL did not become stably ready for the financial retention test." >&2
  docker logs "$CONTAINER" >&2 || true
  exit 2
fi

cat >"$SQL" <<'SQL'
\set ON_ERROR_STOP on

create extension if not exists pgcrypto;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema auth;
create schema private;

create table auth.users (
  id uuid primary key
);

create type public.subscription_plan as enum ('free', 'indie', 'studio', 'publisher');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'canceled', 'incomplete');
create type public.billing_buyer_type as enum ('individual', 'company');
create type public.billing_adjustment_type as enum ('credit_note', 'refund_total');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.workspaces (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscriptions (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  plan public.subscription_plan not null default 'free',
  status public.subscription_status not null default 'trialing',
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.billing_checkout_consents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  buyer_type public.billing_buyer_type not null,
  plan public.subscription_plan not null,
  billing_period text not null,
  terms_version text not null,
  privacy_version text not null,
  terms_accepted boolean not null,
  recurring_billing_accepted boolean not null,
  immediate_service_requested boolean not null default false,
  stripe_checkout_session_id text,
  user_agent text,
  created_at timestamptz not null default now()
);

create table public.billing_invoice_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  checkout_consent_id uuid references public.billing_checkout_consents(id) on delete set null,
  stripe_invoice_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.billing_adjustment_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  adjustment_type public.billing_adjustment_type not null,
  stripe_object_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (adjustment_type, stripe_object_id)
);

create table public.billing_location_evidence (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  stripe_charge_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.billing_dispute_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  stripe_dispute_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.billing_vies_evidence (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  country_code text not null,
  vat_number text not null,
  checked_at timestamptz not null default now()
);

insert into auth.users(id) values ('00000000-0000-0000-0000-000000000001');
insert into public.workspaces(id, owner_id, name)
values ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', 'Retention test');
insert into public.subscriptions(workspace_id, stripe_customer_id, stripe_subscription_id, plan, status)
values ('00000000-0000-0000-0000-000000000101', 'cus_retention_test', 'sub_retention_test', 'studio', 'canceled');

insert into public.billing_checkout_consents(
  id, workspace_id, user_id, buyer_type, plan, billing_period,
  terms_version, privacy_version, terms_accepted, recurring_billing_accepted
) values (
  '00000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000001',
  'company', 'studio', 'monthly', 'test-terms', 'test-privacy', true, true
);

insert into public.billing_invoice_records(workspace_id, checkout_consent_id, stripe_invoice_id)
values ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201', 'in_retention_test');
insert into public.billing_adjustment_records(workspace_id, adjustment_type, stripe_object_id)
values ('00000000-0000-0000-0000-000000000101', 'refund_total', 'ch_retention_test');
insert into public.billing_location_evidence(workspace_id, stripe_charge_id)
values ('00000000-0000-0000-0000-000000000101', 'ch_location_test');
insert into public.billing_dispute_records(workspace_id, stripe_dispute_id)
values ('00000000-0000-0000-0000-000000000101', 'dp_retention_test');
insert into public.billing_vies_evidence(workspace_id, country_code, vat_number)
values ('00000000-0000-0000-0000-000000000101', 'DE', '100');
SQL

cat "$ROOT_DIR/supabase/migrations/20260814140000_preserve_financial_records_after_account_deletion.sql" >>"$SQL"
cat "$ROOT_DIR/supabase/migrations/20260814140500_harden_billing_archive_internal_triggers.sql" >>"$SQL"

cat >>"$SQL" <<'SQL'

-- Verify the backfill before deletion.
do $$
declare
  v_account uuid;
begin
  select id into v_account
  from public.billing_accounts
  where workspace_reference = '00000000-0000-0000-0000-000000000101';

  if v_account is null then raise exception 'Billing account backfill failed.'; end if;
  if (select billing_account_id from public.billing_invoice_records where stripe_invoice_id = 'in_retention_test') <> v_account then
    raise exception 'Invoice billing account backfill failed.';
  end if;
  if (select billing_account_id from public.billing_checkout_consents where id = '00000000-0000-0000-0000-000000000201') <> v_account then
    raise exception 'Consent billing account backfill failed.';
  end if;
end;
$$;

-- Mimic Supabase Auth admin deletion. The original workspace must cascade away.
delete from auth.users where id = '00000000-0000-0000-0000-000000000001';

do $$
declare
  v_account uuid;
  v_workspace uuid;
  v_deleted timestamptz;
begin
  if exists (select 1 from public.workspaces where id = '00000000-0000-0000-0000-000000000101') then
    raise exception 'Workspace did not delete.';
  end if;
  if exists (select 1 from public.subscriptions where workspace_id = '00000000-0000-0000-0000-000000000101') then
    raise exception 'Product subscription row did not delete.';
  end if;

  select id, workspace_id, account_deleted_at
    into v_account, v_workspace, v_deleted
  from public.billing_accounts
  where workspace_reference = '00000000-0000-0000-0000-000000000101';

  if v_account is null then raise exception 'Billing account was deleted.'; end if;
  if v_workspace is not null then raise exception 'Billing account remained attached to deleted workspace.'; end if;
  if v_deleted is null then raise exception 'Billing account was not marked deleted.'; end if;

  if (select count(*) from public.billing_invoice_records where stripe_invoice_id = 'in_retention_test') <> 1 then
    raise exception 'Invoice was cascade-deleted.';
  end if;
  if (select count(*) from public.billing_adjustment_records where stripe_object_id = 'ch_retention_test') <> 1 then
    raise exception 'Adjustment was cascade-deleted.';
  end if;
  if (select count(*) from public.billing_location_evidence where stripe_charge_id = 'ch_location_test') <> 1 then
    raise exception 'Location evidence was cascade-deleted.';
  end if;
  if (select count(*) from public.billing_dispute_records where stripe_dispute_id = 'dp_retention_test') <> 1 then
    raise exception 'Dispute was cascade-deleted.';
  end if;
  if (select count(*) from public.billing_vies_evidence where country_code = 'DE' and vat_number = '100') <> 1 then
    raise exception 'VIES evidence was cascade-deleted.';
  end if;

  if (select workspace_id from public.billing_checkout_consents where id = '00000000-0000-0000-0000-000000000201') is not null then
    raise exception 'Consent retained deleted workspace_id.';
  end if;
  if (select user_id from public.billing_checkout_consents where id = '00000000-0000-0000-0000-000000000201') is not null then
    raise exception 'Consent retained deleted auth user_id.';
  end if;

  -- A late seller-side Stripe record can be stored without recreating product workspace data.
  insert into public.billing_adjustment_records(
    billing_account_id, workspace_id, adjustment_type, stripe_object_id
  ) values (
    v_account, null, 'refund_total', 'ch_post_delete_test'
  );

  if (select count(*) from public.billing_adjustment_records where stripe_object_id = 'ch_post_delete_test' and workspace_id is null) <> 1 then
    raise exception 'Post-deletion financial evidence insert failed.';
  end if;
end;
$$;

-- The service-side resolver must still find the archive after the product rows are gone.
do $$
declare
  v_account uuid;
begin
  select billing_account_id into v_account
  from public.resolve_billing_account_from_stripe('cus_retention_test', null);
  if v_account is null then
    raise exception 'Stripe customer could not resolve retained billing account.';
  end if;
end;
$$;

select 'GameSignal financial retention cascade regression passed.' as result;
SQL

docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d gamesignal_test <"$SQL"
