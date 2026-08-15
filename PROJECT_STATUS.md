# GameSignal — current project status

Last verified: 2026-08-15.

Repository alignment: the verified readiness branch was merged into `main` on 2026-08-15; this file now describes the `main` source of truth and the live Supabase runtime.

This file is the compact source of truth for the current product state. Historical readiness/checkpoint documents remain useful as audit history, but if an older note conflicts with this file or the current runtime, use the current runtime and current code.

## Product

GameSignal is a subscription application for game developers and publishers. A workspace adds games and GameSignal monitors the web for creator activity around those titles.

Currently supported in the real product:

- YouTube video monitoring;
- Twitch live-stream monitoring;
- live creator-signal dashboard;
- aliases and exclusion terms;
- Discord alerts for eligible plans;
- plan-based active-game limits;
- Stripe-hosted subscription Checkout and Customer Portal in SANDBOX;
- accounting/billing evidence and exports.

Kick and production email delivery remain intentionally unavailable until their external prerequisites are met.

## Live application

- Production URL: `https://game-signals.vercel.app`.
- Next.js 16 application deployed through Vercel Git integration.
- Supabase email/password authentication with signup confirmation, login, forgot/reset password and protected dashboard/settings.
- Workspace/account settings, account export and guarded account deletion.
- First-user onboarding and landing -> signup -> dashboard handoff.
- Tracked-game CRUD, Edit, Pause, Resume and Remove.
- Active monitoring limits are enforced in the database and protected against concurrent limit bypass:
  - Free: 1 active game
  - Indie: 1
  - Studio: 3
  - Publisher: 10
- Publisher signal CSV export includes spreadsheet formula-injection protection.
- Production security headers are enabled.
- Branded 404 and error screens are present.

## Monitoring runtime

Real monitoring is active.

- Twitch Edge Function: ACTIVE; scheduler every minute with per-plan due-time logic.
- YouTube Edge Function: ACTIVE; scheduler every 15 minutes with quota-conscious due-game scheduling.
- Discord notification worker: ACTIVE; scheduler every minute.
- Email scheduler exists but is intentionally inactive until a verified sender domain is configured.

Runtime verification on 2026-08-15:

- one active tracked game existed in the live Supabase database;
- YouTube and Twitch scan timestamps were updating normally;
- recent cron executions were succeeding;
- recent scan runs were successful;
- no new creator matches in the preceding 24 hours was a data/result condition, not a stopped scheduler;
- historical real YouTube mention evidence exists in the database;
- real AFTERBLAST monitoring and Discord delivery were verified earlier in the project.

## Dashboard and user flow

The authenticated dashboard is backed by real Supabase data, not the landing-page demo.

- Mentions are loaded from the database.
- New/updated mentions arrive through Supabase Realtime.
- YouTube and Twitch filters are real.
- Twitch LIVE state uses recent `last_seen_at` evidence.
- Game scan timestamps are shown to the user.
- Empty states explain that monitoring is automatic.
- Creating/editing/pausing/resuming/removing a monitor calls the real API routes.

The public `Signal Lab` on the landing page is an explicitly labelled interactive marketing demo and must not be confused with the authenticated real dashboard.

## Billing

Stripe is fully configured and tested in SANDBOX, but real charges are not enabled.

Connected Stripe account verified on 2026-08-15:

- display name: `GameSignals sandbox`;
- therefore the current connected Stripe account cannot be treated as a LIVE payments account.

Sandbox functionality already implemented/tested:

- Indie, Studio and Publisher monthly + yearly prices;
- Stripe Checkout;
- Stripe Customer Portal;
- Individual / solo and Company / business buyer paths;
- Polish billing address collection;
- Company identity and supported Tax ID collection;
- recurring-billing/Terms/Privacy consent evidence;
- automatic Stripe Tax configuration for the currently modelled active-VAT seller;
- subscription lifecycle synchronization;
- payment recovery behaviour;
- invoice lifecycle ledger;
- Credit Notes/refunds;
- disputes/chargebacks evidence;
- accounting CSV exports;
- Tax ID verification reconciliation safeguards.

Future LIVE-capable Stripe billing/webhook code is guarded by explicit TEST/LIVE runtime checks. A LIVE Stripe secret alone is not treated as authorization to charge customers.

## Seller / VAT profile

Current working seller/operator:

