import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const legal = readFileSync("lib/legal.ts", "utf8");
const launch = readFileSync("lib/launch-readiness.ts", "utf8");
const terms = readFileSync("app/terms/page.tsx", "utf8");
const privacy = readFileSync("app/privacy/page.tsx", "utf8");
const withdrawal = readFileSync("app/withdrawal/page.tsx", "utf8");
const migration = readFileSync("supabase/migrations/20260815133000_add_contract_confirmation_evidence.sql", "utf8");
const envExample = readFileSync(".env.example", "utf8");

assert.match(legal, /terms: "2026-08-15-v3"/);
assert.match(legal, /privacy: "2026-08-15-v3"/);
assert.match(legal, /withdrawal: "2026-08-15-v1"/);
assert.match(legal, /GAMESIGNAL_SUPPORT_PHONE/);
assert.match(legal, /import "server-only"/);

assert.match(launch, /key: "legal_contact"/);
assert.match(launch, /legalSupportPhoneConfigured\(\)/);
assert.match(launch, /key: "legal_documents"/);
assert.match(launch, /GAMESIGNAL_LEGAL_DOCUMENTS_APPROVED/);
assert.match(launch, /key: "contract_confirmation"/);
assert.match(launch, /GAMESIGNAL_CONTRACT_CONFIRMATION_READY/);
assert.match(launch, /durable medium/i);

assert.match(terms, /Terms version: \{LEGAL_VERSIONS\.terms\}/);
assert.match(terms, /generally 14 days/i);
assert.match(terms, /durable medium/i);
assert.match(terms, /polubowne\.uokik\.gov\.pl/);
assert.match(terms, /KSeF/);
assert.match(terms, /Polish billing address/);
assert.match(terms, /Stripe-hosted documents are payment\/billing evidence/);
assert.match(terms, /materially and adversely affects/i);
assert.match(terms, /Phone: will be published before paid consumer checkout is enabled/);

assert.match(privacy, /Privacy version: \{LEGAL_VERSIONS\.privacy\}/);
assert.match(privacy, /Data required to use the service/);
assert.match(privacy, /Automated processing/);
assert.match(privacy, /Article 22 GDPR/);
assert.match(privacy, /KSeF/);
assert.match(privacy, /Ministry of Finance/);
assert.match(privacy, /immutable contract-confirmation/i);

assert.match(withdrawal, /Withdrawal information version: \{LEGAL_VERSIONS\.withdrawal\}/);
assert.match(withdrawal, /generally 14 days from the day we are informed/);
assert.match(withdrawal, /same payment method/i);
assert.match(withdrawal, /durable medium/i);
assert.match(withdrawal, /Starting the service does not by itself mean/i);

assert.match(migration, /create table public\.billing_contract_confirmations/);
assert.match(migration, /billing_account_id uuid not null references public\.billing_accounts\(id\) on delete restrict/);
assert.match(migration, /checkout_consent_id uuid not null unique references public\.billing_checkout_consents\(id\) on delete restrict/);
assert.match(migration, /seller_profile_key text not null/);
assert.match(migration, /seller_legal_name text not null/);
assert.match(migration, /seller_nip text not null/);
assert.match(migration, /seller_registered_address text not null/);
assert.match(migration, /seller_country_code text not null/);
assert.match(migration, /confirmation_text text not null/);
assert.match(migration, /confirmation_sha256 text not null/);
assert.match(migration, /extensions\.digest\(convert_to\(new\.confirmation_text, 'UTF8'\), 'sha256'\)/);
assert.match(migration, /Frozen contract confirmation evidence is immutable/);
assert.match(migration, /Delivered contract confirmation cannot return/);
assert.match(migration, /revoke all on public\.billing_contract_confirmations from anon, authenticated/);
assert.match(migration, /grant select, insert, update, delete on public\.billing_contract_confirmations to service_role/);
assert.doesNotMatch(migration, /on delete cascade/i);
assert.doesNotMatch(migration, /\bdrop\s+table\b|\btruncate\s+table\b|\bdelete\s+from\b/i);

for (const line of [
  "GAMESIGNAL_SUPPORT_PHONE=",
  "GAMESIGNAL_LEGAL_DOCUMENTS_APPROVED=false",
  "GAMESIGNAL_CONTRACT_CONFIRMATION_READY=false",
]) {
  assert.ok(envExample.includes(line), `.env.example is missing ${line}`);
}
assert.doesNotMatch(envExample, /NEXT_PUBLIC_GAMESIGNAL_SUPPORT_PHONE/);

console.log("Consumer legal documents, launch blockers and immutable seller/contract confirmation evidence are fail-closed.");
