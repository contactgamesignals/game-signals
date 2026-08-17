# Who Plays My Game - current project status

Last updated: 2026-08-18.

This file is the compact source of truth for the current product state. Historical GameSignal readiness/checkpoint files remain audit history. Current code, runtime and this document take precedence where older notes conflict.

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

The support phone is intentionally kept in operator/legal contact information and transactional agreement confirmation rather than promoted in marketing copy.

Historical technical identifiers such as `GAMESIGNAL_*`, repository/project name `game-signals`, migration names and some evidence labels remain intentionally unchanged for compatibility and audit continuity. Historical frozen billing/contract evidence is not rewritten when current operator data changes.

## Writing style invariant

Do not use Unicode en dash or em dash characters in product copy, emails, generated documents or assistant-prepared copy for this project. Use normal hyphens, commas, colons or periods instead. Historical immutable evidence is not rewritten only to satisfy this style preference.

## Public launch state

Free public beta signup is OPEN.

A new Free workspace can track one active game. Free signup creates no payment obligation. Public registration is enabled in both the frontend and database.

Paddle LIVE checkout is now technically enabled for the final end-to-end launch test. A LIVE checkout has been created successfully, but the first real payment has not yet been completed. Treat paid launch as final-validation-in-progress until the completed transaction, webhook synchronization, active subscription and Customer Portal are confirmed.

## Paid plan model

Indie, Studio and Publisher intentionally have the same paid feature set and the same paid monitoring cadence. The only commercial difference between paid tiers is the number of active monitored games:

- Indie: 1 active game
- Studio: up to 3 active games
- Publisher: up to 10 active games

Every active paid plan includes YouTube and Twitch monitoring, Discord alerts, opt-in daily email digest, CSV signal export, aliases/exclusion terms, pause/resume, billing portal access and the fastest paid monitoring cadence. Do not reintroduce feature gating between Indie, Studio and Publisher unless the product model is explicitly changed again.

## Live product

Implemented and production-backed:

- YouTube video monitoring
- Twitch live-stream monitoring
- real Supabase-backed creator-signal dashboard
- aliases and exclusion terms
- game create/edit/pause/resume/remove flows
- realtime mention updates
- Discord alerts for every active paid plan
- opt-in daily email digests for every active paid plan
- plan-based active-game limits
- CSV signal export for every active paid plan
- account/workspace settings, export and guarded deletion
- public Terms, Privacy, Withdrawal and Refund Policy pages
- Paddle Merchant of Record billing integration verified in Sandbox and staged in LIVE
- Paddle Customer Portal integration
- provider-aware billing identity so legacy Stripe subscriptions remain associated with Stripe

Kick remains intentionally unavailable. Do not implement scraping or private endpoints as a workaround.

## Authentication and signup legal evidence

Production Auth is configured on the canonical domain with:

- email/password signup and login
- forgot/reset password
- Resend custom SMTP on verified `auth.whoplaysmygame.com`
- Cloudflare Turnstile enforced server-side on public email/password auth flows

Real recovery email delivery and real browser login with Turnstile were verified. Requests without CAPTCHA were rejected with `captcha_failed`.

Public signup requires a visible checkbox agreeing to current Terms and acknowledging the Privacy Policy. The frontend sends exact legal versions in Supabase user metadata.

The database trigger `handle_new_user()` independently fail-closes signup unless it receives current acceptance metadata. Accepted versions and a database timestamp are stored in service-role-only `account_legal_acceptances`. New subscriptions created by signup are Free and default to `billing_provider='paddle'`.

## Account agreement confirmation

The database stores delivery evidence for the signup agreement confirmation: frozen confirmation text, SHA-256, status, provider message ID, attempts, sent timestamp and error state.

Supabase Edge Function `send-account-agreement-confirmation` is ACTIVE. Current version sends:

- a concise branded welcome/account-ready email
- a PDF attachment named `who-plays-my-game-account-agreement.pdf` containing the full durable account agreement confirmation
- direct links to dashboard, Terms, Privacy and Withdrawal information

The function still freezes the full confirmation text before sending, verifies its SHA-256, uses a Resend idempotency key and persists sending/delivered/failed/needs_review state.

Future confirmations use the current registered address and ASCII-safe PDF typography. Already frozen/delivered historical confirmations remain immutable and are not rewritten.

## Monitoring and email runtime

Active:

- Twitch Edge Function and scheduler
- YouTube Edge Function and scheduler
- Discord notification worker and scheduler
- daily email digest worker and scheduler

Paid monitoring cadence is intentionally uniform across Indie, Studio and Publisher: Twitch every 2 minutes and YouTube every 30 minutes when due. Free remains on the slower Free cadence.

The product digest runs once daily at `06:00 UTC`, processes the previous complete UTC day, sends nothing when no matching signals exist, groups by recipient and is capped at one digest per recipient per day. Resend idempotency protects against retry duplicates.

