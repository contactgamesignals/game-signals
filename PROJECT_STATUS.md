# GameSignal — production implementation status

## Implemented
- Next.js application shell with landing page, sign up/login, authenticated dashboard and settings.
- Supabase Auth + SSR session handling.
- Workspaces, members, subscriptions, tracked games, aliases, mentions, scan history and notification tables.
- RLS hardening with private membership helpers.
- Database-enforced game limits matching the current pricing: Free 1, Indie 1, Studio 3, Publisher 10.
- Twitch and YouTube scanning Edge Functions.
- Secure Discord webhook management and test notifications.
- Discord delivery worker backend.
- Realtime mention updates in the dashboard.
- Manual scan cooldown.
- Production Next.js deployment: https://game-signals.vercel.app

## Production dependencies still required
- `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET`.
- `YOUTUBE_API_KEY`.
- `CRON_SECRET` and scheduled calls for automatic scanning / Discord delivery.
- Supabase Auth production URL / redirect allowlist for `https://game-signals.vercel.app`.
- A production notification-provider configuration for email.
- Stripe billing before paid-plan checkout is enabled.

## Deployment
Supabase project: `mgaufxduaaobrlyzdrdo`.
Vercel project: `game-signals`.
Canonical production URL: `https://game-signals.vercel.app`.
