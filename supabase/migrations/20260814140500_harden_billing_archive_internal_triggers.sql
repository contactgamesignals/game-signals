-- Internal billing-account lifecycle triggers must be able to maintain seller-side
-- archive state even when the originating workspace/user operation is subject to RLS.
-- SECURITY DEFINER is narrowly justified here because these functions are trigger-only,
-- live in the private schema, use a fixed search_path and expose no caller-controlled SQL.

create or replace function private.ensure_billing_account_for_workspace()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  insert into public.billing_accounts (workspace_reference, workspace_id)
  values (new.id, new.id)
  on conflict (workspace_reference) do update
  set workspace_id = excluded.workspace_id,
      updated_at = now();
  return new;
end;
$$;

revoke all on function private.ensure_billing_account_for_workspace() from public, anon, authenticated;

create or replace function private.sync_billing_account_from_subscription()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  insert into public.billing_accounts (
    workspace_reference,
    workspace_id,
    stripe_customer_id,
    latest_stripe_subscription_id
  ) values (
    new.workspace_id,
    new.workspace_id,
    new.stripe_customer_id,
    new.stripe_subscription_id
  )
  on conflict (workspace_reference) do update
  set workspace_id = excluded.workspace_id,
      stripe_customer_id = coalesce(excluded.stripe_customer_id, public.billing_accounts.stripe_customer_id),
      latest_stripe_subscription_id = coalesce(excluded.latest_stripe_subscription_id, public.billing_accounts.latest_stripe_subscription_id),
      updated_at = now();
  return new;
end;
$$;

revoke all on function private.sync_billing_account_from_subscription() from public, anon, authenticated;

create or replace function private.archive_billing_account_before_workspace_delete()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  update public.billing_accounts a
  set workspace_id = null,
      account_deleted_at = coalesce(a.account_deleted_at, now()),
      updated_at = now()
  where a.workspace_reference = old.id;
  return old;
end;
$$;

revoke all on function private.archive_billing_account_before_workspace_delete() from public, anon, authenticated;
