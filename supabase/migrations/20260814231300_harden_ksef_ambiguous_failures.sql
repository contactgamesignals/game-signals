-- A timeout after sending an invoice is ambiguous: KSeF might have accepted the
-- document even if GameSignal did not receive the response. Never turn such a
-- pending attempt into a fresh retry automatically. Only an authoritative
-- rejection may move the document to `failed` and make a new attempt eligible.

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
  if doc.lifecycle_status = 'ksef_pending' then
    raise exception 'Existing KSeF attempt is pending and must be reconciled before any retry.';
  end if;
  if doc.lifecycle_status not in ('ready_for_issue', 'failed') then
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

create or replace function public.record_seller_document_ksef_reconciliation_error(
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
  safe_error := left(btrim(coalesce(p_error, 'KSeF attempt requires reconciliation.')), 4000);

  update public.billing_seller_documents d
  set ksef_status_code = coalesce(p_status_code, d.ksef_status_code),
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

revoke all on function public.start_seller_document_ksef_attempt(uuid, text)
from public, anon, authenticated;
revoke all on function public.record_seller_document_ksef_reconciliation_error(uuid, text, text, integer)
from public, anon, authenticated;

grant execute on function public.start_seller_document_ksef_attempt(uuid, text)
to service_role;
grant execute on function public.record_seller_document_ksef_reconciliation_error(uuid, text, text, integer)
to service_role;

comment on function public.fail_seller_document_ksef_attempt(uuid, text, text, integer) is
  'Use only after an authoritative KSeF rejection proves the frozen document can be retried. Ambiguous transport/timeouts must remain ksef_pending and use reconciliation instead.';
