# Who Plays My Game — current project status

Last updated: 2026-08-17.

This file is the compact source of truth for the current product state. Historical GameSignal readiness/checkpoint files remain audit history; current code/runtime and this document take precedence where old branding or architecture notes conflict.

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

Historical technical identifiers such as `GAMESIGNAL_*`, repository/project name `game-signals`, migration names and some evidence labels remain intentionally unchanged for compatibility/audit continuity. Historical frozen billing/contract evidence is not rewritten when current operator data changes.

## Public launch state

**Free public beta signup is OPEN.**

A new Free workspace can track one active game. Free signup creates no payment obligation. Public registration is enabled in both the frontend and the database (`public_signup_enabled=true`).

New real-money checkout remains deliberately locked until the separate Paddle LIVE cutover is complete. Public Paddle Sandbox checkout is fail-closed and cannot be presented as a real purchase.

## Paid plan model

Indie, Studio and Publisher intentionally have the same paid feature set and the same paid monitoring cadence. The only commercial difference between paid tiers is the number of active monitored games:

- Indie: 1 active game;
- Studio: up to 3 active games;
- Publisher: up to 10 active games.

Every active paid plan includes YouTube + Twitch monitoring, Discord alerts, opt-in daily email digest, CSV signal export, aliases/exclusion terms, pause/resume, billing portal access and the fastest paid monitoring cadence. Do not reintroduce feature gating between Indie, Studio and Publisher unless the product model is explicitly changed again.

## Live product

Implemented and production-backed:

- YouTube video monitoring;
- Twitch live-stream monitoring;
- real Supabase-backed creator-signal dashboard;
- aliases and exclusion terms;
- game create/edit/pause/resume/remove flows;
- realtime mention updates;
- Discord alerts for every active paid plan;
- opt-in daily email digests for every active paid plan;
- plan-based active-game limits;
- CSV signal export for every active paid plan;
- account/workspace settings, export and guarded deletion;
- public Terms, Privacy, Withdrawal and Refund Policy pages;
- Paddle Merchant-of-Record billing integration verified in Sandbox;
- Paddle Customer Portal;
- provider-aware billing identity so legacy Stripe subscriptions remain associated with Stripe.

Kick remains intentionally unavailable. Do not implement scraping/private endpoints as a workaround.

## Authentication and signup legal evidence

Production Auth is configured on the canonical domain with:

- email/password signup and login;
- forgot/reset password;
- Resend custom SMTP on verified `auth.whoplaysmygame.com`;
- Cloudflare Turnstile enforced server-side on public email/password auth flows.

Real recovery email delivery and real browser login with Turnstile were verified. Requests without CAPTCHA were rejected with `captcha_failed`.

Public signup requires a visible checkbox agreeing to current Terms and acknowledging the Privacy Policy. The frontend sends exact legal versions in Supabase user metadata.

The database trigger `handle_new_user()` independently fail-closes signup unless it receives:

- `terms_accepted=true`;
- Terms version `2026-08-17-v1`;
- `privacy_acknowledged=true`;
- Privacy version `2026-08-17-v1`.

Accepted versions and a database timestamp are stored in service-role-only `account_legal_acceptances`. New subscriptions created by signup are Free, `billing_provider='paddle'`, and keep legacy `stripe_status_raw='trialing'` compatibility.

## Account agreement confirmation

The database stores delivery evidence for the signup agreement confirmation: frozen confirmation text, SHA-256, status, provider message ID, attempts, sent timestamp and error state.

Supabase Edge Function `send-account-agreement-confirmation` is ACTIVE. It:

- authenticates the current user;
- bypasses legacy accounts created before the current signup-evidence flow;
- freezes the confirmation text and verifies its SHA-256;
- uses a Resend idempotency key;
- persists sending/delivered/failed/needs_review state;
- sends current operator/contact information, Free plan status and accepted document versions.

Future confirmations use the current registered address. Already frozen/delivered historical confirmations remain immutable and are not rewritten. The public phone is `+48 694 366 395`; an environment override may still be used later if needed.

## Monitoring and email runtime

Active:

- Twitch Edge Function + scheduler;
- YouTube Edge Function + scheduler;
- Discord notification worker + scheduler;
- daily email digest worker + scheduler.

Paid monitoring cadence is intentionally uniform across Indie, Studio and Publisher: Twitch every 2 minutes and YouTube every 30 minutes when due. Free remains on the slower Free cadence.

The product digest runs once daily at `06:00 UTC`, processes the previous complete UTC day, sends nothing when no matching signals exist, groups by recipient and is capped at one digest per recipient per day. Resend idempotency protects against retry duplicates.

Do not replace daily digest email with instant per-signal email. Realtime belongs in dashboard/Discord.

## Domain, hosting and SEO

- Vercel production hosting;
- apex redirects to `www`;
- Cloudflare DNS records remain DNS-only for Vercel;
- legacy `game-signals.vercel.app` permanently redirects matching paths to the canonical host;
- canonical metadata uses `www.whoplaysmygame.com`;
- `/robots.txt` and `/sitemap.xml` are live.

