import { authorizeRequest, json, jsonHeaders, serviceClient } from "../_shared/core.ts";

type DigestDestination = {
  destination_key: string;
  destination: string;
  attempts: number;
};

type Channel = {
  notification_channel_id: string;
  workspace_id: string;
  destination: string;
  minimum_live_viewers: number;
};

type GameSummary = {
  game_title: string;
  total: number;
  youtube: number;
  twitch: number;
};

type CreatorSummary = {
  creator_name: string;
  total: number;
};

type SignalSummary = {
  id: string;
  platform: "youtube" | "twitch";
  creator_name: string;
  title: string;
  url: string;
  game_title: string;
  reach: number;
  detected_at: string;
};

type WorkspaceSummary = {
  total: number;
  youtube: number;
  twitch: number;
  games: GameSummary[];
  creators: CreatorSummary[];
  signals: SignalSummary[];
};

type CombinedSummary = WorkspaceSummary;

const PUBLIC_SITE_URL = "https://www.whoplaysmygame.com";
const EMAIL_DIGEST_START_HOUR_UTC = 6;
const EMAIL_DESTINATIONS_PER_RUN = 25;
const EMAIL_DESTINATION_CONCURRENCY = 5;
const WORKSPACE_SUMMARY_CONCURRENCY = 10;
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

function numeric(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function mapLimit<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(Math.max(1, concurrency), Math.max(1, items.length)) }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

function normalizeSummary(value: unknown): WorkspaceSummary {
  const input = (value ?? {}) as Record<string, unknown>;
  return {
    total: numeric(input.total),
    youtube: numeric(input.youtube),
    twitch: numeric(input.twitch),
    games: Array.isArray(input.games) ? input.games.map((row) => {
      const item = row as Record<string, unknown>;
      return {
        game_title: String(item.game_title ?? "Unknown game"),
        total: numeric(item.total),
        youtube: numeric(item.youtube),
        twitch: numeric(item.twitch),
      };
    }) : [],
    creators: Array.isArray(input.creators) ? input.creators.map((row) => {
      const item = row as Record<string, unknown>;
      return {
        creator_name: String(item.creator_name ?? "Unknown creator"),
        total: numeric(item.total),
      };
    }) : [],
    signals: Array.isArray(input.signals) ? input.signals.map((row) => {
      const item = row as Record<string, unknown>;
      return {
        id: String(item.id ?? ""),
        platform: item.platform === "youtube" ? "youtube" : "twitch",
        creator_name: String(item.creator_name ?? "Unknown creator"),
        title: String(item.title ?? "Untitled signal"),
        url: String(item.url ?? PUBLIC_SITE_URL),
        game_title: String(item.game_title ?? "Unknown game"),
        reach: numeric(item.reach),
        detected_at: String(item.detected_at ?? new Date(0).toISOString()),
      };
    }) : [],
  };
}

function combineSummaries(summaries: WorkspaceSummary[]): CombinedSummary {
  const games = new Map<string, GameSummary>();
  const creators = new Map<string, CreatorSummary>();
  const signals = new Map<string, SignalSummary>();
  let total = 0;
  let youtube = 0;
  let twitch = 0;

  for (const summary of summaries) {
    total += summary.total;
    youtube += summary.youtube;
    twitch += summary.twitch;

    for (const row of summary.games) {
      const key = row.game_title.toLocaleLowerCase();
      const current = games.get(key) ?? { game_title: row.game_title, total: 0, youtube: 0, twitch: 0 };
      current.total += row.total;
      current.youtube += row.youtube;
      current.twitch += row.twitch;
      games.set(key, current);
    }

    for (const row of summary.creators) {
      const key = row.creator_name.toLocaleLowerCase();
      const current = creators.get(key) ?? { creator_name: row.creator_name, total: 0 };
      current.total += row.total;
      creators.set(key, current);
    }

    for (const signal of summary.signals) {
      if (!signal.id || signals.has(signal.id)) continue;
      signals.set(signal.id, signal);
    }
  }

  return {
    total,
    youtube,
    twitch,
    games: Array.from(games.values())
      .sort((a, b) => b.total - a.total || a.game_title.localeCompare(b.game_title))
      .slice(0, MAX_GAMES_IN_EMAIL),
    creators: Array.from(creators.values())
      .sort((a, b) => b.total - a.total || a.creator_name.localeCompare(b.creator_name))
      .slice(0, MAX_CREATORS_IN_EMAIL),
    signals: Array.from(signals.values())
      .sort((a, b) => b.reach - a.reach || Date.parse(b.detected_at) - Date.parse(a.detected_at))
      .slice(0, MAX_SIGNALS_IN_EMAIL),
  };
}

