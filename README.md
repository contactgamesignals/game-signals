# GameSignal

GameSignal is a Next.js + Supabase service for monitoring creator activity around video games.

Production: `https://game-signals.vercel.app`

## Current foundation

- Next.js App Router frontend preserving the GameSignal landing-page design.
- Supabase email/password authentication and protected dashboard.
- PostgreSQL workspaces, subscriptions, games, aliases, mentions, scan history and notification delivery records.
- Hardened Row Level Security.
- Database-enforced tracked-game limits: Free 1, Indie 1, Studio 3, Publisher 10.
- Real Twitch and YouTube Edge Function workers.
- Realtime mention updates in the dashboard.
- Secure Discord webhook management: the saved webhook URL is server-only and is never returned to the browser.
- Automatic Discord notification delivery every minute through Supabase Cron.
- Cron authentication generated inside Postgres and stored in Supabase Vault; plaintext is never committed to Git.

## External credentials still required

Real platform scanning needs these Supabase Edge Function secrets:

```text
TWITCH_CLIENT_ID
TWITCH_CLIENT_SECRET
YOUTUBE_API_KEY
```

Do not commit or paste those values into source control.

The internal cron authentication secret does **not** need to be supplied manually. `docs/CRON_SETUP.sql` generates it inside Postgres, stores it in Vault and stores only a SHA-256 value in the service-role-only runtime settings table.

## Local setup

Requirements:

- Node.js 22+
- Supabase CLI

```bash
cp .env.example .env.local
npm install
npm run dev
```

The repository contains safe public defaults for the connected GameSignal Supabase project. Override them only when working with another project.

## Database migrations

The filenames in `supabase/migrations` mirror the live Supabase migration history. After linking a matching project:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Environment-specific cron schedules are intentionally provisioned separately from schema migrations. See `docs/CRON_SETUP.sql`.

## Auth production configuration

The hosted Supabase Auth configuration still needs these dashboard values:

- Site URL: `https://game-signals.vercel.app`
- Redirect URL: `https://game-signals.vercel.app/auth/callback`

Email/password auth is the production path today. Google OAuth is intentionally hidden from the interface until the Google provider is configured.

## Edge Functions

Workers:

```text
scan-twitch
scan-youtube
notify-discord
manage-discord
```

All workers use custom authorization because scheduled jobs and authenticated user requests have different trust models. Scheduled requests carry a Vault-managed secret; workers hash the supplied value and compare it with the service-role-only runtime hash.

Platform secrets can be added with the Supabase dashboard or CLI:

```bash
supabase secrets set TWITCH_CLIENT_ID=...
supabase secrets set TWITCH_CLIENT_SECRET=...
supabase secrets set YOUTUBE_API_KEY=...
```

Then deploy scanners with JWT gateway verification disabled; they validate authorization internally:

```bash
supabase functions deploy scan-twitch --no-verify-jwt
supabase functions deploy scan-youtube --no-verify-jwt
supabase functions deploy notify-discord --no-verify-jwt
supabase functions deploy manage-discord --no-verify-jwt
```

## Monitoring cadence

Already active:

- Discord delivery: every minute.

Enable after external API credentials exist:

- Twitch: recommended scheduler every 3 minutes; each game also stores a plan-dependent `next_scan_at`.
- YouTube: recommended scheduler every 15 minutes; the worker defaults to one due game per run to conserve YouTube quota.

## What still belongs to later product stages

- Stripe Checkout, webhooks and Billing Portal.
- Transactional email delivery with a verified sending domain.
- Kick worker using an official API.
- Team invitations.
- Weekly reports / CSV export.

## Security

- No service-role key or external API secret is committed to the repository.
- Discord webhook destinations are server-only.
- Internal runtime settings are inaccessible to browser roles.
- Cron plaintext lives only in Supabase Vault.
- `pg_net` is used with `pg_cron` according to Supabase's scheduling model. The currently installed `pg_net` package is non-relocatable, so Database Advisor may report an extension-namespace warning even though its API lives in the dedicated `net` schema.
