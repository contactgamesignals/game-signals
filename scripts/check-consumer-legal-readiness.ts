import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const company = readFileSync("lib/company.ts", "utf8");
const legal = readFileSync("lib/legal.ts", "utf8");
const legalVersions = readFileSync("lib/legal-versions.ts", "utf8");
const launch = readFileSync("lib/launch-readiness.ts", "utf8");
const terms = readFileSync("app/terms/page.tsx", "utf8");
const privacy = readFileSync("app/privacy/page.tsx", "utf8");
const withdrawal = readFileSync("app/withdrawal/page.tsx", "utf8");
const signup = readFileSync("components/AuthCard.tsx", "utf8");
const signupEvidence = readFileSync("supabase/migrations/20260817003838_add_account_legal_acceptance_evidence.sql", "utf8");
const historicalSignupEnforcement = readFileSync("supabase/migrations/20260817004228_require_current_legal_acceptance_on_signup.sql", "utf8");
const currentSignupEnforcement = readFileSync("supabase/migrations/20260823223000_align_live_legal_and_discord_rate_limit.sql", "utf8");
const accountConfirmationMigration = readFileSync("supabase/migrations/20260817005000_add_account_agreement_confirmation_delivery.sql", "utf8");
const accountConfirmationSender = readFileSync("supabase/functions/send-account-agreement-confirmation/index.ts", "utf8");
const contractMigration = readFileSync("supabase/migrations/20260815133000_add_contract_confirmation_evidence.sql", "utf8");
const envExample = readFileSync(".env.example", "utf8");

assert.match(company, /registeredAddress: "ul\. Kazimierza Morawskiego 5\/127, 30-102 Kraków, Małopolskie, Poland"/);
assert.doesNotMatch(company, /Ujastek 1/);

assert.match(legalVersions, /terms: "2026-08-24-v2"/);
assert.match(legalVersions, /privacy: "2026-08-24-v2"/);
assert.match(legalVersions, /withdrawal: "2026-08-17-v1"/);
assert.match(legalVersions, /terms: "24 August 2026"/);
assert.match(legalVersions, /privacy: "24 August 2026"/);
assert.match(legal, /GAMESIGNAL_SUPPORT_PHONE/);
assert.match(legal, /import "server-only"/);
assert.match(legal, /LEGAL_UPDATED_DATE, LEGAL_UPDATED_DATES, LEGAL_VERSIONS/);

assert.match(launch, /key: "legal_contact"/);
assert.match(launch, /legalSupportPhoneConfigured\(\)/);
assert.match(launch, /key: "legal_documents"/);
assert.match(launch, /GAMESIGNAL_LEGAL_DOCUMENTS_APPROVED/);
assert.match(launch, /key: "contract_confirmation"/);
assert.match(launch, /GAMESIGNAL_CONTRACT_CONFIRMATION_READY/);
assert.match(launch, /durable medium/i);

assert.match(terms, /Legal · public beta/);
assert.match(terms, /Terms version: \{LEGAL_VERSIONS\.terms\}/);
assert.match(terms, /Paddle LIVE/i);
assert.match(terms, /Paddle Sandbox/i);
assert.match(terms, /Merchant of Record/i);
assert.match(terms, /Paddle Customer Portal/i);
assert.match(terms, /generally 14 days/i);
assert.match(terms, /rights that cannot legally be excluded/i);
assert.match(terms, /does not automatically choose or pause games/i);
assert.match(terms, /No direct Stripe LIVE billing route will be enabled/i);
assert.doesNotMatch(terms, /New real-money subscriptions remain unavailable/i);
assert.doesNotMatch(terms, /New paid checkout is temporarily locked/i);
assert.doesNotMatch(terms, /Prices shown on the website before Paddle LIVE activation/i);

assert.match(privacy, /Legal · public beta/);
assert.match(privacy, /Privacy version: \{LEGAL_VERSIONS\.privacy\}/);
assert.match(privacy, /Data required to use the service/);
assert.match(privacy, /Automated processing/);
assert.match(privacy, /Article 22 GDPR/);
assert.match(privacy, /Merchant of Record/i);
assert.match(privacy, /We do not receive or store full payment-card details/i);
assert.match(privacy, /Paddle LIVE is the current billing route/i);
assert.match(privacy, /public Sandbox checkout is disabled/i);
assert.match(privacy, /Resend for authentication email delivery and opt-in product email digests/i);
assert.match(privacy, /legacy\/direct billing route/i);
assert.doesNotMatch(privacy, /New real-money subscriptions remain unavailable/i);
assert.doesNotMatch(privacy, /currently remains in Sandbox while/i);

