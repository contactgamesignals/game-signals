import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

const TWITCH_MANUAL_COOLDOWN_MS = 5 * 60_000;

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as { gameId?: string };
  if (!body.gameId) return NextResponse.json({ error: "Missing gameId." }, { status: 400 });

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { data: game } = await supabase
    .from("games")
    .select("id, youtube_next_scan_at, twitch_last_scanned_at")
    .eq("id", body.gameId)
    .maybeSingle();
  if (!game) return NextResponse.json({ error: "Game not found." }, { status: 404 });

  const now = Date.now();
  const twitchLast = game.twitch_last_scanned_at ? new Date(game.twitch_last_scanned_at).getTime() : null;
  const twitchDue = twitchLast === null || now - twitchLast >= TWITCH_MANUAL_COOLDOWN_MS;
  const youtubeNext = game.youtube_next_scan_at ? new Date(game.youtube_next_scan_at).getTime() : null;
  const youtubeDue = youtubeNext === null || youtubeNext <= now;

  const jobs: Array<{ platform: "twitch" | "youtube"; promise: ReturnType<typeof supabase.functions.invoke> }> = [];
  if (twitchDue) {
    jobs.push({ platform: "twitch", promise: supabase.functions.invoke("scan-twitch", { body: { game_id: body.gameId } }) });
  }
  if (youtubeDue) {
    jobs.push({ platform: "youtube", promise: supabase.functions.invoke("scan-youtube", { body: { game_id: body.gameId } }) });
  }

  if (!jobs.length) {
    return NextResponse.json({
      error: "Automatic monitoring is already up to date. YouTube follows your plan cadence and Twitch manual scans have a five-minute cooldown.",
      youtube_retry_at: game.youtube_next_scan_at,
      twitch_retry_at: twitchLast ? new Date(twitchLast + TWITCH_MANUAL_COOLDOWN_MS).toISOString() : null,
    }, { status: 429 });
  }

  const results = await Promise.all(jobs.map(async (job) => ({ platform: job.platform, result: await job.promise })));
  const failed = results.filter((item) => item.result.error);
  const completed = results.filter((item) => !item.result.error).map((item) => item.platform);

  if (failed.length === results.length) {
    return NextResponse.json({
      error: "Requested platform scans failed.",
      details: failed.map((item) => `${item.platform}: ${item.result.error?.message ?? "unknown error"}`).join(" | "),
    }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    details: `${completed.map((platform) => platform === "twitch" ? "Twitch" : "YouTube").join(" + ")} scan${completed.length === 1 ? "" : "s"} completed. Other platforms remain on their automatic cadence.`,
  });
}
