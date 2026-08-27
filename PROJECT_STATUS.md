# Who Plays My Game - current project status

Last updated: 2026-08-27.

This file is the compact source of truth for the current product state. Current code, production runtime and this document take precedence where older readiness/checkpoint notes conflict. Historical GameSignal identifiers and immutable billing/legal evidence remain unchanged for compatibility and audit continuity.

## Brand and operator

- Product: Who Plays My Game
- Canonical production URL: `https://www.whoplaysmygame.com`
- Support/privacy email: `whoplaysmygame@gmail.com`
- Public support phone: `+48 694 366 395`
- Operator: Lumino Games sp. z o.o.
- Registered address: `ul. Kazimierza Morawskiego 5/127, 30-102 Kraków, Małopolskie, Poland`
- KRS: `0000910452`
- NIP: `6762600090`
- REGON: `389433660`

Historical technical names such as `GAMESIGNAL_*`, repository/project name `game-signals`, migration names and evidence labels remain intentionally unchanged where renaming would create compatibility or audit risk.

## Writing style invariant

Do not use Unicode en dash or em dash characters in product copy, emails, generated documents or assistant-prepared copy for this project. Use normal hyphens, commas, colons or periods instead. Historical immutable evidence is not rewritten only to satisfy this style preference.

## Public launch state

Public signup is OPEN.

A new workspace starts without a paid plan. The current database-enforced active-game limit for the no-plan/free state is 0, so active monitoring requires a paid subscription. Account creation itself creates no payment obligation.

Paddle LIVE is the current new-sales route. A real LIVE Paddle subscription has been paid, synchronized by webhook and is active in production with stored LIVE customer/subscription identity. Customer Portal support is active.

## Paid plan model

All paid plans intentionally have the same feature set. The commercial difference is active-game capacity:

- Indie: 1 active game - $2.99/month or $29.90/year
- Studio: up to 5 active games - $7.99/month or $79.90/year
- Publisher: up to 15 active games - $14.99/month or $149.90/year
- Crazy Dev / Big Publisher: up to 30 active games - $24.99/month or $249.90/year

Every active paid plan includes YouTube and Twitch monitoring, realtime creator-signal dashboard, Discord alerts, opt-in daily email digest, CSV signal export, aliases/exclusion terms, pause/resume and billing portal access.

Do not reintroduce feature gating between paid tiers unless the product model is explicitly changed again.

## Live product

Implemented and production-backed:

- YouTube video monitoring
- Twitch live-stream monitoring
- Supabase-backed creator-signal dashboard
- realtime mention updates
- dashboard history balanced per platform, up to 250 recent YouTube and 250 recent Twitch signals
- aliases and exclusion terms
- game create/edit/pause/resume/remove flows
- database-enforced plan limits
- 12-hour deleted active-game slot cooldown
- Discord alerts for active paid plans
- opt-in daily email digests for active paid plans
- CSV signal export
- account/workspace settings, export and guarded deletion
- public Terms, Privacy, Withdrawal and Refund Policy pages
- Paddle Merchant of Record LIVE checkout and webhook synchronization
- Paddle Customer Portal
- in-app Paddle paid-plan changes
- provider-aware billing identity so legacy Stripe subscriptions remain associated with Stripe
- Google OAuth login and signup through Supabase Auth

Kick remains intentionally unavailable. Do not implement scraping or private endpoints as a workaround.

## Game slot cooldown

Deleting an active tracked game does not make its monitoring slot immediately reusable. That specific freed slot is reserved for 12 hours to prevent rapid game swapping.

The rule is slot-based, not an account-wide lock:

- effective used slots = active games + non-expired deleted-slot cooldowns
- previously unused plan capacity remains available immediately
- deleting a paused game creates no cooldown because it does not free an active slot
- pausing a game itself does not create a cooldown
- adding a game and resuming a paused game are both protected by the same database-enforced effective-slot limit
- concurrent add/delete requests are serialized per workspace so they cannot race around the rule
- cooldown records are stored in the non-public `private` schema
- cooldown state is read only by server-side service-role code; it is not directly callable by authenticated clients

Example on a 5-slot plan: 4 active games -> delete one active game -> 3 active + 1 cooling slot = 4 effective slots, so one new game can still be added. After that addition, 4 active + 1 cooling slot = 5 effective slots and another add is blocked until the cooldown expires.

