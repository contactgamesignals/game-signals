import { landingRealityMarkup } from "@/lib/landing-reality";

function replace(source: string, before: string, after: string) {
  return source.includes(before) ? source.replace(before, after) : source;
}

let markup = landingRealityMarkup;

markup = replace(
  markup,
  "Who Plays My Game detects new YouTube videos and live streams on Twitch. Instead of manually searching the web, you get one clean feed of creator signals. Kick monitoring is planned, pending KICK developer approval.",
  "Who Plays My Game monitors Twitch streamers and new YouTube videos covering your game. Instead of manually searching YouTube and Twitch, you get one clean feed of creator mentions and game coverage. Kick monitoring is planned, pending KICK developer approval.",
);

markup = replace(
  markup,
  '<div class="result-sub">IndieScope · 4,8 tys. wyświetleń</div>',
  '<div class="result-sub">IndieScope · 4.8K views</div>',
);

markup = replace(
  markup,
  "That depends on the platform and the plan. Some signals can be detected close to real time, while others come from scheduled refreshes.",
  "That depends on the platform. Free accounts use a slower monitoring cadence, while every paid plan uses the same faster paid cadence. Detection still depends on platform APIs and scheduled refreshes.",
);

const pricingMarker = '<section class="section pricing-section" id="cennik">';
const seoSection = `<section class="section" id="creator-monitoring">
      <div class="shell">
        <div class="section-head">
          <div><div class="kicker">Built for game teams</div><h2>Twitch stream alerts and YouTube game monitoring for developers.</h2></div>
          <p class="section-lead">Track creator coverage around your game without repeatedly searching each platform. Who Plays My Game is focused creator monitoring for indie developers, studios, publishers, PR and community teams.</p>
        </div>
        <div class="workflow">
          <div class="step"><div class="step-num">TWITCH</div><div class="step-icon">◉</div><h3><a href="/twitch-stream-alerts-for-game-developers">Twitch stream alerts</a></h3><p>Get notified when Twitch streamers play your game so you can react while the stream is still live.</p></div>
          <div class="step"><div class="step-num">YOUTUBE</div><div class="step-icon" style="color:var(--violet2)">▶</div><h3><a href="/youtube-game-monitoring">YouTube game monitoring</a></h3><p>Track new YouTube videos, reviews, let&apos;s plays and organic creator coverage related to your game.</p></div>
          <div class="step"><div class="step-num">CREATORS</div><div class="step-icon" style="color:#ff91e7">◎</div><h3><a href="/game-creator-monitoring">Game creator monitoring</a></h3><p>Use one creator-signal feed as focused social listening for games across YouTube and Twitch.</p></div>
          <div class="step"><div class="step-num">WORKFLOW</div><div class="step-icon" style="color:var(--mint)">✦</div><h3>React, report, remember</h3><p>Use the live dashboard, Discord alerts, daily email digest and CSV export to turn discovered coverage into a repeatable workflow.</p></div>
        </div>
      </div>
    </section>

    ${pricingMarker}`;

markup = replace(markup, pricingMarker, seoSection);

export const landingSeoMarkup = markup;
