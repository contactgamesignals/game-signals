# GameSignal pre-LIVE checkpoint - 14 Aug 2026, part 10

This checkpoint follows Part 9 and records the deployed seller-document queue / numbering layer for the Poland-first paid launch. It does not authorize Stripe LIVE or KSeF PROD.

## Production/source safety

- `main` remains untouched; work remains on `stripe-readiness-20260813`, draft PR #1.
- Stripe remains TEST/Sandbox-only and billing code rejects LIVE keys.
- KSeF PROD remains hard-locked.
- No historical migration, invoice ledger, retained evidence or existing product data was deleted.

## Seller-document queue - DEPLOYED

The Supabase database now contains a durable seller-side document layer separate from Stripe's own invoice objects.

### `billing_seller_profiles`
Internal/service-role seller profiles isolate the legal operator from product code. Exactly one profile can be active.

Current active profile:
- `lumino_games_20260814`
- Lumino Games sp. z o.o.
- NIP `6762600090`
- current KRS address `ul. Kazimierza Morawskiego 5/127, 30-102 Kraków, Poland`
- active VAT
- valid VAT-UE

A future pre-LIVE switch to Lumino Tax can therefore be represented by a separately verified seller profile instead of rewriting queue triggers or mixing invoice sequences.

### `billing_seller_documents`
Durable seller accounting/document queue stores:
- durable `billing_account_id`,
- optional product `workspace_id` with `ON DELETE SET NULL`,
- source billing invoice record and Stripe invoice ID,
- source livemode flag,
- immutable seller profile key + seller name/NIP/address snapshot,
- buyer type/name/country/address/tax IDs,
- currency/net/VAT/gross amounts,
- issue date and service period,
- Stripe billing reason,
- lifecycle state,
- legal invoice number/sequence fields,
- KSeF status/reference fields,
- error and audit timestamps.

One seller/Stripe invoice/document type can produce only one queue record.

Product workspace deletion cannot cascade-delete the seller document: `workspace_id` detaches, while the durable billing account and source billing evidence are retained with restrictive FKs.

### RLS / permissions
- RLS is enabled.
- Browser roles cannot write seller documents, seller profiles or document sequences.
- `billing_document_sequences` and `billing_seller_profiles` are internal/service-role-only.
- authenticated workspace managers may read seller documents for their live workspace using the established `private.can_manage_workspace(workspace_id)` helper - the same helper already used by the existing billing ledgers.
- legal-number reservation RPC is service-role-only.

A preflight caught an initially referenced nonexistent helper before migration deployment; it was replaced with the established billing RLS helper before the queue was applied.

## PL Company evidence gate

A Stripe invoice is queued only for:
- Company buyer,
- Poland billing country,
- linked Stripe subscription,
- Stripe invoice status `paid`,
- positive total,
- known currency,
- durable billing account.

For a future LIVE source invoice, `ready_for_issue` additionally requires:
- positive VAT amount,
- non-empty buyer legal name,
- Polish-format 10-digit tax ID in the retained Stripe tax-ID evidence.

Otherwise the document is `review`.

Sandbox documents are always `sandbox_preview_ready` and can never become legal numbered invoices by accident.

Issue date prefers Stripe `finalized_at`, then `invoice_created_at`; service period and billing reason are snapshotted.

## Legal numbering - DEPLOYED, but sandbox-hard-locked

`billing_document_sequences` maintains an atomic sequence per:
- seller NIP,
- calendar year,
- series.

Current default series format is `GS/YYYY/000001`.

`reserve_seller_document_number(document_id, series)`:
- locks the document row `FOR UPDATE`,
- is service-role-only,
- refuses non-LIVE Stripe documents,
- requires `ready_for_issue`,
- is idempotent for an already-numbered document,
- increments an atomic seller/year/series sequence,
- keeps numbering separated automatically if the legal seller/NIP changes.

### Regression bug caught before any real number

The first rollback-only runtime regression exposed a PL/pgSQL ambiguity in the `ON CONFLICT (seller_nip, sequence_year, series)` target because `sequence_year` was also an OUT parameter name.

The entire test transaction rolled back; follow-up checks proved:
- zero test Stripe invoice rows,
- zero test seller documents,
- zero sequence rows,
- existing Studio remained unchanged.

A forward-only migration replaced the conflict target with the named UNIQUE constraint `billing_document_sequences_seller_nip_sequence_year_series_key`. Historical applied migration files were not edited as a rollback mechanism.

## Numbering regression - PASSED after forward fix

A second real-schema test ran entirely inside `BEGIN ... ROLLBACK`:

1. Sandbox paid PL Company invoice -> `sandbox_preview_ready`.
2. Attempt to reserve a legal number -> correctly rejected with the sandbox lock.
3. Simulated LIVE paid PL Company invoice with VAT + name + NIP -> `ready_for_issue`.
4. First reservation -> `GS/2026/000001`.
5. Repeating reservation for the same document -> still exactly `GS/2026/000001`.
6. Second simulated LIVE document -> `GS/2026/000002`.
7. Sequence row reached `last_number = 2` inside the test transaction.
8. Transaction rolled back.
9. Post-test database check -> zero seller documents / zero sequence rows / zero test invoices.
10. Existing sandbox Studio row remained `active`, raw Stripe status `active`, tax access `approved`, same Stripe subscription ID.

No test legal number survives in the database.

## CI / advisor state

Queue invariants are part of normal `npm run typecheck` and enforce:
- no DROP TABLE/COLUMN, TRUNCATE or DELETE-based migration behavior,
- seller/year/series uniqueness,
- one seller/Stripe invoice/document type record,
- sandbox numbering refusal,
- service-role-only number reservation,
- established manager RLS helper,
- seller-profile isolation,
- buyer VAT/name/NIP evidence for legal readiness,
- finalized/service-period snapshots,
- append-only forward conflict fix.

CI run #293 was fully green before queue deployment; CI run #295 was fully green for the sequence-conflict forward fix.

Post-deployment Supabase advisors show no new billing/document warnings. Existing security warnings remain:
- `pg_net` in public schema,
- Leaked Password Protection disabled.

Performance advisor has no unindexed foreign-key warning; freshly added queue indexes may naturally appear as `unused` before real traffic and are intentionally not removed pre-launch.

## Current next block

The missing PL Company layer is now orchestration rather than data modeling:

1. Take one durable `ready_for_issue` seller document.
2. Reserve its seller-owned legal number exactly once.
3. Build the active-VAT FA(3) using that exact seller/buyer/amount/period snapshot.
4. Reconfirm FA(3) VAT equals retained Stripe VAT.
5. Submit through the existing hard-locked KSeF client when the approved KSeF PROD route is enabled, or mark lawful outside-KSeF issuance only if the final 2026 transition decision explicitly allows it.
6. Persist KSeF session/invoice/reference/status/UPO outcome back to the seller document.
7. Never treat a Stripe PDF as the Polish legal invoice.

KSeF TEST active-VAT OnlineSession + UPO has already passed; KSeF PROD remains locked until the final seller/issuance decision and credentials are explicitly approved.
