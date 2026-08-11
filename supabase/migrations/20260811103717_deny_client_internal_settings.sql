drop policy if exists "internal_settings_no_client_access" on public.internal_settings;
create policy "internal_settings_no_client_access"
on public.internal_settings
for all
to authenticated
using (false)
with check (false);
