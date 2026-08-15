-- Additive performance indexes for the two billing foreign keys flagged by the
-- Supabase performance advisor. No data or constraint semantics are changed.

create index if not exists billing_checkout_consents_user_id_idx
  on public.billing_checkout_consents(user_id);

create index if not exists billing_invoice_records_checkout_consent_id_idx
  on public.billing_invoice_records(checkout_consent_id);
