alter table public.billing_checkout_consents
  add column if not exists withdrawal_version text;

alter table public.billing_checkout_consents
  drop constraint if exists billing_checkout_consents_withdrawal_version_check;
alter table public.billing_checkout_consents
  add constraint billing_checkout_consents_withdrawal_version_check
  check (
    withdrawal_version is null
    or char_length(btrim(withdrawal_version)) between 1 and 80
  );

comment on column public.billing_checkout_consents.withdrawal_version is
  'Version of the withdrawal information presented for this checkout. NULL identifies legacy consent evidence created before version capture was introduced.';
