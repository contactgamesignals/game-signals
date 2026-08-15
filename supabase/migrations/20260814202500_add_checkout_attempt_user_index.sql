-- Additive performance index for the billing_checkout_attempts.user_id foreign key
-- flagged by the Supabase performance advisor. No data or constraint semantics change.

create index if not exists billing_checkout_attempts_user_id_idx
  on public.billing_checkout_attempts(user_id);
