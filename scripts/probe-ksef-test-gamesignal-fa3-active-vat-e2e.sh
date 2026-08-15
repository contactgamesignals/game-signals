#!/usr/bin/env bash
set -euo pipefail

# Full technical KSeF TEST regression for the active-VAT GameSignal FA(3)
# document using the pinned official Ministry of Finance C# E2E client.
#
# SAFETY:
# - TEST environment only,
# - generated GameSignal XML is anonymized before any external KSeF call,
# - real seller NIP/name/address never enter KSeF TEST,
# - official harness generates a random TEST-only seller NIP and certificate,
# - tokens/certificates/UPO stay in an ephemeral directory and are never uploaded.

OFFICIAL_REPO="https://github.com/CIRFMF/ksef-client-csharp.git"
OFFICIAL_COMMIT="406904d69cc7b45fb393c97a5b9a475e62b2fef8"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
SAMPLE_PATH="$TMP_DIR/gamesignal-fa3-active-vat-test.xml"
LOG_PATH="$TMP_DIR/ksef-fa3-active-vat-e2e.log"
RESULTS_DIR="$TMP_DIR/test-results"
TRX_PATH="$RESULTS_DIR/ksef-gamesignal-fa3-active-vat.trx"
trap 'rm -rf "$TMP_DIR"' EXIT

sanitize_log() {
  sed -E \
    -e 's/(AccessToken|RefreshToken|AuthenticationToken):[^[:space:]]*/\1:[REDACTED]/g' \
    -e 's/eyJ[A-Za-z0-9_.-]{20,}/[REDACTED-JWT]/g' \
    -e 's/6762600090/[REDACTED-REAL-NIP]/g' \
    "$LOG_PATH" | tail -n 180
}

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

seller_text = seller.read_text(encoding="utf-8").replace('from "@/lib/company"', 'from "./company.ts"')
seller.write_text(seller_text, encoding="utf-8")

fa3_text = fa3.read_text(encoding="utf-8")
fa3_text = fa3_text.replace('import "server-only";\n\n', '')
fa3_text = fa3_text.replace('from "@/lib/seller-profile"', 'from "./seller-profile.ts"')
fa3.write_text(fa3_text, encoding="utf-8")

check_text = check.read_text(encoding="utf-8")
check_text = check_text.replace('from "@/lib/ksef/fa3-active-vat"', 'from "./fa3-active-vat.ts"')
check.write_text(check_text, encoding="utf-8")
PY

node --experimental-strip-types "$TMP_DIR/check-fa3-active-vat.ts" "$SAMPLE_PATH" >/dev/null

python3 - "$SAMPLE_PATH" <<'PY'
from pathlib import Path
import re
import sys

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")

def replace_nth(pattern: str, replacement: str, value: str, occurrence: int) -> str:
    matches = list(re.finditer(pattern, value))
    if len(matches) < occurrence:
        raise SystemExit(f"Expected at least {occurrence} occurrences for {pattern!r}.")
    match = matches[occurrence - 1]
    return value[:match.start()] + replacement + value[match.end():]

text = replace_nth(r"<NIP>[^<]+</NIP>", "<NIP>9999999999</NIP>", text, 1)
text = replace_nth(r"<Nazwa>[^<]+</Nazwa>", "<Nazwa>GameSignal KSeF TEST Active VAT Seller</Nazwa>", text, 1)
text = replace_nth(r"<AdresL1>[^<]+</AdresL1>", "<AdresL1>ul. Testowa 1, 00-001 Warszawa</AdresL1>", text, 1)

text = replace_nth(r"<NIP>[^<]+</NIP>", "<NIP>1111111111</NIP>", text, 2)
text = replace_nth(r"<Nazwa>[^<]+</Nazwa>", "<Nazwa>GameSignal KSeF TEST Buyer</Nazwa>", text, 2)
text = replace_nth(r"<AdresL1>[^<]+</AdresL1>", "<AdresL1>ul. Polna 1, 00-001 Warszawa</AdresL1>", text, 2)

text = re.sub(r"<SystemInfo>[^<]*</SystemInfo>", "<SystemInfo>GameSignal KSeF TEST Active VAT</SystemInfo>", text, count=1)
text = re.sub(r"<P_2>[^<]+</P_2>", "<P_2>#invoice_number#</P_2>", text, count=1)

