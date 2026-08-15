-- Freeze the exact legal FA(3) bytes once a LIVE seller document has its own
-- legal number. KSeF retries must reuse the same XML instead of regenerating a
-- potentially different document after a code/config change.

alter table public.billing_seller_documents
  add column if not exists fa3_xml text,
  add column if not exists fa3_sha256 text,
  add column if not exists fa3_size_bytes bigint,
  add column if not exists fa3_generated_at timestamptz,
  add column if not exists fa3_generator_version text;

alter table public.billing_seller_documents
  drop constraint if exists billing_seller_documents_fa3_payload_check;

alter table public.billing_seller_documents
  add constraint billing_seller_documents_fa3_payload_check
  check (
    (
      fa3_xml is null
      and fa3_sha256 is null
      and fa3_size_bytes is null
      and fa3_generated_at is null
      and fa3_generator_version is null
    )
    or
    (
      fa3_xml is not null
      and fa3_sha256 ~ '^[0-9a-f]{64}$'
      and fa3_size_bytes is not null
      and fa3_size_bytes > 0
      and fa3_generated_at is not null
      and fa3_generator_version is not null
      and btrim(fa3_generator_version) <> ''
    )
  );

create or replace function public.freeze_seller_document_fa3(
  p_document_id uuid,
  p_fa3_xml text,
  p_fa3_sha256 text,
  p_fa3_size_bytes bigint,
  p_fa3_generated_at timestamptz,
  p_generator_version text
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  doc public.billing_seller_documents%rowtype;
  normalized_hash text;
  normalized_version text;
  actual_size bigint;
begin
  normalized_hash := lower(btrim(coalesce(p_fa3_sha256, '')));
  normalized_version := btrim(coalesce(p_generator_version, ''));

  if p_fa3_xml is null or p_fa3_xml = '' then
    raise exception 'FA(3) XML is required.';
  end if;
  if normalized_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'FA(3) SHA-256 must be a 64-character lowercase hex digest.';
  end if;
  if p_fa3_generated_at is null or normalized_version = '' then
    raise exception 'FA(3) generation timestamp and generator version are required.';
  end if;

  actual_size := octet_length(convert_to(p_fa3_xml, 'UTF8'));
  if p_fa3_size_bytes is null or p_fa3_size_bytes <> actual_size then
    raise exception 'FA(3) size does not match the supplied XML bytes.';
  end if;

  select * into doc
  from public.billing_seller_documents
  where id = p_document_id
  for update;

  if not found then
    raise exception 'Seller document not found.';
  end if;
  if doc.source_livemode is not true then
    raise exception 'Legal FA(3) payloads cannot be frozen for Stripe sandbox documents.';
  end if;
  if doc.legal_document_number is null then
    raise exception 'Legal document number must be reserved before freezing FA(3).';
  end if;
  if doc.lifecycle_status not in ('ready_for_issue', 'ksef_pending') then
    raise exception 'Seller document is not in an issuable state.';
  end if;

  if doc.fa3_xml is not null then
    if doc.fa3_xml = p_fa3_xml
      and doc.fa3_sha256 = normalized_hash
      and doc.fa3_size_bytes = p_fa3_size_bytes
      and doc.fa3_generated_at = p_fa3_generated_at
      and doc.fa3_generator_version = normalized_version
    then
      return false;
    end if;
    raise exception 'FA(3) payload is already frozen and cannot be replaced.';
  end if;

  update public.billing_seller_documents
  set fa3_xml = p_fa3_xml,
      fa3_sha256 = normalized_hash,
      fa3_size_bytes = p_fa3_size_bytes,
      fa3_generated_at = p_fa3_generated_at,
      fa3_generator_version = normalized_version,
      updated_at = now()
  where id = p_document_id;

  return true;
end;
$$;

revoke all on function public.freeze_seller_document_fa3(uuid, text, text, bigint, timestamptz, text)
from public, anon, authenticated;

grant execute on function public.freeze_seller_document_fa3(uuid, text, text, bigint, timestamptz, text)
to service_role;

comment on function public.freeze_seller_document_fa3(uuid, text, text, bigint, timestamptz, text) is
  'Service-role-only write-once freeze of exact legal FA(3) bytes for idempotent KSeF retries.';
