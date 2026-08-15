-- Forward fix after the first transactional numbering regression exposed a
-- PL/pgSQL name collision between the OUT parameter `sequence_year` and the
-- sequence table column. Use the named UNIQUE constraint as the conflict target
-- so the function remains deterministic and migration history stays append-only.

create or replace function public.reserve_seller_document_number(
  p_document_id uuid,
  p_series text default 'GS'
)
returns table (
  document_number text,
  sequence_year integer,
  sequence_number bigint
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  doc public.billing_seller_documents%rowtype;
  normalized_series text;
  next_number bigint;
  target_year integer;
begin
  normalized_series := upper(btrim(coalesce(p_series, '')));
  if normalized_series !~ '^[A-Z0-9_-]{1,16}$' then
    raise exception 'Invalid invoice series.';
  end if;

  select * into doc
  from public.billing_seller_documents
  where id = p_document_id
  for update;

  if not found then
    raise exception 'Seller document not found.';
  end if;
  if doc.source_livemode is not true then
    raise exception 'Legal invoice numbers cannot be allocated to Stripe sandbox documents.';
  end if;
  if doc.lifecycle_status <> 'ready_for_issue' then
    raise exception 'Seller document is not ready for legal issuance.';
  end if;
  if doc.legal_document_number is not null then
    return query select doc.legal_document_number, doc.sequence_year, doc.sequence_number;
    return;
  end if;

  target_year := extract(year from coalesce(doc.issue_date, current_date))::integer;

  insert into public.billing_document_sequences (seller_nip, sequence_year, series, last_number)
  values (doc.seller_nip, target_year, normalized_series, 1)
  on conflict on constraint billing_document_sequences_seller_nip_sequence_year_series_key
  do update set
    last_number = public.billing_document_sequences.last_number + 1,
    updated_at = now()
  returning public.billing_document_sequences.last_number into next_number;

  update public.billing_seller_documents
  set issue_date = coalesce(issue_date, current_date),
      sequence_year = target_year,
      sequence_series = normalized_series,
      sequence_number = next_number,
      legal_document_number = format('%s/%s/%s', normalized_series, target_year, lpad(next_number::text, 6, '0')),
      updated_at = now()
  where id = p_document_id
  returning billing_seller_documents.legal_document_number into doc.legal_document_number;

  return query select doc.legal_document_number, target_year, next_number;
end;
$$;

revoke all on function public.reserve_seller_document_number(uuid, text)
from public, anon, authenticated;

grant execute on function public.reserve_seller_document_number(uuid, text)
to service_role;