for forbidden in ("6762600090", "Lumino Games", "Kazimierza Morawskiego", "Morawskiego 5/127", "Ujastek"):
    if forbidden in text:
        raise SystemExit(f"Real seller marker survived KSeF TEST anonymization: {forbidden}")

path.write_text(text, encoding="utf-8")
PY

chmod +x "$ROOT_DIR/scripts/validate-fa3-xsd.sh"
"$ROOT_DIR/scripts/validate-fa3-xsd.sh" "$SAMPLE_PATH" >/dev/null

python3 - "$SAMPLE_PATH" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
marker = "<NIP>9999999999</NIP>"
if text.count(marker) != 1:
    raise SystemExit("Expected exactly one synthetic TEST seller NIP before placeholder injection.")
text = text.replace(marker, "<NIP>#nip#</NIP>", 1)
if text.count("<NIP>#nip#</NIP>") != 1:
    raise SystemExit("MF TEST seller NIP placeholder was not injected exactly once.")
path.write_text(text, encoding="utf-8")
PY

git clone --quiet --no-tags "$OFFICIAL_REPO" "$TMP_DIR/ksef-client-csharp"
cd "$TMP_DIR/ksef-client-csharp"
git checkout --quiet "$OFFICIAL_COMMIT"

TEMPLATE="KSeF.Client.Tests.Core/Templates/invoice-template-fa-3.xml"
TEST_FILE="KSeF.Client.Tests.Core/E2E/OnlineSession/OnlineSessionE2ETests.cs"
if [[ ! -f "$TEMPLATE" || ! -f "$TEST_FILE" ]]; then
  echo "Pinned official KSeF OnlineSession E2E files were not found."
  exit 1
fi

cp "$SAMPLE_PATH" "$TEMPLATE"

python3 - "$TEST_FILE" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
fa2 = '\t[InlineData(SystemCode.FA2, "invoice-template-fa-2.xml")]\n'
if fa2 not in text:
    raise SystemExit("Pinned official OnlineSession E2E source changed unexpectedly.")
text = text.replace(fa2, "", 1)
path.write_text(text, encoding="utf-8")
PY

mkdir -p "$RESULTS_DIR"
set +e
dotnet test KSeF.Client.sln \
  --framework net10.0 \
  --filter 'FullyQualifiedName~OnlineSessionAsync_FullIntegrationFlow_AllStepsSucceed' \
  --logger 'trx;LogFileName=ksef-gamesignal-fa3-active-vat.trx' \
  --results-directory "$RESULTS_DIR" \
  >"$LOG_PATH" 2>&1
TEST_STATUS=$?
set -e

if [[ $TEST_STATUS -ne 0 ]]; then
  echo "GameSignal active-VAT FA(3) KSeF TEST probe failed. Sanitized diagnostic follows:"
  sanitize_log
  exit 1
fi

if [[ ! -f "$TRX_PATH" ]]; then
  echo "KSeF TEST command exited 0 but did not produce the expected TRX result."
  sanitize_log
  exit 1
fi

python3 - "$TRX_PATH" <<'PY'
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

path = Path(sys.argv[1])
root = ET.parse(path).getroot()
results = [element for element in root.iter() if element.tag.endswith("UnitTestResult")]
matching = [result for result in results if "OnlineSessionAsync_FullIntegrationFlow_AllStepsSucceed" in result.attrib.get("testName", "")]
if len(matching) != 1:
    raise SystemExit(f"Expected exactly one selected KSeF FA3 E2E result, found {len(matching)}.")
outcome = matching[0].attrib.get("outcome")
if outcome != "Passed":
    raise SystemExit(f"Selected KSeF FA3 E2E result was {outcome!r}, not 'Passed'.")
print("Pinned official MF active-VAT FA3 OnlineSession E2E TRX result: Passed.")
PY

for forbidden in "6762600090" "Lumino Games" "Kazimierza Morawskiego"; do
  if grep -Fq "$forbidden" "$LOG_PATH" || grep -Fq "$forbidden" "$TRX_PATH"; then
    echo "Real seller marker unexpectedly appeared in KSeF TEST output."
    exit 1
  fi
done

echo "GameSignal active-VAT FA(3) passed the pinned official MF KSeF TEST online-session + UPO flow."
