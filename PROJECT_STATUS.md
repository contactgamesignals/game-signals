# GameSignal — production implementation status

## Implemented and verified
- Next.js landing page, email/password sign up and login, protected dashboard and settings.
- Supabase Auth + SSR session handling.
- Hosted Auth Site URL / redirect allowlist configured for `https://game-signals.vercel.app`.
- Real production signup verified end-to-end: confirmed user, profile, workspace, owner membership and Free subscription were created correctly.
- Password recovery flow is implemented on `main`: forgot-password email, callback exchange, new-password page and local-only callback redirect validation.
- Workspaces, members, subscriptions, tracked games, aliases, mentions, scan history and notification tables.
- Hardened RLS with private membership helpers; authenticated game insert verified in a rollback-only E2E transaction.
- Database-enforced active monitoring limits matching pricing: Free 1, Indie 1, Studio 3, Publisher 10.
- Concurrent active-game inserts/resumes are serialized per workspace so plan limits cannot be bypassed by a race.
- Plan downgrade reconciliation is live: excess active games are paused instead of deleted, history is preserved, and resuming above the new plan limit is blocked by the database.
- Studio -> Indie downgrade behavior was verified transactionally: 3 active games became 1 active + 2 paused, and attempting to resume another game was rejected; tests were rolled back.
- Dashboard Pause / Resume controls and active-slot usage are implemented on `main`.
- Game monitor editing is implemented on `main`: title, official/Steam URL, additional include phrases and exclude terms can be changed after creation.
- Changing a game title resets Twitch category resolution and makes the platform scans due again.
- Twitch scanning Edge Function deployed and authenticated against the real Twitch API.
- YouTube scanning Edge Function deployed and authenticated against the real YouTube Data API.
- `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` and `YOUTUBE_API_KEY` are configured in Supabase secrets.
- Automatic Twitch scanning every minute through Supabase `pg_cron` + `pg_net`; worker applies per-plan due times.
- Automatic YouTube scheduler every 15 minutes through Supabase `pg_cron` + `pg_net`, intentionally processing a small number of due games per run to control YouTube Search API quota.
- Twitch and YouTube cron calls verified with HTTP 200 responses using the Vault-backed cron secret.
- Manual scan quota protection is enforced in both Next.js and the Edge Functions: Twitch has a per-game cooldown and user-triggered YouTube scans cannot run before `youtube_next_scan_at`.
- Dashboard no longer depends on a manual Scan button; it shows last YouTube/Twitch scan times instead.
- Real AFTERBLAST monitoring verified: Twitch resolved the correct category and YouTube found real mentions.
- YouTube first-scan backfill expanded to 30 days and quality filtering removes obvious non-gaming false positives.
- Dashboard `Live now` uses Twitch `last_seen_at` freshness instead of treating old detected streams as still live; historical Twitch rows show `STREAM` instead of `LIVE`.
- Secure Discord webhook management and test notifications.
- Discord alerts are enforced as Studio/Publisher features both when configuring a webhook and when the delivery worker runs.
- Discord delivery worker with retries and automatic delivery every minute through pg_cron + pg_net.
- Real Studio workspace Discord channel connected and one production mention delivery recorded successfully with no failed deliveries.
- Realtime mention updates in the dashboard.
- Publisher-only CSV signal export with spreadsheet formula-injection protection.
- Stripe sandbox products and recurring prices created for Indie, Studio and Publisher, monthly and yearly (yearly = 10 monthly payments / 2 months free).
- Stable Stripe price lookup keys are configured instead of hard-coding generated price IDs.
- `STRIPE_SECRET_KEY` is configured in Supabase Edge Function Secrets and authenticated against Stripe from the deployed billing worker.
- `stripe-billing` Supabase Edge Function handles authenticated billing status, Stripe-hosted Checkout and Customer Portal sessions.
- Real user-authenticated sandbox Checkout completed from production and synchronized the workspace from Free to Studio / active.
- Stripe Customer and Subscription IDs are stored in Supabase and match the active Stripe sandbox subscription.
- Customer Portal supports customer details, payment method changes, invoice history, cancellation at period end, and switching between all six GameSignal recurring prices.
- Stripe portal plan-change synchronization derives the new GameSignal plan from the active Stripe price instead of stale subscription metadata.
- `stripe-webhook` Supabase Edge Function validates Stripe HMAC signatures and synchronizes Checkout/subscription lifecycle state into `subscriptions`.
- Stripe webhook signing secret is stored in Supabase Vault and exposed only to service-role code through a revoked-by-default helper RPC.
- Stripe webhook signature path was tested end-to-end from Vault through pg_net and returned HTTP 200 / `received: true`.
- Stripe sandbox webhook endpoint points directly to the Supabase Edge Function and listens only to required Checkout/subscription events.
- Stripe integration healthcheck verifies all 6 expected recurring prices, creates/expires a sandbox Checkout Session and confirms Customer Portal configuration.
- Settings billing UX on `main` lets paid users open Customer Portal through working `Change plan` / `Manage billing` actions instead of disabled placeholder controls.
- Resend email backend (`manage-email` + `notify-email`) is implemented with retry, delivery deduplication and Resend idempotency keys.
- Resend pipeline was tested successfully against the provider's test domain and delivered a real AFTERBLAST alert to the Resend account email.
- Email production cron and test email channel are intentionally disabled; UI is marked Coming soon until a verified sending domain is available.
- Landing/dashboard availability copy presents Twitch + YouTube as live integrations while Kick is marked as coming soon pending KICK approval.
- GitHub migration history has been synchronized with later production migrations, including email-disable policy and active-game downgrade reconciliation.
- GitHub CI validates typecheck + production Next.js build; latest application changes pass both.

## Deployment state
- Supabase backend changes listed above are deployed live in project `mgaufxduaaobrlyzdrdo`.
- Existing production frontend remains available at `https://game-signals.vercel.app`.
- Latest frontend/main-branch polish (Pause/Resume, edit monitor/exclusions, improved live status, Settings polish and password recovery) is built successfully in CI but still needs a Vercel production redeploy because the connected `deploy_to_vercel` tool currently fails input validation before creating a deployment.

## Still required before paid public launch
- Redeploy the current GitHub `main` to Vercel once the deployment path is available.
- Add and verify a production sending domain before advertising email delivery as live; then enable `gamesignal-email-every-minute`.
- Obtain the appropriate KICK developer/commercial approval before enabling Kick monitoring for the paid product; do not rely on scraping/private endpoints.
- Configure Google OAuth only if/when social login is enabled in the UI.
- Revisit YouTube quota/refresh promises before scaling paid plans; the Search API quota cannot sustain aggressive per-game refresh rates at large customer counts.
- Recreate/verify Stripe products, prices, webhook and secrets in Stripe live mode before accepting real money.
- Final launch polish and legal/operational review (terms/privacy/support/contact copy, production billing mode, domain/email setup).

## Deployment
Supabase project: `mgaufxduaaobrlyzdrdo`.
Vercel project: `game-signals`.
Canonical production URL: `https://game-signals.vercel.app`.

## Security note
Supabase Database Advisor reports one warning for the `pg_net` extension namespace. The installed `pg_net` version is non-relocatable, so it cannot be moved with `ALTER EXTENSION ... SET SCHEMA`; application tables and secrets remain protected by RLS/revoked grants/Vault. Performance advisor currently reports unused-index hints that are expected at the current very small production dataset size.
