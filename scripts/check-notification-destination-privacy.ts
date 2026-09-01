import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const manageEmail = readFileSync("supabase/functions/manage-email/index.ts", "utf8");
assert.match(manageEmail, /const canManage = membership\.role === "owner" \|\| membership\.role === "admin"/);
assert.match(manageEmail, /destination:\s*canManage\s*\?/);
assert.match(manageEmail, /can_manage:\s*canManage/);
assert.match(manageEmail, /if \(!canManage\)/);

const digestSettings = readFileSync("components/EmailDigestSettings.tsx", "utf8");
assert.match(digestSettings, /can_manage:\s*boolean/);
assert.match(digestSettings, /!status\?\.can_manage/);
assert.match(digestSettings, /The saved destination is hidden\./);
assert.match(digestSettings, /!connected \|\| !canManage/);

const migration = readFileSync("supabase/migrations/20260901111500_harden_notification_destinations.sql", "utf8");
assert.match(migration, /revoke select on table public\.notification_channels from public, anon, authenticated/i);
assert.match(migration, /grant select \([\s\S]*\) on public\.notification_channels to anon, authenticated/i);
assert.match(migration, /grant select on table public\.notification_channels to service_role/i);

const browserGrant = migration.match(/grant select \(([\s\S]*?)\) on public\.notification_channels to anon, authenticated/i)?.[1] ?? "";
assert.ok(browserGrant, "Expected a column-level browser SELECT grant for notification_channels.");
assert.doesNotMatch(browserGrant, /\bdestination\b/i, "Browser roles must never receive SELECT access to notification_channels.destination.");

console.log("Notification destination privacy safeguards passed.");
