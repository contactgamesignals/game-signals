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
- Discord delivery worker with retries and automatic delivery every minute through pg_cron + pg_net.
- Realtime mention updates in the dashboard and manual scan cooldown.
- Publisher-only CSV signal export with spreadsheet formula-injection protection.
- Stripe sandbox products and recurring prices created for Indie, Studio and Publisher, monthly and yearly (yearly = 10 monthly payments / 2 months free).
- Stable Stripe price lookup keys are configured instead of hard-coding generated price IDs.
- `STRIPE_SECRET_KEY` is configured in Supabase Edge Function Secrets and authenticated against Stripe from the deployed billing worker.
- `stripe-billing` Supabase Edge Function handles authenticated billing status, Stripe-hosted Checkout and Customer Portal sessions.
- Customer Portal configuration is created/reused automatically and supports customer details, payment method changes, invoice history and cancellation at period end.
- `stripe-webhook` Supabase Edge Function validates Stripe HMAC signatures and synchronizes Checkout/subscription lifecycle state into `subscriptions`.
- Stripe webhook signing secret is stored in Supabase Vault and exposed only to service-role code through a revoked-by-default helper RPC.
- Stripe webhook signature path was tested end-to-end from Vault through pg_net and returned HTTP 200 / `received: true`.
- Stripe sandbox webhook endpoint points directly to the Supabase Edge Function and listens only to required Checkout/subscription events.
- Stripe integration test verified all 6 expected recurring prices, successfully created and immediately expired a sandbox Checkout Session, and confirmed Customer Portal configuration.
- Landing availability copy is patched so Twitch + YouTube are presented as live integrations while Kick is marked as coming soon pending KICK approval; unsupported Kick demo signals are hidden/disabled.
- Production Next.js deployment: https://game-signals.vercel.app
- GitHub CI: typecheck + production Next.js build.

## Still required before paid public launch
- Create the first real user through the production signup flow and verify the email confirmation callback end-to-end.
- Run a user-authenticated sandbox Checkout from the production Settings page and confirm the webhook changes that real workspace from Free to the selected plan.
- Configure a production transactional email provider and verified sending domain before advertising email delivery as live.
- Obtain the appropriate KICK developer/commercial approval before enabling Kick monitoring for the paid product; do not rely on scraping/private endpoints.
- Configure Google OAuth only if/when social login is enabled in the UI.
- Revisit YouTube quota/refresh promises before scaling paid plans; the Search API quota cannot sustain aggressive per-game refresh rates at large customer counts.
- Before accepting real money, recreate/verify Stripe products, prices, webhook and secrets in Stripe live mode rather than sandbox mode.

## Deployment
Supabase project: `mgaufxduaaobrlyzdrdo`.
Vercel project: `game-signals`.
Canonical production URL: `https://game-signals.vercel.app`.

## Security note
Supabase Database Advisor reports one warning for the `pg_net` extension namespace. The installed `pg_net` version is non-relocatable, so it cannot be moved with `ALTER EXTENSION ... SET SCHEMA`; application tables and secrets remain protected by RLS/revoked grants/Vault. Performance advisor currently reports only unused indexes, which is expected while the production database is empty.
