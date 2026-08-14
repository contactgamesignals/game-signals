#!/usr/bin/env bash
set -euo pipefail

# One-time / manual KSeF TEST authentication regression using the official
# Ministry of Finance C# client. No GameSignal seller identity is used:
# CertTestApp generates a random TEST-only NIP and a self-signed TEST certificate.
#
# SECURITY: the upstream demo prints access/refresh JWTs to stdout. We patch only
# the temporary clone on this ephemeral runner so tokens are redacted before run,
# redirect all output to /tmp, never upload artifacts, and delete everything on exit.

OFFICIAL_REPO="https://github.com/CIRFMF/ksef-client-csharp.git"
OFFICIAL_COMMIT="406904d69cc7b45fb393c97a5b9a475e62b2fef8"
TMP_DIR="$(mktemp -d)"
LOG_PATH="$TMP_DIR/ksef-auth.log"
trap 'rm -rf "$TMP_DIR"' EXIT

git clone --quiet --no-tags "$OFFICIAL_REPO" "$TMP_DIR/ksef-client-csharp"
cd "$TMP_DIR/ksef-client-csharp"
git checkout --quiet "$OFFICIAL_COMMIT"

PROGRAM="KSeF.Client.Tests.CertTestApp/Program.cs"
if [[ ! -f "$PROGRAM" ]]; then
  echo "Pinned official KSeF CertTestApp source was not found."
  exit 1
fi

# Defense in depth: redact JWT output in the ephemeral upstream source BEFORE execution.
python3 - "$PROGRAM" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
replacements = {
    'Console.WriteLine($"    AccessToken: {accessToken}");': 'Console.WriteLine("    AccessToken: [REDACTED]");',
    'Console.WriteLine($"    RefreshToken: {refreshToken}");': 'Console.WriteLine("    RefreshToken: [REDACTED]");',
    'Console.ReadKey();': '',
}
for old, new in replacements.items():
    if old not in text:
        raise SystemExit(f"Pinned official CertTestApp changed unexpectedly; missing marker: {old}")
    text = text.replace(old, new)
path.write_text(text, encoding="utf-8")
PY

set +e
dotnet run \
  --project KSeF.Client.Tests.CertTestApp/KSeF.Client.Tests.CertTestApp.csproj \
  --framework net10.0 \
  -- --output file \
  >"$LOG_PATH" 2>&1
DOTNET_STATUS=$?
set -e

SUCCESS_MARKER="Zakończono pomyślnie."
if [[ $DOTNET_STATUS -ne 0 ]] || ! grep -Fq "$SUCCESS_MARKER" "$LOG_PATH"; then
  echo "KSeF TEST XAdES authentication probe failed. Sanitized diagnostic follows:"
  # Never expose token-looking values even if the pinned upstream output changes.
  sed -E \
    -e 's/(AccessToken|RefreshToken|AuthenticationToken):[^[:space:]]*/\1:[REDACTED]/g' \
    -e 's/eyJ[A-Za-z0-9_.-]{20,}/[REDACTED-JWT]/g' \
    "$LOG_PATH" | tail -n 80
  exit 1
fi

if grep -Eq 'AccessToken: (?!\[REDACTED\])|RefreshToken: (?!\[REDACTED\])' "$LOG_PATH" 2>/dev/null; then
  echo "Unexpected unredacted token marker detected in local auth log."
  exit 1
fi

if ! grep -Fq "Status: 200" "$LOG_PATH"; then
  echo "KSeF TEST auth demo reported success without an observed status 200."
  exit 1
fi

# The demo's TEST-only PFX/XML artifacts remain only under TMP_DIR and are deleted by trap.
echo "KSeF TEST XAdES authentication passed using the pinned official MF client."
