import { landingMarkup } from "@/lib/landing-markup";

function replace(source: string, before: string, after: string) {
  return source.includes(before) ? source.replace(before, after) : source;
}

let markup = landingMarkup;

markup = replace(
  markup,
  "GameSignal detects new YouTube videos plus live streams on Twitch and Kick. Instead of manually searching the web, you get one clean feed and alerts when it actually matters.",
  "GameSignal detects new YouTube videos and live streams on Twitch. Instead of manually searching the web, you get one clean feed of creator signals. Kick monitoring is planned, pending KICK developer approval.",
);
markup = replace(markup, '<div class="platform"><span class="dot ki"></span>Kick</div>', '<div class="platform"><span class="dot ki"></span>Kick · coming soon</div>');
markup = replace(markup, '<div class="platform">Email + Discord</div>', '<div class="platform">Discord · Email coming soon</div>');
markup = replace(markup, '<div class="system-state"><i></i> 3 sources online</div>', '<div class="system-state"><i></i> 2 sources online</div>');
markup = replace(markup, '<span class="map-label l3">Kick / live</span>', '<span class="map-label l3">Kick / coming soon</span>');
markup = replace(markup, '<div class="source-row"><span class="source-name"><span class="dot ki"></span>Kick</span><span class="source-count">3</span></div>', '<div class="source-row" style="opacity:.55"><span class="source-name"><span class="dot ki"></span>Kick</span><span class="source-count">soon</span></div>');
markup = replace(markup, '<div class="feed-line"><div class="ico k">K</div><div><strong>RavenByte is playing for the first time</strong><span>Kick · 76 viewers</span></div><div class="feed-meta">51 min<br>LIVE</div></div>', '');
markup = replace(
  markup,
  "See the creator, live viewers, view velocity, and the overall potential of each mention.",
  "See the creator, current views or live viewers, and a signal score that helps prioritize mentions.",
);
markup = replace(
  markup,
  "Email or Discord takes you straight to the video or stream before the momentum fades.",
  "Studio and Publisher can send matching signals to Discord. Email delivery is coming soon.",
);
markup = replace(markup, '<div class="source-switch">Kick <span class="switch on" data-source-toggle="kick"></span></div>', '<div class="source-switch" style="opacity:.55">Kick · coming soon <span class="switch" data-source-toggle="kick" aria-disabled="true"></span></div>');
markup = replace(markup, '<div class="source-switch">Email <span class="switch on"></span></div>', '<div class="source-switch" style="opacity:.55">Email · coming soon <span class="switch" aria-disabled="true"></span></div>');
markup = replace(markup, '<div class="notice">UI demo. A production version still needs platform APIs and a backend.</div>', '<div class="notice">Interactive demo. Production monitoring is live for YouTube and Twitch; Kick and email delivery are still being prepared.</div>');
markup = replace(markup, '<button class="tab" data-filter="kick">Kick</button>', '<button class="tab" data-filter="kick" disabled style="opacity:.55">Kick · soon</button>');
markup = replace(markup, '<div class="result" data-source="kick" data-viewers="76"><div class="ico k">K</div><div><div class="result-title">RavenByte plays AFTERBLAST for the first time</div><div class="result-sub">Kick · 76 viewers</div></div><span class="badge live">LIVE</span><div class="result-time">51 min</div></div>', '');

markup = replace(
  markup,
  '<ul><li><span class="check">✓</span>1 tracked game</li><li><span class="check">✓</span>YouTube, Twitch, and Kick</li><li><span class="check">✓</span>Notifications email</li><li><span class="check">✓</span>30-day history</li></ul>',
  '<ul><li><span class="check">✓</span>1 active tracked game</li><li><span class="check">✓</span>YouTube + Twitch monitoring</li><li><span class="check">✓</span>Creator signal dashboard</li><li><span class="check">✓</span>Aliases and exclusion terms</li></ul>',
);
markup = replace(
  markup,
  '<ul><li><span class="check">✓</span>Up to 3 games</li><li><span class="check">✓</span>Email + Discord alerts</li><li><span class="check">✓</span>Faster refresh rate</li><li><span class="check">✓</span>12-month history</li><li><span class="check">✓</span>3 team members</li></ul>',
  '<ul><li><span class="check">✓</span>Up to 3 active games</li><li><span class="check">✓</span>Everything in Indie</li><li><span class="check">✓</span>Discord alerts</li><li><span class="check">✓</span>Faster monitoring cadence</li><li><span class="check">✓</span>Stripe self-service billing</li></ul>',
);
markup = replace(
  markup,
  '<ul><li><span class="check">✓</span>Up to 10 games</li><li><span class="check">✓</span>Advanced filters</li><li><span class="check">✓</span>Result export</li><li><span class="check">✓</span>10 team members</li><li><span class="check">✓</span>Priority support</li></ul>',
  '<ul><li><span class="check">✓</span>Up to 10 active games</li><li><span class="check">✓</span>Everything in Studio</li><li><span class="check">✓</span>CSV signal export</li><li><span class="check">✓</span>Highest monitoring cadence</li><li><span class="check">✓</span>Pause and resume active monitors</li></ul>',
);
markup = replace(
  markup,
  "You can add aliases, your studio name, and required or excluded phrases. That helps reduce false positives.",
  "Add aliases, studio-specific search phrases, and exclusion terms. You can edit them later if a false positive appears.",
);
markup = replace(
  markup,
  "Yes. In the production version you will be able to cancel from account settings while keeping access until the end of the paid period.",
  "Yes. Paid subscriptions are managed in Stripe Customer Portal, and cancellation keeps access until the end of the paid period.",
);
markup = replace(markup, '<div class="notification"><strong>New creator detected</strong><p>RavenByte is streaming your game on Kick for the first time.</p></div>', '');
markup = replace(markup, '<button type="button" class="source-check selected">Kick</button>', '<button type="button" class="source-check" aria-disabled="true" style="opacity:.55">Kick · soon</button>');
markup = replace(markup, '<div class="notice">Interactive frontend demo. A production version still needs APIs, a database, auth, and payments.</div>', '<div class="notice">After signup, YouTube and Twitch monitoring starts automatically. Kick and email delivery are coming soon.</div>');
markup = replace(markup, '<div class="notice">In production this form should be connected to your authentication system.</div>', '<div class="notice">Account access is handled by the live GameSignal authentication system.</div>');
markup = replace(markup, '<p style="color:#9099ad">In production this step would create a checkout session and activate the selected plan after payment.</p>', '<p style="color:#9099ad">Paid plans use Stripe-hosted Checkout and can be managed later in Stripe Customer Portal.</p>');
markup = replace(markup, '<div class="notice">This demo does not process any payments.</div>', '<div class="notice">The public landing preview is interactive; billing is handled after account signup.</div>');

export const landingRealityMarkup = markup;
