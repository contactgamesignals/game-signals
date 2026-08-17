# Who Plays My Game — current project status

Last updated: 2026-08-17.

This file is the compact source of truth for the current product state. Historical GameSignal readiness/checkpoint files remain audit history; current code/runtime and this document take precedence where old branding or architecture notes conflict.

## Brand and operator

- Product: Who Plays My Game
- Canonical production URL: `https://www.whoplaysmygame.com`
- Support/privacy email: `whoplaysmygame@gmail.com`
- Operator: Lumino Games sp. z o.o.
- KRS: `0000910452`
- NIP: `6762600090`
- REGON: `389433660`
- Current registered address: `ul. Ujastek 1, 31-752 Kraków, Poland`

Do not use the old `Kazimierza Morawskiego 5/127` address for Lumino Games. That address was incorrectly mixed into current operator data and has been corrected in `lib/company.ts` and the current `billing_seller_profiles` row. Historical immutable Stripe/direct-billing evidence snapshots are not rewritten merely for this correction.

Historical technical identifiers such as `GAMESIGNAL_*`, repository/project name `game-signals`, migration names and some evidence labels remain intentionally unchanged for compatibility/audit continuity.

## Public launch state

The application is technically ready for public Free beta use, but final public consumer launch should wait for the one remaining operator datum: a real public customer-contact telephone number for Lumino Games / Who Plays My Game.

Once that number is configured and the durable account-agreement confirmation sender is wired into the signup-confirmation callback, the Free public beta can be announced broadly.

A new Free workspace can track one active game. Free signup creates no payment obligation.

New real-money checkout remains deliberately locked until the separate Paddle LIVE cutover is complete. Public Paddle Sandbox checkout is fail-closed and cannot be presented as a real purchase.

## Live product

Implemented and production-backed:

- YouTube video monitoring;
- Twitch live-stream monitoring;
- real Supabase-backed creator-signal dashboard;
- aliases and exclusion terms;
- game create/edit/pause/resume/remove flows;
- realtime mention updates;
- Discord alerts for eligible paid plans;
- opt-in daily email digests for eligible paid plans;
- plan-based active-game limits;
- Publisher CSV export;
- account/workspace settings, export and guarded deletion;
- public Terms, Privacy and Withdrawal pages;
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

Public signup now requires a visible checkbox agreeing to current Terms and acknowledging the Privacy Policy. The frontend sends the exact legal versions in Supabase user metadata.

The database trigger `handle_new_user()` independently fail-closes signup unless it receives:

- `terms_accepted=true`;
- Terms version `2026-08-17-v1`;
- `privacy_acknowledged=true`;
- Privacy version `2026-08-17-v1`.

Accepted versions and a database timestamp are stored in service-role-only `account_legal_acceptances`. New subscriptions created by signup are Free, `billing_provider='paddle'`, and keep legacy `stripe_status_raw='trialing'` compatibility.

## Durable account-agreement confirmation

UOKiK guidance for distance contracts requires confirmation on a durable medium no later than the start of the service; email is a durable medium while a mutable web page is not.

The database now stores delivery evidence fields for the signup agreement confirmation: frozen confirmation text, SHA-256, status, provider message ID, attempts, sent timestamp and error state.

Supabase Edge Function `send-account-agreement-confirmation` v1 is ACTIVE and implements:

- authenticated-user-only custom authorization;
- current legal-version lookup;
- frozen confirmation text + SHA-256 verification;
- Resend idempotency key;
- explicit sending/delivered/failed/needs_review state;
- durable email content covering operator identity, Free plan/service, 0-price status, technical requirements, withdrawal information, complaint contact and accepted document versions.

The sender intentionally requires `GAMESIGNAL_SUPPORT_PHONE` and therefore remains fail-closed until a genuine public Lumino Games / Who Plays My Game phone number is supplied. Do not invent or substitute a Lumino Tax/private number.

After the phone is configured, wire this sender into successful signup confirmation (`/auth/callback?next=/dashboard`) and perform one end-to-end external signup test before broad announcement.

## Monitoring and email runtime

Active:

- Twitch Edge Function + scheduler;
- YouTube Edge Function + scheduler;
- Discord notification worker + scheduler;
- daily email digest worker + scheduler.

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

Sandbox has verified transaction creation, webhook synchronization, Paddle-Signature verification, active subscription state, customer/subscription IDs, Customer Portal, end-of-period cancellation and duplicate-subscription protection.

One historical Paddle Sandbox subscription remains on the internal `luminotax@gmail.com` test workspace. Sandbox IDs are test history and are not valid LIVE identifiers.

### Public Sandbox checkout lock

`paddle-billing` v15 is ACTIVE. New Sandbox checkout requires explicit `PADDLE_SANDBOX_CHECKOUT_ENABLED=true`; keep it absent/false on public production. Customer Portal access for an existing Paddle customer remains independent from the new-sales switch.

### Paddle LIVE — still OFF

Sandbox and LIVE use separate credentials, catalog IDs and webhook configuration.

Before real-money sales:

- complete Paddle LIVE business/account verification;
- approve the LIVE domain/default payment link;
- create six LIVE price IDs;
- create LIVE API key and client-side token;
- configure LIVE webhook/signing secret;
- verify LIVE Customer Portal;
- publish the support telephone;
- confirm Paddle MoR accounting/reconciliation route;
- complete final consumer checkout/legal review;
- smoke-test with `PADDLE_LIVE_BILLING_ENABLED=false` first;
- only then explicitly set `PADDLE_LIVE_BILLING_ENABLED=true`.

Paddle.js is prepared for LIVE initialization including `pwCustomer` for Retain readiness.

## Legacy/direct Stripe and KSeF

Stripe LIVE is OFF. KSeF PROD is OFF. Legacy direct Stripe/KSeF infrastructure is preserved only for rollback/history and is separated from the current Paddle launch gate.

The old Stripe tax-ID reconciliation function remains deployed, but its every-five-minute cron is disabled because there are no reconciliation candidates.

Do not rewrite immutable historical direct-billing evidence just to match current branding/address.

## Public legal documents

Current versions:

- Terms: `2026-08-17-v1`
- Privacy: `2026-08-17-v1`
- Withdrawal: `2026-08-17-v1`

Public copy reflects Public Beta, not old Closed Beta: YouTube/Twitch live, Kick unavailable, Discord/daily email according to plan, Sandbox sales disabled and Paddle LIVE still pending.

Future Paddle checkout consent records use current Terms/Privacy versions.

## Security

Known reviewed Supabase advisor notices:

- Leaked Password Protection disabled because the current project is on Supabase Free; revisit Pro before paid launch;
- `pg_net` resides in public and is intentionally retained because the scheduler uses pg_cron + pg_net and relocating it safely requires recreation;
- RLS-without-policy INFO notices concern internal service-role-only billing tables with no `anon`/`authenticated` access.

RLS is enabled on reviewed public application/billing tables. Workspace helpers use `auth.uid()`, SECURITY DEFINER, fixed search paths and no client CREATE permission in the private schema.

## Launch invariants

- broad Free public beta announcement: WAITING ONLY FOR PUBLIC SUPPORT PHONE + FINAL DURABLE-CONFIRMATION WIRING/TEST;
- public Paddle Sandbox new checkout: OFF;
- Paddle LIVE: OFF until full LIVE cutover;
- Stripe LIVE: OFF;
- KSeF PROD: OFF;
- Kick: OFF;
- Turnstile: ON;
- Auth email: ON through Resend;
- product email: opt-in daily digest only;
- no secrets committed to Git;
- preserve RLS and worker authorization.
