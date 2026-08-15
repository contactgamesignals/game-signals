-- A KSeF attempt can fail before the application begins POSTing invoice bytes.
-- In that narrow phase no legal invoice can have reached KSeF, so retry is safe.
-- Keep this transition separate from ambiguous post-submit reconciliation.

create or replace function public.fail_seller_document_ksef_pre_submit(
  p_document_id uuid,
  p_expected_fa3_sha256 text,
  p_error text
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
  safe_error := left(btrim(coalesce(p_error, 'Unknown pre-submit KSeF error.')), 4000);

  update public.billing_seller_documents d
  set lifecycle_status = 'failed',
      last_error = safe_error,
      updated_at = now()
  where d.id = p_document_id
    and d.source_livemode is true
    and d.lifecycle_status = 'ksef_pending'
    and d.fa3_sha256 = lower(btrim(coalesce(p_expected_fa3_sha256, '')))
    and d.ksef_invoice_reference is null
    and d.ksef_reference_number is null
    and d.ksef_accepted_at is null;

  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

revoke all on function public.fail_seller_document_ksef_pre_submit(uuid, text, text)
from public, anon, authenticated;
grant execute on function public.fail_seller_document_ksef_pre_submit(uuid, text, text)
to service_role;

comment on function public.fail_seller_document_ksef_pre_submit(uuid, text, text) is
  'Marks a KSeF attempt retryable only when application control flow proves invoice POST has not started. Service-role only.';
