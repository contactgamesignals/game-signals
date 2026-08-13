# GameSignal — production readiness status

## Live and verified
- Next.js 16 application on `https://game-signals.vercel.app`, automatically deployed from GitHub `main` through Vercel Git integration.
- GitHub CI runs TypeScript, ESLint and a production Next.js build; `npm run build` also gates Vercel builds on lint + typecheck.
- Supabase email/password Auth with signup confirmation, protected dashboard/settings, forgot password and reset password.
- Workspace/account settings: display name, workspace name, password reset, support contact, account-data JSON export and guarded account deletion.
- Account deletion blocks active Stripe subscriptions and owner workspaces with other members before deleting the Auth user/workspace cascade.
- Branded 404 and application-error screens.
- State-driven first-user onboarding in the dashboard.
- Tracked-game CRUD, Pause/Resume, active-slot usage, monitor editing, aliases and exclusion terms.
- Database-enforced active monitoring limits: Free 1, Indie 1, Studio 3, Publisher 10.
- Concurrent create/resume operations are serialized so limits cannot be race-bypassed.
- Plan downgrades preserve data by pausing excess monitors; resume above the new limit is blocked.
- Downgrade behavior was transactionally verified: Studio with 3 active games -> Indie with 1 active + 2 paused.
- Twitch Edge Function authenticated against the real Twitch API; server scheduler runs every minute and workers apply per-plan due times.
- YouTube Edge Function authenticated against the real YouTube Data API; scheduler runs every 15 minutes with a conservative due-game queue to protect Search API quota.
- Manual scan quota protection is enforced server-side; dashboard relies on automatic monitoring and shows last scan times.
- Real AFTERBLAST monitoring verified: Twitch category resolved and YouTube found real mentions.
- YouTube first scan performs a 30-day backfill and gaming-context quality filtering removed false positives in the real test.
- Twitch `LIVE` state is based on recent `last_seen_at`; old streams remain historical `STREAM` rows.
- Realtime mention updates in the dashboard.
- Studio/Publisher Discord webhook management and delivery worker with retries/deduplication; a real AFTERBLAST Discord alert was delivered successfully.
- Publisher CSV signal export with spreadsheet formula-injection protection.
- Stripe SANDBOX products/prices for Indie, Studio and Publisher, monthly + yearly; stable lookup keys configured.
- Stripe-hosted Checkout, webhook synchronization and Customer Portal are live in sandbox mode.
- Real sandbox Checkout upgraded the production test workspace from Free to Studio / active, and Stripe/Supabase subscription state matched.
- Customer Portal supports payment details, invoice history, cancellation at period end and changing among all six recurring prices.
- First paid checkout supports `Individual / solo` and `Company / business` before redirecting to Stripe.
- Company checkout requests a full billing address and Stripe Tax ID collection where supported; buyer type is copied into Checkout/subscription metadata.
- Individual checkout requires an explicit immediate-service request in addition to Terms/Privacy acceptance and recurring-billing acknowledgement.
- Checkout creation is blocked server-side unless the required buyer type and legal acknowledgements are present; this cannot be bypassed by calling the Edge Function directly.
- Checkout evidence is written server-side to `billing_checkout_consents` with user/workspace, plan, period, document versions, buyer type, acknowledgement flags, timestamp/user-agent and associated Stripe Checkout Session ID.
- Consent evidence has RLS plus explicit deny policies for `anon` and `authenticated`; client roles have no table privileges. Security Advisor no longer reports the table.
- Public Terms include recurring billing, cancellation at the end of the paid period and a generally non-refundable/no-partial-period-credit policy subject to mandatory legal remedies.
- Public `/withdrawal` page provides consumer withdrawal information and a model withdrawal statement; Terms and Privacy link to it.
- Stripe webhook verifies HMAC signatures; its signing secret is stored in Supabase Vault.
- Resend email delivery backend is implemented and a real test alert was delivered to the Resend account email.
- Production email cron and test channel are intentionally disabled until a verified sender domain exists.
- Kick is intentionally unavailable and marked Coming soon pending appropriate KICK developer/commercial approval.
- Public landing is rendered truthfully server-side: YouTube + Twitch live, Kick/email Coming soon, no unsupported team/history/filter/support claims.
- Landing explains that checkout can be Individual or Company/business and links Privacy, Terms, Withdrawal and Contact.
- Public site is explicitly marked Closed beta and Stripe sandbox is disclosed; no real payments are accepted yet.
- DM Sans and Space Grotesk are self-hosted through `next/font`.
- Production security headers are live: nosniff, DENY framing, strict referrer policy, camera/microphone/geolocation disabled, COOP and restrictive base/object/frame CSP directives.
- Supabase downgrade reconciliation trigger is no longer callable as a public RPC; execute is limited to postgres/service_role.
- GameSignal is formally presented in the product as operated by `Lumino Games sp. z o.o.` with KRS/NIP/REGON and the current registered office in Kraków.
- Public `/terms` and `/privacy` pages and the operator details are integrated with Settings.

