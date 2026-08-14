#!/usr/bin/env bash
set -euo pipefail

# Full technical KSeF TEST regression for the GameSignal FA(3) document using the
# pinned official Ministry of Finance C# E2E client.
#
# SAFETY:
# - TEST environment only (the pinned MF TestBase points to KSeF TEST),
# - the generated GameSignal XML is anonymized before leaving this runner,
# - Lumino NIP/name/address never enter KSeF TEST,
# - the official test generates a random TEST-only seller NIP and self-signed auth cert,
# - no tokens/certificates/UPO are uploaded as artifacts,
# - the entire official clone and generated XML are deleted on exit.

OFFICIAL_REPO="https://github.com/CIRFMF/ksef-client-csharp.git"
OFFICIAL_COMMIT="406904d69cc7b45fb393c97a5b9a475e62b2fef8"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
SAMPLE_PATH="$TMP_DIR/gamesignal-fa3-test.xml"
LOG_PATH="$TMP_DIR/ksef-fa3-e2e.log"
trap 'rm -rf "$TMP_DIR"' EXIT

# Generate the exact current GameSignal FA(3) sample without adding a TS runner dependency.
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

node --experimental-strip-types "$TMP_DIR/check-fa3.ts" "$SAMPLE_PATH" >/dev/null

# Remove all real seller identity from the generated XML and prepare the placeholders
# expected by the official OnlineSession E2E harness.
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

# Podmiot1 seller: random TEST NIP will be injected by the pinned MF test harness.
text = replace_nth(r"<NIP>[^<]+</NIP>", "<NIP>#nip#</NIP>", text, 1)
text = replace_nth(r"<Nazwa>[^<]+</Nazwa>", "<Nazwa>GameSignal KSeF TEST Seller</Nazwa>", text, 1)
text = replace_nth(r"<AdresL1>[^<]+</AdresL1>", "<AdresL1>ul. Testowa 1, 00-001 Warszawa</AdresL1>", text, 1)

# Podmiot2 buyer: use the same synthetic value present in the official MF FA(3) E2E template.
text = replace_nth(r"<NIP>[^<]+</NIP>", "<NIP>1111111111</NIP>", text, 2)
text = replace_nth(r"<Nazwa>[^<]+</Nazwa>", "<Nazwa>GameSignal KSeF TEST Buyer</Nazwa>", text, 2)
text = replace_nth(r"<AdresL1>[^<]+</AdresL1>", "<AdresL1>ul. Polna 1, 00-001 Warszawa</AdresL1>", text, 2)

text = re.sub(r"<SystemInfo>[^<]*</SystemInfo>", "<SystemInfo>GameSignal KSeF TEST</SystemInfo>", text, count=1)
text = re.sub(r"<P_2>[^<]+</P_2>", "<P_2>#invoice_number#</P_2>", text, count=1)

# Hard fail if any known real seller identifiers survived anonymization.
for forbidden in ("6762600090", "Lumino Games", "Ujastek"):
    if forbidden in text:
        raise SystemExit(f"Real seller marker survived KSeF TEST anonymization: {forbidden}")

path.write_text(text, encoding="utf-8")
PY

# Re-validate the anonymized XML against the official pinned XSD before it is sent.
chmod +x "$ROOT_DIR/scripts/validate-fa3-xsd.sh"
"$ROOT_DIR/scripts/validate-fa3-xsd.sh" "$SAMPLE_PATH" >/dev/null

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

# Run only the FA(3) branch of the official full integration theory. The temporary
# modification never leaves this runner and the official commit is still pinned.
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

set +e
dotnet test \
  KSeF.Client.Tests.Core/KSeF.Client.Tests.Core.csproj \
  --framework net10.0 \
  --filter 'FullyQualifiedName~OnlineSessionAsync_FullIntegrationFlow_AllStepsSucceed' \
  --no-restore \
  >"$LOG_PATH" 2>&1
FIRST_STATUS=$?
set -e

# The first invocation may need NuGet restore on a clean runner. Retry once with restore
# while keeping all output private in /tmp.
if [[ $FIRST_STATUS -ne 0 ]] && grep -Eqi 'assets file.*not found|run a NuGet package restore|project.assets.json' "$LOG_PATH"; then
  set +e
  dotnet test \
    KSeF.Client.Tests.Core/KSeF.Client.Tests.Core.csproj \
    --framework net10.0 \
    --filter 'FullyQualifiedName~OnlineSessionAsync_FullIntegrationFlow_AllStepsSucceed' \
    >"$LOG_PATH" 2>&1
  TEST_STATUS=$?
  set -e
else
  TEST_STATUS=$FIRST_STATUS
fi

if [[ $TEST_STATUS -ne 0 ]]; then
  echo "GameSignal FA(3) KSeF TEST online-session probe failed. Sanitized diagnostic follows:"
  sed -E \
    -e 's/(AccessToken|RefreshToken|AuthenticationToken):[^[:space:]]*/\1:[REDACTED]/g' \
    -e 's/eyJ[A-Za-z0-9_.-]{20,}/[REDACTED-JWT]/g' \
    -e 's/6762600090/[REDACTED-REAL-NIP]/g' \
    "$LOG_PATH" | tail -n 120
  exit 1
fi

# xUnit must report the selected integration test as passed.
if ! grep -Eqi 'Passed!|Passed:' "$LOG_PATH"; then
  echo "KSeF TEST command exited successfully but no xUnit pass marker was found."
  exit 1
fi

if grep -Fq "6762600090" "$LOG_PATH"; then
  echo "Real seller NIP unexpectedly appeared in KSeF TEST output."
  exit 1
fi

# Session references, KSeF number and UPO remain only inside the ephemeral xUnit run/log.
echo "GameSignal FA(3) passed the pinned official MF KSeF TEST online-session + UPO flow."
