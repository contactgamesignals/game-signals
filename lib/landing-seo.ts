import { landingRealityMarkup } from "@/lib/landing-reality";

function replace(source: string, before: string, after: string) {
  return source.includes(before) ? source.replace(before, after) : source;
}

let markup = landingRealityMarkup;

markup = replace(
  markup,
  "Who Plays My Game detects new YouTube videos and live streams on Twitch. Instead of manually searching the web, you get one clean feed of creator signals. Kick monitoring is planned, pending KICK developer approval.",
  "Who Plays My Game monitors new YouTube videos and Twitch streams about your game, puts every match into one dashboard, sends Discord alerts, and gives you one daily email digest when new signals appear.",
);

markup = replace(
  markup,
  "Public beta is open. Create a free account and start monitoring YouTube and Twitch; paid checkout will open after Paddle LIVE activation.",
  "Start with a free public beta account, no card required. Upgrade when you want Discord alerts, the daily email digest, CSV export and faster paid monitoring.",
);

markup = replace(
  markup,
  '<button class="btn btn-primary" data-open="onboarding">Add game</button>',
  '<a class="btn btn-primary" href="/signup">Register</a>',
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

markup = replace(
  markup,
  "Public beta pricing. Paid plans include the same features and monitoring cadence; the only difference is how many active games you can monitor. New paid subscriptions will open after Paddle LIVE activation.",
  "Indie, Studio and Publisher include the same paid features and the same monitoring cadence. The only difference is how many active games you can monitor.",
);

const fullPaidFeatures = '<li><span class="check">✓</span>YouTube + Twitch monitoring</li><li><span class="check">✓</span>Live creator signal dashboard</li><li><span class="check">✓</span>Discord alerts</li><li><span class="check">✓</span>Opt-in daily email digest</li><li><span class="check">✓</span>CSV signal export</li><li><span class="check">✓</span>Aliases and exclusion terms</li><li><span class="check">✓</span>Fastest paid monitoring cadence</li>';

markup = replace(
  markup,
  '<ul><li><span class="check">✓</span>1 active tracked game</li><li><span class="check">✓</span>YouTube + Twitch monitoring</li><li><span class="check">✓</span>Discord + daily email digest</li><li><span class="check">✓</span>CSV signal export</li><li><span class="check">✓</span>Fastest paid monitoring cadence</li></ul>',
  `<div class="same-feature-badge">Same full feature set</div><ul><li><span class="check">✓</span>1 active tracked game</li>${fullPaidFeatures}</ul>`,
);

markup = replace(
  markup,
  '<ul><li><span class="check">✓</span>Up to 3 active games</li><li><span class="check">✓</span>YouTube + Twitch monitoring</li><li><span class="check">✓</span>Discord + daily email digest</li><li><span class="check">✓</span>CSV signal export</li><li><span class="check">✓</span>Fastest paid monitoring cadence</li></ul>',
  `<div class="same-feature-badge">Same full feature set</div><ul><li><span class="check">✓</span>Up to 3 active games</li>${fullPaidFeatures}</ul>`,
);

markup = replace(
  markup,
  '<ul><li><span class="check">✓</span>Up to 10 active games</li><li><span class="check">✓</span>YouTube + Twitch monitoring</li><li><span class="check">✓</span>Discord + daily email digest</li><li><span class="check">✓</span>CSV signal export</li><li><span class="check">✓</span>Fastest paid monitoring cadence</li></ul>',
  `<div class="same-feature-badge">Same full feature set</div><ul><li><span class="check">✓</span>Up to 10 active games</li>${fullPaidFeatures}</ul>`,
);

const pricingMarker = '<section class="section pricing-section" id="cennik">';
const productSections = `<section class="section" id="creator-monitoring">
      <div class="shell">
        <div class="section-head">
          <div><div class="kicker">Built for game teams</div><h2>Twitch stream alerts and YouTube game monitoring for developers.</h2></div>
          <p class="section-lead">Track creator coverage around your game without repeatedly searching each platform. Who Plays My Game is focused creator monitoring for indie developers, studios, publishers, PR and community teams.</p>
        </div>
        <div class="workflow">
          <div class="step"><div class="step-num">TWITCH</div><div class="step-icon">◉</div><h3><a href="/twitch-stream-alerts-for-game-developers" style="color:inherit;text-decoration:none">Twitch stream alerts</a></h3><p>Get notified when Twitch streamers play your game so you can react while the stream is still live.</p></div>
          <div class="step"><div class="step-num">YOUTUBE</div><div class="step-icon" style="color:var(--violet2)">▶</div><h3><a href="/youtube-game-monitoring" style="color:inherit;text-decoration:none">YouTube game monitoring</a></h3><p>Track new YouTube videos, reviews, let&apos;s plays and organic creator coverage related to your game.</p></div>
          <div class="step"><div class="step-num">CREATORS</div><div class="step-icon" style="color:#ff91e7">◎</div><h3><a href="/game-creator-monitoring" style="color:inherit;text-decoration:none">Game creator monitoring</a></h3><p>Use one creator-signal feed as focused social listening for games across YouTube and Twitch.</p></div>
          <div class="step"><div class="step-num">WORKFLOW</div><div class="step-icon" style="color:var(--mint)">✦</div><h3>React, report, remember</h3><p>Use the live dashboard, Discord alerts, daily email digest and CSV export to turn discovered coverage into a repeatable workflow.</p></div>
        </div>
      </div>
    </section>

    <section class="section notification-showcase" id="alerts">
      <div class="shell">
        <div class="section-head">
          <div><div class="kicker">Notifications</div><h2>Get the signal on Discord, then catch up by email.</h2></div>
          <p class="section-lead">Paid plans can send matching creator signals to Discord. The optional email digest gives you one compact summary instead of a separate email for every mention.</p>
        </div>
        <div class="notification-showcase-grid">
          <div class="notification-showcase-card discord-showcase-card">
            <div class="notification-card-head"><span class="notification-channel-icon discord-channel-icon">D</span><div><strong>Discord alert</strong><span>When a new matching signal is detected</span></div></div>
            <div class="discord-message-preview">
              <div class="discord-bot-avatar">WP</div>
              <div class="discord-message-copy">
                <div class="discord-bot-name">Who Plays My Game <span>BOT</span></div>
                <strong>AFTERBLAST is live on Twitch</strong>
                <p>A creator just started streaming your game.</p>
                <div class="discord-signal-details"><span>Creator <b>n0vafox</b></span><span>Viewers <b>184</b></span><span>Source <b>Twitch</b></span></div>
                <div class="notification-preview-button">Open stream</div>
              </div>
            </div>
            <p class="notification-explainer">Connect your Discord destination in account settings. New matching signals can then be delivered straight to the channel your team already watches.</p>
          </div>

          <div class="notification-showcase-card email-showcase-card">
            <div class="notification-card-head"><span class="notification-channel-icon email-channel-icon">@</span><div><strong>Daily email digest</strong><span>Optional and intentionally quiet</span></div></div>
            <div class="email-digest-preview">
              <div class="email-preview-brand">WHO PLAYS MY GAME</div>
              <h3>Your creator activity today</h3>
              <p>7 new signals for AFTERBLAST</p>
              <div class="email-preview-stats"><div><b>4</b><span>YouTube videos</span></div><div><b>3</b><span>Twitch streams</span></div></div>
              <div class="email-preview-line"><span>n0vafox</span><b>184 viewers</b></div>
              <div class="email-preview-line"><span>PixelForge</span><b>12.4K views</b></div>
              <div class="notification-preview-button email-preview-button">Open dashboard</div>
            </div>
            <p class="notification-explainer"><strong>At most one digest per recipient per day.</strong> If there are no new matching signals, no product digest is sent. You can enable or disable the daily email in account settings.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="section after-payment-section" id="after-payment">
      <div class="shell">
        <div class="section-head">
          <div><div class="kicker">After you subscribe</div><h2>What happens when you pay.</h2></div>
          <p class="section-lead">The plan changes how many games you can monitor. The paid product features are the same on Indie, Studio and Publisher.</p>
        </div>
        <div class="after-payment-grid">
          <div class="after-payment-step"><span class="after-payment-number">01</span><h3>Complete Paddle checkout</h3><p>Choose monthly or yearly billing and pay securely through Paddle.</p></div>
          <div class="after-payment-step"><span class="after-payment-number">02</span><h3>Your paid plan activates</h3><p>After Paddle confirms the subscription, your workspace receives the selected active-game limit and the paid monitoring cadence.</p></div>
          <div class="after-payment-step"><span class="after-payment-number">03</span><h3>Turn on your notifications</h3><p>Connect Discord for signal alerts and opt in to the daily email digest if you want the summary in your inbox.</p></div>
          <div class="after-payment-step"><span class="after-payment-number">04</span><h3>Manage billing in Paddle</h3><p>Payment methods, billing documents and cancellation are available through Paddle Customer Portal.</p></div>
        </div>
      </div>
    </section>

    ${pricingMarker}`;

markup = replace(markup, pricingMarker, productSections);

markup = replace(
  markup,
  '<button class="btn btn-ghost plan-btn" data-plan="Publisher">Choose Publisher</button>\n          </div>\n        </div>\n      </div>\n    </section>',
  '<button class="btn btn-ghost plan-btn" data-plan="Publisher">Choose Publisher</button>\n          </div>\n        </div>\n        <div class="free-beta-note"><strong>Want to try it first?</strong><span>Create a free public beta account with no card. Free is a way to try the product, not another pricing tier.</span><a href="/signup">Create free account</a></div>\n      </div>\n    </section>',
);

export const landingSeoMarkup = markup;
