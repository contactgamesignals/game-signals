# GameSignal pre-LIVE checkpoint - location evidence and KSeF public probe

Status: SAFE DRAFT / no production cutover.

## Cross-border customer-location evidence

For electronically supplied B2C services, EU rules recognize evidence such as customer billing address, IP/geolocation and payment/bank-location information. GameSignal must treat these as factual evidence rather than as an automatic VAT-rate decision.

The existing Stripe sandbox charge demonstrates why conservative handling matters: its billing country is PL while the Stripe test card country is US. That mismatch is expected for a standard US test card and must not be interpreted as customer wrongdoing or silently force a tax treatment.

Branch-only preparation now includes:

- `billing_location_evidence` table migration,
- country-level billing/payment evidence only,
- `match`, `mismatch`, `insufficient` classification,
- no raw IP storage in the dedicated evidence ledger,
- no card number, fingerprint or last-four storage in that ledger,
- manager read-only RLS; only service role can write.

The migration has NOT been applied to production and the current Stripe webhook does NOT write this table yet.

`lib/billing-location-evidence.ts` contains a pure conservative classifier. A match is evidence only; a mismatch or missing signal must route to another evidence source/accounting review instead of changing VAT automatically.

Vercel currently exposes `x-vercel-ip-country` at country-code level. This can be considered later as an additional privacy-minimal location signal. It has not yet been persisted by GameSignal.

The Privacy Policy draft now describes privacy-minimal country-level billing evidence and explicitly states that the dedicated location-evidence ledger is designed not to store raw IP, payment-card numbers, card fingerprints or card last-four values.

## KSeF public TEST probe

Official KSeF 2.0 documentation exposes two useful public operations that do not authenticate a taxpayer:

- `POST /auth/challenge`,
- `GET /security/public-key-certificates`.

The public-key endpoint can contain multiple certificates during recertification or key rotation. The client must select an appropriate currently valid certificate for the required `usage`, and cannot hard-code one public key forever.

Branch-only `lib/ksef/public-probe.ts` now:

- uses the existing central KSeF environment configuration,
- refuses to operate when the configured environment is `production`,
- requests challenge + public-key certificates only,
- checks that a challenge was returned,
- selects a currently valid `SymmetricKeyEncryption` certificate,
- prefers the latest valid candidate by `validFrom`,
- returns IDs and validity metadata needed for readiness diagnostics,
- does not use a taxpayer NIP, KSeF token, signing certificate or invoice,
- does not submit anything to KSeF.

An owner/admin API route intended to invoke this probe was NOT added because the connected-tool safety layer blocked the write. The probe therefore is not publicly exposed and has not been executed against KSeF TEST from GameSignal yet.

## FA(3) validation

`scripts/run-fa3-validation.sh` was added as a self-contained manual runner. It creates a temporary executable copy of the exact FA(3) generator code and then delegates XML validation to the pinned official MF schema validator.

The full XSD validation is still PENDING. The local execution environment available during this work could not resolve GitHub hosts, so schema files could not be downloaded. Do not mark the FA(3) launch gate ready until `xmllint` actually succeeds against the pinned official schema.

Manual inspection against the official FA(3) XSD has additionally confirmed the intended meanings of the generator's key negative flags, including no new-means-of-transport procedure, no margin procedure and no simplified triangular procedure. Manual inspection does not replace executable XSD validation.

## Do not merge these pieces independently

Before production merge:

1. execute FA(3) XSD validation,
2. wire/test Stripe webhook ordering protection,
3. wire/test location evidence capture without storing extra card/IP data,
4. update Privacy/retention review if final evidence scope changes,
5. run fresh Company + Individual sandbox Checkout tests,
6. only then apply compatible database migrations and Edge Function changes together.
