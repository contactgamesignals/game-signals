# Who Plays My Game — current project status

Last updated: 2026-08-17.

This file is the compact source of truth for the current product state. Historical GameSignal readiness/checkpoint files remain useful as audit history, but current code/runtime and this document take precedence where old branding or architecture notes conflict.

## Product and brand

Who Plays My Game is a subscription application for game developers and publishers. A workspace adds games and the service monitors public creator activity around those titles.

Current public brand:

- product: Who Plays My Game
- canonical production URL: `https://www.whoplaysmygame.com`
- support email: `whoplaysmygame@gmail.com`
- operator: Lumino Games sp. z o.o.

Historical technical identifiers such as `GAMESIGNAL_*`, migration names and some database evidence labels are intentionally retained where changing them could break compatibility or audit continuity.

## Public launch state

The public beta is authorized/open for normal account registration and free product use.

A new Free workspace can track one active game. Public users can create an account, confirm their email, sign in, add a game and use the real YouTube/Twitch monitoring dashboard. Free signup must not be confused with a paid Paddle subscription.

New real-money checkout remains deliberately locked until the separate Paddle LIVE account/domain/catalog/webhook/credentials cutover is complete. Public Paddle Sandbox checkout is fail-closed and cannot be presented as a real purchase.

## Live product

Currently implemented:

- YouTube video monitoring;
- Twitch live-stream monitoring;
- real Supabase-backed creator-signal dashboard;
- aliases and exclusion terms;
- game create/edit/pause/resume/remove flows;
- realtime mention updates;
- Discord alerts for eligible plans;
- opt-in daily email digests for active paid plans;
- plan-based active-game limits;
- Publisher CSV export;
- account/workspace settings, export and guarded deletion;
- public Terms, Privacy and Withdrawal pages;
- Paddle Merchant-of-Record integration, verified in Sandbox;
- Paddle Customer Portal integration;
- provider-aware billing identity so legacy Stripe subscriptions remain associated with Stripe.

Kick remains intentionally unavailable. Instant per-signal email alerts are intentionally not used; product email is a capped daily digest instead.

## Domain, hosting and SEO

Vercel hosts the application.

- `https://whoplaysmygame.com` redirects to `https://www.whoplaysmygame.com`;
- both domains are attached to the Vercel project and have valid DNS configuration;
- Cloudflare is used for DNS, with the Vercel records kept DNS-only;
- `https://game-signals.vercel.app` is retained only as a legacy Vercel alias and permanently redirects matching paths to `https://www.whoplaysmygame.com`;
- the root and public legal pages use canonical URLs on `www.whoplaysmygame.com`;
- `/robots.txt` is live and blocks private/auth/API routes from crawling;
- `/sitemap.xml` is live and contains only the public homepage and legal pages.

## Authentication

Supabase email/password authentication supports signup confirmation, login, forgot/reset password and protected dashboard/settings.

Production Auth configuration:

- Site URL: `https://www.whoplaysmygame.com`;
- production callback: `https://www.whoplaysmygame.com/auth/callback`;
- Resend custom SMTP on verified `auth.whoplaysmygame.com`;
- Cloudflare Turnstile enforced server-side for public email/password auth flows.

A real recovery email was delivered successfully. Direct Auth login/recovery without CAPTCHA was rejected with `captcha_failed`, while a real browser password login with Turnstile succeeded with HTTP 200.

The Supabase Free plan still reports Leaked Password Protection disabled. Treat upgrading/reviewing Supabase Auth security as a paid-launch hardening item, not as a defect in the current free public beta.

## Monitoring runtime

Real monitoring is active:

- Twitch Edge Function and scheduler;
- YouTube Edge Function and scheduler;
- Discord notification worker and scheduler;
- daily email digest worker and scheduler.

The product-email scheduler runs once daily at `06:00 UTC`. It processes the previous complete UTC day, sends nothing when no matching signals exist, groups matching games/workspaces by recipient address and is capped at one digest per recipient per day. Resend idempotency protects against retry duplicates.

The public Signal Lab is only an interactive marketing demo; the authenticated dashboard is backed by real Supabase data.

## Billing

### Current customer route: Paddle Merchant of Record

New subscription records default to `billing_provider = 'paddle'`. Existing Stripe-backed rows are not rewritten and remain Stripe-associated.

Planned Paddle catalog:

- Indie: $2.99/month or $29.90/year
- Studio: $7.99/month or $79.90/year
- Publisher: $14.99/month or $149.90/year

Sandbox has already verified:

- checkout transaction creation;
- webhook subscription synchronization;
- raw-body Paddle-Signature verification with a five-second timestamp tolerance;
- active subscription state in Supabase;
- customer/subscription identifiers;
- Customer Portal;
- cancellation at the end of the paid period;
- duplicate-subscription protection;
- provider-aware Settings UI.

One internal historical Paddle Sandbox subscription remains on the `luminotax@gmail.com` test workspace. Its Sandbox customer/subscription IDs are test history and must not be treated as LIVE Paddle identifiers.

### Public Sandbox sales lock

Production `paddle-billing` is deployed with an explicit Sandbox checkout lock. New Sandbox checkout requires `PADDLE_SANDBOX_CHECKOUT_ENABLED=true`; keep that flag absent/false on the public production service.

