#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

cp "$ROOT_DIR/lib/company.ts" "$TMP_DIR/company.ts"
cp "$ROOT_DIR/lib/seller-profile.ts" "$TMP_DIR/seller-profile.ts"
cp "$ROOT_DIR/lib/ksef/fa3-active-vat.ts" "$TMP_DIR/fa3-active-vat.ts"
cp "$ROOT_DIR/lib/ksef/seller-document-fa3.ts" "$TMP_DIR/seller-document-fa3.ts"
cp "$ROOT_DIR/lib/ksef/seller-document-preparation.ts" "$TMP_DIR/seller-document-preparation.ts"
cp "$ROOT_DIR/lib/ksef/issuance-orchestrator.ts" "$TMP_DIR/issuance-orchestrator.ts"
cp "$ROOT_DIR/scripts/check-ksef-issuance-orchestrator.ts" "$TMP_DIR/check-ksef-issuance-orchestrator.ts"

python3 - \
  "$TMP_DIR/seller-profile.ts" \
  "$TMP_DIR/fa3-active-vat.ts" \
  "$TMP_DIR/seller-document-fa3.ts" \
  "$TMP_DIR/seller-document-preparation.ts" \
  "$TMP_DIR/issuance-orchestrator.ts" \
  "$TMP_DIR/check-ksef-issuance-orchestrator.ts" <<'PY'
from pathlib import Path
import sys

seller, fa3, snapshot, prep, orch, check = map(Path, sys.argv[1:])

seller.write_text(seller.read_text(encoding='utf-8').replace('from "@/lib/company"', 'from "./company.ts"'), encoding='utf-8')

text = fa3.read_text(encoding='utf-8').replace('import "server-only";\n\n', '').replace('from "@/lib/seller-profile"', 'from "./seller-profile.ts"')
fa3.write_text(text, encoding='utf-8')

text = snapshot.read_text(encoding='utf-8').replace('import "server-only";\n\n', '').replace('from "@/lib/ksef/fa3-active-vat"', 'from "./fa3-active-vat.ts"')
snapshot.write_text(text, encoding='utf-8')

text = prep.read_text(encoding='utf-8').replace('import "server-only";\n\n', '').replace('from "@/lib/ksef/seller-document-fa3"', 'from "./seller-document-fa3.ts"')
prep.write_text(text, encoding='utf-8')

text = orch.read_text(encoding='utf-8').replace('import "server-only";\n\n', '').replace('from "@/lib/ksef/seller-document-preparation"', 'from "./seller-document-preparation.ts"')
orch.write_text(text, encoding='utf-8')

text = check.read_text(encoding='utf-8').replace('from "@/lib/ksef/issuance-orchestrator"', 'from "./issuance-orchestrator.ts"')
check.write_text(text, encoding='utf-8')
PY

node --experimental-strip-types "$TMP_DIR/check-ksef-issuance-orchestrator.ts"
