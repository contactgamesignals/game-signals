import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const exposureRoots = ["app", "components", "supabase/functions"];
const forbidden = [
  "issueSellerDocumentToKsef",
  "seller-document-workflow",
  "createKsefOnlineIssuanceTransport",
];

function walk(directory: string): string[] {
  const absolute = join(root, directory);
  if (!existsSync(absolute)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(absolute)) {
    const path = join(absolute, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) files.push(...walk(relative(root, path)));
    else if (/\.(?:ts|tsx|js|jsx)$/.test(entry)) files.push(path);
  }
  return files;
}

for (const directory of exposureRoots) {
  for (const file of walk(directory)) {
    const source = readFileSync(file, "utf8");
    for (const token of forbidden) {
      assert.equal(
        source.includes(token),
        false,
        `${relative(root, file)} exposes KSeF legal issuance token ${token}; production issuance must remain inert until explicit go-live wiring.`,
      );
    }
  }
}

const provider = readFileSync(join(root, "lib/ksef/token-auth.ts"), "utf8");
assert.match(provider, /process\.env\.KSEF_SYSTEM_TOKEN/);
assert.doesNotMatch(provider, /console\.(?:log|info|warn|error)[\s\S]*KSEF_SYSTEM_TOKEN/i);

const serverGuard = readFileSync(join(root, "lib/ksef/server.ts"), "utf8");
assert.match(serverGuard, /KSEF_ENABLED === "true"/);
assert.match(serverGuard, /KSEF_PRODUCTION_UNLOCK/);
assert.match(serverGuard, /I_UNDERSTAND_KSEF_PRODUCTION_HAS_LEGAL_EFFECT/);

console.log("KSeF production issuance remains server-only, secret-gated and unexposed by app routes/UI/cron.");