The lock does not remove Customer Portal access for an already existing Paddle customer. This preserves cancellation/billing-management access independently from the switch that opens new sales.

Current Paddle billing Edge Function version after the public-launch update: v15 ACTIVE.

### Paddle LIVE

Paddle LIVE remains OFF until the real LIVE environment is configured. Sandbox and LIVE credentials/catalog IDs are separate.

Required paid-launch work still includes:

- Paddle LIVE business/account verification;
- LIVE domain/default payment-link approval;
- six LIVE plan price IDs;
- LIVE API key and client-side token;
- LIVE webhook destination/signing secret;
- LIVE Customer Portal validation;
- support telephone published for consumer contact before paid consumer sales;
- accounting reconciliation route confirmed for Paddle MoR proceeds;
- final legal/consumer checkout review;
- final explicit `PADDLE_LIVE_BILLING_ENABLED=true` only after smoke checks.

The operator launch-readiness gate remains fail-closed and separates these Paddle checks from legacy Stripe/KSeF checks.

### Legacy/direct Stripe path

The repository retains the previously built Stripe sandbox/direct-billing, tax, accounting, contract-confirmation and KSeF-readiness infrastructure as rollback/history. Existing Stripe-backed records remain provider-associated.

Stripe LIVE is OFF. The legacy `reconcile-stripe-tax-ids` function is retained, but its automatic every-five-minutes cron is disabled because the reconciliation candidate set is empty. Re-enable it only if the direct Stripe path is deliberately restored.

Historical direct-billing evidence structures may deliberately use old Stripe-specific fields and immutable legal snapshots. Do not rewrite those merely for branding.

## Seller/operator

Current operator:

- Lumino Games sp. z o.o.
- KRS: `0000910452`
- NIP: `6762600090`
- REGON: `389433660`
- registered address: `ul. Kazimierza Morawskiego 5/127, 30-102 Kraków, Poland`
- support/privacy: `whoplaysmygame@gmail.com`

A public support telephone is still required before opening paid consumer checkout; do not invent or publish a number without operator confirmation.

## Legal pages

Public legal copy now reflects the public-beta state rather than the old closed-beta state:

- public signup/free service is available;
- YouTube/Twitch monitoring is live;
- Discord and opt-in daily email digests are described according to current plan availability;
- Kick remains unavailable;
- Paddle Sandbox is internal test history and public Sandbox checkout is disabled;
- Paddle LIVE real-money sales remain pending;
- Paddle is described as Merchant of Record for future paid Paddle transactions;
- legacy Stripe/direct-billing infrastructure is non-default rollback/history;
- mandatory consumer rights are not excluded.

Current public web legal versions:

- Terms: `2026-08-17-v1`
- Privacy: `2026-08-17-v1`
- Withdrawal: `2026-08-17-v1`

Paddle checkout-consent evidence is synchronized to Terms `2026-08-17-v1` and Privacy `2026-08-17-v1` for future new checkouts.

The legacy Stripe durable-contract-confirmation core retains its historical immutable version identifiers because it represents a separate direct-billing evidence path.

## Database security

A production review confirmed:

- RLS is enabled on current public application/billing tables reviewed;
- internal billing tables flagged as RLS-without-policy are intentionally service-role-only and do not grant access to `anon`/`authenticated`;
- workspace RLS helpers use `auth.uid()`, `SECURITY DEFINER`, a fixed search path and no client CREATE privilege in the private schema;
- `pg_net` remains in place because pg_cron + pg_net is actively used and the installed extension cannot be safely relocated without recreation;
- performance unused-index notices are not being acted on prematurely.

Known advisor items remain the previously reviewed Free-plan leaked-password warning, `pg_net` schema warning and informational internal-table RLS notices; no new security issue was introduced by the public-launch migrations/changes.

## Email

Resend handles two separate layers:

- Supabase Auth custom SMTP: `Who Plays My Game <no-reply@auth.whoplaysmygame.com>`;
- opt-in product digest worker using a restricted Sending Access API key: `Who Plays My Game <updates@auth.whoplaysmygame.com>`.

Daily product email is available to active Indie, Studio and Publisher plans. Settings lets an owner/admin enable/disable it, choose the recipient and thresholds. Do not replace this with instant per-signal email delivery.

## Kick

Kick monitoring remains Coming soon. Do not implement scraping or unsupported/private endpoints as a workaround for missing appropriate API/developer access.

## KSeF / direct-billing accounting readiness

KSeF production submission remains locked. The old KSeF/direct-seller implementation is retained only for the legacy/direct billing route and must not be conflated with Paddle MoR customer transactions.

## Security and launch locks

Keep these invariants:

- public beta signup/free use: OPEN;
- public Paddle Sandbox new checkout: OFF;
- Paddle LIVE: OFF until LIVE account/domain/catalog/webhook/credentials + final approval;
- Stripe LIVE: OFF;
- KSeF PROD: OFF;
- Kick: OFF;
- product email: daily digest only, opt-in, one message per recipient per day;
- Cloudflare Turnstile: ON for public email/password Auth;
- no secrets committed to Git;
- database/RLS and worker authorization remain intact.
