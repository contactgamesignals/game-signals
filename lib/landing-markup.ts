import { BRAND } from "@/lib/brand";
import { landingSeoMarkup } from "@/lib/landing-seo";

function replace(source: string, before: string, after: string) {
  return source.includes(before) ? source.replace(before, after) : source;
}

let markup = landingSeoMarkup;

markup = replace(
  markup,
  '<a href="/withdrawal">Withdrawal</a> · ',
  '<a href="/withdrawal">Withdrawal</a> · <a href="/refunds">Refund Policy</a> · ',
);

markup = replace(
  markup,
  '<div class="eyebrow"><span class="pulse"></span> live creator intelligence</div>',
  '<div class="eyebrow"><span class="pulse"></span> creator monitoring for game developers</div>',
);

markup = replace(
  markup,
  '<h1>Know <span class="accent">who is playing your game</span> before the moment passes.</h1>',
  '<h1>See when <span class="accent">creators play your game.</span></h1>',
);

markup = replace(
  markup,
  '<p class="hero-copy">Who Plays My Game monitors new YouTube videos and Twitch streams about your game, puts every match into one dashboard, sends Discord alerts, and gives you one daily email digest when new signals appear.</p>',
  '<p class="hero-copy">Who Plays My Game monitors new YouTube videos and Twitch streams about your game, puts every match into one dashboard, sends Discord alerts, and gives you a daily email summary.</p>',
);

markup = replace(
  markup,
  '<div class="micro">Start with a free public beta account, no card required. Upgrade when you want Discord alerts, the daily email digest, CSV export and faster paid monitoring.</div>',
  '<div class="micro"><strong>No YouTube, Twitch or Steam account connection required.</strong> Start with a free public beta account, no card required. Upgrade when you want Discord alerts, the daily email digest, CSV export and faster paid monitoring.</div>',
);

markup = replace(
  markup,
  '<div><div class="kicker">From signal to response</div><h2>The internet is playing. You get the signals that matter.</h2></div>',
  '<div><div class="kicker">How it works</div><h2>Add your game. We watch the creators. You get the signal.</h2></div>',
);

markup = replace(
  markup,
  '<p class="section-lead">This should not be another list of links. It should filter the noise and show what is happening around your game right now.</p>',
  '<p class="section-lead">Set up monitoring once, then stop repeatedly searching YouTube and Twitch by hand.</p>',
);

markup = replace(
  markup,
  '<div class="workflow">\n          <div class="step"><div class="step-num">01 / LISTEN</div><div class="step-icon">⌁</div><h3>Listen</h3><p>We watch for new videos and active live streams across the selected platforms.</p></div>\n          <div class="step"><div class="step-num">02 / MATCH</div><div class="step-icon" style="color:var(--violet2)">◎</div><h3>Match</h3><p>Your game title, aliases, and extra keywords help filter out irrelevant results.</p></div>\n          <div class="step"><div class="step-num">03 / SCORE</div><div class="step-icon" style="color:#ff91e7">↗</div><h3>Score</h3><p>See the creator, current views or live viewers, and a signal score that helps prioritize mentions.</p></div>\n          <div class="step"><div class="step-num">04 / ALERT</div><div class="step-icon" style="color:var(--mint)">✦</div><h3>Alert</h3><p>Every paid plan includes Discord alerts and one opt-in daily email digest, alongside the live dashboard.</p></div>\n        </div>',
  '<div class="clarity-steps-grid">\n          <div class="clarity-step"><div class="clarity-step-top"><span class="clarity-step-number">01</span><span class="clarity-step-icon">+</span></div><h3>Add your game</h3><p>Enter the game title and optional aliases or keywords. No YouTube or Twitch account connection is required.</p></div>\n          <div class="clarity-step"><div class="clarity-step-top"><span class="clarity-step-number">02</span><span class="clarity-step-icon monitor">◉</span></div><h3>We monitor creators</h3><p>Who Plays My Game checks for new YouTube videos and active Twitch streams connected to your title.</p></div>\n          <div class="clarity-step"><div class="clarity-step-top"><span class="clarity-step-number">03</span><span class="clarity-step-icon alert">✦</span></div><h3>You get notified</h3><p>See every match in your dashboard and use Discord alerts or the optional daily email digest on paid plans.</p></div>\n        </div>',
);

