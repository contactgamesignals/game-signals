# GameSignal — production implementation status

## Implemented
- Next.js application shell with landing page, sign up/login, authenticated dashboard and settings.
- Supabase Auth + SSR session handling.
- Workspaces, members, subscriptions, tracked games, aliases, mentions, scan history and notification tables.
- RLS hardening with private membership helpers.
- Database-enforced game limits matching the current pricing: Free 1, Indie 1, Studio 3, Publisher 10.
- Twitch and YouTube scanning Edge Functions.
- Discord delivery worker backend.
- Realtime mention updates in the dashboard.
- Manual scan cooldown.

## Production dependencies still required
- `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET`.
- `YOUTUBE_API_KEY`.
- `CRON_SECRET` and scheduled calls for automatic scanning / Discord delivery.
- A production notification-provider configuration for email.
- Stripe billing before paid-plan checkout is enabled.

## Deployment
Supabase project: `mgaufxduaaobrlyzdrdo`.
The repository is intended to deploy as a standard Next.js project on Vercel.
