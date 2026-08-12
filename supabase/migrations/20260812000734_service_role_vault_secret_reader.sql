create or replace function public.get_internal_vault_secret(secret_name text)
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = secret_name
  limit 1;
$$;

revoke all on function public.get_internal_vault_secret(text) from public;
revoke all on function public.get_internal_vault_secret(text) from anon;
revoke all on function public.get_internal_vault_secret(text) from authenticated;
grant execute on function public.get_internal_vault_secret(text) to service_role;
