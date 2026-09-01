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

# The official Postgres image starts a temporary Unix-socket server during
# initialization and then restarts into the final server. Waiting on the socket
# can therefore report ready just before that temporary server shuts down. The
# final server listens on TCP, so require several consecutive TCP-ready checks.
ready_streak=0
for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" pg_isready -h 127.0.0.1 -U postgres -d gamesignal_test >/dev/null 2>&1; then
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
  echo "PostgreSQL did not become stably ready for the contract-confirmation test." >&2
  docker logs "$CONTAINER" >&2 || true
  exit 2
fi

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
) values
(
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000101',
  'individual', 'indie', 'monthly',
  '2026-08-15-v3', '2026-08-15-v3', true, true, true,
  'cs_test_contract_confirmation_1'
),
(
  '00000000-0000-4000-8000-000000000202',
  '00000000-0000-4000-8000-000000000101',
  'company', 'studio', 'yearly',
  '2026-08-15-v3', '2026-08-15-v3', true, true, false,
  'cs_test_contract_confirmation_2'
);
SQL

cat "$ROOT_DIR/supabase/migrations/20260815133000_add_contract_confirmation_evidence.sql" >>"$SQL"
cat "$ROOT_DIR/supabase/migrations/20260815143000_add_contract_confirmation_delivery_state.sql" >>"$SQL"

cat >>"$SQL" <<'SQL'

-- Product roles must not receive direct table or delivery-RPC privileges.
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
  if has_function_privilege('anon', 'public.claim_billing_contract_confirmations_for_delivery(integer)', 'EXECUTE') then
    raise exception 'anon unexpectedly has claim RPC execute privilege.';
  end if;
  if has_function_privilege('authenticated', 'public.transition_billing_contract_confirmation_delivery(uuid,text,text,text,text)', 'EXECUTE') then
    raise exception 'authenticated unexpectedly has transition RPC execute privilege.';
  end if;
  if not has_function_privilege('service_role', 'public.claim_billing_contract_confirmations_for_delivery(integer)', 'EXECUTE') then
    raise exception 'service_role is missing claim RPC execute privilege.';
  end if;
end;
$$;

-- Insert two valid frozen confirmations including exact seller snapshots.
with payloads(id, consent_id, session_id, buyer_type, plan, period, email, body) as (
  values
  (
    '00000000-0000-4000-8000-000000000301'::uuid,
    '00000000-0000-4000-8000-000000000201'::uuid,
    'cs_test_contract_confirmation_1',
    'individual'::public.billing_buyer_type,
    'indie'::public.subscription_plan,
    'monthly',
    'buyer@example.test',
    repeat('GameSignal immutable contract confirmation one. ', 5)
  ),
  (
    '00000000-0000-4000-8000-000000000302'::uuid,
    '00000000-0000-4000-8000-000000000202'::uuid,
    'cs_test_contract_confirmation_2',
    'company'::public.billing_buyer_type,
    'studio'::public.subscription_plan,
    'yearly',
    'studio@example.test',
    repeat('GameSignal immutable contract confirmation two. ', 5)
  )
)
insert into public.billing_contract_confirmations(
  id, billing_account_id, checkout_consent_id, stripe_checkout_session_id,
  seller_profile_key, seller_legal_name, seller_nip,
  seller_registered_address, seller_country_code,
  buyer_type, plan, billing_period, recipient_email,
  terms_version, privacy_version, withdrawal_version, confirmation_version,
  confirmation_text, confirmation_sha256, contract_concluded_at,
  source_stripe_event_id
)
select
  id,
  '00000000-0000-4000-8000-000000000101',
  consent_id,
  session_id,
  'lumino_games_20260814',
  'Lumino Games sp. z o.o.',
  '6762600090',
  'ul. Kazimierza Morawskiego 5/127, 30-102 Kraków, Poland',
  'PL',
  buyer_type,
  plan,
  period,
  email,
  '2026-08-15-v3',
  '2026-08-15-v3',
  '2026-08-15-v1',
  '2026-08-15-v1',
  body,
  encode(extensions.digest(convert_to(body, 'UTF8'), 'sha256'), 'hex'),
  now(),
  'evt_contract_confirmation_' || right(id::text, 3)
from payloads;

