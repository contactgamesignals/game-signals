-- Preserve both sides of a KSeF 440 duplicate event. The current attempt's
-- session/invoice references stay in ksef_session_reference /
-- ksef_invoice_reference. The original accepted invoice is recorded separately
-- so accounting evidence never pretends the acceptance came from the duplicate
-- attempt.

alter table public.billing_seller_documents
  add column if not exists ksef_original_session_reference text,
  add column if not exists ksef_original_invoice_reference text,
  add column if not exists ksef_duplicate_status_code integer,
  add column if not exists ksef_duplicate_detected_at timestamptz;

alter table public.billing_seller_documents
  drop constraint if exists billing_seller_documents_ksef_duplicate_evidence_check;
alter table public.billing_seller_documents
  add constraint billing_seller_documents_ksef_duplicate_evidence_check
  check (
    (
      ksef_original_session_reference is null
      and ksef_original_invoice_reference is null
      and ksef_duplicate_status_code is null
      and ksef_duplicate_detected_at is null
    )
    or
    (
      nullif(btrim(ksef_original_session_reference), '') is not null
      and nullif(btrim(ksef_original_invoice_reference), '') is not null
      and ksef_duplicate_status_code = 440
      and ksef_duplicate_detected_at is not null
      and lifecycle_status = 'ksef_accepted'
      and ksef_status_code = 200
      and nullif(btrim(ksef_reference_number), '') is not null
      and ksef_upo_xml is not null
      and ksef_upo_sha256 is not null
      and ksef_upo_received_at is not null
    )
  );

create or replace function public.accept_seller_document_ksef_duplicate(
  p_document_id uuid,
  p_expected_fa3_sha256 text,
  p_original_session_reference text,
  p_original_invoice_reference text,
  p_ksef_reference_number text,
  p_duplicate_status_code integer,
  p_accepted_status_code integer,
  p_upo_xml text,
  p_upo_sha256 text,
  p_accepted_at timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = public, extensions, pg_temp
as $$
declare
  affected integer;
  normalized_upo_hash text;
  actual_upo_hash text;
begin
  if p_duplicate_status_code <> 440 then
    raise exception 'Duplicate reconciliation requires KSeF status 440.';
  end if;
  if p_accepted_status_code <> 200 then
    raise exception 'Original duplicate invoice must have accepted KSeF status 200.';
  end if;
  if nullif(btrim(coalesce(p_original_session_reference, '')), '') is null then
    raise exception 'Original KSeF session reference is required.';
  end if;
  if nullif(btrim(coalesce(p_original_invoice_reference, '')), '') is null then
    raise exception 'Original KSeF invoice reference is required.';
  end if;
  if nullif(btrim(coalesce(p_ksef_reference_number, '')), '') is null then
    raise exception 'Original KSeF number is required.';
  end if;
  if p_upo_xml is null or p_upo_xml = '' or p_accepted_at is null then
    raise exception 'Original UPO XML and acceptance timestamp are required.';
  end if;

  normalized_upo_hash := lower(btrim(coalesce(p_upo_sha256, '')));
  if normalized_upo_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'UPO SHA-256 must be a 64-character lowercase hex digest.';
  end if;

  actual_upo_hash := encode(extensions.digest(convert_to(p_upo_xml, 'UTF8'), 'sha256'), 'hex');
  if normalized_upo_hash <> actual_upo_hash then
    raise exception 'UPO SHA-256 does not match the supplied original UPO XML bytes.';
  end if;

  update public.billing_seller_documents d
  set lifecycle_status = 'ksef_accepted',
      ksef_original_session_reference = btrim(p_original_session_reference),
      ksef_original_invoice_reference = btrim(p_original_invoice_reference),
      ksef_duplicate_status_code = p_duplicate_status_code,
      ksef_duplicate_detected_at = now(),
      ksef_reference_number = btrim(p_ksef_reference_number),
      ksef_status_code = p_accepted_status_code,
      ksef_accepted_at = p_accepted_at,
      ksef_upo_xml = p_upo_xml,
      ksef_upo_sha256 = normalized_upo_hash,
      ksef_upo_received_at = now(),
      last_error = null,
      updated_at = now()
  where d.id = p_document_id
    and d.source_livemode is true
    and d.lifecycle_status = 'ksef_pending'
    and d.fa3_sha256 = lower(btrim(coalesce(p_expected_fa3_sha256, '')))
    and nullif(btrim(coalesce(d.ksef_session_reference, '')), '') is not null
    and nullif(btrim(coalesce(d.ksef_invoice_reference, '')), '') is not null
    and d.ksef_reference_number is null
    and d.ksef_accepted_at is null
    and d.ksef_original_session_reference is null
    and d.ksef_original_invoice_reference is null;

  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

revoke all on function public.accept_seller_document_ksef_duplicate(
  uuid, text, text, text, text, integer, integer, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.accept_seller_document_ksef_duplicate(
  uuid, text, text, text, text, integer, integer, text, text, timestamptz
) to service_role;

comment on function public.accept_seller_document_ksef_duplicate(
  uuid, text, text, text, text, integer, integer, text, text, timestamptz
) is
  'Atomically accepts a 440 duplicate only after the original session invoice was independently matched and accepted; preserves both duplicate-attempt and original-session evidence. Service-role only.';