assert.match(withdrawal, /Withdrawal information version: \{LEGAL_VERSIONS\.withdrawal\}/);
assert.match(withdrawal, /generally 14 days from the day we are informed/);
assert.match(withdrawal, /same payment method/i);
assert.match(withdrawal, /durable medium/i);
assert.match(withdrawal, /Starting the service does not by itself mean/i);
assert.match(withdrawal, /Paddle Customer Portal/i);

assert.match(signup, /LEGAL_VERSIONS/);
assert.match(signup, /I agree to the/);
assert.match(signup, /href="\/terms"/);
assert.match(signup, /href="\/privacy"/);
assert.match(signup, /terms_accepted: true/);
assert.match(signup, /terms_version: LEGAL_VERSIONS\.terms/);
assert.match(signup, /privacy_acknowledged: true/);
assert.match(signup, /privacy_version: LEGAL_VERSIONS\.privacy/);
assert.match(signup, /!isLogin && !legalAccepted/);

assert.match(signupEvidence, /create table if not exists public\.account_legal_acceptances/);
assert.match(signupEvidence, /user_id uuid not null references auth\.users\(id\) on delete cascade/);
assert.match(signupEvidence, /terms_version text not null/);
assert.match(signupEvidence, /privacy_version text not null/);
assert.match(signupEvidence, /accepted_at timestamptz not null default now\(\)/);
assert.match(signupEvidence, /alter table public\.account_legal_acceptances enable row level security/);
assert.match(signupEvidence, /revoke all on table public\.account_legal_acceptances from anon, authenticated/);
assert.match(signupEvidence, /grant select, insert, update, delete on table public\.account_legal_acceptances to service_role/);

for (const metadataField of ["terms_accepted", "terms_version", "privacy_acknowledged", "privacy_version"]) {
  assert.ok(historicalSignupEnforcement.includes(`new.raw_user_meta_data ->> '${metadataField}'`) || historicalSignupEnforcement.includes(`new.raw_user_meta_data ->> '${metadataField.replace("_accepted", "")}'`), `Historical signup enforcement must inspect ${metadataField}.`);
  assert.ok(currentSignupEnforcement.includes(`new.raw_user_meta_data ->> '${metadataField}'`) || currentSignupEnforcement.includes(`new.raw_user_meta_data ->> '${metadataField.replace("_accepted", "")}'`), `Current signup enforcement must inspect ${metadataField}.`);
}
assert.match(historicalSignupEnforcement, /accepted_terms_version is distinct from '2026-08-17-v1'/);
assert.match(historicalSignupEnforcement, /acknowledged_privacy_version is distinct from '2026-08-17-v1'/);
assert.match(currentSignupEnforcement, /accepted_terms_version is distinct from '2026-08-24-v2'/);
assert.match(currentSignupEnforcement, /acknowledged_privacy_version is distinct from '2026-08-24-v2'/);
assert.match(currentSignupEnforcement, /Current Terms and Privacy Policy must be acknowledged before signup\./);
assert.match(currentSignupEnforcement, /insert into public\.account_legal_acceptances/);
assert.match(currentSignupEnforcement, /insert into public\.subscriptions \(workspace_id, plan, status, stripe_status_raw, billing_provider\)/);
assert.match(currentSignupEnforcement, /values \(workspace_id, 'free', 'trialing', 'trialing', 'paddle'\)/);
assert.match(currentSignupEnforcement, /create or replace function public\.defer_discord_rate_limited_delivery/);
assert.match(currentSignupEnforcement, /attempts = greatest\(attempts - 1, 0\)/);
assert.match(currentSignupEnforcement, /grant execute on function public\.defer_discord_rate_limited_delivery[\s\S]*to service_role/);
assert.match(currentSignupEnforcement, /revoke all on function public\.defer_discord_rate_limited_delivery[\s\S]*from public, anon, authenticated/);

