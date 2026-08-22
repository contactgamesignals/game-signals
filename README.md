# Who Plays My Game

Who Plays My Game is a Next.js + Supabase service for game developers and publishers that monitors creator activity around tracked games.

Production: `https://www.whoplaysmygame.com`

## Current product

- Next.js App Router frontend on Vercel.
- Supabase authentication and protected dashboard.
- PostgreSQL workspaces, subscriptions, games, aliases, mentions, scan history and notification records.
- Real YouTube video monitoring and Twitch live-stream monitoring.
- Realtime creator-signal dashboard.
- Game aliases and exclusion terms.
- Database-enforced active-game limits: no plan 0, Indie 1, Studio 5, Publisher 15, Crazy 30.
- Discord alerts for active paid plans.
- Opt-in daily email digest for active paid plans.
- CSV signal export.
- Paddle Merchant-of-Record LIVE billing, Checkout, webhooks and Customer Portal.
- In-app Paddle plan changes with proration and next-renewal scheduling.
- Stripe direct-billing code retained only as a legacy/rollback path; Stripe LIVE new sales are off.
- Kick monitoring remains intentionally unavailable pending supported developer/API access.

## Production domains

Canonical URL:

```text
https://www.whoplaysmygame.com
```

The apex domain redirects to `www` through Vercel. Cloudflare DNS records used by Vercel remain DNS-only.

## Local setup

Requirements:

- Node.js 22+
- Supabase CLI when working with Edge Functions or database migrations

```bash
cp .env.example .env.local
npm install
npm run dev
```

Do not commit service-role keys, Paddle/Stripe secrets, platform API keys, Discord webhooks or other credentials.

## Supabase Auth production configuration

The hosted Auth project uses the canonical production domain:

```text
Site URL: https://www.whoplaysmygame.com
Redirect URL: https://www.whoplaysmygame.com/auth/callback
```

Cloudflare Turnstile is enforced on public email/password auth flows and Resend provides production auth email delivery.

## External platform secrets

Real platform scanning uses server-side secrets such as:

```text
TWITCH_CLIENT_ID
TWITCH_CLIENT_SECRET
YOUTUBE_API_KEY
```

Internal scheduler authorization and all billing credentials remain server-side and are not committed to Git.

## Billing

New paid subscriptions use Paddle LIVE. Provider identity is stored per subscription so legacy Stripe-backed subscriptions are not silently converted.

Current paid plans:

- Indie: 1 active game - $2.99/month or $29.90/year
- Studio: up to 5 active games - $7.99/month or $79.90/year
- Publisher: up to 15 active games - $14.99/month or $149.90/year
- Crazy Dev / Big Publisher: up to 30 active games - $24.99/month or $249.90/year

All paid plans intentionally share the same feature set.

The in-app Change Plan flow preserves the current monthly/yearly billing period. Upgrades can apply immediately with Paddle proration or at the next renewal. Downgrades apply at the next renewal only and are blocked until the workspace fits the target active-game limit. Monthly/yearly switching is intentionally deferred to a separate future flow.

Paddle Sandbox identity is kept separate from LIVE identity. Public Sandbox checkout is disabled.

## Edge Functions

Core active workers include:

```text
scan-twitch
scan-youtube
notify-discord
manage-discord
manage-email
notify-email
paddle-billing
paddle-webhook
```

Some workers deliberately disable Supabase gateway JWT verification because they implement their own authenticated-user, webhook or internal-cron authorization. Preserve the existing authorization model when deploying them.

## Monitoring cadence

- Twitch: due every 10 minutes; scheduler checks every minute.
- YouTube paid: due every 30 minutes; scheduler runs every 15 minutes.
- Discord delivery: every minute.
- Daily email digest: 06:00 UTC.

## Product truth

- YouTube: LIVE.
- Twitch: LIVE.
- Discord: LIVE for active paid plans.
- Daily email digest: LIVE and opt-in.
- Paddle LIVE Checkout/webhooks/Customer Portal: LIVE.
- Real Paddle paid subscription synchronization: VERIFIED.
- In-app Change Plan: IMPLEMENTED, final LIVE path validation in progress.
- Kick: OFF.
- Stripe LIVE new sales: OFF.
- KSeF production submission: OFF.

For the authoritative current engineering and launch state, see `PROJECT_STATUS.md`.
