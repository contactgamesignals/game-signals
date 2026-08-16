import { authorizeRequest, json, jsonHeaders, serviceClient } from "../_shared/core.ts";

type Mention = {
  id: string;
  platform: "youtube" | "twitch" | "kick";
  creator_name: string;
  title: string;
  url: string;
  viewer_count: number | null;
  view_count: number | null;
  signal_score: number;
  detected_at: string;
  games: { title: string; workspace_id: string } | { title: string; workspace_id: string }[];
};

type Channel = {
  id: string;
  workspace_id: string;
  destination: string;
  minimum_signal_score: number;
  minimum_live_viewers: number;
};

type Delivery = {
  mention_id: string;
  notification_channel_id: string;
  status: "pending" | "delivered" | "failed";
  attempts: number;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: jsonHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const auth = await authorizeRequest(request);
    if (!auth.internal) return json({ error: "Email delivery is an internal worker." }, 403);

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const resendFrom = Deno.env.get("RESEND_FROM_EMAIL");
    if (!resendApiKey || !resendFrom) return json({ error: "Email provider is not configured." }, 503);

    const supabase = serviceClient();
    const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
    const [{ data: mentionsData }, { data: channelsData }] = await Promise.all([
      supabase
        .from("mentions")
        .select("id, platform, creator_name, title, url, viewer_count, view_count, signal_score, detected_at, games(title, workspace_id)")
        .gte("detected_at", since)
        .order("detected_at", { ascending: false })
        .limit(500),
      supabase
        .from("notification_channels")
        .select("id, workspace_id, destination, minimum_signal_score, minimum_live_viewers")
        .eq("type", "email")
        .eq("enabled", true),
    ]);

    const mentions = (mentionsData ?? []) as Mention[];
    const allChannels = (channelsData ?? []) as Channel[];
    if (!mentions.length || !allChannels.length) return json({ ok: true, delivered: 0, retried: 0 });

    const workspaceIds = Array.from(new Set(allChannels.map((channel) => channel.workspace_id)));
    const { data: subscriptionsData } = await supabase
      .from("subscriptions")
      .select("workspace_id, plan, status")
      .in("workspace_id", workspaceIds);

    const allowedWorkspaces = new Set(
      (subscriptionsData ?? [])
        .filter((subscription) =>
          (subscription.status === "active" || subscription.status === "trialing") &&
          (subscription.plan === "indie" || subscription.plan === "studio" || subscription.plan === "publisher"),
        )
        .map((subscription) => subscription.workspace_id as string),
    );

    const channels = allChannels.filter((channel) => allowedWorkspaces.has(channel.workspace_id));
    if (!channels.length) return json({ ok: true, delivered: 0, retried: 0 });

    const mentionIds = mentions.map((mention) => mention.id);
    const channelIds = channels.map((channel) => channel.id);
    const { data: deliveryData } = await supabase
      .from("delivered_notifications")
      .select("mention_id, notification_channel_id, status, attempts")
      .in("mention_id", mentionIds)
      .in("notification_channel_id", channelIds);

    const deliveries = new Map<string, Delivery>();
    for (const row of (deliveryData ?? []) as Delivery[]) {
      deliveries.set(`${row.mention_id}:${row.notification_channel_id}`, row);
    }

    let delivered = 0;
    let retried = 0;

    for (const mention of mentions) {
      const game = Array.isArray(mention.games) ? mention.games[0] : mention.games;
      if (!game) continue;

      const relevantChannels = channels.filter((channel) => channel.workspace_id === game.workspace_id);
      for (const channel of relevantChannels) {
        const key = `${mention.id}:${channel.id}`;
        const previous = deliveries.get(key);
        if (previous?.status === "delivered") continue;
        if ((previous?.attempts ?? 0) >= 5) continue;

        const liveViewers = mention.viewer_count ?? 0;
        if (mention.signal_score < channel.minimum_signal_score) continue;
        if (mention.platform !== "youtube" && liveViewers < channel.minimum_live_viewers) continue;

        if (previous) retried += 1;
        const reach = mention.view_count ?? mention.viewer_count ?? 0;
        const platformLabel = mention.platform === "youtube" ? "YouTube video" : `${mention.platform[0].toUpperCase()}${mention.platform.slice(1)} stream`;
        const subject = `${game.title}: new ${platformLabel} detected`;
        const safeCreator = escapeHtml(mention.creator_name);
        const safeGame = escapeHtml(game.title);
        const safeTitle = escapeHtml(mention.title);
        const safeUrl = escapeHtml(mention.url);
        const text = `${mention.creator_name} mentioned or started playing ${game.title}.\n\n${mention.title}\n${platformLabel}\nReach: ${reach}\nSignal score: ${mention.signal_score}/100\n\nOpen signal: ${mention.url}`;
        const html = `<div style="font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:620px;margin:0 auto;color:#101828;line-height:1.55"><div style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#475467;margin-bottom:12px">Who Plays My Game</div><h2 style="margin:0 0 12px;font-size:24px">New ${escapeHtml(platformLabel)} detected</h2><p style="margin:0 0 14px"><strong>${safeCreator}</strong> mentioned or started playing <strong>${safeGame}</strong>.</p><div style="padding:16px;border:1px solid #e4e7ec;border-radius:12px;margin:16px 0"><div style="font-weight:700;margin-bottom:6px">${safeTitle}</div><div style="color:#667085;font-size:14px">Reach: ${reach.toLocaleString("en-US")} · Signal score: ${mention.signal_score}/100</div></div><a href="${safeUrl}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:11px 16px;border-radius:9px;font-weight:700">Open signal</a><p style="color:#98a2b3;font-size:12px;margin-top:24px">Detected by Who Plays My Game.</p></div>`;

        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `gamesignal:${mention.id}:${channel.id}`,
          },
          body: JSON.stringify({
            from: resendFrom,
            to: [channel.destination],
            subject,
            text,
            html,
          }),
        });

        const success = response.ok;
        const attempts = (previous?.attempts ?? 0) + 1;
        await supabase.from("delivered_notifications").upsert({
          mention_id: mention.id,
          notification_channel_id: channel.id,
          delivered_at: success ? new Date().toISOString() : null,
          status: success ? "delivered" : "failed",
          error: success ? null : (await response.text()).slice(0, 1000),
          attempts,
        }, { onConflict: "mention_id,notification_channel_id" });

        deliveries.set(key, {
          mention_id: mention.id,
          notification_channel_id: channel.id,
          status: success ? "delivered" : "failed",
          attempts,
        });
        if (success) delivered += 1;
      }
    }

    return json({ ok: true, delivered, retried });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, message === "Unauthorized" ? 401 : 500);
  }
});
