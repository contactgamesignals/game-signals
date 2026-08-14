-- Tighten PL Company legal-document readiness: a 10-digit identifier alone is
-- not enough. The retained Stripe tax-ID evidence must also say `verified`.
-- Unverified/pending/unavailable IDs remain in review and never receive a legal
-- number automatically.

create or replace function private.billing_has_polish_tax_id(p_tax_ids jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog, pg_temp
as $$
  select exists (
    select 1
    from jsonb_array_elements(coalesce(p_tax_ids, '[]'::jsonb)) item
    where coalesce(item->>'type', '') in ('pl_nip', 'eu_vat')
      and regexp_replace(coalesce(item->>'value', ''), '[^0-9]', '', 'g') ~ '^[0-9]{10}$'
      and lower(coalesce(item->>'verification_status', '')) = 'verified'
  );
$$;

revoke all on function private.billing_has_polish_tax_id(jsonb)
from public, anon, authenticated;

grant execute on function private.billing_has_polish_tax_id(jsonb)
to service_role;
