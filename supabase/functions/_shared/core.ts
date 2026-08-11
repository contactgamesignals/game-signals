import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export const jsonHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
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

export async function authorizeRequest(request: Request, gameId?: string) {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const suppliedCronSecret = request.headers.get("x-cron-secret");
  if (cronSecret && suppliedCronSecret === cronSecret) {
    return { internal: true, userId: null };
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
    const { data: game } = await userClient.from("games").select("id").eq("id", gameId).maybeSingle();
    if (!game) throw new Error("Forbidden");
  }

  return { internal: false, userId: data.user.id };
}

export function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

export type Plan = "free" | "indie" | "studio" | "publisher";

export function twitchCadenceMinutes(plan: Plan) {
  if (plan === "publisher") return 2;
  if (plan === "studio") return 3;
  return 5;
}

export function youtubeCadenceMinutes(plan: Plan) {
  if (plan === "publisher") return 30;
  if (plan === "studio") return 60;
  return 120;
}

export function signalScore(reach: number, isLive: boolean) {
  const base = reach <= 0 ? 12 : Math.min(72, Math.round(Math.log10(reach + 1) * 18));
  return Math.min(100, base + (isLive ? 18 : 8));
}