## Authentication and signup legal evidence

Production Auth uses the canonical domain and supports:

- email/password signup and login
- Google OAuth signup and login
- forgot/reset password
- Resend custom SMTP on verified `auth.whoplaysmygame.com`
- Cloudflare Turnstile enforced server-side on public email/password auth flows

Google OAuth is LIVE in Supabase. Production `/login` and `/signup` both resolve the Google provider as enabled and render `Continue with Google`. Supabase Auth reloaded the provider configuration successfully after activation and subsequent `/settings` checks return HTTP 200.

Google OAuth intentionally uses a deferred-provisioning legal flow for brand-new Google users:

- Google first creates the Auth user and `public.profiles` row only
- a new Google user receives no workspace, membership, subscription or product access before current Terms and Privacy acceptance
- `/auth/complete-google-signup` presents the required legal acceptance
- `/api/auth/complete-google-signup` verifies the authenticated user and same-origin request
- service-role-only RPC `public.complete_google_oauth_signup(uuid,text,text)` verifies a real Google identity and atomically creates legal evidence, default workspace, owner membership and free Paddle subscription
- the RPC is idempotent and serializes concurrent completion for the same Auth user
- `anon` and `authenticated` cannot execute the RPC directly; `service_role` can
- existing email/password users who later use Google with the same verified email are expected to identity-link to the same Auth user and retain their existing workspace

The application OAuth callback is `https://www.whoplaysmygame.com/auth/callback?next=/dashboard`. Google itself redirects through the Supabase Auth callback `https://mgaufxduaaobrlyzdrdo.supabase.co/auth/v1/callback`.

Public email/password signup requires visible acceptance of current Terms and acknowledgement of the Privacy Policy. The database independently fail-closes signup unless current legal-version metadata is present, and accepted versions/timestamp are stored in service-role-only evidence.

Current Terms and Privacy versions used by signup are both `2026-08-24-v2`.

The account agreement confirmation flow is ACTIVE. It sends a concise branded email plus `who-plays-my-game-account-agreement.pdf`, freezes the full confirmation text before sending, verifies its SHA-256, uses Resend idempotency and persists delivery state.

## Monitoring and notification runtime

Active production workers/schedulers:

- Twitch scanner v38
- YouTube scanner v40
- Discord notification worker v36
- daily email digest worker v25

Current cadence logic:

- Twitch: 10 minutes when a game is due
- YouTube paid: 30 minutes when due
- YouTube no-plan/free cadence value: 120 minutes, although the current no-plan/free active-game limit is 0
- daily email digest: at most one digest per recipient for the previous complete UTC day

The Twitch scheduler runs every minute and the scanner claims only due games. The YouTube scheduler remains every 15 minutes and similarly claims only due games. Discord delivery runs every minute from a durable delivery queue. The daily digest destination queue drains every 5 minutes from 06:00 through 11:59 UTC, sends nothing when there are no matching signals, and uses provider idempotency plus durable delivery state to protect against duplicates.

Do not replace daily digest email with instant per-signal email. Realtime belongs in dashboard and Discord.

### Scaled monitoring rollout

The monitoring runtime was reworked and production-validated on 2026-08-23 for a target architecture of up to 1000 active tracked games. This is an architecture capacity target, not a promise that the current external YouTube quota can already sustain 1000 games at the paid 30-minute cadence.

Production scaling safeguards now include:

- per-platform game leases with `FOR UPDATE SKIP LOCKED`, preventing overlapping workers from scanning the same due game
- frozen YouTube scan windows and durable page tokens, so pagination resumes instead of repeating or losing later pages
- YouTube snippet-first classification, with full video details requested only for ambiguous candidates
- a durable YouTube detail-candidate queue, so quota pressure delays validation instead of losing candidates
- best-effort YouTube view-stat enrichment separated from creator detection
- Twitch category IDs cached for seven days instead of resolving the same category on every scan
- grouped Twitch category requests, pagination, rate-limit safety and execution-time guards
- durable Discord delivery jobs with retry timing instead of repeatedly polling only the newest mentions
- SQL-aggregated email summaries and a destination queue instead of loading a large global mention window into one Edge invocation
- direct indexed `workspace_id` ownership on mentions for dashboard and notification filtering
- bounded batch writes and daily cleanup of internal scan/delivery diagnostics