markup = replace(
  markup,
  '<div><div class="kicker">Interactive product</div><h2>Signal Lab. Configure monitoring the way it would work for your game.</h2></div>',
  '<div><div class="kicker">Interactive product</div><h2>Configure monitoring the way it would work for your game.</h2></div>',
);

markup = replace(
  markup,
  '<span class="panel-title">Live signal map</span>',
  '<span class="panel-title">Live creators activity</span>',
);

markup = replace(
  markup,
  '<div class="micro"><strong>No YouTube, Twitch or Steam account connection required.</strong> Start with a free public beta account, no card required. Upgrade when you want Discord alerts, the daily email digest, CSV export and faster paid monitoring.</div>',
  '<div class="micro"><strong>No YouTube, Twitch or Steam account connection required.</strong></div>',
);

markup = replace(
  markup,
  '<button class="btn btn-primary scan-btn" id="scanBtn">Scan now</button>',
  '<button class="btn btn-primary scan-btn" id="scanBtn">Show example signal</button>',
);

markup = replace(
  markup,
  '<div class="notification-card-head"><span class="notification-channel-icon email-channel-icon">@</span><div><strong>Daily email digest</strong><span>Optional and intentionally quiet</span></div></div>',
  '<div class="notification-card-head"><span class="notification-channel-icon email-channel-icon">@</span><div><strong>Daily email summary</strong><span>Catch up without checking the dashboard</span></div></div>',
);

markup = replace(
  markup,
  '<p class="notification-explainer"><strong>At most one digest per recipient per day.</strong> If there are no new matching signals, no product digest is sent. You can enable or disable the daily email in account settings.</p>',
  '<p class="notification-explainer">Catch up on new YouTube videos and Twitch streams without checking the dashboard.</p>',
);

markup = replace(
  markup,
  '<div><div class="kicker">After you subscribe</div><h2>What happens when you pay.</h2></div>',
  '<div><div class="kicker">Get started</div><h2>Choose a plan. Add your games. Get notified.</h2></div>',
);

markup = replace(
  markup,
  '<p class="section-lead">The plan changes how many games you can monitor. The paid product features are the same on Indie, Studio and Publisher.</p>',
  '<p class="section-lead">Pick the game limit that fits your team. Every paid plan includes the same monitoring features and alerts.</p>',
);

markup = replace(
  markup,
  '<div class="after-payment-grid">\n          <div class="after-payment-step"><span class="after-payment-number">01</span><h3>Complete Paddle checkout</h3><p>Choose monthly or yearly billing and pay securely through Paddle.</p></div>\n          <div class="after-payment-step"><span class="after-payment-number">02</span><h3>Your paid plan activates</h3><p>After Paddle confirms the subscription, your workspace receives the selected active-game limit and the paid monitoring cadence.</p></div>\n          <div class="after-payment-step"><span class="after-payment-number">03</span><h3>Turn on your notifications</h3><p>Connect Discord for signal alerts and opt in to the daily email digest if you want the summary in your inbox.</p></div>\n          <div class="after-payment-step"><span class="after-payment-number">04</span><h3>Manage billing in Paddle</h3><p>Payment methods, billing documents and cancellation are available through Paddle Customer Portal.</p></div>\n        </div>',
  '<div class="after-payment-grid">\n          <div class="after-payment-step"><span class="after-payment-number">01</span><h3>Choose your plan</h3><p>Pick the number of active games you want to monitor. Every paid plan includes the same product features.</p></div>\n          <div class="after-payment-step"><span class="after-payment-number">02</span><h3>Add your games</h3><p>Add the titles, aliases and keywords you want Who Plays My Game to watch across YouTube and Twitch.</p></div>\n          <div class="after-payment-step"><span class="after-payment-number">03</span><h3>Get your alerts</h3><p>See matches in your dashboard, connect Discord alerts and enable the optional daily email summary.</p></div>\n        </div>',
);