function buildDigest(destination: string, summary: CombinedSummary, periodStart: Date) {
  const periodLabel = periodStart.toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const subject = `Who Plays My Game - ${summary.total} new signal${summary.total === 1 ? "" : "s"} on ${periodLabel}`;

  const gameText = summary.games
    .map((row) => `- ${row.game_title}: ${row.total} total (${row.youtube} YouTube, ${row.twitch} Twitch)`)
    .join("\n");
  const creatorText = summary.creators.map((row) => `- ${row.creator_name}: ${row.total}`).join("\n");
  const signalText = summary.signals
    .map((item) => `- [${item.platform.toUpperCase()}] ${item.game_title} - ${item.creator_name}: ${item.title}\n  ${item.url}`)
    .join("\n");
  const text = `Who Plays My Game - daily creator digest\n\n${periodLabel}\n${summary.total} new signal${summary.total === 1 ? "" : "s"}: ${summary.youtube} YouTube, ${summary.twitch} Twitch.\n\nBy game\n${gameText}\n\nTop creators\n${creatorText}\n\nTop signals\n${signalText}\n\nView all signals: ${PUBLIC_SITE_URL}/dashboard\n\nThis daily digest is sent only when new matching signals exist. Maximum one digest per recipient per day.`;

  const gameHtml = summary.games.map((row) => `<tr><td style="padding:8px 12px 8px 0;font-weight:700">${escapeHtml(row.game_title)}</td><td style="padding:8px 0;color:#667085">${row.total} total · ${row.youtube} YouTube · ${row.twitch} Twitch</td></tr>`).join("");
  const creatorHtml = summary.creators.map((row) => `<span style="display:inline-block;margin:0 8px 8px 0;padding:7px 10px;border:1px solid #e4e7ec;border-radius:999px">${escapeHtml(row.creator_name)} · ${row.total}</span>`).join("");
  const signalsHtml = summary.signals.map((item) => `<div style="padding:14px 0;border-top:1px solid #eaecf0"><div style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#667085">${escapeHtml(item.platform)} · ${escapeHtml(item.game_title)}</div><div style="font-weight:700;margin:5px 0">${escapeHtml(item.creator_name)} - ${escapeHtml(item.title)}</div><a href="${escapeHtml(item.url)}" style="color:#475467">Open signal</a></div>`).join("");
  const html = `<div style="font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:680px;margin:0 auto;color:#101828;line-height:1.55"><div style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#475467;margin-bottom:10px">Who Plays My Game</div><h1 style="font-size:28px;margin:0 0 6px">Daily creator digest</h1><p style="margin:0 0 20px;color:#667085">${escapeHtml(periodLabel)} · ${summary.total} new signal${summary.total === 1 ? "" : "s"}</p><div style="display:flex;gap:10px;margin-bottom:22px"><div style="padding:12px 16px;border:1px solid #e4e7ec;border-radius:12px"><strong>${summary.youtube}</strong><br><span style="color:#667085">YouTube</span></div><div style="padding:12px 16px;border:1px solid #e4e7ec;border-radius:12px"><strong>${summary.twitch}</strong><br><span style="color:#667085">Twitch</span></div></div><h2 style="font-size:18px;margin:22px 0 8px">By game</h2><table style="width:100%;border-collapse:collapse">${gameHtml}</table><h2 style="font-size:18px;margin:22px 0 10px">Top creators</h2><div>${creatorHtml}</div><h2 style="font-size:18px;margin:22px 0 0">Top signals</h2>${signalsHtml}<a href="${PUBLIC_SITE_URL}/dashboard" style="display:inline-block;margin-top:22px;background:#111827;color:#fff;text-decoration:none;padding:12px 17px;border-radius:9px;font-weight:700">View all signals</a><p style="color:#98a2b3;font-size:12px;margin-top:24px">Sent to ${escapeHtml(destination)}. This digest is sent only when new matching signals exist, with a maximum of one digest per recipient per day.</p></div>`;

  return { subject, text, html };
}

