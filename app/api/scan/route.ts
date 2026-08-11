import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

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
    .select("id, youtube_last_scanned_at, twitch_last_scanned_at")
    .eq("id", body.gameId)
    .maybeSingle();
  if (!game) return NextResponse.json({ error: "Game not found." }, { status: 404 });

  const latestScan = [game.youtube_last_scanned_at, game.twitch_last_scanned_at]
    .filter(Boolean)
    .map((value) => new Date(value as string).getTime())
    .sort((a, b) => b - a)[0];
  if (latestScan && Date.now() - latestScan < 5 * 60_000) {
    return NextResponse.json(
      { error: "Manual scans are limited to one request every five minutes per game." },
      { status: 429 },
    );
  }

  const [twitch, youtube] = await Promise.all([
    supabase.functions.invoke("scan-twitch", { body: { game_id: body.gameId, force: true } }),
    supabase.functions.invoke("scan-youtube", { body: { game_id: body.gameId, force: true } }),
  ]);

  const errors = [twitch.error?.message, youtube.error?.message].filter(Boolean);
  if (errors.length === 2) {
    return NextResponse.json(
      { error: "Both platform scans failed.", details: errors.join(" | ") },
      { status: 502 },
    );
  }

  const details = errors.length
    ? `One platform scan completed. Other worker: ${errors[0]}`
    : "Twitch and YouTube scans completed.";

  return NextResponse.json({ ok: true, details });
}