const developerStory = `<section class="section developer-proof-section" id="built-by-game-developers">
      <div class="shell">
        <div class="developer-proof-card">
          <div class="developer-proof-copy">
            <div class="kicker">Built by game developers</div>
            <h2>We needed this for our own game too.</h2>
            <p>Who Plays My Game is built by the team at Lumino Games, developers of AFTERBLAST. We know what it is like to keep searching YouTube and Twitch to find out whether someone covered your game, started a stream, or mentioned it without ever contacting the studio.</p>
            <p>We built one place that watches for those moments automatically, so game teams can react while the creator activity still matters.</p>
          </div>
          <div class="developer-proof-side">
            <span class="developer-proof-label">FROM THE TEAM BEHIND</span>
            <strong>AFTERBLAST</strong>
            <span>Commercial FPS roguelite on Steam</span>
          </div>
        </div>
      </div>
    </section>

    `;

markup = replace(
  markup,
  '<section class="section after-payment-section" id="after-payment">',
  `${developerStory}<section class="section after-payment-section" id="after-payment">`,
);

markup = replace(
  markup,
  'SIGNAL COMMAND /',
  'MONITORING /',
);

markup = replace(
  markup,
  '<button class="btn btn-primary" data-open="onboarding">Add your first game</button>',
  '<a class="btn btn-primary" href="/signup">Register</a>',
);

markup = replace(
  markup,
  '<div class="free-beta-note"><strong>Want to try it first?</strong><span>Create a free public beta account with no card. Free is a way to try the product, not another pricing tier.</span><a href="/signup">Create free account</a></div>',
  '',
);

markup = replace(
  markup,
  'That depends on the platform. Free accounts use a slower monitoring cadence, while every paid plan uses the same faster paid cadence. Detection still depends on platform APIs and scheduled refreshes.',
  'That depends on the platform. Every paid plan uses the same monitoring cadence. Detection depends on platform APIs and scheduled refreshes.',
);

markup = replace(
  markup,
  '<div class="notice">New paid checkout is temporarily unavailable while Paddle LIVE activation is completed. Free public beta accounts are open now.</div>',
  '<div class="notice">Paid checkout is available after registration.</div>',
);

markup = markup
  .replaceAll("Up to 3 active games", "Up to 5 active games")
  .replaceAll("Up to 10 active games", "Up to 15 active games");

const crazyPlanFeatures = '<li><span class="check">✓</span>Up to 30 active games</li><li><span class="check">✓</span>YouTube + Twitch monitoring</li><li><span class="check">✓</span>Live creator signal dashboard</li><li><span class="check">✓</span>Discord alerts</li><li><span class="check">✓</span>Opt-in daily email digest</li><li><span class="check">✓</span>CSV signal export</li><li><span class="check">✓</span>Aliases and exclusion terms</li><li><span class="check">✓</span>Fastest paid monitoring cadence</li>';

markup = replace(
  markup,
  '<button class="btn btn-ghost plan-btn" data-plan="Publisher">Choose Publisher</button>\n          </div>\n        </div>',
  `<button class="btn btn-ghost plan-btn" data-plan="Publisher">Choose Publisher</button>
          </div>
          <div class="plan">
            <h3>Crazy Dev / Big Publisher</h3><p class="desc">For high-output teams and publishers monitoring a very large game portfolio.</p>
            <div class="price" data-monthly="$24.99" data-yearly="$249.90">$24.99 <small>/mo</small></div>
            <div class="same-feature-badge">Same full feature set</div><ul>${crazyPlanFeatures}</ul>
            <button class="btn btn-ghost plan-btn" data-plan="crazy">Choose Crazy Dev / Big Publisher</button>
          </div>
        </div>
        <div class="custom-plan-note"><div><strong>Contact support</strong><span>${BRAND.supportEmail}</span></div></div>`,
);

export const landingMarkup = markup;