## Billing

### Paddle Merchant of Record — current customer route

New subscription records default to Paddle. Existing Stripe-backed records remain Stripe-associated.

Planned prices:

- Indie: $2.99/month or $29.90/year
- Studio: $7.99/month or $79.90/year
- Publisher: $14.99/month or $149.90/year

The price difference represents active-game capacity only, not feature access.

Sandbox has verified transaction creation, webhook synchronization, Paddle-Signature verification, active subscription state, customer/subscription IDs, Customer Portal, end-of-period cancellation and duplicate-subscription protection.

One historical Paddle Sandbox subscription remains on the internal `luminotax@gmail.com` test workspace. Sandbox IDs are test history and are not valid LIVE identifiers.

### Public Sandbox checkout lock

New Sandbox checkout requires explicit `PADDLE_SANDBOX_CHECKOUT_ENABLED=true`; keep it absent/false on public production. Customer Portal access for an existing Paddle customer remains independent from the new-sales switch.

### Paddle LIVE — onboarding in progress, real charges still OFF

Paddle is the intended Merchant of Record for new paid customer transactions. Its role is to handle the payment transaction, applicable sales tax/VAT/GST, customer billing documents and payment-side refund/chargeback handling. Do not rebuild a second new direct-payment/tax stack for Paddle customers.

Sandbox and LIVE use separate credentials, catalog IDs and webhook configuration.

Completed in LIVE:

- three products and six prices created;
- all six LIVE `pri_...` IDs mapped in application billing code;
- LIVE API key created and stored in Supabase as `PADDLE_LIVE_API_KEY`;
- LIVE client-side token created and stored in Vercel Production as `PADDLE_LIVE_CLIENT_TOKEN`;
- LIVE notification destination created for the Supabase `paddle-webhook` endpoint;
- LIVE webhook signing secret stored in Supabase as `PADDLE_LIVE_WEBHOOK_SECRET`;
- `whoplaysmygame.com` submitted for Paddle domain approval and currently pending review;
- Paddle account/business verification started;
- current Lumino Games registered address reconciled in app/legal data and current billing seller profile.

Still required before real-money sales:

- finish Paddle LIVE business/account verification;
- receive domain approval and set/verify the LIVE default payment link;
- verify LIVE Customer Portal and enabled payment methods;
- set up/verify Paddle payouts;
- confirm Paddle MoR accounting/reconciliation route;
- smoke-test LIVE configuration while `PADDLE_LIVE_BILLING_ENABLED=false`;
- only then explicitly enable the LIVE sales gate.

Do not switch public checkout to LIVE prematurely. Paddle.js is prepared for LIVE initialization including `pwCustomer` for Retain readiness.

## Legacy/direct Stripe and KSeF

Stripe LIVE is OFF. KSeF PROD is OFF. Legacy direct Stripe/KSeF infrastructure is preserved only for rollback/history and is separated from the current Paddle launch gate.

The old Stripe tax-ID reconciliation function remains deployed, but its every-five-minute cron is disabled because there are no reconciliation candidates.

Do not rewrite immutable historical direct-billing evidence just to match current branding/address.

## Public legal documents

Current versions:

- Terms: `2026-08-17-v1`
- Privacy: `2026-08-17-v1`
- Withdrawal: `2026-08-17-v1`

Public copy reflects Public Beta, not old Closed Beta: YouTube/Twitch live, Kick unavailable, paid-plan feature access is uniform, Sandbox sales disabled and Paddle LIVE still pending. Operator contact uses the current registered address, support email and public support phone. `/refunds` provides the standalone Refund Policy URL required by Paddle website verification.

Future Paddle checkout consent records use current Terms/Privacy versions.

## Security

Known reviewed Supabase advisor notices:

- Leaked Password Protection disabled because the current project is on Supabase Free; revisit Pro before paid launch;
- `pg_net` resides in public and is intentionally retained because the scheduler uses pg_cron + pg_net and relocating it safely requires recreation;
- RLS-without-policy INFO notices concern internal service-role-only billing tables with no `anon`/`authenticated` access.

RLS is enabled on reviewed public application/billing tables. Workspace helpers use `auth.uid()`, SECURITY DEFINER, fixed search paths and no client CREATE permission in the private schema.

## Launch invariants

- Free public beta signup: OPEN;
- paid-plan features: SAME across Indie/Studio/Publisher; only active-game limit differs;
- public Paddle Sandbox new checkout: OFF;
- Paddle LIVE real-money checkout: OFF until full LIVE cutover;
- Stripe LIVE: OFF;
- KSeF PROD: OFF;
- Kick: OFF;
- Turnstile: ON;
- Auth email: ON through Resend;
- product email: opt-in daily digest only;
- no secrets committed to Git;
- preserve RLS and worker authorization.