assert.match(accountConfirmationMigration, /confirmation_text text/);
assert.match(accountConfirmationMigration, /confirmation_sha256 text/);
assert.match(accountConfirmationMigration, /confirmation_status text not null default 'pending'/);
assert.match(accountConfirmationMigration, /confirmation_provider_message_id text/);
assert.match(accountConfirmationMigration, /confirmation_sent_at timestamptz/);
assert.match(accountConfirmationMigration, /confirmation_status in \('pending','sending','delivered','failed','needs_review'\)/);

assert.match(accountConfirmationSender, /GAMESIGNAL_SUPPORT_PHONE/);
assert.match(accountConfirmationSender, /RESEND_API_KEY/);
assert.match(accountConfirmationSender, /Idempotency-Key/);
assert.match(accountConfirmationSender, /Who Plays My Game - your account is ready/);
assert.match(accountConfirmationSender, /who-plays-my-game-account-agreement\.pdf/);
assert.match(accountConfirmationSender, /attachments:/);
assert.match(accountConfirmationSender, /Creating an account costs 0 USD/);
assert.match(accountConfirmationSender, /0 active tracked-game slots/);
assert.match(accountConfirmationSender, /Paddle LIVE/);
assert.match(accountConfirmationSender, /termsVersion: row\.terms_version/);
assert.match(accountConfirmationSender, /privacyVersion: row\.privacy_version/);
assert.match(accountConfirmationSender, /\.eq\("source", "signup"\)/);
assert.doesNotMatch(accountConfirmationSender, /const TERMS_VERSION =/);
assert.doesNotMatch(accountConfirmationSender, /const PRIVACY_VERSION =/);
assert.match(accountConfirmationSender, /generally 14 days/);
assert.match(accountConfirmationSender, /confirmation_status: "sending"/);
assert.match(accountConfirmationSender, /confirmation_status: "delivered"/);
assert.match(accountConfirmationSender, /confirmation_status: "needs_review"/);
assert.match(accountConfirmationSender, /confirmation_sha256/);
assert.match(accountConfirmationSender, /Kazimierza Morawskiego 5\/127/);
assert.doesNotMatch(accountConfirmationSender, /Ujastek 1/);

assert.match(contractMigration, /create table public\.billing_contract_confirmations/);
assert.match(contractMigration, /billing_account_id uuid not null references public\.billing_accounts\(id\) on delete restrict/);
assert.match(contractMigration, /checkout_consent_id uuid not null unique references public\.billing_checkout_consents\(id\) on delete restrict/);
assert.match(contractMigration, /seller_profile_key text not null/);
assert.match(contractMigration, /seller_legal_name text not null/);
assert.match(contractMigration, /seller_nip text not null/);
assert.match(contractMigration, /seller_registered_address text not null/);
assert.match(contractMigration, /seller_country_code text not null/);
assert.match(contractMigration, /confirmation_text text not null/);
assert.match(contractMigration, /confirmation_sha256 text not null/);
assert.match(contractMigration, /extensions\.digest\(convert_to\(new\.confirmation_text, 'UTF8'\), 'sha256'\)/);
assert.match(contractMigration, /Frozen contract confirmation evidence is immutable/);
assert.match(contractMigration, /Delivered contract confirmation cannot return/);
assert.match(contractMigration, /revoke all on public\.billing_contract_confirmations from anon, authenticated/);
assert.match(contractMigration, /grant select, insert, update, delete on public\.billing_contract_confirmations to service_role/);
assert.doesNotMatch(contractMigration, /on delete cascade/i);
assert.doesNotMatch(contractMigration, /\bdrop\s+table\b|\btruncate\s+table\b|\bdelete\s+from\b/i);

for (const line of [
  "GAMESIGNAL_SUPPORT_PHONE=",
  "GAMESIGNAL_LEGAL_DOCUMENTS_APPROVED=false",
  "GAMESIGNAL_CONTRACT_CONFIRMATION_READY=false",
]) {
  assert.ok(envExample.includes(line), `.env.example is missing ${line}`);
}
assert.doesNotMatch(envExample, /NEXT_PUBLIC_GAMESIGNAL_SUPPORT_PHONE/);

console.log("Live legal documents, server-enforced signup evidence and durable confirmation sender are fail-closed.");