The isolated PostgreSQL regression creates 1000 paid active games plus additional non-paid controls and verifies leasing, queue isolation and no duplicate claims. Production stress validation also completed a full Counter-Strike 2 Twitch scan with more than 2000 simultaneous stream rows without truncation.

### YouTube external quota gate

The current production Search Queries budget intentionally remains conservative at 100 search requests/day with a peak reservation of 4/minute. The one-minute YouTube scheduler is NOT enabled.

At 1000 active paid games and a 30-minute cadence, one search request per game per scan would already require 48,000 `search.list` requests/day before pagination. The capacity regression therefore models a future Search Queries target of about 100,000/day, giving room for more than one result page per scan on average.

Do not increase the YouTube scheduler cadence or production Search Queries budget until Google explicitly approves sufficient quota. After approval, the architecture can be scaled by a controlled configuration/scheduler rollout instead of another monitoring rewrite.

## Domain, hosting and SEO

- Vercel production hosting
- apex redirects to `www`
- Cloudflare DNS records for Vercel remain DNS-only
- legacy `game-signals.vercel.app` redirects matching paths to the canonical host
- canonical metadata uses `www.whoplaysmygame.com`
- `/robots.txt` and `/sitemap.xml` are live
- dedicated SEO pages exist for Twitch stream alerts, YouTube game monitoring and game creator monitoring

Current production deployment for the Google OAuth rollout is Vercel deployment `dpl_Ai4bCkbfGPd2CyVC4Sj6LXh6DiyM`, built from main commit `b3481e2f743496a5463f3572134d154ea3dd9de7`. It is READY and serves the canonical production aliases.

## Paddle billing

Paddle is the current Merchant of Record route for new subscriptions. Existing Stripe-backed records remain Stripe-associated and are not silently converted.

LIVE production configuration includes:

- verified business/account
- LIVE API key stored only server-side
- LIVE Paddle.js client token in Vercel Production
- LIVE webhook destination and signing secret
- approved checkout domain and default payment link
- PayPal, Apple Pay and Google Pay in addition to cards where Paddle makes them available
- `PADDLE_ENV=live`
- `PADDLE_BILLING_ENABLED=true`
- `PADDLE_LIVE_BILLING_ENABLED=true`
- public Sandbox checkout disabled
- all four paid plans mapped to LIVE Paddle prices

A real LIVE Indie monthly subscription is currently active and synchronized in Supabase. LIVE customer and subscription IDs are stored and Customer Portal integration is available.

A historical Paddle Sandbox subscription is retained for internal test history. Billing environment is stored per subscription so Sandbox identity is never sent to the LIVE Paddle API.

### In-app Change Plan

Implemented on production:

- current billing period is preserved during this flow
- immediate upgrade can use Paddle proration and charge only the calculated difference for the remainder of the period
- upgrade can instead be scheduled for the next renewal
- downgrade is allowed only for the next renewal
- downgrade is blocked until active games fit the target plan limit
- the system never chooses games to pause automatically
- scheduled changes use `pending_plan`, `pending_plan_effective_at` and `pending_plan_requested_at`
- current entitlement stays active until the scheduled renewal is successfully paid
- monthly-to-yearly and yearly-to-monthly switching is intentionally deferred to a separate future flow

The original LIVE preview failure on 2026-08-22 was caused by missing Paddle subscription permission. The LIVE API key was updated to `Subscriptions: Write`, which also provides the required read access.

The next-renewal upgrade path has since advanced successfully in LIVE production: the active monthly Indie subscription currently has `pending_plan = studio`, requested on 2026-08-24 and scheduled to take effect at the next renewal on 2026-09-21. This confirms that scheduled upgrade state is being persisted correctly. Immediate prorated upgrade and downgrade should still be treated as separate live-path validations unless reverified after this status update.

## Legacy Stripe and KSeF

Stripe LIVE is OFF for new sales. KSeF PROD is OFF. Legacy direct Stripe/KSeF infrastructure remains only for rollback/history and is separated from the current Paddle route.

