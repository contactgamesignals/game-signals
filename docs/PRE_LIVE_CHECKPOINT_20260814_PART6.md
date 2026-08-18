# GameSignal pre-LIVE checkpoint - 14 Aug 2026, part 6

This checkpoint records verified external TEST results. It does not authorize production billing, KSeF production submission, or a merge to `main`.

## Production remains untouched

- `main` is still based on `9671f2f00cfab4eba541092ef281bec29d5970d4`.
- No draft migration from this PR has been applied to the live Supabase project.
- Active Supabase billing remains `stripe-billing` v10 and `stripe-webhook` v7.
- Stripe remains sandbox/test mode only.
- No Lumino Games or Lumino Tax invoice was submitted to KSeF TEST or PRODUCTION.
- No KSeF PRODUCTION call was made.

## FA(3) official schema validation - PASSED

The permanent GitHub CI step now:

1. generates the current GameSignal FA(3) sample,
2. downloads the pinned official Ministry of Finance FA(3) XSD and base schemas,
3. validates the generated XML with `xmllint`.

The real official-XSD validation passed and remains part of normal PR CI.

## KSeF TEST public connectivity - PASSED

Manual reusable script: `scripts/probe-ksef-test-public.sh`

Verified against the real KSeF TEST API:

- `POST /auth/challenge`,
- `GET /security/public-key-certificates`,
- a currently valid `KsefTokenEncryption` public key,
- a currently valid `SymmetricKeyEncryption` public key.

The external probe is intentionally not a permanent CI dependency.

## KSeF TEST XAdES authentication - PASSED

Manual reusable script: `scripts/probe-ksef-test-xades-auth.sh`

Using a pinned official MF C# client commit, the test successfully completed:

- random TEST-only NIP generation,
- self-signed TEST-only certificate generation,
- auth challenge,
- `AuthTokenRequest`,
- XAdES signing,
- authentication status 200,
- access/refresh token retrieval.

The upstream demo normally prints JWTs. The GameSignal probe patches only the ephemeral clone before execution so access/refresh tokens are redacted, keeps output under `/tmp`, uploads no artifacts, and deletes all temporary material at exit.

No real GameSignal seller identity was used.

## GameSignal FA(3) full KSeF TEST OnlineSession + UPO - PASSED

Manual reusable script: `scripts/probe-ksef-test-gamesignal-fa3-e2e.sh`

This test uses the current GameSignal FA(3) generator but removes the real seller identity before any external KSeF call. The anonymized document is validated again against the official XSD, then inserted only into an ephemeral clone of the pinned official MF C# OnlineSession E2E client.

The final successful test used the official repository's documented solution test flow on .NET 10 and required a machine-readable TRX result for the selected FA(3) integration test to equal `Passed`.

The pinned official MF E2E lifecycle covers:

- TEST authentication,
- encryption material creation,
- FA(3) online-session open,
- AES encryption of the invoice and RSA protection of the session key,
- invoice submission,
- asynchronous processing/status polling,
- session close,
- accepted invoice lookup / KSeF number,
- UPO retrieval and validation performed by the official test.

Real seller markers (`Lumino Games`, NIP `6762600090`, `Ujastek`) are hard-failed before external send and checked again in test output. The MF harness injects its own random TEST-only seller NIP.

This is a technical KSeF TEST success. It does **not** approve the real legal/tax contents of future production invoices, legal numbering, final seller identity, or KSeF PRODUCTION credentials.

## VIES REST integration - PASSED

Manual reusable script: `scripts/probe-vies-rest-test-service.sh`

The European Commission publishes a dedicated REST integration-test endpoint. The probe executes the actual GameSignal VIES normalization/request/parser code in a temporary copy, changing only the fixed endpoint from production `check-vat-number` to the official `check-vat-test-service`.

Verified:

- country/VAT normalization,
- official TEST response for VALID,
- official TEST response for INVALID,
- `requestDate` parsing,
- evidence-only result contract,
- no automatic VAT/reverse-charge decision.

No real third-party VAT number was used.

The final VIES launch gate remains pending until the selected GameSignal seller has the required VAT-UE state and the real requester identity can be included so `requestIdentifier` is retained as audit evidence where appropriate.

## Duplicate-subscription protection remains draft-only

Prepared on the branch but not applied/deployed:

- atomic `billing_checkout_attempts` reservation,
- one active attempt per workspace,
- 35-minute Stripe-aligned expiry,
- frozen idempotent Stripe parameters,
- service-role-only reservation RPC,
- `SECURITY INVOKER` final RPC definitions,
- recent-completed synchronization grace,
- attempt reconciliation after subscription activation,
- `stripe-billing-v11-draft`,
- `stripe-webhook-v8-draft`.

## Next technical launch block

1. Resolve the pinned Stripe API-version requirement for `stripe-webhook-v8-draft` without adding an unmanageable Supabase secret.
2. Review v8/v11 as one sandbox deployment bundle with their forward migrations.
3. Only then apply the bundle to the current sandbox-backed Supabase project in a controlled order.
4. Run fresh Stripe sandbox buyer-flow regression:
   - Individual,
   - Company,
   - EU Company + tax ID,
   - EU Individual,
   - duplicate/concurrent Checkout protection,
   - failed-payment state handling,
   - refund/Credit Note,
   - dispute lifecycle where a safe Stripe test fixture is available,
   - webhook ordering/idempotency.
5. Keep all LIVE and final-seller decisions blocked until the explicit final launch checkpoint.
