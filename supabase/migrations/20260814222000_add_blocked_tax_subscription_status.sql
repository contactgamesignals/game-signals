-- Forward-only entitlement state for a paid Stripe subscription whose tax route
-- has not yet been approved. Existing code treats every status other than
-- active/trialing as Free, so this fails closed without deleting data.

alter type public.subscription_status add value if not exists 'blocked_tax';
