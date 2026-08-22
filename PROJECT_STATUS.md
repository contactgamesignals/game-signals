# Who Plays My Game - current project status

Last updated: 2026-08-22.

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
- aliases and exclusion terms
- game create/edit/pause/resume/remove flows
- database-enforced plan limits
- Discord alerts for active paid plans
- opt-in daily email digests for active paid plans
- CSV signal export
- account/workspace settings, export and guarded deletion
- public Terms, Privacy, Withdrawal and Refund Policy pages
- Paddle Merchant of Record LIVE checkout and webhook synchronization
- Paddle Customer Portal
- in-app Paddle paid-plan changes
- provider-aware billing identity so legacy Stripe subscriptions remain associated with Stripe

Kick remains intentionally unavailable. Do not implement scraping or private endpoints as a workaround.

## Authentication and signup legal evidence

Production Auth uses the canonical domain and supports:

- email/password signup and login
- forgot/reset password
- Resend custom SMTP on verified `auth.whoplaysmygame.com`
- Cloudflare Turnstile enforced server-side on public email/password auth flows

Public signup requires visible acceptance of current Terms and acknowledgement of the Privacy Policy. The database independently fail-closes signup unless current legal-version metadata is present, and accepted versions/timestamp are stored in service-role-only evidence.

The account agreement confirmation flow is ACTIVE. It sends a concise branded email plus `who-plays-my-game-account-agreement.pdf`, freezes the full confirmation text before sending, verifies its SHA-256, uses Resend idempotency and persists delivery state.

## Monitoring and notification runtime

Active production workers/schedulers:

- Twitch scanner
- YouTube scanner
- Discord notification worker
- daily email digest worker

Current cadence logic:

- Twitch: 10 minutes when a game is due
- YouTube paid: 30 minutes when due
- YouTube no-plan/free cadence value: 120 minutes, although the current no-plan/free active-game limit is 0
- daily email digest: once daily at `06:00 UTC`

The Twitch scheduler itself runs every minute and the scanner checks each game's due time. The YouTube scheduler runs every 15 minutes and similarly processes due games. Discord delivery runs every minute. The daily digest processes the previous complete UTC day, sends nothing when there are no matching signals and uses idempotency to protect against duplicates.

Do not replace daily digest email with instant per-signal email. Realtime belongs in dashboard and Discord.

## Domain, hosting and SEO

- Vercel production hosting
- apex redirects to `www`
- Cloudflare DNS records for Vercel remain DNS-only
- legacy `game-signals.vercel.app` redirects matching paths to the canonical host
- canonical metadata uses `www.whoplaysmygame.com`
- `/robots.txt` and `/sitemap.xml` are live
- dedicated SEO pages exist for Twitch stream alerts, YouTube game monitoring and game creator monitoring

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

A real LIVE Indie monthly subscription is currently active and synchronized in Supabase. Its current period ends on 2026-09-21. LIVE customer and subscription IDs are stored and Customer Portal integration is available.

A historical Paddle Sandbox subscription is retained for internal test history. Billing environment is stored per subscription so Sandbox identity is never sent to the LIVE Paddle API.

### In-app Change Plan

Implemented on production:

- current billing period is preserved during this flow
- immediate upgrade uses Paddle proration and charges only the calculated difference for the remainder of the period
- upgrade can instead be scheduled for the next renewal
- downgrade is allowed only for the next renewal
- downgrade is blocked until active games fit the target plan limit
- the system never chooses games to pause automatically
- scheduled changes use `pending_plan`, `pending_plan_effective_at` and `pending_plan_requested_at`
- current entitlement stays active until the scheduled renewal is successfully paid
- monthly-to-yearly and yearly-to-monthly switching is intentionally deferred to a separate future flow

On 2026-08-22 the first LIVE Change Plan preview exposed `not authorized to read subscription`. Production data remained unchanged. The cause was missing Paddle API-key subscription permission, not database corruption or a plan-change code failure. The existing LIVE key was updated to `Subscriptions: Write`, which also supplies the read access required by the preview. A post-permission end-to-end retry is the current validation step.

## Legacy Stripe and KSeF

Stripe LIVE is OFF for new sales. KSeF PROD is OFF. Legacy direct Stripe/KSeF infrastructure remains only for rollback/history and is separated from the current Paddle route.

The old Stripe tax-ID reconciliation function remains deployed but its scheduler is disabled.

Do not rewrite immutable historical direct-billing evidence just to match current branding, address or style.

## Public legal documents

Current versions:

- Terms: `2026-08-17-v1`
- Privacy: `2026-08-17-v1`
- Withdrawal: `2026-08-17-v1`

Operator contact uses the current registered address, support email and public support phone. `/refunds` provides the standalone Refund Policy URL used for Paddle verification.

## Security

Known reviewed Supabase advisor notices remain intentionally tracked:

- Leaked Password Protection is unavailable/disabled in the current setup
- `pg_net` remains in `public` because the scheduler depends on pg_cron and pg_net
- RLS-without-policy INFO notices concern internal service-role-only billing/legal tables with no client policy by design

Do not blindly change these notices without rechecking worker dependencies and access-control intent.

## Current launch invariants

- public signup: OPEN
- no-plan/free active-game limit: 0
- paid-plan features: SAME across Indie/Studio/Publisher/Crazy; capacity differs
- limits: 0 / 1 / 5 / 15 / 30
- Paddle runtime: LIVE
- Paddle LIVE checkout: ON
- real LIVE paid subscription: ACTIVE and webhook-synchronized
- Paddle Customer Portal: ACTIVE
- in-app Change Plan: IMPLEMENTED, final LIVE path validation in progress
- Paddle LIVE API key subscription permission: WRITE enabled on 2026-08-22
- public Paddle Sandbox new checkout: OFF
- Stripe LIVE new sales: OFF
- KSeF PROD: OFF
- Kick: OFF
- Turnstile: ON
- Auth email: ON through Resend
- account agreement confirmation: ON, concise body plus PDF attachment
- product email: opt-in daily digest only
- no secrets committed to Git
- preserve RLS and worker authorization

## Next validation step

Retry the existing LIVE Indie -> Studio Change Plan preview after the Paddle permission update. First verify that Paddle returns the exact preview amounts without changing the subscription. Then separately validate immediate upgrade, next-renewal upgrade and downgrade paths before considering Change Plan fully closed.
