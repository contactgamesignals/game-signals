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

type DigestItem = {
  mention: Mention;
  channel: Channel;
  gameTitle: string;
};

const PUBLIC_SITE_URL = "https://www.whoplaysmygame.com";
const PAGE_SIZE = 1000;
const MAX_MENTIONS_PER_DIGEST_WINDOW = 10_000;
const MAX_GAMES_IN_EMAIL = 12;
const MAX_CREATORS_IN_EMAIL = 8;
const MAX_SIGNALS_IN_EMAIL = 12;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function reach(mention: Mention) {
  return mention.view_count ?? mention.viewer_count ?? 0;
}

async function digestKey(destination: string, periodKey: string) {
  const bytes = new TextEncoder().encode(destination.trim().toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `who-plays-my-game/daily-digest/${periodKey}/${hash.slice(0, 32)}`;
}

async function loadMentionsForPeriod(
  supabase: ReturnType<typeof serviceClient>,
  periodStart: string,
  periodEnd: string,
) {
  const mentions: Mention[] = [];

  for (let offset = 0; offset < MAX_MENTIONS_PER_DIGEST_WINDOW; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("mentions")
      .select("id, platform, creator_name, title, url, viewer_count, view_count, signal_score, detected_at, games(title, workspace_id)")
      .gte("detected_at", periodStart)
      .lt("detected_at", periodEnd)
      .order("detected_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw error;
    const page = (data ?? []) as Mention[];
    mentions.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return mentions;
}

function buildDigest(destination: string, items: DigestItem[], periodStart: Date) {
  const byGame = new Map<string, { total: number; youtube: number; twitch: number }>();
  const byCreator = new Map<string, number>();
  let youtube = 0;
  let twitch = 0;

  for (const item of items) {
    const game = byGame.get(item.gameTitle) ?? { total: 0, youtube: 0, twitch: 0 };
    game.total += 1;
    if (item.mention.platform === "youtube") {
      game.youtube += 1;
      youtube += 1;
    } else if (item.mention.platform === "twitch") {
      game.twitch += 1;
      twitch += 1;
    }
    byGame.set(item.gameTitle, game);
    byCreator.set(item.mention.creator_name, (byCreator.get(item.mention.creator_name) ?? 0) + 1);
  }

  const gameRows = [...byGame.entries()]
    .sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0]))
    .slice(0, MAX_GAMES_IN_EMAIL);
  const creatorRows = [...byCreator.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_CREATORS_IN_EMAIL);
  const topSignals = [...items]
    .sort((a, b) => b.mention.signal_score - a.mention.signal_score || reach(b.mention) - reach(a.mention))
    .slice(0, MAX_SIGNALS_IN_EMAIL);

  const total = items.length;
  const periodLabel = periodStart.toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const subject = `Who Plays My Game - ${total} new signal${total === 1 ? "" : "s"} on ${periodLabel}`;

  const gameText = gameRows
    .map(([name, counts]) => `- ${name}: ${counts.total} total (${counts.youtube} YouTube, ${counts.twitch} Twitch)`)
    .join("\n");
  const creatorText = creatorRows.map(([name, count]) => `- ${name}: ${count}`).join("\n");
  const signalText = topSignals
    .map((item) => `- [${item.mention.platform.toUpperCase()}] ${item.gameTitle} - ${item.mention.creator_name}: ${item.mention.title} (${item.mention.signal_score}/100)\n  ${item.mention.url}`)
    .join("\n");
  const text = `Who Plays My Game - daily creator digest\n\n${periodLabel}\n${total} new signal${total === 1 ? "" : "s"}: ${youtube} YouTube, ${twitch} Twitch.\n\nBy game\n${gameText}\n\nTop creators\n${creatorText}\n\nTop signals\n${signalText}\n\nView all signals: ${PUBLIC_SITE_URL}/dashboard\n\nThis daily digest is sent only when new matching signals exist. Maximum one digest per recipient per day.`;

  const gameHtml = gameRows.map(([name, counts]) => `<tr><td style="padding:8px 12px 8px 0;font-weight:700">${escapeHtml(name)}</td><td style="padding:8px 0;color:#667085">${counts.total} total · ${counts.youtube} YouTube · ${counts.twitch} Twitch</td></tr>`).join("");
  const creatorHtml = creatorRows.map(([name, count]) => `<span style="display:inline-block;margin:0 8px 8px 0;padding:7px 10px;border:1px solid #e4e7ec;border-radius:999px">${escapeHtml(name)} · ${count}</span>`).join("");
  const signalsHtml = topSignals.map((item) => `<div style="padding:14px 0;border-top:1px solid #eaecf0"><div style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#667085">${escapeHtml(item.mention.platform)} · ${escapeHtml(item.gameTitle)} · score ${item.mention.signal_score}/100</div><div style="font-weight:700;margin:5px 0">${escapeHtml(item.mention.creator_name)} - ${escapeHtml(item.mention.title)}</div><a href="${escapeHtml(item.mention.url)}" style="color:#475467">Open signal</a></div>`).join("");
  const html = `<div style="font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:680px;margin:0 auto;color:#101828;line-height:1.55"><div style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#475467;margin-bottom:10px">Who Plays My Game</div><h1 style="font-size:28px;margin:0 0 6px">Daily creator digest</h1><p style="margin:0 0 20px;color:#667085">${escapeHtml(periodLabel)} · ${total} new signal${total === 1 ? "" : "s"}</p><div style="display:flex;gap:10px;margin-bottom:22px"><div style="padding:12px 16px;border:1px solid #e4e7ec;border-radius:12px"><strong>${youtube}</strong><br><span style="color:#667085">YouTube</span></div><div style="padding:12px 16px;border:1px solid #e4e7ec;border-radius:12px"><strong>${twitch}</strong><br><span style="color:#667085">Twitch</span></div></div><h2 style="font-size:18px;margin:22px 0 8px">By game</h2><table style="width:100%;border-collapse:collapse">${gameHtml}</table><h2 style="font-size:18px;margin:22px 0 10px">Top creators</h2><div>${creatorHtml}</div><h2 style="font-size:18px;margin:22px 0 0">Top signals</h2>${signalsHtml}<a href="${PUBLIC_SITE_URL}/dashboard" style="display:inline-block;margin-top:22px;background:#111827;color:#fff;text-decoration:none;padding:12px 17px;border-radius:9px;font-weight:700">View all signals</a><p style="color:#98a2b3;font-size:12px;margin-top:24px">Sent to ${escapeHtml(destination)}. This digest is sent only when new matching signals exist, with a maximum of one digest per recipient per day.</p></div>`;

  return { subject, text, html };
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
    const now = new Date();
    const currentDayStart = startOfUtcDay(now);
    const periodEnd = currentDayStart;
    const periodStart = new Date(periodEnd.getTime() - 24 * 60 * 60_000);
    const periodKey = dateKey(periodStart);

    const { data: channelsData, error: channelsError } = await supabase
      .from("notification_channels")
      .select("id, workspace_id, destination, minimum_signal_score, minimum_live_viewers")
      .eq("type", "email")
      .eq("enabled", true);
    if (channelsError) throw channelsError;

    const allChannels = (channelsData ?? []) as Channel[];
    if (!allChannels.length) return json({ ok: true, mode: "daily_digest", period: periodKey, recipients: 0, delivered: 0, skipped_empty: 0, skipped_already_sent: 0 });

    const workspaceIds = Array.from(new Set(allChannels.map((channel) => channel.workspace_id)));
    const { data: subscriptionsData, error: subscriptionsError } = await supabase
      .from("subscriptions")
      .select("workspace_id, plan, status")
      .in("workspace_id", workspaceIds);
    if (subscriptionsError) throw subscriptionsError;

    const allowedWorkspaces = new Set(
      (subscriptionsData ?? [])
        .filter((subscription) =>
          (subscription.status === "active" || subscription.status === "trialing") &&
          (subscription.plan === "indie" || subscription.plan === "studio" || subscription.plan === "publisher"),
        )
        .map((subscription) => subscription.workspace_id as string),
    );
    const channels = allChannels.filter((channel) => allowedWorkspaces.has(channel.workspace_id));
    if (!channels.length) return json({ ok: true, mode: "daily_digest", period: periodKey, recipients: 0, delivered: 0, skipped_empty: 0, skipped_already_sent: 0 });

    const channelIds = channels.map((channel) => channel.id);
    const { data: sentTodayData, error: sentTodayError } = await supabase
      .from("delivered_notifications")
      .select("notification_channel_id")
      .in("notification_channel_id", channelIds)
      .eq("status", "delivered")
      .gte("delivered_at", currentDayStart.toISOString());
    if (sentTodayError) throw sentTodayError;
    const sentToday = new Set((sentTodayData ?? []).map((row) => String(row.notification_channel_id)));

    const mentions = await loadMentionsForPeriod(supabase, periodStart.toISOString(), periodEnd.toISOString());
    const channelByWorkspace = new Map(channels.map((channel) => [channel.workspace_id, channel]));
    const itemsByDestination = new Map<string, { destination: string; items: DigestItem[]; channelIds: Set<string> }>();

    for (const mention of mentions) {
      if (mention.platform === "kick") continue;
      const game = Array.isArray(mention.games) ? mention.games[0] : mention.games;
      if (!game) continue;
      const channel = channelByWorkspace.get(game.workspace_id);
      if (!channel) continue;
      if (mention.signal_score < channel.minimum_signal_score) continue;
      if (mention.platform === "twitch" && (mention.viewer_count ?? 0) < channel.minimum_live_viewers) continue;

      const normalizedDestination = channel.destination.trim().toLowerCase();
      if (!normalizedDestination) continue;
      const group = itemsByDestination.get(normalizedDestination) ?? {
        destination: channel.destination.trim(),
        items: [],
        channelIds: new Set<string>(),
      };
      group.items.push({ mention, channel, gameTitle: game.title });
      group.channelIds.add(channel.id);
      itemsByDestination.set(normalizedDestination, group);
    }

    let delivered = 0;
    let skippedEmpty = 0;
    let skippedAlreadySent = 0;
    let failed = 0;

    const configuredDestinations = new Set(channels.map((channel) => channel.destination.trim().toLowerCase()).filter(Boolean));
    for (const destination of configuredDestinations) {
      const group = itemsByDestination.get(destination);
      if (!group?.items.length) {
        skippedEmpty += 1;
        continue;
      }

      if ([...group.channelIds].some((channelId) => sentToday.has(channelId))) {
        skippedAlreadySent += 1;
        continue;
      }

      const email = buildDigest(group.destination, group.items, periodStart);
      const idempotencyKey = await digestKey(group.destination, periodKey);
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          from: resendFrom,
          to: [group.destination],
          subject: email.subject,
          text: email.text,
          html: email.html,
        }),
      });

      if (!response.ok) {
        failed += 1;
        console.error("Daily digest delivery failed", group.destination, response.status, (await response.text()).slice(0, 1000));
        continue;
      }

      const deliveredAt = new Date().toISOString();
      const rows = group.items.map(({ mention, channel }) => ({
        mention_id: mention.id,
        notification_channel_id: channel.id,
        delivered_at: deliveredAt,
        status: "delivered",
        error: null,
        attempts: 1,
      }));
      const { error: deliveryError } = await supabase
        .from("delivered_notifications")
        .upsert(rows, { onConflict: "mention_id,notification_channel_id" });
      if (deliveryError) {
        // Resend idempotency prevents an accidental duplicate if this worker is
        // retried within 24 hours after the provider accepted the email.
        console.error("Daily digest sent but delivery markers could not be persisted", group.destination, deliveryError);
        failed += 1;
        continue;
      }

      delivered += 1;
      for (const channelId of group.channelIds) sentToday.add(channelId);
    }

    return json({
      ok: failed === 0,
      mode: "daily_digest",
      period: periodKey,
      recipients: configuredDestinations.size,
      delivered,
      failed,
      skipped_empty: skippedEmpty,
      skipped_already_sent: skippedAlreadySent,
      mention_window_count: mentions.length,
    }, failed === 0 ? 200 : 207);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, message === "Unauthorized" ? 401 : 500);
  }
});
