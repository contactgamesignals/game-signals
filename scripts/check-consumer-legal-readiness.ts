import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const legal = readFileSync("lib/legal.ts", "utf8");
const launch = readFileSync("lib/launch-readiness.ts", "utf8");
const terms = readFileSync("app/terms/page.tsx", "utf8");
const privacy = readFileSync("app/privacy/page.tsx", "utf8");
const withdrawal = readFileSync("app/withdrawal/page.tsx", "utf8");
const migration = readFileSync("supabase/migrations/20260815133000_add_contract_confirmation_evidence.sql", "utf8");
const envExample = readFileSync(".env.example", "utf8");

assert.match(legal, /terms: "2026-08-16-v4"/);
assert.match(legal, /privacy: "2026-08-16-v4"/);
assert.match(legal, /withdrawal: "2026-08-16-v2"/);
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
assert.match(terms, /Paddle Sandbox/i);
assert.match(terms, /Merchant of Record/i);
assert.match(terms, /Paddle Customer Portal/i);
assert.match(terms, /generally 14 days/i);
assert.match(terms, /rights that cannot legally be excluded/i);
assert.match(terms, /Real paid billing is not enabled/i);
assert.match(terms, /No direct LIVE billing route will be enabled/i);
assert.match(terms, /Phone: will be published before any paid consumer launch if required/i);

assert.match(privacy, /Privacy version: \{LEGAL_VERSIONS\.privacy\}/);
assert.match(privacy, /Data required to use the service/);
assert.match(privacy, /Automated processing/);
assert.match(privacy, /Article 22 GDPR/);
assert.match(privacy, /Merchant of Record/i);
assert.match(privacy, /We do not receive or store full payment-card details/i);
assert.match(privacy, /Paddle integration is Sandbox only/i);
assert.match(privacy, /legacy\/direct billing route/i);

assert.match(withdrawal, /Withdrawal information version: \{LEGAL_VERSIONS\.withdrawal\}/);
assert.match(withdrawal, /generally 14 days from the day we are informed/);
assert.match(withdrawal, /same payment method/i);
assert.match(withdrawal, /durable medium/i);
assert.match(withdrawal, /Starting the service does not by itself mean/i);
assert.match(withdrawal, /Paddle Customer Portal/i);

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
