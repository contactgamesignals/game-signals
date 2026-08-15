-- Re-evaluate the PL Company seller-document queue when Stripe Tax ID evidence
-- is enriched after invoice finalization. The reconciliation Edge Function only
-- updates verification_status on the exact type+value already snapshotted on
-- the Stripe invoice; it never replaces or adds a buyer Tax ID.

drop trigger if exists queue_paid_polish_company_document_after_write
on public.billing_invoice_records;

create trigger queue_paid_polish_company_document_after_write
after insert or update of
  workspace_id,
  billing_account_id,
  stripe_subscription_id,
  stripe_status,
  buyer_type,
  customer_name,
  customer_country,
  customer_address,
  customer_tax_ids,
  currency,
  tax_amount,
  total_amount,
  amount_paid,
  livemode,
  finalized_at,
  invoice_created_at,
  period_start,
  period_end,
  billing_reason
on public.billing_invoice_records
for each row execute function private.queue_paid_polish_company_document();

select cron.unschedule(jobid)
from cron.job
where jobname = 'gamesignal-stripe-tax-id-every-5-minutes';

select cron.schedule(
  'gamesignal-stripe-tax-id-every-5-minutes',
  '*/5 * * * *',
  $cron$
  select net.http_post(
    url := 'https://mgaufxduaaobrlyzdrdo.supabase.co/functions/v1/reconcile-stripe-tax-ids',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'gamesignal_cron_secret'
        limit 1
      )
    ),
    body := '{}'::jsonb
  );
  $cron$
);

comment on trigger queue_paid_polish_company_document_after_write
on public.billing_invoice_records is
  'Re-evaluates the durable PL Company seller-document queue when invoice identity, Tax ID verification, VAT or service-period evidence changes.';
