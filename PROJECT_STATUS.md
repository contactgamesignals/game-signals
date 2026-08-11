# GameSignal — production implementation status

## Implemented
- Next.js landing page, email/password sign up and login, protected dashboard and settings.
- Supabase Auth + SSR session handling.
- Workspaces, members, subscriptions, tracked games, aliases, mentions, scan history and notification tables.
- Hardened RLS with private membership helpers.
- Database-enforced game limits matching pricing: Free 1, Indie 1, Studio 3, Publisher 10.
- Concurrent game inserts are serialized per workspace so plan limits cannot be bypassed by a race.
- Twitch and YouTube scanning Edge Functions, both deployed at v4.
- Secure Discord webhook management and test notifications; manager deployed at v2.
- Discord delivery worker deployed at v5 with up to five retry attempts for failed sends.
- Automatic Discord delivery every minute through pg_cron + pg_net, verified with HTTP 200 responses.
- Cron secret generated inside Postgres, stored in Supabase Vault, and validated by SHA-256 from a service-role-only runtime table.
- Realtime mention updates in the dashboard.
- Manual scan cooldown.
- Production Next.js deployment: https://game-signals.vercel.app
- GitHub CI: typecheck + production Next.js build.

## External configuration still required
- `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET`.
- `YOUTUBE_API_KEY`.
- Hosted Supabase Auth Site URL / redirect allowlist for `https://game-signals.vercel.app`.
- Google OAuth is intentionally hidden until its provider is configured.
- A production email provider and verified sending domain.
- Stripe billing before paid-plan checkout is enabled.

## Deployment
Supabase project: `mgaufxduaaobrlyzdrdo`.
Vercel project: `game-signals`.
Canonical production URL: `https://game-signals.vercel.app`.

## Security note
Supabase Database Advisor reports one warning for the `pg_net` extension namespace. `pg_net` is the official Supabase mechanism used together with `pg_cron` to schedule Edge Functions and the installed version is non-relocatable; application tables and secrets remain protected by RLS/revoked grants/Vault.