-- An incorrect application-provided digest must be rejected by PostgreSQL.
do $$
begin
  begin
    insert into public.billing_contract_confirmations(
      billing_account_id, checkout_consent_id,
      seller_profile_key, seller_legal_name, seller_nip,
      seller_registered_address, seller_country_code,
      buyer_type, plan, billing_period,
      recipient_email, terms_version, privacy_version, withdrawal_version,
      confirmation_version, confirmation_text, confirmation_sha256,
      contract_concluded_at
    ) values (
      '00000000-0000-4000-8000-000000000101',
      extensions.gen_random_uuid(),
      'seller_test', 'Seller Test sp. z o.o.', '6762600090',
      'Test address 1, Kraków, Poland', 'PL',
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

-- Frozen contract/legal and seller content cannot be edited after insert.
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

  begin
    update public.billing_contract_confirmations
    set seller_legal_name = 'Different seller sp. z o.o.'
    where id = '00000000-0000-4000-8000-000000000301';
    raise exception 'Frozen seller snapshot was mutable.';
  exception
    when others then
      if sqlerrm = 'Frozen seller snapshot was mutable.' then raise; end if;
      if position('immutable' in lower(sqlerrm)) = 0 then raise; end if;
  end;
end;
$$;

-- Claim is atomic and advances only pending/retryable records to sending.
do $$
declare
  claimed_count integer;
begin
  select count(*) into claimed_count
  from public.claim_billing_contract_confirmations_for_delivery(10);
  if claimed_count <> 2 then raise exception 'Expected two claimed confirmations, got %.', claimed_count; end if;

  if exists (
    select 1 from public.billing_contract_confirmations
    where id in ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000302')
      and (delivery_status <> 'sending' or delivery_attempts <> 1)
  ) then
    raise exception 'Claim did not persist sending/attempt state.';
  end if;
end;
$$;

-- Wrong immutable hash cannot transition an in-flight record.
do $$
begin
  if public.transition_billing_contract_confirmation_delivery(
    '00000000-0000-4000-8000-000000000301', repeat('0', 64), 'delivered', 'provider_wrong_hash', null
  ) then
    raise exception 'Transition accepted a wrong confirmation hash.';
  end if;
end;
$$;

-- First record is authoritatively delivered.
do $$
declare
  digest text;
begin
  select confirmation_sha256 into digest
  from public.billing_contract_confirmations
  where id = '00000000-0000-4000-8000-000000000301';

  if not public.transition_billing_contract_confirmation_delivery(
    '00000000-0000-4000-8000-000000000301', digest, 'delivered', 'resend_test_message', null
  ) then
    raise exception 'Delivered transition did not update exactly one record.';
  end if;
end;
$$;

-- Second record gets one explicit retryable outcome, is claimed once more, and
-- then becomes needs_review after an ambiguous provider/network outcome.
do $$
declare
  digest text;
  claimed_id uuid;
begin
  select confirmation_sha256 into digest
  from public.billing_contract_confirmations
  where id = '00000000-0000-4000-8000-000000000302';

  if not public.transition_billing_contract_confirmation_delivery(
    '00000000-0000-4000-8000-000000000302', digest, 'retryable', null, 'HTTP 503 from provider'
  ) then
    raise exception 'Retryable transition did not update exactly one record.';
  end if;

  select id into claimed_id
  from public.claim_billing_contract_confirmations_for_delivery(1);
  if claimed_id <> '00000000-0000-4000-8000-000000000302' then
    raise exception 'Retryable confirmation was not reclaimed deterministically.';
  end if;

  if not public.transition_billing_contract_confirmation_delivery(
    '00000000-0000-4000-8000-000000000302', digest, 'needs_review', null, 'Ambiguous network timeout after POST began'
  ) then
    raise exception 'needs_review transition did not update exactly one record.';
  end if;
end;
$$;

-- delivered and needs_review are both excluded from automatic claims.
do $$
declare
  remaining integer;
begin
  select count(*) into remaining
  from public.claim_billing_contract_confirmations_for_delivery(10);
  if remaining <> 0 then raise exception 'Unsafe delivery states were automatically reclaimed.'; end if;

  if (select delivery_status from public.billing_contract_confirmations where id = '00000000-0000-4000-8000-000000000301') <> 'delivered' then
    raise exception 'First confirmation is not delivered.';
  end if;
  if (select delivery_status from public.billing_contract_confirmations where id = '00000000-0000-4000-8000-000000000302') <> 'needs_review' then
    raise exception 'Second confirmation is not held for manual review.';
  end if;
  if (select delivery_attempts from public.billing_contract_confirmations where id = '00000000-0000-4000-8000-000000000302') <> 2 then
    raise exception 'Second confirmation attempt count is wrong.';
  end if;
end;
$$;

-- Delivered evidence cannot be moved back to another state through raw update.
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

-- Frozen text/seller hash remains exact after all delivery transitions.
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
  if (select seller_legal_name from public.billing_contract_confirmations where id = '00000000-0000-4000-8000-000000000301') <> 'Lumino Games sp. z o.o.' then
    raise exception 'Seller snapshot changed.';
  end if;
end;
$$;

select 'GameSignal contract confirmation delivery-state PostgreSQL regression passed.' as result;
SQL

docker cp "$SQL" "$CONTAINER:/tmp/contract-confirmation-test.sql"
docker exec "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d gamesignal_test -f /tmp/contract-confirmation-test.sql
