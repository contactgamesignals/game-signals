import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const worker = readFileSync("supabase/functions/send-contract-confirmations/index.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260815143000_add_contract_confirmation_delivery_state.sql", "utf8");

assert.match(worker, /authorizeRequest/);
assert.match(worker, /if \(!auth\.internal\)/);
assert.match(worker, /RESEND_API_KEY/);
assert.match(worker, /RESEND_FROM_EMAIL/);
assert.match(worker, /Idempotency-Key/);
assert.match(worker, /contract-confirmation\/\$\{row\.id\}\/\$\{row\.confirmation_sha256\}/);
assert.match(worker, /https:\/\/api\.resend\.com\/emails/);
assert.match(worker, /text:\s*row\.confirmation_text/);
assert.match(worker, /escapeHtml\(row\.confirmation_text\)/);
assert.match(worker, /claim_billing_contract_confirmations_for_delivery/);
assert.match(worker, /transition_billing_contract_confirmation_delivery/);
assert.match(worker, /"needs_review"/);
assert.match(worker, /"retryable"/);
assert.match(worker, /response\.status === 429 \|\| response\.status >= 500/);
assert.match(worker, /response\.status === 409 \|\| response\.status === 408/);
assert.match(worker, /Ambiguous Resend network failure after delivery POST began/);
assert.match(worker, /stays `sending`/);

const configAt = worker.indexOf('const apiKey = required(Deno.env.get("RESEND_API_KEY")');
const claimAt = worker.indexOf('supabase.rpc("claim_billing_contract_confirmations_for_delivery"');
assert.ok(configAt >= 0 && claimAt > configAt, "Resend configuration must be validated before any delivery row is claimed");

const fetchAt = worker.indexOf("response = await fetch(RESEND_ENDPOINT");
const successAt = worker.indexOf('await transition(supabase, row, "delivered"');
assert.ok(fetchAt >= 0 && successAt > fetchAt, "delivery may be marked successful only after the provider response");

// Delivery may only transmit the already-frozen evidence. It can type/read the
// stored confirmation_text field, but it must never build, rewrite or persist a
// replacement contract/seller/legal snapshot.
assert.doesNotMatch(worker, /buildContractConfirmationText/);
assert.doesNotMatch(worker, /CONTRACT_LEGAL_VERSIONS/);
assert.doesNotMatch(worker, /\.update\([\s\S]{0,200}confirmation_text/);
assert.doesNotMatch(worker, /\.upsert\([\s\S]{0,200}confirmation_text/);
assert.doesNotMatch(worker, /billing_seller_profiles/);
assert.doesNotMatch(worker, /checkout\/sessions/);
assert.doesNotMatch(worker, /subscriptions\//);

// No scheduler is introduced with the worker. Transactional sending remains
// inert until a verified sender/channel is explicitly approved later.
assert.doesNotMatch(worker, /cron\.schedule|net\.http_post|gamesignal-contract-confirmation-every/);

assert.match(migration, /delivery_status in \('pending', 'sending', 'retryable', 'delivered', 'failed', 'needs_review'\)/);
assert.match(migration, /for update skip locked/);
assert.match(migration, /delivery_status in \('pending', 'retryable'\)/);
assert.match(migration, /claim_billing_contract_confirmations_for_delivery/);
assert.match(migration, /transition_billing_contract_confirmation_delivery/);
assert.match(migration, /c\.delivery_status = 'sending'/);
assert.match(migration, /c\.confirmation_sha256 = lower/);
assert.match(migration, /target not in \('delivered', 'retryable', 'failed', 'needs_review'\)/);
assert.match(migration, /revoke all on function public\.claim_billing_contract_confirmations_for_delivery[\s\S]*from public, anon, authenticated/);
assert.match(migration, /grant execute on function public\.claim_billing_contract_confirmations_for_delivery[\s\S]*to service_role/);
assert.match(migration, /revoke all on function public\.transition_billing_contract_confirmation_delivery[\s\S]*from public, anon, authenticated/);
assert.match(migration, /grant execute on function public\.transition_billing_contract_confirmation_delivery[\s\S]*to service_role/);
assert.doesNotMatch(migration, /delivery_status in \('pending', 'retryable', 'sending'/);

console.log("Contract confirmation delivery is immutable-text-only, idempotent and fail-closed on ambiguous outcomes.");
