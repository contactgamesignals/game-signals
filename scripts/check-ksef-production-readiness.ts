import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  evaluateKsefProductionReadiness,
  type KsefProductionReadinessInput,
} from "../lib/ksef/production-readiness-core.ts";

const root = process.cwd();
const readiness = readFileSync(join(root, "lib/ksef/production-readiness.ts"), "utf8");
const readinessCore = readFileSync(join(root, "lib/ksef/production-readiness-core.ts"), "utf8");
const launchReadiness = readFileSync(join(root, "lib/launch-readiness.ts"), "utf8");
const serverGuard = readFileSync(join(root, "lib/ksef/server.ts"), "utf8");
const envExample = readFileSync(join(root, ".env.example"), "utf8");

assert.match(readiness, /import "server-only"/);
assert.match(readiness, /evaluateKsefProductionReadiness/);
assert.match(readiness, /getKsefServerConfig/);
assert.match(readiness, /KSEF_FINAL_SELLER_NIP/);
assert.match(readiness, /KSEF_FINAL_SELLER_CONFIRMED_AT/);
assert.match(readiness, /KSEF_INVOICE_WRITE_VERIFIED_AT/);
assert.match(readiness, /KSEF_SYSTEM_TOKEN/);
assert.match(readinessCore, /mode: "read_only_no_network"/);
assert.match(readinessCore, /productionEnvironmentSelected/);
assert.match(readinessCore, /productionUnlockPresent/);
assert.match(readinessCore, /submissionArmed/);
assert.match(readinessCore, /productionStillLocked/);
assert.match(readinessCore, /seller_vat_status_is_active_and_fresh/);
assert.match(readinessCore, /seller_vat_ue_status_is_valid_and_fresh/);
assert.match(readinessCore, /invoice_write_permission_is_freshly_verified/);
assert.match(readinessCore, /final_seller_nip_matches_active_seller/);

// The preflight must remain local/read-only. It may inspect configuration but it
// must not authenticate, open sessions, issue invoices or make arbitrary HTTP
// requests while production is still being prepared.
for (const source of [readiness, readinessCore]) {
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /getKsefAccessTokenForSeller/);
  assert.doesNotMatch(source, /authenticateWithKsefToken/);
  assert.doesNotMatch(source, /openKsefOnlineSession/);
  assert.doesNotMatch(source, /issueSellerDocumentToKsef/);
  assert.doesNotMatch(source, /issueFrozenSellerDocumentToKsef/);
}
assert.doesNotMatch(readiness, /KSEF_SYSTEM_TOKEN\s*:/);

// Existing legal-effect guards stay authoritative; readiness never bypasses
// them and the final arming switches remain separate from prerequisites.
assert.match(serverGuard, /KSEF_ENABLED === "true"/);
assert.match(serverGuard, /KSEF_PRODUCTION_UNLOCK/);
assert.match(serverGuard, /I_UNDERSTAND_KSEF_PRODUCTION_HAS_LEGAL_EFFECT/);
assert.match(readinessCore, /input\.config\.environment === "production"/);
assert.match(readinessCore, /input\.config\.enabled/);
assert.match(readinessCore, /input\.config\.productionUnlocked/);

// The central LIVE gate must consume the real preflight. A manual
// GAMESIGNAL_KSEF_FLOW_READY=true flag is necessary but not sufficient, and the
// final legal-effect arm remains a separate blocking check.
assert.match(launchReadiness, /getKsefProductionReadiness/);
assert.match(launchReadiness, /approved\("GAMESIGNAL_KSEF_FLOW_READY"\) && ksef\.prerequisitesReady/);
assert.match(launchReadiness, /key: "ksef_production_arm"/);
assert.match(launchReadiness, /ready: ksef\.submissionArmed/);
assert.match(launchReadiness, /productionStillLocked/);
assert.match(launchReadiness, /pending\.length === 0 \? "ready_for_explicit_live_cutover" : "sandbox_only"/);
assert.doesNotMatch(launchReadiness, /key: "ksef"[\s\S]{0,300}ready: approved\("GAMESIGNAL_KSEF_FLOW_READY"\),/);

const nowMs = Date.UTC(2026, 7, 15, 2, 30, 0);
const freshIso = new Date(Date.UTC(2026, 7, 14, 12, 0, 0)).toISOString();
const baseInput = {
  nowMs,
  seller: {
    legalName: "Lumino Games sp. z o.o.",
    nip: "6762600090",
    countryCode: "PL",
    vatStatus: "active",
    vatStatusVerifiedAt: freshIso,
    vatUeStatus: "valid",
    vatUeVerifiedAt: freshIso,
  },
  config: {
    environment: "production",
    enabled: false,
    productionUnlocked: false,
    apiFamily: "2.0",
    invoiceSchema: "FA (3)",
  },
  finalSellerNip: "6762600090",
  finalSellerConfirmedAt: freshIso,
  systemTokenConfigured: true,
  invoiceWriteVerifiedAt: freshIso,
} satisfies KsefProductionReadinessInput;

const preparedButLocked = evaluateKsefProductionReadiness(baseInput);
assert.equal(preparedButLocked.prerequisitesReady, true);
assert.deepEqual(preparedButLocked.blockers, []);
assert.equal(preparedButLocked.submissionArmed, false);
assert.equal(preparedButLocked.productionStillLocked, true);
assert.equal(preparedButLocked.ksef.productionUnlockPresent, false);

const fullyArmed = evaluateKsefProductionReadiness({
  ...baseInput,
  config: {
    ...baseInput.config,
    enabled: true,
    productionUnlocked: true,
  },
});
assert.equal(fullyArmed.prerequisitesReady, true);
assert.equal(fullyArmed.submissionArmed, true);
assert.equal(fullyArmed.productionStillLocked, false);

const missingToken = evaluateKsefProductionReadiness({
  ...baseInput,
  systemTokenConfigured: false,
});
assert.equal(missingToken.prerequisitesReady, false);
assert.equal(missingToken.submissionArmed, false);
assert.ok(missingToken.blockers.includes("ksef_system_token_is_configured"));

const testEnvironmentCannotArmProduction = evaluateKsefProductionReadiness({
  ...baseInput,
  config: {
    ...baseInput.config,
    environment: "test",
    enabled: true,
    productionUnlocked: true,
  },
});
assert.equal(testEnvironmentCannotArmProduction.prerequisitesReady, false);
assert.equal(testEnvironmentCannotArmProduction.submissionArmed, false);
assert.equal(testEnvironmentCannotArmProduction.ksef.productionUnlockPresent, false);
assert.ok(testEnvironmentCannotArmProduction.blockers.includes("environment_is_production"));

const wrongSeller = evaluateKsefProductionReadiness({
  ...baseInput,
  finalSellerNip: "1234567890",
});
assert.equal(wrongSeller.prerequisitesReady, false);
assert.ok(wrongSeller.blockers.includes("final_seller_nip_matches_active_seller"));

const staleEvidence = evaluateKsefProductionReadiness({
  ...baseInput,
  seller: {
    ...baseInput.seller,
    vatStatusVerifiedAt: "2026-08-01T00:00:00.000Z",
    vatUeVerifiedAt: "2026-08-01T00:00:00.000Z",
  },
});
assert.equal(staleEvidence.prerequisitesReady, false);
assert.ok(staleEvidence.blockers.includes("seller_vat_status_is_active_and_fresh"));
assert.ok(staleEvidence.blockers.includes("seller_vat_ue_status_is_valid_and_fresh"));

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

console.log("KSeF production readiness behavior is fail-closed, secret-safe, launch-gated and separately armed.");
