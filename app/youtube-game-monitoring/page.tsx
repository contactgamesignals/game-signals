import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: `YouTube Game Monitoring for Developers | ${BRAND.name}`,
  description:
    "Track new YouTube videos about your game and discover creator coverage without manual searching. Built for indie developers, studios and publishers.",
  alternates: { canonical: "/youtube-game-monitoring" },
  openGraph: {
    title: `YouTube Game Monitoring for Developers | ${BRAND.name}`,
    description:
      "Track new YouTube videos covering your game and keep creator coverage in one dashboard.",
    url: `${BRAND.siteUrl}/youtube-game-monitoring`,
    type: "website",
  },
};

export default function YouTubeGameMonitoringPage() {
  return (
    <main className="auth-page" style={{ alignItems: "flex-start", paddingTop: 48, paddingBottom: 64 }}>
      <article className="auth-card" style={{ width: "min(920px, 100%)", maxWidth: 920 }}>
        <Link href="/" className="brand">
          <span className="brand-mark" />
          <span>{BRAND.name}</span>
        </Link>

        <div className="kicker" style={{ marginTop: 24 }}>YouTube monitoring for games</div>
        <h1>Track YouTube videos about your game</h1>
        <p>
          You should not have to search your game name on YouTube every morning to find out whether a creator uploaded a review, first-impressions video, let&apos;s play or feature. {BRAND.name} monitors new YouTube creator signals related to the games you track and collects them in one dashboard.
        </p>
        <p>
          This is useful before launch, during Steam Next Fest, after an update, during Early Access and long after release. Organic creator coverage can appear at any time, and smaller channels are especially easy to miss when the only process is manual search.
        </p>

        <h2>Game-specific YouTube monitoring</h2>
        <p>
          Start with the exact game title, then add aliases, studio-specific phrases or exclusion terms when needed. This is especially important for games with short, common or ambiguous names. Matching results surface the creator, video title, link and available public reach signals so your team can decide what deserves attention.
        </p>

        <h2>How do I find YouTubers playing my game?</h2>
        <p>
          Add your game title and useful aliases to {BRAND.name}. The service monitors YouTube for new videos related to your game and surfaces matching creators in one dashboard, helping you find YouTubers who are already covering or playing your game even if you did not know their channel before.
        </p>

        <h2>Why monitor YouTube creator coverage?</h2>
        <ul>
          <li>Discover reviews, let&apos;s plays, impressions and recommendation videos you did not arrange yourself.</li>
          <li>React to creator coverage while it is still fresh.</li>
          <li>Keep a record of useful signals instead of losing links across chats and spreadsheets.</li>
          <li>See YouTube and Twitch activity around the same game in one workflow.</li>
          <li>Export paid-plan creator signals to CSV when you need to report or analyze coverage elsewhere.</li>
        </ul>

        <h2>Is this the same as YouTube channel notifications?</h2>
        <p>
          No. Channel notifications tell you when creators you already follow upload something. Game monitoring starts from your game instead: the goal is to discover relevant videos even when you did not know the creator beforehand.
        </p>

        <h2>From a YouTube upload to a creator relationship</h2>
        <p>
          Finding coverage quickly lets a developer watch the video, understand how the game is being presented, thank the creator where appropriate, share useful coverage with the community and identify creators worth remembering for future updates. {BRAND.name} focuses on discovery and monitoring rather than paid influencer placement.
        </p>

        <div className="dashboard-actions" style={{ marginTop: 28 }}>
          <Link className="btn btn-primary" href="/signup">Create free account</Link>
          <Link className="btn btn-ghost" href="/twitch-stream-alerts-for-game-developers">Twitch stream alerts</Link>
          <Link className="btn btn-ghost" href="/game-creator-monitoring">Creator monitoring</Link>
          <Link className="btn btn-ghost" href="/">Product overview</Link>
        </div>
      </article>
    </main>
  );
}
