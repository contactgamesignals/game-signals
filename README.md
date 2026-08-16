# Who Plays My Game

Who Plays My Game is a Next.js + Supabase service for game developers and publishers that monitors creator activity around tracked games.

Production: `https://www.whoplaysmygame.com`

## Current product

- Next.js App Router frontend on Vercel.
- Supabase email/password authentication and protected dashboard.
- PostgreSQL workspaces, subscriptions, games, aliases, mentions, scan history and notification records.
- Real YouTube video monitoring and Twitch live-stream monitoring.
- Realtime creator-signal dashboard.
- Game aliases and exclusion terms.
- Database-enforced active-game limits: Free 1, Indie 1, Studio 3, Publisher 10.
- Discord alerts for eligible plans.
- Paddle Merchant-of-Record billing integration in SANDBOX, including Checkout and Customer Portal.
- Stripe direct-billing code retained as a sandbox/rollback and historical accounting path; Stripe LIVE is not enabled.
- Kick monitoring and production email alerts remain intentionally unavailable.

## Production domains

Canonical URL:

```text
https://www.whoplaysmygame.com
```

The apex domain redirects to `www` through Vercel. DNS is delegated through Cloudflare in DNS-only mode for the Vercel records.

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

The hosted Auth project should use the canonical production domain:

```text
Site URL: https://www.whoplaysmygame.com
Redirect URL: https://www.whoplaysmygame.com/auth/callback
```

Keep local development redirects separately if needed.

## External platform secrets

Real platform scanning uses Supabase Edge Function secrets such as:

```text
TWITCH_CLIENT_ID
TWITCH_CLIENT_SECRET
YOUTUBE_API_KEY
```

The internal cron secret is generated/stored through the existing Supabase Vault/runtime setup and is not committed to Git.

## Billing

New subscription checkout currently defaults to Paddle SANDBOX. The application keeps provider identity per subscription so an existing Stripe-backed subscription is not silently converted to Paddle.

Paddle-related runtime configuration is deliberately fail-closed. LIVE billing requires a separate explicit LIVE environment/key/unlock and must not be enabled as part of ordinary deployments.

Current Paddle Sandbox price catalog:

- Indie: $2.99 monthly / $29.90 yearly
- Studio: $7.99 monthly / $79.90 yearly
- Publisher: $14.99 monthly / $149.90 yearly

## Edge Functions

Core active workers include:

```text
scan-twitch
scan-youtube
notify-discord
manage-discord
paddle-billing
paddle-webhook
```

Some workers deliberately disable Supabase gateway JWT verification because they implement their own authenticated-user or internal-cron authorization. Preserve the existing authorization model when deploying them.

## Monitoring cadence

- Twitch scheduler: active, with per-plan due-time logic.
- YouTube scheduler: active, quota-conscious scheduling.
- Discord delivery: active.
- Email delivery scheduler: intentionally inactive until a production sender is ready.

## Product truth

- YouTube: live.
- Twitch: live.
- Discord: live on eligible plans.
- Paddle: Sandbox only.
- Kick: coming soon, pending supported developer/API access.
- Production email alerts: coming soon.
- Stripe LIVE: off.
- KSeF production submission: off.

For the most current engineering state and launch gates, see `PROJECT_STATUS.md`.
