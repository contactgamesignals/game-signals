create table if not exists public.internal_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.internal_settings enable row level security;
revoke all on public.internal_settings from public, anon, authenticated;
grant select, insert, update, delete on public.internal_settings to service_role;
