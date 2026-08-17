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
- Paddle Merchant-of-Record billing integration in SANDBOX;
- Paddle Customer Portal integration;
- provider-aware billing identity so legacy Stripe subscriptions remain associated with Stripe.

Kick remains intentionally unavailable. Instant per-signal email alerts are intentionally not used; product email is a capped daily digest instead.

## Domain, hosting and SEO

Vercel hosts the application.

- `https://whoplaysmygame.com` redirects to `https://www.whoplaysmygame.com`;
- both domains are attached to the Vercel project and have valid DNS configuration;
- Cloudflare is used for DNS, with the Vercel records kept DNS-only;
- `https://game-signals.vercel.app` is retained only as a legacy Vercel alias and now permanently redirects every path to the matching path on `https://www.whoplaysmygame.com`;
- the root and all three public legal pages use canonical URLs on `www.whoplaysmygame.com`;
- `/robots.txt` is live and blocks private/auth/API routes from crawling;
- `/sitemap.xml` is live and contains only the public homepage and legal pages.

## Authentication

Supabase email/password authentication supports:

- signup confirmation;
- login;
- forgot/reset password;
- protected dashboard/settings.

Production Auth URL configuration is set to the canonical Who Plays My Game domain:

- Site URL: `https://www.whoplaysmygame.com`;
- production callback allowlist: `https://www.whoplaysmygame.com/auth/callback`;
- localhost may remain allowlisted for development.

Production Auth email delivery is configured through Resend custom SMTP using the verified `auth.whoplaysmygame.com` sending domain. A real recovery email was delivered successfully from `Who Plays My Game <no-reply@auth.whoplaysmygame.com>`, and the Supabase Auth log recorded the recovery request with HTTP 200 and the canonical reset callback.

Cloudflare Turnstile bot protection is enabled in Supabase Auth using a managed widget for the production domain. The production frontend passes the Turnstile `captchaToken` to password login, signup and password-recovery requests. A direct Auth request without any CAPTCHA token was tested after enforcement was enabled and was rejected with HTTP 400 / `captcha_failed`, confirming that the protection is enforced server-side rather than only rendered in the browser.

The Supabase security advisor currently reports Leaked Password Protection as unavailable/disabled. The project is on the Supabase Free plan and Supabase documents this protection as a Pro-plan feature, so it remains a pre-LIVE upgrade/security-review item rather than a closed-beta code defect.

## Monitoring runtime

Real monitoring is active:

- Twitch Edge Function and scheduler;
- YouTube Edge Function and scheduler;
- Discord notification worker and scheduler;
- daily email digest worker and scheduler.

The product-email scheduler runs once daily at `06:00 UTC`. It processes the previous complete UTC day, sends nothing when no matching signals exist, groups matching games/workspaces by recipient address, and is capped at one digest per recipient per day. Resend idempotency is also used to protect against retry duplicates.

Recent production checks show the monitoring workers returning HTTP 200. The public Signal Lab is a marketing demo; the authenticated dashboard is backed by real Supabase data.

## Billing

### Current default: Paddle Sandbox

Paddle is the default provider for new subscription checkout in the current code path.

Sandbox catalog:

- Indie: $2.99/month or $29.90/year
- Studio: $7.99/month or $79.90/year
- Publisher: $14.99/month or $149.90/year

Implemented/tested:

- checkout transaction creation;
- webhook subscription synchronization;
- raw-body Paddle-Signature verification with a five-second timestamp tolerance;
- active subscription state in Supabase;
- customer/subscription identifiers;
- Paddle Customer Portal;
- cancellation at the end of the paid period;
- duplicate-subscription protection;
- provider-aware Settings UI;
- explicit Sandbox/LIVE locks.

Paddle LIVE remains OFF and requires a deliberate separate cutover. The operator launch-readiness gate follows the current Paddle MoR architecture: LIVE account verification, domain approval, LIVE catalog, LIVE webhook, portal, accounting route, legal review, Auth production review and a final explicit Paddle approval all fail closed.

### Legacy/direct Stripe path

The repository retains the previously built Stripe sandbox/direct-billing, tax, accounting, contract-confirmation and KSeF-readiness infrastructure as a rollback/legacy path. Existing Stripe-backed records must remain provider-associated.

