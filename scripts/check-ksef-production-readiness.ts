import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const readiness = readFileSync(join(root, "lib/ksef/production-readiness.ts"), "utf8");
const serverGuard = readFileSync(join(root, "lib/ksef/server.ts"), "utf8");
const envExample = readFileSync(join(root, ".env.example"), "utf8");

assert.match(readiness, /import "server-only"/);
assert.match(readiness, /mode: "read_only_no_network"/);
assert.match(readiness, /getKsefServerConfig/);
assert.match(readiness, /KSEF_FINAL_SELLER_NIP/);
assert.match(readiness, /KSEF_FINAL_SELLER_CONFIRMED_AT/);
assert.match(readiness, /KSEF_INVOICE_WRITE_VERIFIED_AT/);
assert.match(readiness, /KSEF_SYSTEM_TOKEN/);
assert.match(readiness, /systemTokenConfigured/);
assert.match(readiness, /productionEnvironmentSelected/);
assert.match(readiness, /productionUnlockPresent/);
assert.match(readiness, /submissionArmed/);
assert.match(readiness, /productionStillLocked/);
assert.match(readiness, /seller_vat_status_is_active_and_fresh/);
assert.match(readiness, /seller_vat_ue_status_is_valid_and_fresh/);
assert.match(readiness, /invoice_write_permission_is_freshly_verified/);
assert.match(readiness, /final_seller_nip_matches_active_seller/);

// The preflight must remain local/read-only. It may inspect configuration but it
// must not authenticate, open sessions, issue invoices or make arbitrary HTTP
// requests while production is still being prepared.
assert.doesNotMatch(readiness, /\bfetch\s*\(/);
assert.doesNotMatch(readiness, /getKsefAccessTokenForSeller/);
assert.doesNotMatch(readiness, /authenticateWithKsefToken/);
assert.doesNotMatch(readiness, /openKsefOnlineSession/);
assert.doesNotMatch(readiness, /issueSellerDocumentToKsef/);
assert.doesNotMatch(readiness, /issueFrozenSellerDocumentToKsef/);
assert.doesNotMatch(readiness, /KSEF_SYSTEM_TOKEN\s*:/);

// Existing legal-effect guards stay authoritative; readiness never bypasses
// them and the final arming switches remain separate from prerequisites.
assert.match(serverGuard, /KSEF_ENABLED === "true"/);
assert.match(serverGuard, /KSEF_PRODUCTION_UNLOCK/);
assert.match(serverGuard, /I_UNDERSTAND_KSEF_PRODUCTION_HAS_LEGAL_EFFECT/);
assert.match(readiness, /config\.environment === "production"/);
assert.match(readiness, /config\.enabled/);
assert.match(readiness, /config\.productionUnlocked/);

for (const key of [
  "KSEF_ENV=test",
  "KSEF_ENABLED=false",
  "KSEF_PRODUCTION_UNLOCK=",
  "KSEF_SYSTEM_TOKEN=",
  "KSEF_FINAL_SELLER_NIP=",
  "KSEF_FINAL_SELLER_CONFIRMED_AT=",
  "KSEF_INVOICE_WRITE_VERIFIED_AT=",
]) {
  assert.ok(envExample.includes(key), `.env.example is missing ${key}`);
}
assert.doesNotMatch(envExample, /NEXT_PUBLIC_KSEF_/);

console.log("KSeF production readiness remains read-only, secret-safe and separately armed.");
