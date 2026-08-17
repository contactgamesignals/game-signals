alter table public.subscriptions
  add column if not exists billing_environment text not null default 'live';

alter table public.subscriptions
  drop constraint if exists subscriptions_billing_environment_check;

alter table public.subscriptions
  add constraint subscriptions_billing_environment_check
  check (billing_environment in ('sandbox', 'live'));

comment on column public.subscriptions.billing_environment is
  'Paddle environment that owns provider-neutral Paddle customer/subscription IDs. Keeps historical Sandbox identities isolated after LIVE cutover.';

-- Preserve the one historical Sandbox integration and any other records that
-- reference the known Sandbox catalog. New/free Paddle rows default to LIVE.
update public.subscriptions
set billing_environment = 'sandbox',
    updated_at = now()
where billing_provider = 'paddle'
  and billing_price_id in (
    'pri_01m041w2rt1m5qm26yjygktnzj',
    'pri_01m04220y737wxhfphwbx7yscx',
    'pri_01m0426yqh0mq79yz0z4dy1cf3',
    'pri_01m042a8vyffzzdeqeyqs1kj6t',
    'pri_01m042eynme90xtjwpsgpdbp33',
    'pri_01m042kp4p6r7baaea3w3pv7yb'
  );
