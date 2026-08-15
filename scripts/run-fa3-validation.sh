#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
SAMPLE_PATH="$TMP_DIR/gamesignal-fa3-sample.xml"
trap 'rm -rf "$TMP_DIR"' EXIT

# Node 22 can execute erasable TypeScript syntax. For this isolated validation
# copy only, rewrite application-only imports so the exact FA(3) generator
# logic can run without adding a separate tsx/ts-node dependency to GameSignal.
cp "$ROOT_DIR/lib/company.ts" "$TMP_DIR/company.ts"
cp "$ROOT_DIR/lib/ksef/fa3.ts" "$TMP_DIR/fa3.ts"
cp "$ROOT_DIR/scripts/check-fa3.ts" "$TMP_DIR/check-fa3.ts"

python3 - "$TMP_DIR/fa3.ts" "$TMP_DIR/check-fa3.ts" <<'PY'
from pathlib import Path
import sys

fa3 = Path(sys.argv[1])
check = Path(sys.argv[2])

fa3_text = fa3.read_text(encoding="utf-8")
fa3_text = fa3_text.replace('import "server-only";\n\n', '')
fa3_text = fa3_text.replace('from "@/lib/company"', 'from "./company.ts"')
fa3.write_text(fa3_text, encoding="utf-8")

check_text = check.read_text(encoding="utf-8")
check_text = check_text.replace('from "@/lib/ksef/fa3"', 'from "./fa3.ts"')
check.write_text(check_text, encoding="utf-8")
PY

node --experimental-strip-types "$TMP_DIR/check-fa3.ts" "$SAMPLE_PATH"

"$ROOT_DIR/scripts/validate-fa3-xsd.sh" "$SAMPLE_PATH"
