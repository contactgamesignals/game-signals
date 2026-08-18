import { createClient } from "npm:@supabase/supabase-js@2";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers });
}

function validDiscordWebhook(value: string) {
  try {
    const url = new URL(value);
    const allowedHosts = new Set(["discord.com", "www.discord.com", "discordapp.com", "www.discordapp.com"]);
    return url.protocol === "https:" && allowedHosts.has(url.hostname) && url.pathname.startsWith("/api/webhooks/");
  } catch {
    return false;
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authHeader = request.headers.get("Authorization");
    if (!supabaseUrl || !anonKey || !serviceKey || !authHeader) return json({ error: "Unauthorized." }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "Unauthorized." }, 401);

    const body = await request.json().catch(() => ({})) as {
      action?: "status" | "upsert" | "delete" | "test";
      workspace_id?: string;
      webhook_url?: string;
      minimum_signal_score?: number;
      minimum_live_viewers?: number;
    };
    if (!body.workspace_id || !body.action) return json({ error: "Missing workspace or action." }, 400);

    const [{ data: membership, error: membershipError }, { data: subscription }] = await Promise.all([
      userClient.from("workspace_members").select("role").eq("workspace_id", body.workspace_id).eq("user_id", authData.user.id).maybeSingle(),
      userClient.from("subscriptions").select("plan, status").eq("workspace_id", body.workspace_id).maybeSingle(),
    ]);
    if (membershipError || !membership) return json({ error: "Forbidden." }, 403);

    const plan = String(subscription?.plan ?? "free");
    const subscriptionActive = subscription?.status === "active" || subscription?.status === "trialing";
    const allowed = subscriptionActive && (plan === "indie" || plan === "studio" || plan === "publisher");

    const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: existing, error: channelError } = await service
      .from("notification_channels")
      .select("id, enabled, minimum_signal_score, minimum_live_viewers, destination")
      .eq("workspace_id", body.workspace_id)
      .eq("type", "discord")
      .limit(1)
      .maybeSingle();
    if (channelError) throw channelError;

    if (body.action === "status") {
      return json({
        configured: Boolean(existing),
        enabled: existing?.enabled ?? false,
        minimum_signal_score: existing?.minimum_signal_score ?? 0,
        minimum_live_viewers: existing?.minimum_live_viewers ?? 0,
        allowed,
        plan,
      });
    }

    if (membership.role !== "owner" && membership.role !== "admin") {
      return json({ error: "Only workspace owners and admins can change Discord settings." }, 403);
    }

    if (body.action === "delete") {
      if (existing) {
        const { error } = await service.from("notification_channels").delete().eq("id", existing.id);
        if (error) throw error;
      }
      return json({ ok: true, configured: false, allowed, plan });
    }

    if (!allowed) {
      return json({ error: "Discord alerts require an active paid plan." }, 403);
    }

    if (body.action === "test") {
      if (!existing) return json({ error: "Configure a Discord webhook first." }, 409);
      const response = await fetch(existing.destination, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "Who Plays My Game",
          embeds: [{
            title: "Discord alerts are ready",
            description: "**Example creator signal**\n\nYour webhook is connected correctly. Real alerts use this richer layout and include the detected content thumbnail when available.",
            url: "https://www.whoplaysmygame.com/dashboard",
            color: 0x35e7ff,
            fields: [
              { name: "Creator", value: "**ExampleCreator**", inline: true },
              { name: "Live viewers", value: "**184**", inline: true },
              { name: "Game", value: "**AFTERBLAST**", inline: true },
              { name: "Signal score", value: "**78/100**", inline: true },
              { name: "Open dashboard", value: "[View in Who Plays My Game](https://www.whoplaysmygame.com/dashboard)", inline: false },
            ],
            footer: { text: "Who Plays My Game • Test notification" },
            timestamp: new Date().toISOString(),
          }],
        }),
      });
      if (!response.ok) return json({ error: `Discord rejected the webhook (${response.status}).` }, 400);
      return json({ ok: true });
    }

    const webhook = body.webhook_url?.trim() ?? "";
    if (!validDiscordWebhook(webhook)) return json({ error: "Enter a valid Discord webhook URL." }, 400);
    const minimumSignalScore = Math.max(0, Math.min(100, Math.round(Number(body.minimum_signal_score ?? 0))));
    const minimumLiveViewers = Math.max(0, Math.round(Number(body.minimum_live_viewers ?? 0)));

    const { error: upsertError } = await service.from("notification_channels").upsert({
      workspace_id: body.workspace_id,
      type: "discord",
      destination: webhook,
      enabled: true,
      minimum_signal_score: minimumSignalScore,
      minimum_live_viewers: minimumLiveViewers,
    }, { onConflict: "workspace_id,type" });
    if (upsertError) throw upsertError;

    return json({ ok: true, configured: true, allowed, plan, minimum_signal_score: minimumSignalScore, minimum_live_viewers: minimumLiveViewers });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Unexpected error." }, 500);
  }
});
