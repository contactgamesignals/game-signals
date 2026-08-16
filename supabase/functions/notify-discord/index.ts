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

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: jsonHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const auth = await authorizeRequest(request);
    if (!auth.internal) return json({ error: "Discord delivery is an internal worker." }, 403);

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
        .eq("type", "discord")
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
          (subscription.plan === "studio" || subscription.plan === "publisher"),
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
        const response = await fetch(channel.destination, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": Deno.env.get("DISCORD_USER_AGENT") ?? "WhoPlaysMyGame/0.1",
          },
          body: JSON.stringify({
            username: "Who Plays My Game",
            embeds: [{
              title: mention.platform === "youtube" ? "New YouTube video detected" : `New ${mention.platform} stream detected`,
              description: `**${mention.creator_name}** mentioned or started playing **${game.title}**.`,
              url: mention.url,
              fields: [
                { name: mention.platform === "youtube" ? "Views" : "Live viewers", value: String(reach), inline: true },
                { name: "Signal score", value: `${mention.signal_score}/100`, inline: true },
              ],
              footer: { text: mention.title.slice(0, 200) },
              timestamp: mention.detected_at,
            }],
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
