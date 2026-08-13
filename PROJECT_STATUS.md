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

## Latest safe-branch checkpoint — 2026-08-13

This section supersedes the earlier VAT-status uncertainty in the remaining-work list above. Production `main` remains unchanged at `9671f2f00cfab4eba541092ef281bec29d5970d4`. Current work is isolated on `stripe-readiness-20260813` and draft PR #1.

### Seller tax assumption confirmed by the operator
- Lumino Games sp. z o.o. is currently not a Polish VAT-active taxpayer and intends to remain eligible for the Polish VAT exemption.
- Do not enable Stripe automatic tax or add Polish output VAT while the exemption validly applies.
- VAT-UE is a separate status: registering for VAT-UE for qualifying EU B2B services does not by itself convert Lumino Games into a Polish VAT-active taxpayer.
- Current VAT-UE registration status is still to be confirmed before the first qualifying EU B2B sale.
- EU B2C should evaluate the cross-border SME/EX procedure while eligible before defaulting to destination VAT/OSS.

### Stripe sandbox tests completed
- Existing Studio sandbox card payment for 64.50 PLN remains successful and the subscription remains active.
- A 1.00 PLN partial sandbox refund was executed and verified end-to-end through Stripe webhook -> `billing_adjustment_records`.
- The adjustment is recorded as `refund_total`, `partially_refunded`, amount `100` minor units, with `needs_accounting_review=true` by design.
- An isolated 3DS-required sandbox subscription was created only for testing; it entered the expected incomplete/confirmation-required state and was immediately cancelled.
- The isolated 3DS test did not carry a GameSignal workspace ID and did not mutate the real Studio test workspace.
- Vercel production showed no runtime errors after the tests and scanning/notification cron jobs remained healthy.

### Safe branch code added
- `lib/billing-compliance.ts`: VAT-exempt seller profile plus neutral PL/EU/non-EU × Individual/Company routing without calculating a VAT rate.
- `app/api/accounting/billing-export/route.ts`: accounting CSV now includes seller VAT status, tax route, VAT action, VAT-UE action, SME action, KSeF action, live readiness and accounting-review flag.
- `app/api/accounting/compliance-summary/route.ts`: owner/admin-only summary of stored Stripe invoice records and their compliance routing.
- `supabase/functions/stripe-billing/index.ts`: branch source requires individual/business name collection, keeps company tax-ID collection, records `seller_vat_status=exempt`, and hard-locks Stripe API calls to `sk_test_` / `rk_test_` credentials.
- `lib/ksef/server.ts`: server-only TEST/DEMO/PRODUCTION endpoint configuration, KSeF disabled by default, with a separate production unlock because production KSeF invoices have legal effect.
- `docs/STRIPE_READINESS_20260813.md`, `docs/VAT_TRANSACTION_MATRIX_DRAFT.md` and `docs/KSEF_AND_VIES_INTEGRATION.md` record the exact current decisions and test state.

### Verification
- Draft PR #1 exists only for review; it has not been merged.
- CI for the Stripe/compliance changes passed TypeScript, ESLint and the production Next.js build.
- No file, table, branch, scanner, notification channel or production deployment was deleted.
- No Stripe LIVE payment was enabled.
- Attempted deployment of the hardened `stripe-billing` Edge Function was blocked by the connected-tool safety layer, not by a code/test failure. The currently deployed Supabase `stripe-billing` remains version 10, and its source was retrieved as a rollback reference before attempting any update.

### Current next steps
1. Keep `main` untouched until branch verification is complete.
2. Deploy/test the hardened `stripe-billing` function in sandbox when the connected deployment path permits it; do not bypass tool safety controls.
3. Confirm whether Lumino Games already has VAT-UE registration; if not, register before the first qualifying EU B2B service.
4. Decide EU B2C cross-border SME/EX vs ordinary destination VAT/OSS handling before allowing EU consumer LIVE checkout.
5. Implement/test FA(3) generation, KSeF TEST authentication, encrypted online-session submission, status polling and UPO retrieval using anonymized data; only then consider DEMO.
6. Add persistent VIES evidence for EU Company transactions using the official EC VIES service; a Company declaration alone is not enough for automatic reverse-charge treatment.
7. Only after tax/KSeF/checkout tests pass: prepare Stripe LIVE products/prices/webhook/portal/secrets and explicitly remove the sandbox-only gate in a separate reviewed change.
