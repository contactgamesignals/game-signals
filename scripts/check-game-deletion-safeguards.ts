import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync("app/api/games/[id]/route.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260910213000_restore_authenticated_game_delete_rpc.sql", "utf8");

assert.doesNotMatch(
  route,
  /getSupabaseAdminClient|SUPABASE_SERVICE_ROLE_KEY/,
  "Game deletion must not require a Supabase service-role key in Vercel.",
);
assert.match(
  route,
  /supabase\.rpc\("delete_workspace_game",\s*\{\s*p_game_id:\s*id,?\s*\}\)/,
  "Game deletion must use the authenticated delete_workspace_game RPC.",
);
assert.match(route, /Only workspace owners and admins can remove games\./);
assert.match(route, /cooldownCreated = Boolean\(deletedGame\.enabled && hadMonitoringAccess\)/);
assert.match(route, /readGameSlotState\(deletedGame\.workspace_id as string\)/);

assert.match(migration, /create or replace function public\.delete_workspace_game\(p_game_id uuid\)/);
assert.match(migration, /security definer/i);
assert.match(migration, /set search_path = ''/);
assert.match(migration, /set statement_timeout = '30s'/);
assert.match(migration, /v_user_id uuid := auth\.uid\(\)/);
assert.match(migration, /wm\.role::text in \('owner', 'admin'\)/);
assert.match(migration, /delete from public\.games g/);
assert.match(migration, /revoke all on function public\.delete_workspace_game\(uuid\) from public, anon, service_role/);
assert.match(migration, /grant execute on function public\.delete_workspace_game\(uuid\) to authenticated/);
assert.doesNotMatch(migration, /grant execute[\s\S]*to anon/);

console.log("Authenticated game deletion is owner/admin-gated, bounded, and independent of Vercel service-role credentials.");
