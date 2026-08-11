export const landingMarkup = String.raw`
<nav class="nav">
    <div class="shell nav-inner">
      <a href="#" class="brand"><span class="brand-mark"></span><span>GameSignal</span></a>
      <div class="nav-links">
        <a href="#overview">Overview</a>
        <a href="#jak-dziala">How it works</a>
        <a href="#signal-lab">Live demo</a>
        <a href="#cennik">Pricing</a>
        <a href="#faq">FAQ</a>
      </div>
      <div class="actions">
        <button class="btn btn-ghost" data-open="login">Log in</button>
        <button class="btn btn-primary" data-open="onboarding">Add game</button>
      </div>
    </div>
  </nav>

  <main>
    <section class="hero" id="overview">
      <div class="shell hero-grid">
        <div class="hero-copy-wrap">
          <div class="eyebrow"><span class="pulse"></span> live creator intelligence</div>
          <h1>Know <span class="accent">who is playing your game</span> before the moment passes.</h1>
          <p class="hero-copy">GameSignal detects new YouTube videos plus live streams on Twitch and Kick. Instead of manually searching the web, you get one clean feed and alerts when it actually matters.</p>
          <form class="hero-form" id="quickAdd">
            <input id="gameName" aria-label="Game title" placeholder="Enter your game title, e.g. AFTERBLAST" required>
            <button class="btn btn-primary" type="submit">Start monitoring</button>
          </form>
          <div class="micro">No credit card required. Add your game title and try the interactive monitoring demo.</div>
          <div class="platforms">
            <div class="platform"><span class="dot yt"></span>YouTube</div>
            <div class="platform"><span class="dot tw"></span>Twitch</div>
            <div class="platform"><span class="dot ki"></span>Kick</div>
            <div class="platform">Email + Discord</div>
          </div>
        </div>

        <div class="command" id="command">
          <div class="command-grid">
            <div class="command-top">
              <div class="system-name"><span class="system-icon">⌁</span> SIGNAL COMMAND / <span id="heroGame">AFTERBLAST</span></div>
              <div class="system-state"><i></i> 3 sources online</div>
            </div>
            <div class="command-body">
              <div class="glass live-map">
                <div class="panel-head"><span class="panel-title">Live signal map</span><span class="tiny">last 60 min</span></div>
                <div class="signal-path">
                  <div class="beam"></div>
                  <div class="trace t1"></div><div class="trace t2"></div><div class="trace t3"></div>
                  <span class="node n1"></span><span class="node n2"></span><span class="node n3"></span><span class="node n4"></span>
                  <span class="map-label l1">YouTube / upload</span><span class="map-label l2">Twitch / live</span><span class="map-label l3">Kick / live</span><span class="map-label l4">creator match</span>
                </div>
              </div>
              <div class="side-stack">
                <div class="glass score-card">
                  <div class="panel-head"><span class="panel-title">Signal score</span><span class="tiny">+18%</span></div>
                  <div class="score-row">
                    <div class="score-number">84<small>/100</small></div>
                    <svg class="spark" viewBox="0 0 82 34" aria-hidden="true">
                      <defs><linearGradient id="sparkGradient"><stop stop-color="#35e7ff"/><stop offset="1" stop-color="#7a6cff"/></linearGradient></defs>
                      <path d="M2 29 C12 26 13 18 21 21 S33 27 38 16 S49 10 55 14 S67 6 80 4"/>
                    </svg>
                  </div>
                </div>
                <div class="glass source-card">
                  <div class="panel-head"><span class="panel-title">Sources</span><span class="tiny">today</span></div>
                  <div class="source-row"><span class="source-name"><span class="dot yt"></span>YouTube</span><span class="source-count">12</span></div>
                  <div class="source-row"><span class="source-name"><span class="dot tw"></span>Twitch</span><span class="source-count">5</span></div>
                  <div class="source-row"><span class="source-name"><span class="dot ki"></span>Kick</span><span class="source-count">3</span></div>
                </div>
              </div>

              <div class="glass feed-card" id="heroFeed">
                <div class="feed-line new"><div class="ico t">TW</div><div><strong>n0vafox started streaming</strong><span>AFTERBLAST · 184 viewers</span></div><div class="feed-meta">now<br>LIVE</div></div>
                <div class="feed-line"><div class="ico y">YT</div><div><strong>“This roguelike surprised me...”</strong><span>PixelForge · 12.4K views</span></div><div class="feed-meta">32 min<br>VIDEO</div></div>
                <div class="feed-line"><div class="ico k">K</div><div><strong>RavenByte is playing for the first time</strong><span>Kick · 76 viewers</span></div><div class="feed-meta">51 min<br>LIVE</div></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="section" id="jak-dziala">
      <div class="shell">
        <div class="section-head">
          <div><div class="kicker">From signal to response</div><h2>The internet is playing. You get the signals that matter.</h2></div>
          <p class="section-lead">This should not be another list of links. It should filter the noise and show what is happening around your game right now.</p>
        </div>
        <div class="workflow">
          <div class="step"><div class="step-num">01 / LISTEN</div><div class="step-icon">⌁</div><h3>Listen</h3><p>We watch for new videos and active live streams across the selected platforms.</p></div>
          <div class="step"><div class="step-num">02 / MATCH</div><div class="step-icon" style="color:var(--violet2)">◎</div><h3>Match</h3><p>Your game title, aliases, and extra keywords help filter out irrelevant results.</p></div>
          <div class="step"><div class="step-num">03 / SCORE</div><div class="step-icon" style="color:#ff91e7">↗</div><h3>Score</h3><p>See the creator, live viewers, view velocity, and the overall potential of each mention.</p></div>
          <div class="step"><div class="step-num">04 / ALERT</div><div class="step-icon" style="color:var(--mint)">✦</div><h3>Alert</h3><p>Email or Discord takes you straight to the video or stream before the momentum fades.</p></div>
        </div>
      </div>
    </section>

    <section class="section" id="signal-lab">
      <div class="shell">
        <div class="section-head">
          <div><div class="kicker">Interactive product</div><h2>Signal Lab. Configure monitoring the way it would work for your game.</h2></div>
          <p class="section-lead">Change the game name, enabled sources, and the live viewer threshold. Click scan to see a new signal appear inside the dashboard.</p>
        </div>

        <div class="lab-shell">
          <div class="lab-top">
            <div class="lab-brand"><span class="brand-mark" style="width:29px;height:29px;border-radius:9px"></span> GameSignal / Workspace</div>
            <div class="lab-status"><i></i><i></i><i></i></div>
          </div>
          <div class="lab-grid">
            <aside class="controls">
              <div class="control-group">
                <label class="control-label">Tracked game</label>
                <input class="control-input" id="labGame" value="AFTERBLAST">
              </div>
              <div class="control-group">
                <span class="control-label">Sources</span>
                <div class="source-switch">YouTube <span class="switch on" data-source-toggle="youtube"></span></div>
                <div class="source-switch">Twitch <span class="switch on" data-source-toggle="twitch"></span></div>
                <div class="source-switch">Kick <span class="switch on" data-source-toggle="kick"></span></div>
              </div>
              <div class="control-group">
                <label class="control-label">Minimum live viewers: <b id="viewerValue">25</b></label>
                <input class="range" id="viewerRange" type="range" min="0" max="500" value="25">
              </div>
              <div class="control-group">
                <span class="control-label">Notifications</span>
                <div class="source-switch">Email <span class="switch on"></span></div>
                <div class="source-switch">Discord <span class="switch on"></span></div>
              </div>
              <button class="btn btn-primary scan-btn" id="scanBtn">Scan now</button>
              <div class="notice">UI demo. A production version still needs platform APIs and a backend.</div>
            </aside>

            <div class="workspace">
              <div class="workspace-top">
                <div><div class="kicker" style="margin:0 0 6px">Live workspace</div><h3 id="workspaceTitle">AFTERBLAST</h3></div>
                <button class="notif-btn" id="notifBtn" aria-label="Notifications">◌</button>
              </div>
              <div class="stats">
                <div class="stat"><span>New today</span><b id="statNew">18</b></div>
                <div class="stat"><span>Live now</span><b id="statLive">7</b></div>
                <div class="stat"><span>Creators</span><b>43</b></div>
                <div class="stat"><span>Total reach</span><b id="statReach">286K</b></div>
              </div>
              <div class="result-panel">
                <div class="tabs">
                  <button class="tab active" data-filter="all">All</button>
                  <button class="tab" data-filter="youtube">YouTube</button>
                  <button class="tab" data-filter="twitch">Twitch</button>
                  <button class="tab" data-filter="kick">Kick</button>
                </div>
                <div id="results">
                  <div class="result" data-source="twitch" data-viewers="184"><div class="ico t">TW</div><div><div class="result-title">n0vafox: “checking out this new roguelike FPS”</div><div class="result-sub">Twitch · 184 viewers</div></div><span class="badge live">LIVE</span><div class="result-time">now</div></div>
                  <div class="result" data-source="youtube" data-viewers="0"><div class="ico y">YT</div><div><div class="result-title">This roguelike surprised me more than I expected</div><div class="result-sub">PixelForge · 12.4K views</div></div><span class="badge video">VIDEO</span><div class="result-time">32 min</div></div>
                  <div class="result" data-source="kick" data-viewers="76"><div class="ico k">K</div><div><div class="result-title">RavenByte plays AFTERBLAST for the first time</div><div class="result-sub">Kick · 76 viewers</div></div><span class="badge live">LIVE</span><div class="result-time">51 min</div></div>
                  <div class="result" data-source="youtube" data-viewers="0"><div class="ico y">YT</div><div><div class="result-title">Top indie FPS games you should not miss</div><div class="result-sub">IndieScope · 4,8 tys. wyświetleń</div></div><span class="badge video">VIDEO</span><div class="result-time">2 h</div></div>
                  <div class="result" data-source="twitch" data-viewers="51"><div class="ico t">TW</div><div><div class="result-title">speedrun attempt #12</div><div class="result-sub">Twitch · 51 viewers</div></div><span class="badge live">LIVE</span><div class="result-time">3 h</div></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="section pricing-section" id="cennik">
      <div class="shell">
        <div class="section-head pricing-head">
          <div><div class="kicker">Pricing</div><h2>From one indie game to a full portfolio.</h2></div>
          <p class="section-lead">A simple subscription model based on the number of tracked games and how quickly you want alerts to arrive.</p>
        </div>
        <div class="pricing-top">
          <div class="toggle"><button class="active" data-cycle="monthly">Monthly</button><button data-cycle="yearly">Yearly · 2 months free</button></div>
        </div>
        <div class="plans">
          <div class="plan">
            <h3>Indie</h3><p class="desc">For solo developers or a small team with one active title.</p>
            <div class="price" data-monthly="24.5" data-yearly="20.5">24.5 PLN <small>/mo</small></div>
            <ul><li><span class="check">✓</span>1 tracked game</li><li><span class="check">✓</span>YouTube, Twitch, and Kick</li><li><span class="check">✓</span>Notifications email</li><li><span class="check">✓</span>30-day history</li></ul>
            <button class="btn btn-ghost plan-btn" data-plan="Indie">Choose Indie</button>
          </div>
          <div class="plan featured">
            <span class="popular">MOST POPULAR</span>
            <h3>Studio</h3><p class="desc">For a studio that wants to react quickly to every meaningful mention.</p>
            <div class="price" data-monthly="64.5" data-yearly="54">64.5 PLN <small>/mo</small></div>
            <ul><li><span class="check">✓</span>Up to 3 games</li><li><span class="check">✓</span>Email + Discord alerts</li><li><span class="check">✓</span>Faster refresh rate</li><li><span class="check">✓</span>12-month history</li><li><span class="check">✓</span>3 team members</li></ul>
            <button class="btn btn-primary plan-btn" data-plan="Studio">Choose Studio</button>
          </div>
          <div class="plan">
            <h3>Publisher</h3><p class="desc">For publishers and teams running several launches at the same time.</p>
            <div class="price" data-monthly="149.5" data-yearly="124.5">149.5 PLN <small>/mo</small></div>
            <ul><li><span class="check">✓</span>Up to 10 games</li><li><span class="check">✓</span>Advanced filters</li><li><span class="check">✓</span>Result export</li><li><span class="check">✓</span>10 team members</li><li><span class="check">✓</span>Priority support</li></ul>
            <button class="btn btn-ghost plan-btn" data-plan="Publisher">Choose Publisher</button>
          </div>
        </div>
      </div>
    </section>

    <section class="section" id="faq">
      <div class="shell faq">
        <div><div class="kicker">FAQ</div><h2>Questions before you launch monitoring.</h2></div>
        <div class="faq-list">
          <div class="faq-item"><button class="faq-q">Do I need to connect my Steam account?<span>+</span></button><div class="faq-a">No. For basic monitoring you only need the game title and its aliases. A Steam link can help with metadata and with identifying the correct title.</div></div>
          <div class="faq-item"><button class="faq-q">How fast will I get alerts?<span>+</span></button><div class="faq-a">That depends on the platform and the plan. Some signals can be detected close to real time, while others come from scheduled refreshes.</div></div>
          <div class="faq-item"><button class="faq-q">What if my game has a common name?<span>+</span></button><div class="faq-a">You can add aliases, your studio name, and required or excluded phrases. That helps reduce false positives.</div></div>
          <div class="faq-item"><button class="faq-q">Can I cancel my subscription?<span>+</span></button><div class="faq-a">Yes. In the production version you will be able to cancel from account settings while keeping access until the end of the paid period.</div></div>
        </div>
      </div>
    </section>

    <section class="section" style="padding-top:28px">
      <div class="shell">
        <div class="cta">
          <div class="kicker">Do not miss the next signal</div>
          <h2>Someone may be publishing content about your game right now.</h2>
          <p>Add your title to monitoring and turn manual searching into one organized alert system.</p>
          <button class="btn btn-primary" data-open="onboarding">Add your first game</button>
        </div>
      </div>
    </section>
  </main>

  <footer><div class="shell footer-inner"><div>© 2026 GameSignal. Creator intelligence for game developers.</div><div>Privacy Policy · Terms · Contact</div></div></footer>

  <aside class="drawer" id="drawer">
    <div class="drawer-head"><h3>Notifications</h3><button class="drawer-close" id="drawerClose">×</button></div>
    <div class="notification"><strong>New stream · Twitch</strong><p>n0vafox started streaming. 184 viewers · now</p></div>
    <div class="notification"><strong>Fast-rising content</strong><p>PixelForge passed 12K views in 32 minutes.</p></div>
    <div class="notification"><strong>New creator detected</strong><p>RavenByte is streaming your game on Kick for the first time.</p></div>
  </aside>

  <div class="modal-backdrop" id="onboardingModal">
    <div class="modal">
      <div class="modal-top"><div><div class="kicker">New monitor</div><h3>Add your game</h3></div><button class="close" data-close>×</button></div>
      <form id="onboardingForm">
        <div class="field"><label>Game title</label><input id="modalGame" placeholder="e.g. AFTERBLAST" required></div>
        <div class="field"><label>Aliases or extra keywords</label><input placeholder="e.g. AFTER BLAST, studio name"></div>
        <div class="field"><label>Steam or game page URL</label><input placeholder="https://store.steampowered.com/..."></div>
        <div class="checks">
          <button type="button" class="source-check selected">YouTube</button>
          <button type="button" class="source-check selected">Twitch</button>
          <button type="button" class="source-check selected">Kick</button>
        </div>
        <button class="btn btn-primary" style="width:100%">Create monitor</button>
        <div class="notice">Interactive frontend demo. A production version still needs APIs, a database, auth, and payments.</div>
      </form>
    </div>
  </div>

  <div class="modal-backdrop" id="loginModal">
    <div class="modal">
      <div class="modal-top"><div><div class="kicker">Account</div><h3>Log in</h3></div><button class="close" data-close>×</button></div>
      <form id="loginForm">
        <div class="field"><label>Email</label><input type="email" placeholder="ty@studio.com" required></div>
        <div class="field"><label>Password</label><input type="password" placeholder="••••••••" required></div>
        <button class="btn btn-primary" style="width:100%;margin-top:18px">Log in</button>
        <div class="notice">In production this form should be connected to your authentication system.</div>
      </form>
    </div>
  </div>

  <div class="modal-backdrop" id="planModal">
    <div class="modal">
      <div class="modal-top"><div><div class="kicker">Subscription</div><h3 id="planTitle">Plan Studio</h3></div><button class="close" data-close>×</button></div>
      <p style="color:#9099ad">In production this step would create a checkout session and activate the selected plan after payment.</p>
      <button class="btn btn-primary" style="width:100%" id="checkoutDemo">Proceed to checkout</button>
      <div class="notice">This demo does not process any payments.</div>
    </div>
  </div>

  <div class="toast" id="toast">Done.</div>
`;
