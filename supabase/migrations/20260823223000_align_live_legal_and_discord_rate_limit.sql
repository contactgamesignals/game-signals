begin;

-- New signups must accept the public legal text that matches the current
-- Paddle LIVE product. Historical v1 acceptances remain immutable.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  workspace_id uuid;
  preferred_name text;
  accepted_terms_version text;
  acknowledged_privacy_version text;
  signup_enabled boolean;
begin
  select coalesce(value = 'true', false)
    into signup_enabled
    from public.internal_settings
   where key = 'public_signup_enabled';

  if coalesce(signup_enabled, false) is not true then
    raise exception 'Public signup is temporarily closed while final launch contact information is configured.';
  end if;

  preferred_name := coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1));
  accepted_terms_version := nullif(trim(coalesce(new.raw_user_meta_data ->> 'terms_version', '')), '');
  acknowledged_privacy_version := nullif(trim(coalesce(new.raw_user_meta_data ->> 'privacy_version', '')), '');

  if coalesce(new.raw_user_meta_data ->> 'terms_accepted', 'false') <> 'true'
     or coalesce(new.raw_user_meta_data ->> 'privacy_acknowledged', 'false') <> 'true'
     or accepted_terms_version is distinct from '2026-08-24-v2'
     or acknowledged_privacy_version is distinct from '2026-08-24-v2' then
    raise exception 'Current Terms and Privacy Policy must be acknowledged before signup.';
  end if;

  insert into public.profiles (id, email, display_name)
  values (new.id, coalesce(new.email, ''), preferred_name)
  on conflict (id) do nothing;

  insert into public.account_legal_acceptances (user_id, terms_version, privacy_version, source)
  values (new.id, accepted_terms_version, acknowledged_privacy_version, 'signup')
  on conflict (user_id, terms_version, privacy_version, source) do nothing;

  insert into public.workspaces (owner_id, name)
  values (new.id, preferred_name || '''s workspace')
  returning id into workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (workspace_id, new.id, 'owner');

  insert into public.subscriptions (workspace_id, plan, status, stripe_status_raw, billing_provider)
  values (workspace_id, 'free', 'trialing', 'trialing', 'paddle');

  return new;
end;
$function$;

-- A Discord HTTP 429 is backpressure, not a failed delivery attempt. The
-- claim RPC increments attempts before the HTTP request, so undo exactly that
-- increment when Discord asks us to retry later. Other failures keep consuming
-- the normal retry budget.
create or replace function public.defer_discord_rate_limited_delivery(
  p_mention_id uuid,
  p_notification_channel_id uuid,
  p_error text default null,
  p_retry_after_seconds integer default 60
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  update public.delivered_notifications
     set status = 'failed',
         delivered_at = null,
         claimed_at = null,
         available_at = now() + make_interval(secs => greatest(5, least(coalesce(p_retry_after_seconds, 60), 3600))),
         error = left(coalesce(p_error, 'Discord rate limited the webhook.'), 1000),
         attempts = greatest(attempts - 1, 0)
   where mention_id = p_mention_id
     and notification_channel_id = p_notification_channel_id
     and status = 'processing';
end;
$function$;

revoke all on function public.defer_discord_rate_limited_delivery(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.defer_discord_rate_limited_delivery(uuid, uuid, text, integer) to service_role;

commit;
