alter table public.account_legal_acceptances
  add column if not exists confirmation_text text,
  add column if not exists confirmation_sha256 text,
  add column if not exists confirmation_status text not null default 'pending',
  add column if not exists confirmation_provider_message_id text,
  add column if not exists confirmation_attempts integer not null default 0,
  add column if not exists confirmation_sent_at timestamptz,
  add column if not exists confirmation_last_error text;

alter table public.account_legal_acceptances
  drop constraint if exists account_legal_acceptances_confirmation_status_check;
alter table public.account_legal_acceptances
  add constraint account_legal_acceptances_confirmation_status_check
  check (confirmation_status in ('pending','sending','delivered','failed','needs_review'));

alter table public.account_legal_acceptances
  drop constraint if exists account_legal_acceptances_confirmation_hash_check;
alter table public.account_legal_acceptances
  add constraint account_legal_acceptances_confirmation_hash_check
  check (confirmation_sha256 is null or confirmation_sha256 ~ '^[0-9a-f]{64}$');

create index if not exists account_legal_acceptances_confirmation_status_idx
  on public.account_legal_acceptances (confirmation_status, accepted_at);