async function completeDestination(
  supabase: ReturnType<typeof serviceClient>,
  destination: DigestDestination,
  periodDate: string,
  success: boolean,
  providerMessageId: string | null,
  error: string | null,
) {
  const { error: rpcError } = await supabase.rpc("complete_email_digest_destination", {
    p_destination_key: destination.destination_key,
    p_period_date: periodDate,
    p_success: success,
    p_provider_message_id: providerMessageId,
    p_error: error,
  });
  if (rpcError) throw rpcError;
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

    const now = new Date();
    if (now.getUTCHours() < EMAIL_DIGEST_START_HOUR_UTC) {
      return json({ ok: true, mode: "daily_digest", waiting_for_utc_hour: EMAIL_DIGEST_START_HOUR_UTC });
    }

    const currentDayStart = startOfUtcDay(now);
    const periodEnd = currentDayStart;
    const periodStart = new Date(periodEnd.getTime() - 24 * 60 * 60_000);
    const periodDate = dateKey(periodStart);
    const supabase = serviceClient();

    const { error: prepareError } = await supabase.rpc("prepare_email_digest_period", { p_period_date: periodDate });
    if (prepareError) throw prepareError;

    const { data: destinationData, error: claimError } = await supabase.rpc("claim_email_digest_destinations", {
      p_period_date: periodDate,
      p_limit: EMAIL_DESTINATIONS_PER_RUN,
    });
    if (claimError) throw claimError;

    const destinations = (destinationData ?? []) as DigestDestination[];
    if (!destinations.length) {
      return json({ ok: true, mode: "daily_digest", period: periodDate, claimed: 0, delivered: 0, skipped_empty: 0, failed: 0 });
    }

    const results = await mapLimit(destinations, EMAIL_DESTINATION_CONCURRENCY, async (destination) => {
      try {
        const { data: channelData, error: channelError } = await supabase.rpc("email_digest_channels_for_destination", {
          p_destination: destination.destination,
        });
        if (channelError) throw channelError;

        const channels = (channelData ?? []) as Channel[];
        if (!channels.length) {
          await completeDestination(supabase, destination, periodDate, true, null, null);
          return { delivered: 0, skippedEmpty: 1, failed: 0 };
        }

        const summaryResults = await mapLimit(channels, WORKSPACE_SUMMARY_CONCURRENCY, async (channel) => {
          const { data, error } = await supabase.rpc("email_digest_workspace_summary", {
            p_workspace_id: channel.workspace_id,
            p_period_start: periodStart.toISOString(),
            p_period_end: periodEnd.toISOString(),
            p_minimum_live_viewers: channel.minimum_live_viewers,
          });
          if (error) throw error;
          return normalizeSummary(data);
        });

        const combined = combineSummaries(summaryResults);
        if (combined.total <= 0) {
          await completeDestination(supabase, destination, periodDate, true, null, null);
          return { delivered: 0, skippedEmpty: 1, failed: 0 };
        }

        const email = buildDigest(destination.destination, combined, periodStart);
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `who-plays-my-game/daily-digest/${periodDate}/${destination.destination_key.slice(0, 40)}`,
          },
          body: JSON.stringify({
            from: resendFrom,
            to: [destination.destination],
            subject: email.subject,
            text: email.text,
            html: email.html,
          }),
        });

        if (!response.ok) {
          const errorText = (await response.text()).slice(0, 1000);
          await completeDestination(supabase, destination, periodDate, false, null, errorText);
          return { delivered: 0, skippedEmpty: 0, failed: 1 };
        }

        const providerPayload = await response.json().catch(() => ({})) as { id?: string };
        await completeDestination(supabase, destination, periodDate, true, providerPayload.id ?? null, null);
        return { delivered: 1, skippedEmpty: 0, failed: 0 };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await completeDestination(supabase, destination, periodDate, false, null, message).catch(() => undefined);
        return { delivered: 0, skippedEmpty: 0, failed: 1 };
      }
    });

    const delivered = results.reduce((sum, result) => sum + result.delivered, 0);
    const skippedEmpty = results.reduce((sum, result) => sum + result.skippedEmpty, 0);
    const failed = results.reduce((sum, result) => sum + result.failed, 0);

    return json({
      ok: failed === 0,
      mode: "daily_digest",
      period: periodDate,
      claimed: destinations.length,
      delivered,
      skipped_empty: skippedEmpty,
      failed,
    }, failed === 0 ? 200 : 207);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, message === "Unauthorized" ? 401 : 500);
  }
});
