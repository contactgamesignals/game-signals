-- Durable KSeF submission state machine for already-numbered, frozen LIVE FA(3)
-- documents. Credentials/tokens are intentionally never stored here.
-- This branch artifact mirrors the SQL actually applied to Supabase; the
-- preflight-only invalid marker was never part of the live migration.

alter table public.billing_seller_documents
  add column if not exists ksef_attempt_count integer not null default 0,
  add column if not exists ksef_last_attempt_at timestamptz,
  add column if not exists ksef_upo_xml text,
  add column if not exists ksef_upo_sha256 text,
  add column if not exists ksef_upo_received_at timestamptz;

alter table public.billing_seller_documents
  drop constraint if exists billing_seller_documents_ksef_attempt_count_check;
alter table public.billing_seller_documents
  add constraint billing_seller_documents_ksef_attempt_count_check
  check (ksef_attempt_count >= 0);

alter table public.billing_seller_documents
  drop constraint if exists billing_seller_documents_ksef_upo_check;
alter table public.billing_seller_documents
  add constraint billing_seller_documents_ksef_upo_check
  check (
    (
      ksef_upo_xml is null
      and ksef_upo_sha256 is null
      and ksef_upo_received_at is null
    )
    or
    (
      ksef_upo_xml is not null
      and ksef_upo_sha256 ~ '^[0-9a-f]{64}$'
      and ksef_upo_received_at is not null
    )
  );

create or replace function public.start_seller_document_ksef_attempt(
  p_document_id uuid,
  p_expected_fa3_sha256 text
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  doc public.billing_seller_documents%rowtype;
  next_attempt integer;
begin
  select * into doc
  from public.billing_seller_documents
  where id = p_document_id
  for update;

  if not found then
    raise exception 'Seller document not found.';
  end if;
  if doc.source_livemode is not true then
    raise exception 'KSeF submission cannot start for a Stripe sandbox document.';
  end if;
  if doc.legal_document_number is null or doc.fa3_xml is null or doc.fa3_sha256 is null then
    raise exception 'Legal number and frozen FA(3) are required before KSeF submission.';
  end if;
  if lower(btrim(coalesce(p_expected_fa3_sha256, ''))) <> doc.fa3_sha256 then
    raise exception 'Expected FA(3) SHA-256 does not match the frozen document.';
  end if;
  if doc.lifecycle_status = 'ksef_accepted' then
    raise exception 'Seller document is already accepted by KSeF.';
  end if;
  if doc.lifecycle_status not in ('ready_for_issue', 'failed', 'ksef_pending') then
    raise exception 'Seller document is not eligible for a KSeF attempt.';
  end if;

  next_attempt := doc.ksef_attempt_count + 1;

  update public.billing_seller_documents
  set lifecycle_status = 'ksef_pending',
      ksef_attempt_count = next_attempt,
      ksef_last_attempt_at = now(),
      last_error = null,
      updated_at = now()
  where id = p_document_id;

  return next_attempt;
end;
$$;

create or replace function public.record_seller_document_ksef_references(
  p_document_id uuid,
  p_expected_fa3_sha256 text,
  p_session_reference text,
  p_invoice_reference text,
  p_status_code integer default null
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  affected integer;
begin
  if nullif(btrim(coalesce(p_session_reference, '')), '') is null then
    raise exception 'KSeF session reference is required.';
  end if;

  update public.billing_seller_documents d
  set ksef_session_reference = btrim(p_session_reference),
      ksef_invoice_reference = coalesce(nullif(btrim(coalesce(p_invoice_reference, '')), ''), d.ksef_invoice_reference),
      ksef_status_code = coalesce(p_status_code, d.ksef_status_code),
      updated_at = now()
  where d.id = p_document_id
    and d.source_livemode is true
    and d.lifecycle_status = 'ksef_pending'
    and d.fa3_sha256 = lower(btrim(coalesce(p_expected_fa3_sha256, '')));

  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

create or replace function public.fail_seller_document_ksef_attempt(
  p_document_id uuid,
  p_expected_fa3_sha256 text,
  p_error text,
  p_status_code integer default null
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  affected integer;
  safe_error text;
begin
  safe_error := left(btrim(coalesce(p_error, 'Unknown KSeF submission error.')), 4000);

  update public.billing_seller_documents d
  set lifecycle_status = 'failed',
      ksef_status_code = coalesce(p_status_code, d.ksef_status_code),
      last_error = safe_error,
      updated_at = now()
  where d.id = p_document_id
    and d.source_livemode is true
    and d.lifecycle_status = 'ksef_pending'
    and d.fa3_sha256 = lower(btrim(coalesce(p_expected_fa3_sha256, '')));

  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

create or replace function public.accept_seller_document_ksef(
  p_document_id uuid,
  p_expected_fa3_sha256 text,
  p_ksef_reference_number text,
  p_status_code integer,
  p_upo_xml text,
  p_upo_sha256 text,
  p_accepted_at timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  affected integer;
  normalized_upo_hash text;
  actual_upo_hash text;
begin
  if nullif(btrim(coalesce(p_ksef_reference_number, '')), '') is null then
    raise exception 'KSeF reference number is required.';
  end if;
  if p_upo_xml is null or p_upo_xml = '' or p_accepted_at is null then
    raise exception 'UPO XML and acceptance timestamp are required.';
  end if;

  normalized_upo_hash := lower(btrim(coalesce(p_upo_sha256, '')));
  if normalized_upo_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'UPO SHA-256 must be a 64-character lowercase hex digest.';
  end if;

  actual_upo_hash := encode(extensions.digest(convert_to(p_upo_xml, 'UTF8'), 'sha256'), 'hex');
  if normalized_upo_hash <> actual_upo_hash then
    raise exception 'UPO SHA-256 does not match the supplied UPO XML bytes.';
  end if;

  update public.billing_seller_documents d
  set lifecycle_status = 'ksef_accepted',
      ksef_reference_number = btrim(p_ksef_reference_number),
      ksef_status_code = p_status_code,
      ksef_accepted_at = p_accepted_at,
      ksef_upo_xml = p_upo_xml,
      ksef_upo_sha256 = normalized_upo_hash,
      ksef_upo_received_at = now(),
      last_error = null,
      updated_at = now()
  where d.id = p_document_id
    and d.source_livemode is true
    and d.lifecycle_status = 'ksef_pending'
    and d.fa3_sha256 = lower(btrim(coalesce(p_expected_fa3_sha256, '')));

  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

revoke all on function public.start_seller_document_ksef_attempt(uuid, text)
from public, anon, authenticated;
revoke all on function public.record_seller_document_ksef_references(uuid, text, text, text, integer)
from public, anon, authenticated;
revoke all on function public.fail_seller_document_ksef_attempt(uuid, text, text, integer)
from public, anon, authenticated;
revoke all on function public.accept_seller_document_ksef(uuid, text, text, integer, text, text, timestamptz)
from public, anon, authenticated;

grant execute on function public.start_seller_document_ksef_attempt(uuid, text) to service_role;
grant execute on function public.record_seller_document_ksef_references(uuid, text, text, text, integer) to service_role;
grant execute on function public.fail_seller_document_ksef_attempt(uuid, text, text, integer) to service_role;
grant execute on function public.accept_seller_document_ksef(uuid, text, text, integer, text, text, timestamptz) to service_role;
