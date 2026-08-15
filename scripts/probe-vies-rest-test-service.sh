#!/usr/bin/env bash
set -euo pipefail

# Exercise the actual GameSignal VIES client against the European Commission's
# official REST integration-test endpoint. No real company VAT ID is used.
# The temporary copy changes only the fixed endpoint URL and removes server-only
# so Node can execute the exact normalizer/request/parser logic in CI.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

cp "$ROOT_DIR/lib/vies/server.ts" "$TMP_DIR/vies.ts"

python3 - "$TMP_DIR/vies.ts" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
text = text.replace('import "server-only";\n\n', '')
production = 'https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number'
test = 'https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-test-service'
if text.count(production) != 1:
    raise SystemExit("Expected exactly one pinned production VIES endpoint in GameSignal client.")
text = text.replace(production, test, 1)
path.write_text(text, encoding="utf-8")
PY

cat > "$TMP_DIR/probe.ts" <<'TS'
import assert from "node:assert/strict";
import { checkViesVatNumber, normalizeViesVatId } from "./vies.ts";

assert.deepEqual(normalizeViesVatId("gr", "GR100"), { countryCode: "EL", vatNumber: "100" });
assert.deepEqual(normalizeViesVatId("DE", "DE 100"), { countryCode: "DE", vatNumber: "100" });

const valid = await checkViesVatNumber({ countryCode: "DE", vatNumber: "100" });
assert.equal(valid.valid, true, "Official VIES REST test value 100 should return VALID.");
assert.equal(valid.taxDecision, "evidence_only");
assert.equal(valid.source, "EU_VIES_REST");
assert.ok(valid.requestDate, "VALID test response should include requestDate.");

const invalid = await checkViesVatNumber({ countryCode: "DE", vatNumber: "200" });
assert.equal(invalid.valid, false, "Official VIES REST test value 200 should return INVALID.");
assert.equal(invalid.taxDecision, "evidence_only");
assert.equal(invalid.source, "EU_VIES_REST");
assert.ok(invalid.requestDate, "INVALID test response should include requestDate.");

console.log("GameSignal VIES client passed official EC REST VALID/INVALID integration probes.");
TS

node --experimental-strip-types "$TMP_DIR/probe.ts"
