#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
SAMPLE_PATH="$TMP_DIR/gamesignal-fa3-active-vat-sample.xml"
trap 'rm -rf "$TMP_DIR"' EXIT

cp "$ROOT_DIR/lib/company.ts" "$TMP_DIR/company.ts"
cp "$ROOT_DIR/lib/seller-profile.ts" "$TMP_DIR/seller-profile.ts"
cp "$ROOT_DIR/lib/ksef/fa3-active-vat.ts" "$TMP_DIR/fa3-active-vat.ts"
cp "$ROOT_DIR/scripts/check-fa3-active-vat.ts" "$TMP_DIR/check-fa3-active-vat.ts"

python3 - "$TMP_DIR/seller-profile.ts" "$TMP_DIR/fa3-active-vat.ts" "$TMP_DIR/check-fa3-active-vat.ts" <<'PY'
from pathlib import Path
import sys

seller = Path(sys.argv[1])
fa3 = Path(sys.argv[2])
check = Path(sys.argv[3])

seller_text = seller.read_text(encoding="utf-8")
seller_text = seller_text.replace('from "@/lib/company"', 'from "./company.ts"')
seller.write_text(seller_text, encoding="utf-8")

fa3_text = fa3.read_text(encoding="utf-8")
fa3_text = fa3_text.replace('import "server-only";\n\n', '')
fa3_text = fa3_text.replace('from "@/lib/seller-profile"', 'from "./seller-profile.ts"')
fa3.write_text(fa3_text, encoding="utf-8")

check_text = check.read_text(encoding="utf-8")
check_text = check_text.replace('from "@/lib/ksef/fa3-active-vat"', 'from "./fa3-active-vat.ts"')
check.write_text(check_text, encoding="utf-8")
PY

node --experimental-strip-types "$TMP_DIR/check-fa3-active-vat.ts" "$SAMPLE_PATH"
"$ROOT_DIR/scripts/validate-fa3-xsd.sh" "$SAMPLE_PATH"
