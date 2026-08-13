-- Keep checkout/legal evidence server-only while making the deny posture explicit to RLS tooling.
create policy "checkout_consents_deny_authenticated"
on public.billing_checkout_consents
for all
to authenticated
using (false)
with check (false);

create policy "checkout_consents_deny_anon"
on public.billing_checkout_consents
for all
to anon
using (false)
with check (false);
