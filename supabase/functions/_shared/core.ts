import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@6";

export const jsonHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret, x-gamesignal-scheduler",
};

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

export function serviceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) throw new Error("Supabase service environment is missing.");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

const githubJwks = createRemoteJWKSet(
  new URL("https://token.actions.githubusercontent.com/.well-known/jwks"),
);

const allowedSchedulerWorkflows = new Set([
  "contactgamesignals/game-signals/.github/workflows/scan-twitch.yml@refs/heads/main",
  "contactgamesignals/game-signals/.github/workflows/scan-youtube.yml@refs/heads/main",
]);

async function authorizeGithubScheduler(request: Request) {
  if (request.headers.get("x-gamesignal-scheduler") !== "github-actions") return null;

  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized");

  const token = authHeader.slice("Bearer ".length);
  const { payload } = await jwtVerify(token, githubJwks, {
    issuer: "https://token.actions.githubusercontent.com",
    audience: "gamesignal-scheduler",
    algorithms: ["RS256"],
  });

  const repository = String(payload.repository ?? "");
  const ref = String(payload.ref ?? "");
  const workflowRef = String(payload.workflow_ref ?? "");
  const eventName = String(payload.event_name ?? "");

  if (repository !== "contactgamesignals/game-signals") throw new Error("Forbidden");
  if (ref !== "refs/heads/main") throw new Error("Forbidden");
  if (!allowedSchedulerWorkflows.has(workflowRef)) throw new Error("Forbidden");
  if (!["schedule", "push", "workflow_dispatch"].includes(eventName)) throw new Error("Forbidden");

  return { internal: true, userId: null, scheduler: "github-actions" as const };
}

let cronHashCache: { value: string; expiresAt: number } | null = null;

async function expectedCronHash() {
  if (cronHashCache && cronHashCache.expiresAt > Date.now()) return cronHashCache.value;

  const { data, error } = await serviceClient()
    .from("internal_settings")
    .select("value")
    .eq("key", "cron_secret_sha256")
    .maybeSingle();

  if (error || !data?.value) return null;
  cronHashCache = { value: String(data.value), expiresAt: Date.now() + 5 * 60_000 };
  return cronHashCache.value;
}

async function validCronSecret(value: string | null) {
  if (!value) return false;
  const expected = await expectedCronHash();
  if (!expected) return false;

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return hash === expected;
}

export async function authorizeRequest(request: Request, gameId?: string) {
  try {
    const githubScheduler = await authorizeGithubScheduler(request);
    if (githubScheduler) return githubScheduler;
  } catch (error) {
    if (request.headers.get("x-gamesignal-scheduler") === "github-actions") throw error;
  }

  if (await validCronSecret(request.headers.get("x-cron-secret"))) {
    return { internal: true, userId: null, scheduler: "supabase-cron" as const };
  }

  const authHeader = request.headers.get("Authorization");
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!authHeader || !url || !anonKey) throw new Error("Unauthorized");

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) throw new Error("Unauthorized");

  if (gameId) {
    const { data: game } = await userClient
      .from("games")
      .select("id, workspace_id")
      .eq("id", gameId)
      .maybeSingle();
    if (!game) throw new Error("Forbidden");

    const { data: access, error: accessError } = await userClient
      .rpc("workspace_product_access", { p_workspace_id: game.workspace_id })
      .maybeSingle();
    const accessRow = access as { effective_plan?: unknown } | null;
    if (accessError || !accessRow || String(accessRow.effective_plan ?? "free") === "free") {
      throw new Error("Forbidden");
    }
  }

  return { internal: false, userId: data.user.id, scheduler: null };
}

export function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

export type Plan = "free" | "indie" | "studio" | "publisher" | "crazy";

export function twitchCadenceMinutes(_plan: Plan) {
  return 10;
}

export function youtubeCadenceMinutes(_plan: Plan) {
  // Free workspaces cannot have active monitors. Trial and paid monitors therefore share the production cadence.
  return 30;
}

export function signalScore(reach: number, isLive: boolean) {
  const base = reach <= 0 ? 12 : Math.min(72, Math.round(Math.log10(reach + 1) * 18));
  return Math.min(100, base + (isLive ? 18 : 8));
}