- Lumino Games sp. z o.o.
- KRS: `0000910452`
- NIP: `6762600090`
- REGON: `389433660`
- registered address: `ul. Kazimierza Morawskiego 5/127, 30-102 Kraków, Poland`
- support/privacy: `contact.gamesignals@gmail.com`

Current billing tax profile, verified on 2026-08-14:

- Polish VAT status: ACTIVE;
- VAT-UE/VIES: VALID;
- customer-facing Stripe prices: VAT-inclusive;
- EU/non-EU routes remain fail-closed wherever transaction-level evidence/tax handling is not explicitly approved.

Older notes describing Lumino Games as VAT-exempt are historical and are superseded by the verified 2026-08-14 active-VAT/VAT-UE state.

## Polish invoice / KSeF readiness

A substantial KSeF/FA(3) implementation exists and is intentionally fail-closed.

Implemented/tested on the readiness branch and supporting Supabase schema:

- durable seller-document queue;
- seller snapshot evidence;
- atomic/idempotent legal document numbering;
- sandbox documents cannot consume legal invoice numbers;
- immutable FA(3) XML snapshot with SHA-256 verification;
- official MF FA(3) XSD validation;
- anonymized KSeF TEST OnlineSession/UPO regression;
- persist-before-send KSeF state machine;
- pre-submit vs ambiguous post-submit failure separation;
- no blind retry after ambiguous submission;
- deterministic pending-session reconciliation;
- KSeF `440` duplicate reconciliation using original-session evidence;
- UPO hashing/evidence;
- production KSeF remains separately locked.

GameSignal does not automatically rely on the temporary 2026 PLN 10,000 KSeF transition because the application cannot know all seller-wide invoice activity outside GameSignal.

## Legal / consumer pages

Public pages exist for:

- Terms;
- Privacy Policy;
- Withdrawal information/model statement.

Checkout records the buyer path and required acceptance evidence. Additional immutable contract-confirmation storage/delivery safeguards have been developed as readiness infrastructure; they must not distract from the core product roadmap and should only be extended when directly required for launch/runtime behaviour.

## Email

The Resend-based email delivery backend exists, but production email alerts remain OFF.

External prerequisite:

- verify a production sending domain / sender identity.

Until then the product truthfully presents email alerts as Coming soon. Do not activate the email cron with an unverified sender.

## Kick

Kick monitoring remains Coming soon.

External prerequisite:

- obtain appropriate KICK developer/API/commercial approval for the intended monitoring use.

Do not implement scraping or private/unsupported endpoints as a workaround.

## Current automation

Expected runtime jobs:

- `gamesignal-discord-every-minute` — ACTIVE;
- `gamesignal-twitch-every-minute` — ACTIVE;
- `gamesignal-youtube-every-15-minutes` — ACTIVE;
- `gamesignal-stripe-tax-id-every-5-minutes` — ACTIVE;
- `gamesignal-email-every-minute` — INACTIVE intentionally.

## Security / infrastructure notes

Supabase known items:

- `pg_net` in the public schema remains intentionally because the current scheduler path depends on it;
- Leaked Password Protection is still disabled and should be enabled in Supabase Auth before public paid launch;
- informational unused-index hints are expected on the current small dataset and are not a reason to delete indexes now.

Vercel verification on 2026-08-15:

- production site returned HTTP 200;
- no production runtime error clusters were reported for the preceding 24 hours;
- current readiness-branch previews built successfully.

## What is actually left before a real paid launch

Do not restart already completed product engineering. The remaining blockers are narrow:

1. **Stripe LIVE account/configuration** — the connected Stripe account is currently sandbox. Create/connect the real LIVE account and reproduce the already-tested prices, Tax, webhook and Portal configuration, then perform a separately authorized cutover.
2. **Final seller/KSeF production credentials** — immediately before LIVE re-check seller/VAT/VAT-UE/KRS evidence and configure the final production KSeF authorization/InvoiceWrite evidence while keeping the legal-effect unlock separate until cutover.
3. **Supabase Leaked Password Protection** — enable in Auth settings and re-run Security Advisor.
4. **Email, if wanted at launch** — verify the production sender domain; otherwise leave Email Coming soon.
5. **Kick** — obtain the required KICK approval; otherwise leave Kick Coming soon.
6. **Scaling** — review/request YouTube Search API quota before meaningful customer scale.
7. Run one final production-launch smoke checklist, then enable LIVE billing deliberately.

Everything else should now be treated as product maintenance/polish rather than a reason to delay normal use of the working authentication, dashboard, game monitoring and Discord-alert system.
