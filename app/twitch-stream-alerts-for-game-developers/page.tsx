import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Twitch Stream Alerts for Game Developers | ${BRAND.name}`,
  description:
    "Get notified when Twitch streamers start playing your game. Monitor live creator activity, viewer counts and send alerts to Discord.",
  alternates: { canonical: "/twitch-stream-alerts-for-game-developers" },
  openGraph: {
    title: `Twitch Stream Alerts for Game Developers | ${BRAND.name}`,
    description:
      "Monitor Twitch for streamers playing your game and react while the stream is still live.",
    url: `${BRAND.siteUrl}/twitch-stream-alerts-for-game-developers`,
    type: "website",
  },
};

export default function TwitchStreamAlertsPage() {
  return (
    <main className="auth-page" style={{ alignItems: "flex-start", paddingTop: 48, paddingBottom: 64 }}>
      <article className="auth-card" style={{ width: "min(920px, 100%)", maxWidth: 920 }}>
        <Link href="/" className="brand">
          <span className="brand-mark" />
          <span>{BRAND.name}</span>
        </Link>

        <div className="kicker" style={{ marginTop: 24 }}>Twitch monitoring for games</div>
        <h1>Twitch stream alerts for game developers</h1>
        <p>
          Find out when a Twitch streamer starts playing your game without keeping the Twitch directory open all day. {BRAND.name} monitors live creator activity around the games you track and puts matching streams into one dashboard.
        </p>
        <p>
          For a small studio, community manager or publisher, timing matters. A live stream can be the best moment to join the conversation, answer a question, share the stream with your community or simply learn how a new player experiences the game. A notification after the stream ends is often too late.
        </p>

        <h2>How Twitch game monitoring works</h2>
        <p>
          Add your game title, useful aliases and optional exclusion terms. The monitoring system checks Twitch for active streams that match the game you are tracking. Matching signals can include the streamer, current live-viewer information and a direct path back to the stream.
        </p>
        <p>
          Paid plans include Discord alerts alongside the live dashboard, so teams can react without repeatedly searching Twitch. All paid plans use the same monitoring cadence; the plan difference is the number of active games you can track.
        </p>

        <h2>How do I get notified when someone streams my game?</h2>
        <p>
          Add your game to {BRAND.name} and enable Twitch monitoring. When a matching creator starts streaming your game, the stream can appear in your dashboard and paid plans can send a Discord alert, helping you react while the stream is still live. You do not need to connect your own Twitch channel.
        </p>

        <h2>Who uses Twitch stream alerts?</h2>
        <ul>
          <li>Indie game developers who want to notice organic streams during launch or Early Access.</li>
          <li>Community managers who want to join relevant live conversations quickly.</li>
          <li>Publishers monitoring several titles from one place.</li>
          <li>PR and marketing teams tracking creator coverage after keys, events or updates.</li>
        </ul>

        <h2>Do I need to connect my own Twitch channel?</h2>
        <p>
          No. You are monitoring creator activity around your game, not notifications for your own streaming account. Basic setup starts with the game title and aliases. Monitoring relies on Twitch data and platform availability, so no tool can guarantee detection of every possible stream or instantaneous results in every case.
        </p>

        <h2>Twitch alerts plus YouTube monitoring</h2>
        <p>
          A creator may stream your game today and publish a YouTube video tomorrow. {BRAND.name} keeps both sources in the same creator-signal workflow so you do not have to maintain separate spreadsheets or searches for each platform.
        </p>

        <div className="dashboard-actions" style={{ marginTop: 28 }}>
          <Link className="btn btn-primary" href="/signup">Start monitoring free</Link>
          <Link className="btn btn-ghost" href="/youtube-game-monitoring">YouTube monitoring</Link>
          <Link className="btn btn-ghost" href="/game-creator-monitoring">Creator monitoring</Link>
          <Link className="btn btn-ghost" href="/">Product overview</Link>
        </div>
      </article>
    </main>
  );
}
