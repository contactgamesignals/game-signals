# GameSignal

GameSignal is a production-oriented Next.js + Supabase foundation for monitoring creator activity around video games.

The application preserves the V6 landing-page design while replacing the fake demo backend with a real application structure:

- Next.js 16 App Router
- Supabase email/password and Google authentication
- protected dashboard
- PostgreSQL schema with Row Level Security
- workspace and plan limits enforced on the server and in PostgreSQL
- real Twitch category resolution and live-stream scanning
- real YouTube video search and statistics lookup
- mention deduplication with `UNIQUE(platform, external_id)`
- scan history and errors in `scan_runs`
- Discord delivery worker
- Supabase Cron examples

## What works after configuration

1. A user can register or log in.
2. A default workspace and free subscription record are created automatically.
3. The dashboard is protected by Supabase Auth.
4. A user can add and remove a game.
5. The backend and database check the tracked-game limit for the current plan.
6. Adding a game attempts the first Twitch and YouTube scans.
7. Twitch resolves the game category, fetches current streams, and stores new mentions.
8. YouTube searches new videos, fetches view statistics, and stores new mentions.
9. Duplicate platform results update the existing record instead of creating repeated alerts.
10. Real mentions appear in the dashboard and open the source content.

## Not included yet

- Stripe Checkout, Billing portal, and webhook processing
- production UI for Discord webhook management
- transactional email provider integration
- Kick worker
- team invitations
- weekly reports and CSV export

Those are intentionally left for the next stages, after the first real Twitch and YouTube scans are verified.

## Local setup

Requirements:

- Node.js 22+
- a Supabase project
- Supabase CLI
- Twitch Developer application
- Google Cloud project with YouTube Data API enabled

```bash
cp .env.example .env.local
npm install
npm run dev
```

The repository contains safe public defaults for the connected GameSignal Supabase project. To override them locally, set:

```env
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

## Database setup

Link the repository to the Supabase project and push migrations:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

For an already-created test account, delete and recreate the account after applying the migration, or manually create its profile/workspace records. The `handle_new_user` trigger handles all new registrations.

## Auth configuration

In Supabase Auth URL Configuration, add:

- Site URL: `http://localhost:3000` for local development
- Redirect URL: `http://localhost:3000/auth/callback`
- production equivalents for the deployed domain

Enable Google in Supabase Auth Providers only after its OAuth client is configured.

## Edge Function secrets

```bash
supabase secrets set \
  TWITCH_CLIENT_ID=... \
  TWITCH_CLIENT_SECRET=... \
  YOUTUBE_API_KEY=... \
  CRON_SECRET=... \
  DISCORD_USER_AGENT='GameSignal/0.1 (+https://your-domain.example)'
```

Deploy the workers:

```bash
supabase functions deploy scan-twitch --no-verify-jwt
supabase functions deploy scan-youtube --no-verify-jwt
supabase functions deploy notify-discord --no-verify-jwt
```

The workers disable automatic JWT verification because they accept two controlled modes:

- an authenticated user's bearer token for a manual single-game scan
- a private `x-cron-secret` header for scheduled scans

They still validate authorization inside the function before using the service role.

## Cron

Use `supabase/migrations/202608050002_cron_jobs.sql` as a template after replacing the project reference and secret.

Recommended starting cadence:

- Twitch: every 3 minutes
- YouTube: every 15 minutes, one due game per run
- Discord: every minute

The YouTube worker intentionally defaults to one game per run to conserve quota. Request a quota increase before promising faster scanning across many games.

## Deployment

A practical production deployment is:

- Next.js application: Vercel
- database/auth/functions/cron: Supabase
- transactional email: Resend, Postmark, or another provider with a verified sending domain
- payments: Stripe Checkout + Billing

Never add platform secrets or the Supabase service role key to public variables or source control.

## Development workflow

Treat this repository as the single source of truth. Modify full files in the project and return a complete Git commit, instead of copying isolated snippets into an old `index.html`.
