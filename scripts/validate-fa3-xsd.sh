#!/usr/bin/env bash
set -euo pipefail

SAMPLE_PATH="${1:-/tmp/gamesignal-fa3-sample.xml}"
SCHEMA_REF="1c34fe2799387d517b83a2fb21e31e83d5f66247"
RAW_BASE="https://raw.githubusercontent.com/CIRFMF/ksef-api/${SCHEMA_REF}/faktury/schemy/FA"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

mkdir -p "$TMP_DIR/bazowe"

curl --fail --silent --show-error --location \
  "$RAW_BASE/schemat_FA(3)_v1-0E.xsd" \
  --output "$TMP_DIR/schema.xsd"
curl --fail --silent --show-error --location \
  "$RAW_BASE/bazowe/StrukturyDanych_v10-0E.xsd" \
  --output "$TMP_DIR/bazowe/StrukturyDanych_v10-0E.xsd"
curl --fail --silent --show-error --location \
  "$RAW_BASE/bazowe/ElementarneTypyDanych_v10-0E.xsd" \
  --output "$TMP_DIR/bazowe/ElementarneTypyDanych_v10-0E.xsd"
curl --fail --silent --show-error --location \
  "$RAW_BASE/bazowe/KodyKrajow_v10-0E.xsd" \
  --output "$TMP_DIR/bazowe/KodyKrajow_v10-0E.xsd"

python3 - "$TMP_DIR/schema.xsd" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
remote = "http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2022/01/05/eD/DefinicjeTypy/StrukturyDanych_v10-0E.xsd"
local = "bazowe/StrukturyDanych_v10-0E.xsd"
if remote not in text:
    raise SystemExit("Expected official FA(3) schema import was not found; review the pinned schema before changing validation.")
path.write_text(text.replace(remote, local), encoding="utf-8")
PY

if ! command -v xmllint >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo apt-get install -y -qq libxml2-utils
fi

xmllint --noout --schema "$TMP_DIR/schema.xsd" "$SAMPLE_PATH"
echo "FA(3) XML is valid against the pinned official MF schema."
