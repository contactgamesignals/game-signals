# GameSignal — production implementation status

## Implemented
- Next.js landing page, email/password sign up and login, protected dashboard and settings.
- Supabase Auth + SSR session handling.
- Hosted Auth Site URL / redirect allowlist configured for `https://game-signals.vercel.app`.
- Workspaces, members, subscriptions, tracked games, aliases, mentions, scan history and notification tables.
- Signup trigger verified transactionally: profile, workspace, owner membership and free/trialing subscription are created correctly.
- Hardened RLS with private membership helpers; authenticated game insert verified in a rollback-only E2E transaction.
- Database-enforced game limits matching pricing: Free 1, Indie 1, Studio 3, Publisher 10.
- Concurrent game inserts are serialized per workspace so plan limits cannot be bypassed by a race.
- Twitch scanning Edge Function deployed and authenticated against the real Twitch API.
- YouTube scanning Edge Function deployed and authenticated against the real YouTube Data API.
- `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` and `YOUTUBE_API_KEY` are configured in Supabase secrets.
- Automatic Twitch scanning every minute through Supabase `pg_cron` + `pg_net`; worker applies per-plan due times.
- Automatic YouTube scheduler every 15 minutes through Supabase `pg_cron` + `pg_net`, intentionally processing a small number of due games per run to control YouTube Search API quota.
- Twitch and YouTube cron calls verified with HTTP 200 responses using the Vault-backed cron secret.
- GitHub OIDC healthcheck workflows remain available for manual Twitch/YouTube credential checks; GitHub is no longer the production scheduler.
- Secure Discord webhook management and test notifications.
- Discord alerts are enforced as Studio/Publisher features both when configuring a webhook and when the delivery worker runs.
- Discord delivery worker with retries.
- Automatic Discord delivery every minute through pg_cron + pg_net, verified with HTTP 200 responses.
- Cron secret generated inside Postgres, stored in Supabase Vault, and validated by SHA-256 from a service-role-only runtime table.
- Realtime mention updates in the dashboard.
- Manual scan cooldown.
- Publisher-only CSV signal export with spreadsheet formula-injection protection.
- Production Next.js deployment: https://game-signals.vercel.app
- GitHub CI: typecheck + production Next.js build.

## Still required before paid public launch
- Create the first real user through the production signup flow and verify the email confirmation callback end-to-end.
- Configure a production SMTP/email provider and verified sending domain.
- Implement Stripe billing and webhook-driven paid subscription state before paid-plan checkout is enabled.
- Integrate Kick using the official KICK developer API; do not rely on scraping/private endpoints.
- Configure Google OAuth only if/when social login is enabled in the UI.
- Reconcile marketing/demo copy with the real implementation so unsupported sources/features are not presented as already live.
- Revisit YouTube quota/refresh promises before scaling paid plans; the default Search API quota cannot sustain aggressive per-game refresh rates at large customer counts.

## Deployment
Supabase project: `mgaufxduaaobrlyzdrdo`.
Vercel project: `game-signals`.
Canonical production URL: `https://game-signals.vercel.app`.

## Security note
Supabase Database Advisor reports one warning for the `pg_net` extension namespace. The installed `pg_net` version is non-relocatable, so it cannot be moved with `ALTER EXTENSION ... SET SCHEMA`; application tables and secrets remain protected by RLS/revoked grants/Vault. Performance advisor currently reports only unused indexes, which is expected while the production database is empty.
