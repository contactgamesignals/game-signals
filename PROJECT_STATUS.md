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
- Twitch Edge Function authenticated against the real Twitch API; server scheduler runs every minute and workers apply per-plan due times.
- YouTube Edge Function authenticated against the real YouTube Data API; scheduler runs every 15 minutes with a conservative due-game queue to protect Search API quota.
- Real AFTERBLAST monitoring and real Studio/Publisher Discord delivery were verified.
- Publisher signal CSV export has spreadsheet formula-injection protection.
- Stripe SANDBOX products/prices for Indie, Studio and Publisher, monthly + yearly; Stripe-hosted Checkout and Customer Portal are configured in sandbox mode.
- First paid checkout supports `Individual / solo` and `Company / business` before redirecting to Stripe.
- Company checkout requests full billing address and Stripe Tax ID collection where supported; Individual checkout requires the explicit immediate-service request.
- Terms/Privacy acceptance and recurring-billing acknowledgement are enforced server-side before Checkout creation.
- Checkout evidence is stored server-side in `billing_checkout_consents`, linked to the Stripe Checkout Session and inaccessible to client writes/deletes.
- Public Terms include recurring billing, end-of-period cancellation and a generally non-refundable/no-partial-period-credit policy subject to mandatory legal remedies.
- Public `/withdrawal` page provides consumer withdrawal information and a model withdrawal statement.
- GameSignal is presented as operated by `Lumino Games sp. z o.o.` and public Terms/Privacy/Withdrawal plus company details are linked from the product.
- Stripe invoice accounting snapshots are stored in `billing_invoice_records`: invoice/customer/subscription IDs, buyer type, billing country/address, tax IDs, currency, amounts, service period, invoice status and Stripe document links.
- Billing records are grouped only into neutral `pl / eu / non_eu / unknown` jurisdiction buckets; the application does not automatically declare reverse charge, OSS or a VAT rate from the buyer checkbox.
- Stripe webhook v7 synchronizes subscription state, invoice lifecycle, Credit Notes and direct charge refund totals. HMAC signature verification uses the webhook secret in Supabase Vault.
- Credit Notes are linked to their Stripe invoice where possible. Direct card refunds that cannot be safely tied to a specific invoice are retained with `needs_accounting_review=true` rather than guessed.
- Owner/admin Settings exposes separate accounting CSV exports for invoice ledger and billing adjustments; neither export includes payment-card data or secrets.
- One existing Studio sandbox invoice was backfilled into the billing ledger to verify a real record shape without creating a new payment.
- Stripe sandbox webhook endpoint is enabled for checkout/subscription events, invoice lifecycle events, `credit_note.created/updated/voided` and `charge.refunded`.
- Internal `docs/ACCOUNTING_AND_VAT_FLOW.md` documents the neutral PL/EU/non-EU routing, KSeF handoff principles and the no-tax-guessing rule.
- Privacy Policy discloses checkout-consent evidence and Stripe invoice-ledger snapshots.
- Resend email backend is implemented/tested but production email cron remains disabled until a verified sender domain exists.
- Kick remains Coming soon pending appropriate KICK approval; no scraping/private endpoints.
- Public landing is rendered truthfully server-side and explicitly says Closed beta / Stripe sandbox; no real payments are accepted yet.
- DM Sans and Space Grotesk are self-hosted through `next/font`.
- Production security headers are live.
- Supabase Security Advisor after the billing-ledger migrations reports only the two known items: `pg_net` in public schema and Leaked Password Protection disabled.

## Current automation
- `gamesignal-discord-every-minute` — active.
- `gamesignal-twitch-every-minute` — active.
- `gamesignal-youtube-every-15-minutes` — active.
- `gamesignal-email-every-minute` — intentionally inactive.

## Remaining before a paid public launch
1. Confirm Lumino Games' actual launch-date VAT/VAT-UE status and approve the transaction matrix for: PL Individual, PL Company, EU Individual, EU Company, non-EU Individual and non-EU Company. The code intentionally does not guess this.
2. Decide EU B2C electronic-service handling (including the EUR 10,000 cross-border threshold/OSS where applicable), evidence required for EU B2B treatment and whether customer-facing prices are VAT-inclusive.
3. Implement the actual Polish invoice/KSeF document-generation and submission layer for transactions where it is required. Stripe invoice PDFs remain payment/billing evidence and are not treated as a substitute for KSeF.
4. Run final sandbox Checkout tests for both buyer paths, including an EU Company with tax ID and an EU Individual, then test a Credit Note/refund flow.
5. Move Stripe from sandbox to live mode: live products/prices, live webhook, live portal, live account/business/tax configuration and live secrets. Do this only after items 1-4.
6. Final paid-launch legal review of Terms/Privacy/Withdrawal/checkout wording.
7. Enable Supabase Auth Leaked Password Protection in the dashboard.
8. If email alerts should launch immediately, verify a production sending domain; otherwise keep Email Coming soon.
9. Obtain appropriate KICK approval before enabling Kick monitoring.
10. Review/request YouTube Search quota before meaningful scale.
11. Google OAuth remains optional.

## Legal operator
- Product/brand: `GameSignal`.
- Operator/controller/seller: `Lumino Games sp. z o.o.`.
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
- Supabase Security Advisor: known `pg_net` extension-in-public warning remains. It is required by the working pg_cron/pg_net scheduler path and is intentionally left in place.
- Supabase Security Advisor reports Leaked Password Protection disabled; this remains a manual Auth setting.
- Performance Advisor unused-index hints are informational for the current very small dataset; no indexes are being removed at this stage.
