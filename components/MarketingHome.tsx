import Link from "next/link";
import styles from "./MarketingHome.module.css";

const plans = [
  {
    name: "Indie",
    games: "1 active game",
    monthly: "$2.99",
    yearly: "$29.90 / year",
    className: "",
  },
  {
    name: "Studio",
    games: "Up to 3 active games",
    monthly: "$7.99",
    yearly: "$79.90 / year",
    className: styles.featured,
  },
  {
    name: "Publisher",
    games: "Up to 10 active games",
    monthly: "$14.99",
    yearly: "$149.90 / year",
    className: "",
  },
] as const;

const paidFeatures = [
  "YouTube video monitoring",
  "Twitch live stream monitoring",
  "Discord alerts for new matching signals",
  "One daily email digest when new signals exist",
  "Live creator signal dashboard",
  "Aliases and exclusion terms",
  "CSV signal export",
  "Pause and resume monitoring",
  "Same fast paid monitoring cadence on every paid plan",
] as const;

export default function MarketingHome() {
  return (
    <div className={styles.home}>
      <header className={styles.navWrap}>
        <nav className={styles.nav} aria-label="Primary navigation">
          <Link className={styles.brand} href="/">
            <span className={styles.brandMark} aria-hidden="true" />
            <span>Who Plays My Game</span>
          </Link>
          <div className={styles.navLinks}>
            <a href="#product">Product</a>
            <a href="#alerts">Alerts</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
          </div>
          <div className={styles.navActions}>
            <Link className={styles.secondaryButton} href="/login">Log in</Link>
            <Link className={styles.primaryButton} href="/signup">Start free</Link>
          </div>
        </nav>
      </header>

      <main>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <div className={styles.eyebrow}><span className={styles.liveDot} /> YouTube + Twitch monitoring for game teams</div>
            <h1>Know when creators <span>play your game.</span></h1>
            <p className={styles.heroLead}>
              Who Plays My Game finds new YouTube videos and Twitch streams related to your game, puts them in one dashboard, and can notify you on Discord and by daily email.
            </p>
            <div className={styles.heroActions}>
              <Link className={styles.primaryButtonLarge} href="/signup">Start monitoring free</Link>
              <a className={styles.secondaryButtonLarge} href="#product">See what you get</a>
            </div>
            <div className={styles.heroNotes}>
              <span>No card required to start</span>
              <span>YouTube and Twitch live now</span>
              <span>Kick coming later</span>
            </div>
          </div>

          <div className={styles.productPreview} aria-label="Product preview">
            <div className={styles.previewTop}>
              <div>
                <span className={styles.previewLabel}>LIVE WORKSPACE</span>
                <strong>AFTERBLAST</strong>
              </div>
              <span className={styles.monitoringPill}>Monitoring</span>
            </div>

            <div className={styles.metrics}>
              <div><span>New today</span><strong>18</strong></div>
              <div><span>Live now</span><strong>3</strong></div>
              <div><span>Creators</span><strong>11</strong></div>
            </div>

            <div className={styles.signalList}>
              <div className={styles.signalRow}>
                <div className={`${styles.sourceIcon} ${styles.twitchIcon}`}>TW</div>
                <div className={styles.signalCopy}>
                  <strong>n0vafox started streaming AFTERBLAST</strong>
                  <span>Twitch / 184 viewers</span>
                </div>
                <span className={styles.liveBadge}>LIVE</span>
              </div>
              <div className={styles.signalRow}>
                <div className={`${styles.sourceIcon} ${styles.youtubeIcon}`}>YT</div>
                <div className={styles.signalCopy}>
                  <strong>This roguelike FPS surprised me</strong>
                  <span>PixelForge / 12.4K views</span>
                </div>
                <span className={styles.videoBadge}>VIDEO</span>
              </div>
              <div className={styles.signalRow}>
                <div className={`${styles.sourceIcon} ${styles.youtubeIcon}`}>YT</div>
                <div className={styles.signalCopy}>
                  <strong>Top indie FPS games worth watching</strong>
                  <span>IndieScope / 4.8K views</span>
                </div>
                <span className={styles.videoBadge}>VIDEO</span>
              </div>
            </div>

            <div className={styles.previewFooter}>
              <span><i className={styles.smallDot} /> YouTube active</span>
              <span><i className={styles.smallDot} /> Twitch active</span>
            </div>
          </div>
        </section>

        <section className={styles.trustStrip} aria-label="Included monitoring channels">
          <div><strong>YouTube</strong><span>new videos</span></div>
          <div><strong>Twitch</strong><span>live streams</span></div>
          <div><strong>Discord</strong><span>signal alerts</span></div>
          <div><strong>Email</strong><span>daily digest</span></div>
          <div><strong>CSV</strong><span>export signals</span></div>
        </section>

        <section className={styles.section} id="product">
          <div className={styles.sectionHeading}>
            <div>
              <span className={styles.kicker}>What the product actually does</span>
              <h2>Stop searching for your own game every day.</h2>
            </div>
            <p>
              Add the game once. We keep checking the supported platforms and turn matching coverage into a clean creator signal feed.
            </p>
          </div>

          <div className={styles.flowGrid}>
            <article className={styles.flowCard}>
              <span className={styles.stepNumber}>01</span>
              <h3>Add your game</h3>
              <p>Enter the title, aliases and exclusion terms. You can edit them later when you want to tighten matching.</p>
            </article>
            <article className={styles.flowCard}>
              <span className={styles.stepNumber}>02</span>
              <h3>We monitor coverage</h3>
              <p>YouTube videos and Twitch live streams are checked automatically. Paid plans use the same faster monitoring cadence.</p>
            </article>
            <article className={styles.flowCard}>
              <span className={styles.stepNumber}>03</span>
              <h3>You get the signal</h3>
              <p>Open the dashboard, receive a Discord alert, or catch up through one daily email digest when there is something new.</p>
            </article>
          </div>
        </section>

        <section className={`${styles.section} ${styles.alertSection}`} id="alerts">
          <div className={styles.sectionHeading}>
            <div>
              <span className={styles.kicker}>Notifications you can actually use</span>
              <h2>See the signal where your team already works.</h2>
            </div>
            <p>
              Dashboard for the full feed, Discord when a matching signal appears, and a compact email summary instead of dozens of separate messages.
            </p>
          </div>

          <div className={styles.alertGrid}>
            <article className={styles.discordCard}>
              <div className={styles.cardTopLine}>
                <span className={styles.discordLogo}>D</span>
                <div><strong>Discord alert</strong><span>after a new signal is detected</span></div>
              </div>
              <div className={styles.discordMessage}>
                <div className={styles.botAvatar}>WP</div>
                <div>
                  <div><strong>Who Plays My Game</strong> <span className={styles.botTag}>BOT</span></div>
                  <p><strong>AFTERBLAST is live on Twitch</strong></p>
                  <dl>
                    <div><dt>Creator</dt><dd>n0vafox</dd></div>
                    <div><dt>Viewers</dt><dd>184</dd></div>
                    <div><dt>Signal</dt><dd>New live stream</dd></div>
                  </dl>
                  <span className={styles.openSignal}>Open stream</span>
                </div>
              </div>
            </article>

            <article className={styles.emailCard}>
              <div className={styles.cardTopLine}>
                <span className={styles.mailLogo}>@</span>
                <div><strong>Daily email digest</strong><span>only when new matching signals exist</span></div>
              </div>
              <div className={styles.emailPreview}>
                <span className={styles.emailBrand}>WHO PLAYS MY GAME</span>
                <h3>Your creator activity today</h3>
                <p>7 new signals for AFTERBLAST</p>
                <div className={styles.emailStats}>
                  <div><strong>4</strong><span>YouTube videos</span></div>
                  <div><strong>3</strong><span>Twitch streams</span></div>
                </div>
                <div className={styles.digestLine}><span>n0vafox</span><strong>184 viewers</strong></div>
                <div className={styles.digestLine}><span>PixelForge</span><strong>12.4K views</strong></div>
                <span className={styles.openDashboard}>Open dashboard</span>
              </div>
            </article>
          </div>

          <div className={styles.alertNote}>
            Email is intentionally aggregated. Each recipient gets at most one product digest per day, and no digest is sent when there are no new matching signals.
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <div>
              <span className={styles.kicker}>After you subscribe</span>
              <h2>What changes when you pay.</h2>
            </div>
            <p>Every paid plan has the same feature set. You only choose how many games you need to monitor.</p>
          </div>

          <div className={styles.afterPayGrid}>
            <div><span>1</span><strong>Checkout in Paddle</strong><p>Choose monthly or yearly billing and complete the secure Paddle checkout.</p></div>
            <div><span>2</span><strong>Paid monitoring activates</strong><p>Your workspace switches to the paid monitoring cadence automatically after the subscription is confirmed.</p></div>
            <div><span>3</span><strong>Alerts and export unlock</strong><p>Use Discord alerts, the daily email digest, CSV export and the rest of the paid workflow.</p></div>
            <div><span>4</span><strong>Manage it yourself</strong><p>Payment methods, billing documents and cancellation are handled through Paddle Customer Portal.</p></div>
          </div>

          <div className={styles.cadenceBar}>
            <div><span>Twitch paid monitoring</span><strong>scheduled every 2 min</strong></div>
            <div><span>YouTube paid monitoring</span><strong>scheduled every 30 min</strong></div>
            <p>Actual detection time still depends on third-party platform APIs and when content becomes available to them.</p>
          </div>
        </section>

        <section className={`${styles.section} ${styles.pricingSection}`} id="pricing">
          <div className={styles.sectionHeading}>
            <div>
              <span className={styles.kicker}>Simple paid plans</span>
              <h2>Same features. Pick the number of games.</h2>
            </div>
            <p>There is no stripped-down paid tier. Indie, Studio and Publisher all get the complete paid product.</p>
          </div>

          <div className={styles.plans}>
            {plans.map((plan) => (
              <article className={`${styles.plan} ${plan.className}`} key={plan.name}>
                {plan.name === "Studio" ? <span className={styles.popular}>POPULAR</span> : null}
                <h3>{plan.name}</h3>
                <p className={styles.gameLimit}>{plan.games}</p>
                <div className={styles.priceRow}><strong>{plan.monthly}</strong><span>/ month</span></div>
                <p className={styles.yearlyPrice}>{plan.yearly}</p>
                <ul>
                  {paidFeatures.map((feature) => <li key={feature}><span>✓</span>{feature}</li>)}
                </ul>
                <Link className={plan.name === "Studio" ? styles.primaryButtonWide : styles.secondaryButtonWide} href="/signup">
                  Start with {plan.name}
                </Link>
              </article>
            ))}
          </div>

          <div className={styles.freeNote}>
            Want to look around first? Create a free public beta account with no card. Free is for trying the product, not a separate pricing tier.
            <Link href="/signup">Create free account</Link>
          </div>
        </section>

        <section className={styles.section} id="faq">
          <div className={styles.sectionHeading}>
            <div>
              <span className={styles.kicker}>FAQ</span>
              <h2>The practical questions.</h2>
            </div>
          </div>

          <div className={styles.faqList}>
            <details>
              <summary>What is included in every paid plan?</summary>
              <p>YouTube and Twitch monitoring, the dashboard, Discord alerts, one daily email digest when there are new signals, CSV export, aliases, exclusions, pause and resume, and the same paid monitoring cadence.</p>
            </details>
            <details>
              <summary>Why are the three paid plans different prices?</summary>
              <p>Only the active game limit changes. Indie monitors 1 game, Studio up to 3, and Publisher up to 10.</p>
            </details>
            <details>
              <summary>Will I receive hundreds of emails?</summary>
              <p>No. Product email is aggregated into at most one daily digest per recipient, and nothing is sent on days without new matching signals.</p>
            </details>
            <details>
              <summary>Can I cancel later?</summary>
              <p>Yes. Paddle Customer Portal is used for subscription management and cancellation. Access remains until the end of the paid period after an end-of-period cancellation.</p>
            </details>
            <details>
              <summary>Does it monitor Kick?</summary>
              <p>Not yet. YouTube and Twitch monitoring are live. Kick remains planned for later.</p>
            </details>
          </div>
        </section>

        <section className={styles.finalCta}>
          <div>
            <span className={styles.kicker}>Stop checking manually</span>
            <h2>Let the coverage come to you.</h2>
            <p>Create a workspace, add your game, and see new creator signals in one place.</p>
          </div>
          <div className={styles.finalActions}>
            <Link className={styles.primaryButtonLarge} href="/signup">Start monitoring free</Link>
            <Link className={styles.secondaryButtonLarge} href="/login">Log in</Link>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div>
            <strong>Who Plays My Game</strong>
            <span>Operated by Lumino Games sp. z o.o.</span>
          </div>
          <div className={styles.footerLinks}>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/withdrawal">Withdrawal</Link>
            <Link href="/refunds">Refund policy</Link>
            <a href="mailto:whoplaysmygame@gmail.com">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