Do not replace daily digest email with instant per-signal email. Realtime belongs in dashboard and Discord.

## Domain, hosting and SEO

- Vercel production hosting
- apex redirects to `www`
- Cloudflare DNS records remain DNS-only for Vercel
- legacy `game-signals.vercel.app` permanently redirects matching paths to the canonical host
- canonical metadata uses `www.whoplaysmygame.com`
- `/robots.txt` and `/sitemap.xml` are live
- dedicated SEO pages exist for Twitch stream alerts, YouTube game monitoring and game creator monitoring

## Billing

### Paddle Merchant of Record - current customer route

New subscription records default to Paddle. Existing Stripe-backed records remain Stripe-associated.

Prices:

- Indie: $2.99/month or $29.90/year
- Studio: $7.99/month or $79.90/year
- Publisher: $14.99/month or $149.90/year

The price difference represents active-game capacity only, not feature access.

Sandbox verified transaction creation, webhook synchronization, Paddle-Signature verification, active subscription state, customer/subscription IDs, Customer Portal, end-of-period cancellation and duplicate-subscription protection.

One historical Paddle Sandbox subscription remains on the internal `luminotax@gmail.com` test workspace. Its billing environment is explicitly `sandbox`, so its customer/subscription IDs are never sent to the LIVE Paddle API.

### Paddle LIVE - current state

Completed:

- business verification passed
- identity verification passed
- three products and six LIVE prices created
- all six LIVE `pri_...` IDs mapped in application billing code
- LIVE API key stored in Supabase
- LIVE client-side token stored in Vercel Production
- LIVE notification destination created for the Supabase `paddle-webhook` endpoint
- LIVE webhook signing secret stored in Supabase
- domain accepted for LIVE checkout
- default payment link configured
- PayPal, Apple Pay and Google Pay enabled in addition to cards
- payout settings configured for Lumino Games
- Paddle runtime switched to `live`
- `PADDLE_BILLING_ENABLED=true`
- `PADDLE_LIVE_BILLING_ENABLED=true`
- Sandbox checkout remains disabled
- `/pay` confirmed to load Paddle.js with a LIVE client token
- first LIVE checkout transaction successfully created for Indie monthly
- LIVE checkout displayed correct $2.99 total and Polish VAT calculation

Current final validation transaction:

- transaction ID: `txn_01m08zermaw59av5apry5kae85`
- plan: Indie
- billing period: monthly
- buyer type: individual
- consent evidence recorded
- workspace billing environment: `live`
- transaction has not yet been paid

Still required before declaring paid launch fully validated:

- complete one real LIVE payment
- confirm Paddle transaction reaches completed status
- confirm LIVE webhook deliveries return 2xx
- confirm Supabase subscription changes from Free to active Indie
- confirm LIVE Paddle customer and subscription IDs are stored
- confirm Customer Portal opens for the new LIVE customer
- cancel/refund the internal validation subscription if desired after testing

## Legacy Stripe and KSeF

Stripe LIVE is OFF for new sales. KSeF PROD is OFF. Legacy direct Stripe/KSeF infrastructure is preserved only for rollback/history and is separated from the current Paddle route.

The old Stripe tax-ID reconciliation function remains deployed, but its scheduler is disabled because there are no reconciliation candidates.

Do not rewrite immutable historical direct-billing evidence just to match current branding, address or style.

## Public legal documents

Current versions:

- Terms: `2026-08-17-v1`
- Privacy: `2026-08-17-v1`
- Withdrawal: `2026-08-17-v1`

Operator contact uses the current registered address, support email and public support phone. `/refunds` provides the standalone Refund Policy URL used for Paddle verification.

Future Paddle checkout consent records use current Terms/Privacy versions.

## Security

Known reviewed Supabase advisor notices:

- Leaked Password Protection remains unavailable on the current Supabase Free plan
- `pg_net` remains in public because the scheduler depends on pg_cron and pg_net
- RLS-without-policy INFO notices concern internal service-role-only billing tables with no `anon` or `authenticated` access

RLS is enabled on reviewed public application/billing tables. Workspace helpers use `auth.uid()`, SECURITY DEFINER, fixed search paths and no client CREATE permission in the private schema.

## Launch invariants

- Free public beta signup: OPEN
- paid-plan features: SAME across Indie/Studio/Publisher; only active-game limit differs
- public Paddle Sandbox new checkout: OFF
- Paddle runtime: LIVE
- Paddle LIVE checkout gate: ON for final validation
- first real LIVE payment: NOT YET COMPLETED
- Stripe LIVE new sales: OFF
- KSeF PROD: OFF
- Kick: OFF
- Turnstile: ON
- Auth email: ON through Resend
- account agreement email: concise body plus PDF attachment
- product email: opt-in daily digest only
- no secrets committed to Git
- preserve RLS and worker authorization
