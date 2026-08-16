# Who Plays My Game — current project status

Last updated: 2026-08-16.

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
- plan-based active-game limits;
- Publisher CSV export;
- account/workspace settings, export and guarded deletion;
- public Terms, Privacy and Withdrawal pages;
- Paddle Merchant-of-Record billing integration in SANDBOX;
- Paddle Customer Portal integration;
- provider-aware billing identity so legacy Stripe subscriptions remain associated with Stripe.

Kick and production email alerts remain intentionally unavailable.

## Domain and hosting

Vercel hosts the application.

- `https://whoplaysmygame.com` redirects to `https://www.whoplaysmygame.com`.
- both domains are attached to the Vercel project and have valid DNS configuration;
- Cloudflare is used for DNS, with the Vercel records kept DNS-only;
- the previous `game-signals.vercel.app` address is a legacy deployment hostname, not the public canonical URL.

## Authentication

Supabase email/password authentication supports:

- signup confirmation;
- login;
- forgot/reset password;
- protected dashboard/settings.

The production Supabase Auth dashboard should use the canonical Who Plays My Game domain for Site URL and redirect allowlisting. Localhost redirects may be kept for development.

## Monitoring runtime

Real monitoring is active:

- Twitch Edge Function and scheduler;
- YouTube Edge Function and scheduler;
- Discord notification worker and scheduler.

The public Signal Lab is a marketing demo; the authenticated dashboard is backed by real Supabase data.

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
- active subscription state in Supabase;
- customer/subscription identifiers;
- Paddle Customer Portal;
- cancellation at the end of the paid period;
- duplicate-subscription protection;
- provider-aware Settings UI;
- explicit Sandbox/LIVE locks.

Paddle LIVE remains OFF and must require a deliberate separate cutover.

### Legacy/direct Stripe path

The repository retains the previously built Stripe sandbox/direct-billing, tax, accounting, contract-confirmation and KSeF-readiness infrastructure as a rollback/legacy path. Existing Stripe-backed records must remain provider-associated.

Stripe LIVE is OFF. Do not turn it on as part of normal deployments or the rebrand.

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

## Email

The Resend-based email backend exists, but production email alerts remain OFF.

Do not enable the email scheduler until a production sender/domain is verified and the launch decision explicitly includes email alerts.

## Kick

Kick monitoring remains Coming soon. Do not implement scraping or unsupported/private endpoints as a workaround for missing appropriate API/developer access.

## KSeF / direct-billing accounting readiness

A substantial fail-closed KSeF and seller-document implementation remains in the repository for the legacy/direct seller billing route. KSeF production submission remains locked.

The Paddle Merchant-of-Record customer route must not be conflated with the old direct Stripe seller-invoice architecture. Preserve old evidence code where needed for history/rollback; do not activate KSeF PROD during the rebrand.

## Security and launch locks

Keep these invariants:

- Paddle LIVE: OFF until separately approved;
- Stripe LIVE: OFF;
- KSeF PROD: OFF;
- Kick: OFF;
- production email scheduler: OFF;
- no secrets committed to Git;
- database/RLS and custom worker authorization remain intact.

Before a public paid launch, re-check current seller/company information, production billing-provider configuration, authentication redirects, security settings, platform quotas and the final legal/consumer checkout flow.