The old Stripe tax-ID reconciliation function remains deployed but its scheduler is disabled.

Do not rewrite immutable historical direct-billing evidence just to match current branding, address or style.

## Public legal documents

Current versions:

- Terms: `2026-08-24-v2`
- Privacy: `2026-08-24-v2`
- Withdrawal: `2026-08-17-v1`
- Refund Policy page revision date: `2026-08-17-v1`

Operator contact uses the current registered address, support email and public support phone. `/refunds` provides the standalone Refund Policy URL used for Paddle verification.

## Security

Google OAuth deferred provisioning is fail-closed around legal acceptance. Brand-new Google users cannot receive a workspace or product access until the service-role completion path verifies both Google identity and current legal versions.

The Google completion RPC access currently verifies as:

- `anon`: no EXECUTE
- `authenticated`: no EXECUTE
- `service_role`: EXECUTE

Known reviewed Supabase advisor notices remain intentionally tracked:

- Leaked Password Protection is unavailable/disabled in the current setup
- `pg_net` remains in `public` because the scheduler depends on pg_cron and pg_net
- RLS-without-policy INFO notices concern internal service-role-only billing/legal tables with no client policy by design

Do not blindly change these notices without rechecking worker dependencies and access-control intent.

## Current production health snapshot

Verified after Google provider activation on 2026-08-27:

- Vercel production deployment: READY
- production `/login`: HTTP 200 and Google enabled
- production `/signup`: HTTP 200 and Google enabled
- Vercel production error/fatal runtime logs in the checked one-hour window: none
- Supabase Auth provider configuration reload: successful
- latest checked 30-minute cron window: 62 total, 62 succeeded, 0 non-success
- latest checked 30-minute monitoring scan window: 10 total, 10 success, 0 non-success
- users/profiles/workspaces/memberships/subscriptions remain balanced at 7 each before the first Google sign-in
- Google identities remain 0 before the first interactive Google sign-in, which is expected

## Current launch invariants

- public signup: OPEN
- no-plan/free active-game limit: 0
- paid-plan features: SAME across Indie/Studio/Publisher/Crazy; capacity differs
- limits: 0 / 1 / 5 / 15 / 30
- deleting an active game reserves exactly that freed slot for 12 hours
- deleting a paused game creates no slot cooldown
- unused plan capacity remains usable while other deleted slots cool down
- dashboard history: up to 250 YouTube + 250 Twitch signals
- scaled monitoring queues and leases: LIVE
- 1000-game architecture regression: PASS
- YouTube 1000-game full-cadence external quota: NOT YET APPROVED
- YouTube scheduler: every 15 minutes, intentionally gated
- Paddle runtime: LIVE
- Paddle LIVE checkout: ON
- real LIVE paid subscription: ACTIVE and webhook-synchronized
- Paddle Customer Portal: ACTIVE
- in-app Change Plan: IMPLEMENTED
- next-renewal Indie -> Studio scheduled change: VERIFIED in LIVE state
- immediate prorated upgrade and downgrade: separate live-path validation still desirable
- public Paddle Sandbox new checkout: OFF
- Stripe LIVE new sales: OFF
- KSeF PROD: OFF
- Kick: OFF
- Turnstile: ON for public email/password auth
- Google OAuth: ON through Supabase Auth
- Auth email: ON through Resend
- account agreement confirmation: ON, concise body plus PDF attachment
- current Terms/Privacy signup versions: `2026-08-24-v2`
- product email: opt-in daily digest only
- no secrets committed to Git
- preserve RLS and worker authorization

## Next validation step

Perform one interactive production Google sign-in. Preferably test both cases over time:

1. Brand-new Google email: verify Google Auth creates only the Auth user/profile first, then `/auth/complete-google-signup` requires current legal acceptance, and completion creates exactly one workspace, owner membership, free subscription and legal evidence before dashboard access.
2. Existing verified email/password account using the same Google email: verify Supabase links the Google identity to the existing Auth user and preserves the existing workspace instead of creating another account/workspace.

After an interactive Google login, verify the agreement confirmation email and recheck Auth logs, Google identity count, workspace/membership/subscription counts, Vercel runtime errors and monitoring health. Immediate-proration and downgrade Change Plan paths can then be revalidated separately if desired.
