-- Close any active Checkout reservation once Stripe has produced a paid/trialing
-- subscription for the workspace. This prevents a successful Checkout from leaving
-- a stale 'creating'/'open' reservation that blocks later billing management.

create or replace function public.reconcile_checkout_attempt_after_subscription()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.stripe_subscription_id is not null
     and new.status in ('active'::public.subscription_status, 'trialing'::public.subscription_status) then
    update public.billing_checkout_attempts a
    set status = 'completed',
        updated_at = now()
    where a.workspace_id = new.workspace_id
      and a.status in ('creating', 'open');
  end if;

  return new;
end;
$$;

revoke all on function public.reconcile_checkout_attempt_after_subscription() from public, anon, authenticated;
grant execute on function public.reconcile_checkout_attempt_after_subscription() to service_role;

drop trigger if exists reconcile_checkout_attempt_after_subscription on public.subscriptions;
create trigger reconcile_checkout_attempt_after_subscription
after insert or update of stripe_subscription_id, status on public.subscriptions
for each row execute function public.reconcile_checkout_attempt_after_subscription();
