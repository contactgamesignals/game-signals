#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER="gamesignal-contract-confirmation-$RANDOM-$RANDOM"
TMP_DIR="$(mktemp -d)"
SQL="$TMP_DIR/contract-confirmation-test.sql"
trap 'docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; rm -rf "$TMP_DIR"' EXIT

docker run -d --rm \
  --name "$CONTAINER" \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=gamesignal_test \
  postgres:17-alpine >/dev/null

for _ in $(seq 1 40); do
  if docker exec "$CONTAINER" pg_isready -U postgres -d gamesignal_test >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

docker exec "$CONTAINER" pg_isready -U postgres -d gamesignal_test >/dev/null

cat >"$SQL" <<'SQL'
\set ON_ERROR_STOP on

create schema extensions;
create extension pgcrypto with schema extensions;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema private;

create type public.subscription_plan as enum ('free', 'indie', 'studio', 'publisher');
create type public.billing_buyer_type as enum ('individual', 'company');

create table public.billing_accounts (
  id uuid primary key default extensions.gen_random_uuid()
);

create table public.billing_checkout_consents (
  id uuid primary key default extensions.gen_random_uuid(),
  billing_account_id uuid not null references public.billing_accounts(id) on delete restrict,
  buyer_type public.billing_buyer_type not null,
  plan public.subscription_plan not null,
  billing_period text not null,
  terms_version text not null,
  privacy_version text not null,
  terms_accepted boolean not null,
  recurring_billing_accepted boolean not null,
  immediate_service_requested boolean not null default false,
  stripe_checkout_session_id text unique,
  created_at timestamptz not null default now()
);

insert into public.billing_accounts(id)
values ('00000000-0000-4000-8000-000000000101');

insert into public.billing_checkout_consents(
  id, billing_account_id, buyer_type, plan, billing_period,
  terms_version, privacy_version, terms_accepted,
  recurring_billing_accepted, immediate_service_requested,
  stripe_checkout_session_id
) values (
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000101',
  'individual', 'indie', 'monthly',
  '2026-08-15-v3', '2026-08-15-v3', true, true, true,
  'cs_test_contract_confirmation'
);
SQL

cat "$ROOT_DIR/supabase/migrations/20260815133000_add_contract_confirmation_evidence.sql" >>"$SQL"

cat >>"$SQL" <<'SQL'

-- Product roles must not receive direct table privileges.
do $$
begin
  if has_table_privilege('anon', 'public.billing_contract_confirmations', 'SELECT') then
    raise exception 'anon unexpectedly has SELECT on contract confirmations.';
  end if;
  if has_table_privilege('authenticated', 'public.billing_contract_confirmations', 'SELECT') then
    raise exception 'authenticated unexpectedly has SELECT on contract confirmations.';
  end if;
  if not has_table_privilege('service_role', 'public.billing_contract_confirmations', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'service_role is missing contract-confirmation privileges.';
  end if;
end;
$$;

-- Insert one valid frozen confirmation.
with payload as (
  select repeat('GameSignal immutable contract confirmation. ', 5) as body
)
insert into public.billing_contract_confirmations(
  id,
  billing_account_id,
  checkout_consent_id,
  stripe_checkout_session_id,
  buyer_type,
  plan,
  billing_period,
  recipient_email,
  terms_version,
  privacy_version,
  withdrawal_version,
  confirmation_version,
  confirmation_text,
  confirmation_sha256,
  contract_concluded_at,
  source_stripe_event_id
)
select
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000201',
  'cs_test_contract_confirmation',
  'individual',
  'indie',
  'monthly',
  'buyer@example.test',
  '2026-08-15-v3',
  '2026-08-15-v3',
  '2026-08-15-v1',
  '2026-08-15-v1',
  body,
  encode(extensions.digest(convert_to(body, 'UTF8'), 'sha256'), 'hex'),
  now(),
  'evt_contract_confirmation_test'
from payload;

-- An incorrect application-provided digest must be rejected by PostgreSQL.
do $$
begin
  begin
    insert into public.billing_contract_confirmations(
      billing_account_id, checkout_consent_id, buyer_type, plan, billing_period,
      recipient_email, terms_version, privacy_version, withdrawal_version,
      confirmation_version, confirmation_text, confirmation_sha256,
      contract_concluded_at
    ) values (
      '00000000-0000-4000-8000-000000000101',
      extensions.gen_random_uuid(),
      'company', 'studio', 'yearly',
      'other@example.test', 't', 'p', 'w', 'c',
      repeat('Wrong hash confirmation text. ', 5), repeat('0', 64), now()
    );
    raise exception 'Wrong confirmation hash was accepted.';
  exception
    when foreign_key_violation then
      raise exception 'Hash regression reached FK validation before hash verification.';
    when others then
      if sqlerrm = 'Wrong confirmation hash was accepted.' then raise; end if;
      if position('SHA-256 does not match' in sqlerrm) = 0 then raise; end if;
  end;
end;
$$;

-- Frozen contract/legal content cannot be edited after insert.
do $$
begin
  begin
    update public.billing_contract_confirmations
    set confirmation_text = confirmation_text || ' tampered'
    where id = '00000000-0000-4000-8000-000000000301';
    raise exception 'Frozen confirmation text was mutable.';
  exception
    when others then
      if sqlerrm = 'Frozen confirmation text was mutable.' then raise; end if;
      if position('immutable' in lower(sqlerrm)) = 0 then raise; end if;
  end;
end;
$$;

-- Delivery metadata may advance without changing the frozen payload.
update public.billing_contract_confirmations
set delivery_status = 'delivered',
    delivery_attempts = 1,
    last_attempt_at = now(),
    delivered_at = now(),
    provider_message_id = 'resend_test_message',
    last_error = null
where id = '00000000-0000-4000-8000-000000000301';

do $$
declare
  stored_hash text;
  actual_hash text;
begin
  select confirmation_sha256,
         encode(extensions.digest(convert_to(confirmation_text, 'UTF8'), 'sha256'), 'hex')
    into stored_hash, actual_hash
  from public.billing_contract_confirmations
  where id = '00000000-0000-4000-8000-000000000301';

  if stored_hash <> actual_hash then raise exception 'Stored confirmation hash changed.'; end if;
  if (select delivery_status from public.billing_contract_confirmations where id = '00000000-0000-4000-8000-000000000301') <> 'delivered' then
    raise exception 'Delivery status did not advance.';
  end if;
end;
$$;

-- Delivered evidence cannot be moved back to pending/failed.
do $$
begin
  begin
    update public.billing_contract_confirmations
    set delivery_status = 'pending'
    where id = '00000000-0000-4000-8000-000000000301';
    raise exception 'Delivered confirmation was reverted.';
  exception
    when others then
      if sqlerrm = 'Delivered confirmation was reverted.' then raise; end if;
      if position('cannot return' in lower(sqlerrm)) = 0 then raise; end if;
  end;
end;
$$;

select 'GameSignal contract confirmation PostgreSQL regression passed.' as result;
SQL

docker cp "$SQL" "$CONTAINER:/tmp/contract-confirmation-test.sql"
docker exec "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d gamesignal_test -f /tmp/contract-confirmation-test.sql
