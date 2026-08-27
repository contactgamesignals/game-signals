import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Game Creator Monitoring for Developers & Publishers | ${BRAND.name}`,
  description:
    "Monitor creators covering your game on YouTube and Twitch. A focused game influencer monitoring and social-listening tool for developers and publishers.",
  alternates: { canonical: "/game-creator-monitoring" },
  openGraph: {
    title: `Game Creator Monitoring for Developers & Publishers | ${BRAND.name}`,
    description:
      "Monitor YouTube and Twitch creator coverage around your game without repetitive manual searching.",
    url: `${BRAND.siteUrl}/game-creator-monitoring`,
    type: "website",
  },
};

export default function GameCreatorMonitoringPage() {
  return (
    <main className="auth-page" style={{ alignItems: "flex-start", paddingTop: 48, paddingBottom: 64 }}>
      <article className="auth-card" style={{ width: "min(920px, 100%)", maxWidth: 920 }}>
        <Link href="/" className="brand">
          <span className="brand-mark" />
          <span>{BRAND.name}</span>
        </Link>

        <div className="kicker" style={{ marginTop: 24 }}>Creator monitoring for games</div>
        <h1>Game creator monitoring for developers and publishers</h1>
        <p>
          {BRAND.name} is a focused creator-monitoring tool for game teams that want to know who is playing, streaming or publishing videos about their titles. It brings YouTube videos and Twitch live streams into one signal feed instead of forcing your team to repeat the same searches across platforms.
        </p>
        <p>
          You can think of it as focused social listening for games: rather than trying to monitor every conversation on the internet, the product concentrates on actionable creator activity around the games you care about.
        </p>

        <h2>Creator monitoring instead of creator guesswork</h2>
        <p>
          Traditional influencer discovery starts with a list of creators you hope might cover your game. Creator monitoring answers a different question: who is already covering it right now? That makes it useful for spotting organic interest, reacting to unexpected coverage and building a better picture of the creators who naturally connect with your game.
        </p>

        <h2>What game teams can monitor</h2>
        <ul>
          <li>New YouTube videos that match a tracked game title and its aliases.</li>
          <li>Active Twitch streams playing or discussing the tracked game.</li>
          <li>Available public reach signals such as video views or live viewers.</li>
          <li>Creator signals collected into one authenticated dashboard.</li>
          <li>Discord alerts and opt-in daily email digests on paid plans.</li>
          <li>CSV export for reporting or additional analysis on paid plans.</li>
        </ul>

        <h2>Built for indie developers, studios and publishers</h2>
        <p>
          A solo developer may only need to monitor one active game. A studio might be supporting several releases, while a publisher may need one place to watch a larger portfolio. The paid tiers therefore differ by active-game capacity rather than hiding useful monitoring features behind higher plans.
        </p>

        <h2>Game influencer monitoring without paid placement</h2>
        <p>
          {BRAND.name} does not sell influencer posts or promise creator coverage. It helps you observe public creator activity that is already happening. That makes the product useful alongside PR outreach, key distribution, influencer campaigns or community management rather than replacing those workflows.
        </p>

        <h2>Why not just search manually?</h2>
        <p>
          Manual search works when you have one title and plenty of time. It becomes unreliable during launches, events, updates and multi-game portfolios because results appear at different times and on different platforms. Monitoring turns that repeated task into an ongoing workflow so the team can spend more time responding to useful signals and less time refreshing search pages.
        </p>

        <div className="dashboard-actions" style={{ marginTop: 28 }}>
          <Link className="btn btn-primary" href="/signup">Create free account</Link>
          <Link className="btn btn-ghost" href="/twitch-stream-alerts-for-game-developers">Twitch stream alerts</Link>
          <Link className="btn btn-ghost" href="/youtube-game-monitoring">YouTube monitoring</Link>
          <Link className="btn btn-ghost" href="/">Product overview</Link>
        </div>
      </article>
    </main>
  );
}