## Current automation
- `gamesignal-discord-every-minute` — active.
- `gamesignal-twitch-every-minute` — active.
- `gamesignal-youtube-every-15-minutes` — active.
- `gamesignal-email-every-minute` — intentionally inactive.
- Recent Twitch and YouTube scan runs are succeeding without errors.

## Remaining before a paid public launch
1. Finalize tax treatment for the two buyer paths before real charges: Company/B2B VAT-ID handling and Individual/B2C place-of-supply/VAT/OSS handling. Decide whether displayed consumer prices are VAT-inclusive and whether Stripe Tax or another tax workflow will be used.
2. Finalize invoicing/accounting flow under Lumino Games, including Polish/KSeF handling where applicable and what sales evidence is passed from Stripe/GameSignal to accounting.
3. Move billing from Stripe sandbox to Stripe live mode: recreate/verify live products and prices, live webhook, live portal and live secrets. Do this only after items 1-2.
4. Perform a final paid-launch legal review of Terms/Privacy/Withdrawal/checkout wording. The current safeguards are implemented in closed beta, but mandatory consumer rights remain intentionally preserved.
5. Enable Supabase Auth Leaked Password Protection in the dashboard.
6. If email alerts should launch immediately, verify a production sending domain and then enable the email cron. Otherwise keep Email as Coming soon.
7. Obtain appropriate KICK approval before enabling paid Kick monitoring; do not substitute scraping/private endpoints.
8. Review YouTube Search quota before meaningful scale. The current default Search API budget is not suitable for aggressive per-game refresh promises across many customers; request/plan additional quota before scaling.
9. Google OAuth is optional and should only be configured if social login is intentionally enabled.

## Legal operator
- Product/brand: `GameSignal`.
- Operator/controller/seller for launch preparation: `Lumino Games sp. z o.o.`.
- KRS: `0000910452`.
- NIP: `6762600090`.
- REGON: `389433660`.
- Registered office used by GameSignal legal pages: `ul. Ujastek 1, 31-752 Kraków, Poland`.
- Product support/privacy contact: `contact.gamesignals@gmail.com`.

## Infrastructure
- GitHub: `contactgamesignals/game-signals`, branch `main` is the source of truth.
- Supabase project: `mgaufxduaaobrlyzdrdo`.
- Vercel project: `game-signals` (`prj_YGRQmcvxv5oTQLCapOpiC7ztiiMs`).
- Production URL: `https://game-signals.vercel.app`.

## Advisor notes
- Supabase Security Advisor: known `pg_net` extension-in-public warning remains. The installed extension is non-relocatable and is required by the working pg_cron/pg_net scheduler path, so it is intentionally left in place.
- Supabase Security Advisor also reports Leaked Password Protection disabled; this is the remaining manual Auth setting to enable.
- Performance Advisor currently shows unused-index informational hints expected for the very small dataset; no indexes are being removed at this stage.