Stripe LIVE is OFF. Legacy Stripe/KSeF checks are explicitly separated from the current Paddle `liveAllowed` gate so historical rollback infrastructure cannot accidentally block or authorize Paddle LIVE.

Some historical direct-billing evidence structures deliberately continue using Stripe-specific field names and immutable legal-version snapshots. Do not rename or rewrite those merely for branding.

## Seller/operator

Current operator:

- Lumino Games sp. z o.o.
- KRS: `0000910452`
- NIP: `6762600090`
- REGON: `389433660`
- registered address: `ul. Kazimierza Morawskiego 5/127, 30-102 Kraków, Poland`
- support/privacy: `whoplaysmygame@gmail.com`

## Legal pages

Public legal pages are aligned to the Who Plays My Game brand and current closed-beta architecture:

- Paddle Sandbox is the current default test checkout;
- no real-money billing is enabled;
- Paddle is described as Merchant of Record for a future Paddle transaction;
- legacy Stripe/direct-billing infrastructure is identified as non-default rollback/history rather than the active customer route;
- mandatory consumer rights are not excluded.

Current web legal versions:

- Terms: `2026-08-16-v4`
- Privacy: `2026-08-16-v4`
- Withdrawal: `2026-08-16-v2`

The legacy Stripe durable-contract-confirmation core retains its own historical immutable version identifiers because it represents a separate direct-billing evidence path.

## Database security

A post-domain-cutover review confirmed:

- RLS is enabled on all current public application/billing tables reviewed;
- internal billing tables flagged by the advisor as having RLS without policies are intentionally service-role-only and do not grant table access to `anon` or `authenticated`;
- workspace RLS helpers use `auth.uid()`, `SECURITY DEFINER`, a fixed search path and no client CREATE privilege in the private schema;
- the active `pg_net` extension is intentionally left in place because the scheduler stack uses pg_cron + pg_net and the installed extension is not relocatable without recreation;
- performance-advisor unused-index notices are not being acted on during closed beta because many indexes protect low-frequency billing/history paths and premature removal would create more risk than value.

## Email

Resend handles both email layers, with separate responsibilities:

- Supabase Auth uses custom SMTP and sends branded account/security emails from `Who Plays My Game <no-reply@auth.whoplaysmygame.com>`;
- product digests use a restricted Resend Sending Access API key in Supabase Edge Function secrets and send from `Who Plays My Game <updates@auth.whoplaysmygame.com>`.

Daily product email is opt-in per workspace and available to active Indie, Studio and Publisher plans. The Settings page lets an owner/admin enable or turn off the digest, choose the recipient and configure minimum signal score / Twitch viewer thresholds. The worker groups all eligible signals for the same recipient into one message and sends no email on empty days.

Do not replace this with instant per-signal email delivery. Realtime delivery belongs in the dashboard and Discord; email remains the low-volume daily summary channel.

## Kick

Kick monitoring remains Coming soon. Do not implement scraping or unsupported/private endpoints as a workaround for missing appropriate API/developer access.

## KSeF / direct-billing accounting readiness

A substantial fail-closed KSeF and seller-document implementation remains in the repository for the legacy/direct seller billing route. KSeF production submission remains locked.

The Paddle Merchant-of-Record customer route must not be conflated with the old direct Stripe seller-invoice architecture. Preserve old evidence code where needed for history/rollback; do not activate KSeF PROD unless the direct-billing route is separately re-authorized.

## Security and launch locks

Keep these invariants:

- Paddle LIVE: OFF until separately approved;
- Stripe LIVE: OFF;
- KSeF PROD: OFF;
- Kick: OFF;
- product email remains daily-digest-only, opt-in and capped at one message per recipient per day;
- Cloudflare Turnstile remains enabled for public email/password Auth flows;
- no secrets committed to Git;
- database/RLS and custom worker authorization remain intact.

Before a public paid launch, complete Paddle LIVE account/domain/catalog/webhook/portal configuration, verify Paddle accounting reconciliation, upgrade/review Supabase Auth security (including Leaked Password Protection availability), re-check current seller/company information and complete the final legal/consumer checkout review.
