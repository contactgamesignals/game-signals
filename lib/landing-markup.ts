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
  '<p class="hero-copy">Get notified when someone uploads a YouTube video about your game or goes live with it on Twitch. Who Plays My Game finds the content automatically and puts it all in one place.</p>',
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

export const landingMarkup = markup;
