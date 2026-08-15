#!/usr/bin/env bash
set -euo pipefail

BASE_URL="https://api-test.ksef.mf.gov.pl/v2"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

curl --fail --silent --show-error --location \
  --retry 2 --retry-all-errors --connect-timeout 10 --max-time 30 \
  --request POST \
  --header 'Accept: application/json' \
  "$BASE_URL/auth/challenge" \
  --output "$TMP_DIR/challenge.json"

curl --fail --silent --show-error --location \
  --retry 2 --retry-all-errors --connect-timeout 10 --max-time 30 \
  --header 'Accept: application/json' \
  "$BASE_URL/security/public-key-certificates" \
  --output "$TMP_DIR/certificates.json"

python3 - "$TMP_DIR/challenge.json" "$TMP_DIR/certificates.json" <<'PY'
from datetime import datetime, timezone
import json
from pathlib import Path
import sys

challenge = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
certificates = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))

if not isinstance(challenge, dict):
    raise SystemExit("KSeF TEST challenge response is not an object.")
if not isinstance(challenge.get("challenge"), str) or not challenge["challenge"].strip():
    raise SystemExit("KSeF TEST challenge is missing.")
if not isinstance(challenge.get("timestamp"), str) or not challenge["timestamp"].strip():
    raise SystemExit("KSeF TEST challenge timestamp is missing.")

if not isinstance(certificates, list) or not certificates:
    raise SystemExit("KSeF TEST did not return public-key certificates.")

now = datetime.now(timezone.utc)
valid_usages = set()
for item in certificates:
    if not isinstance(item, dict):
        continue
    public_key_id = item.get("publicKeyId")
    certificate = item.get("certificate")
    valid_from = item.get("validFrom")
    valid_to = item.get("validTo")
    usages = item.get("usage")
    if not all(isinstance(value, str) and value.strip() for value in (public_key_id, certificate, valid_from, valid_to)):
        continue
    if not isinstance(usages, list):
        continue
    try:
        starts = datetime.fromisoformat(valid_from.replace("Z", "+00:00"))
        ends = datetime.fromisoformat(valid_to.replace("Z", "+00:00"))
    except ValueError:
        continue
    if starts <= now < ends:
        valid_usages.update(value for value in usages if isinstance(value, str))

required = {"KsefTokenEncryption", "SymmetricKeyEncryption"}
missing = sorted(required - valid_usages)
if missing:
    raise SystemExit(f"KSeF TEST is missing a currently valid public key for: {', '.join(missing)}")

print("KSeF TEST public challenge and encryption-key probe passed.")
PY
