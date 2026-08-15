-- Durable-medium contract confirmation evidence for paid distance contracts.
--
-- Checkout consent remains the audit record of what the user actively accepted.
-- This table serves a different purpose: preserve the exact contract/legal text
-- that was supplied for one concluded checkout and the evidence that this exact
-- immutable payload was delivered through a durable transactional channel.
--
-- The record is attached to the seller-side billing account so it survives
-- deletion of the product workspace/Auth user where legal retention requires it.
-- Seller identity is copied into immutable snapshot columns because the active
-- seller profile may legitimately change for future transactions.

create table public.billing_contract_confirmations (
  id uuid primary key default gen_random_uuid(),
  billing_account_id uuid not null references public.billing_accounts(id) on delete restrict,
  checkout_consent_id uuid not null unique references public.billing_checkout_consents(id) on delete restrict,
  stripe_checkout_session_id text unique,
  seller_profile_key text not null check (char_length(btrim(seller_profile_key)) between 1 and 120),
  seller_legal_name text not null check (char_length(btrim(seller_legal_name)) between 1 and 300),
  seller_nip text not null check (seller_nip ~ '^[0-9]{10}$'),
  seller_registered_address text not null check (char_length(btrim(seller_registered_address)) between 5 and 500),
  seller_country_code text not null check (seller_country_code ~ '^[A-Z]{2}$'),
  buyer_type public.billing_buyer_type not null,
  plan public.subscription_plan not null,
  billing_period text not null check (billing_period in ('monthly', 'yearly')),
  recipient_email text not null check (char_length(btrim(recipient_email)) between 3 and 320),
  terms_version text not null check (char_length(btrim(terms_version)) between 1 and 80),
  privacy_version text not null check (char_length(btrim(privacy_version)) between 1 and 80),
  withdrawal_version text not null check (char_length(btrim(withdrawal_version)) between 1 and 80),
  confirmation_version text not null check (char_length(btrim(confirmation_version)) between 1 and 80),
  confirmation_text text not null check (char_length(confirmation_text) between 100 and 200000),
  confirmation_sha256 text not null check (confirmation_sha256 ~ '^[0-9a-f]{64}$'),
  contract_concluded_at timestamptz not null,
  source_stripe_event_id text,
  delivery_status text not null default 'pending' check (delivery_status in ('pending', 'delivered', 'failed')),
  delivery_attempts integer not null default 0 check (delivery_attempts between 0 and 20),
  last_attempt_at timestamptz,
  delivered_at timestamptz,
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (delivery_status <> 'delivered' or delivered_at is not null)
);

create index billing_contract_confirmations_account_created_idx
  on public.billing_contract_confirmations(billing_account_id, created_at desc);
create index billing_contract_confirmations_pending_idx
  on public.billing_contract_confirmations(created_at)
  where delivery_status in ('pending', 'failed') and delivery_attempts < 5;

alter table public.billing_contract_confirmations enable row level security;

-- Seller-side legal evidence only. Product clients cannot read, insert, mutate
-- or delete the immutable confirmation record directly.
revoke all on public.billing_contract_confirmations from anon, authenticated;
grant select, insert, update, delete on public.billing_contract_confirmations to service_role;

create or replace function private.verify_billing_contract_confirmation_hash()
returns trigger
language plpgsql
security invoker
set search_path = public, extensions, pg_temp
as $$
declare
  actual_hash text;
begin
  actual_hash := encode(
    extensions.digest(convert_to(new.confirmation_text, 'UTF8'), 'sha256'),
    'hex'
  );

  if lower(btrim(new.confirmation_sha256)) <> actual_hash then
    raise exception 'Contract confirmation SHA-256 does not match confirmation_text bytes.';
  end if;

  new.confirmation_sha256 := actual_hash;
  return new;
end;
$$;

revoke all on function private.verify_billing_contract_confirmation_hash()
from public, anon, authenticated;
grant execute on function private.verify_billing_contract_confirmation_hash()
to service_role;

create trigger verify_billing_contract_confirmation_hash
before insert or update of confirmation_text, confirmation_sha256
on public.billing_contract_confirmations
for each row execute function private.verify_billing_contract_confirmation_hash();

create or replace function private.guard_billing_contract_confirmation_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  old_immutable jsonb;
  new_immutable jsonb;
begin
  old_immutable := to_jsonb(old) - array[
    'delivery_status',
    'delivery_attempts',
    'last_attempt_at',
    'delivered_at',
    'provider_message_id',
    'last_error',
    'updated_at'
  ];
  new_immutable := to_jsonb(new) - array[
    'delivery_status',
    'delivery_attempts',
    'last_attempt_at',
    'delivered_at',
    'provider_message_id',
    'last_error',
    'updated_at'
  ];

  if old_immutable is distinct from new_immutable then
    raise exception 'Frozen contract confirmation evidence is immutable.';
  end if;

  if new.delivery_attempts < old.delivery_attempts then
    raise exception 'Contract confirmation delivery attempts cannot decrease.';
  end if;

  if old.delivery_status = 'delivered' and new.delivery_status <> 'delivered' then
    raise exception 'Delivered contract confirmation cannot return to a non-delivered state.';
  end if;

  if new.delivery_status = 'delivered' and new.delivered_at is null then
    raise exception 'Delivered contract confirmation requires delivered_at.';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.guard_billing_contract_confirmation_update()
from public, anon, authenticated;
grant execute on function private.guard_billing_contract_confirmation_update()
to service_role;

create trigger guard_billing_contract_confirmation_update
before update on public.billing_contract_confirmations
for each row execute function private.guard_billing_contract_confirmation_update();

comment on table public.billing_contract_confirmations is
  'Immutable seller-side snapshot of one concluded paid contract/legal confirmation plus durable-medium delivery evidence. Product clients have no direct access.';
comment on column public.billing_contract_confirmations.seller_profile_key is
  'Identifier of the seller profile selected at contract conclusion; seller identity is additionally frozen in snapshot columns.';
comment on column public.billing_contract_confirmations.confirmation_sha256 is
  'SHA-256 of exact UTF-8 confirmation_text bytes, independently verified by PostgreSQL.';
comment on column public.billing_contract_confirmations.delivery_status is
  'Transactional durable-medium delivery state. Only delivery metadata may change after the record is frozen.';
