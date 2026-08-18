# GameSignal - KSeF and VIES integration plan

Status: pre-launch implementation plan. No KSeF production submission is enabled.

## Seller model

Lumino Games sp. z o.o. intends to remain a Polish VAT-exempt taxpayer while eligible for the domestic exemption.

VAT-UE registration is treated separately from domestic VAT-active status. A qualifying EU B2B service can require VAT-UE registration/reporting without making Lumino Games a Polish VAT-active taxpayer.

## KSeF environments

GameSignal must never start with KSeF production.

- TEST: `https://api-test.ksef.mf.gov.pl/v2`
- DEMO: `https://api-demo.ksef.mf.gov.pl/v2`
- PRODUCTION: `https://api.ksef.mf.gov.pl/v2`

The production environment uses real authorization and submitted invoices have legal effect. TEST must be the default integration environment. DEMO is useful only after real company authorization is available and before production cutover.

Current production documentation reports KSeF API 2.6.1. The invoice schema is FA(3).

## KSeF submission lifecycle to implement

For an invoice that is actually in mandatory KSeF scope:

1. Generate the Polish structured invoice XML in FA(3).
2. Validate the XML against the current FA(3) schema before any network call.
3. Authenticate with KSeF and obtain the access token.
4. Generate the 256-bit symmetric key and 128-bit IV.
5. Encrypt the invoice with AES-256-CBC + PKCS#7.
6. Encrypt the symmetric key using the current MF public key and RSAES-OAEP SHA-256.
7. Open an online session with `POST /sessions/online`.
8. Send the encrypted invoice with `POST /sessions/online/{referenceNumber}/invoices`.
9. Poll invoice/session status until accepted or rejected.
10. Close the online session.
11. Persist the KSeF number, reference numbers, accepted/rejected status and UPO evidence.
12. Never mark a Stripe invoice as a Polish KSeF invoice merely because Stripe generated a PDF.

The current official KSeF API is asynchronous. A successful HTTP request is not sufficient evidence that the invoice was accepted.

## KSeF scope routing for GameSignal

### Poland - Individual

B2C invoices remain outside mandatory KSeF. Do not submit automatically just because Stripe produced a billing record.

### Poland - Company

Domestic B2B is the main KSeF candidate. Lumino Games' VAT exemption does not generally remove KSeF obligations. During the 2026 transitional period, the monthly PLN 10,000 gross invoiced-sales relief must be evaluated before deciding whether mandatory KSeF applies.

### Cross-border transactions

Do not assume that every foreign invoice belongs in mandatory KSeF. Route the transaction through the accounting rules first and only submit when the Polish KSeF rules require it for that document.

## VIES evidence for EU Company purchases

The European Commission exposes an official VIES REST service at the `check-vat-number` endpoint. GameSignal should use it as evidence collection, not as an automatic tax-decision engine.

Expected request fields include:
- `countryCode`,
- `vatNumber`,
- optional requester data and trader matching fields.

Useful response fields include:
- `valid`,
- `requestDate`,
- `requestIdentifier`,
- `name`,
- `address`,
- trader matching results when supplied.

For an EU Company transaction the eventual workflow should preserve:
- original tax ID supplied through Stripe,
- normalized country + VAT number,
- Stripe tax-ID verification evidence,
- VIES valid/invalid result,
- VIES request identifier and request date where returned,
- company name/address evidence,
- final accounting classification.

A Company button or a valid-looking VAT number is never sufficient by itself to decide reverse charge.

## Security requirements

- KSeF access tokens, certificates, private keys and other credentials must never be committed to GitHub.
- KSeF production must have a separate explicit server-side unlock in addition to the environment selector.
- KSeF production calls must never run from client-side code.
- Raw card details remain entirely at Stripe.
- VIES requests must go only to the fixed official EC endpoint; never accept a user-provided destination URL.
- Persist enough evidence for accounting/audit, but do not expose seller credentials or sensitive billing data to ordinary workspace members.

## Current implementation on the safe branch

- `lib/billing-compliance.ts` routes PL/EU/non-EU and Individual/Company cases without guessing VAT rates.
- billing CSV export includes seller VAT status, tax route, VAT-UE action, SME action, KSeF action and accounting-review flags.
- `/api/accounting/compliance-summary` summarizes the stored Stripe invoice ledger for owner/admin review.
- `lib/ksef/server.ts` defines TEST/DEMO/PRODUCTION endpoints and keeps KSeF disabled with a separate production unlock.
- Stripe Checkout source on the branch remains sandbox-only and collects required individual/business names plus billing address and supported company tax IDs.

## Before any KSeF production call

1. Confirm whether Lumino Games is already registered for VAT-UE; if not, register before the first qualifying EU B2B service.
2. Decide whether EU B2C will use the cross-border SME scheme while eligible or another compliant route such as destination VAT/OSS.
3. Finish and test FA(3) generation using anonymized TEST data.
4. Test authentication, online session, invoice submission, rejection handling, status polling and UPO retrieval in TEST.
5. Test DEMO with real company authorization only after TEST is stable.
6. Perform an explicit production launch review before enabling KSeF production.

## Official references to re-check immediately before implementation/cutover

- KSeF integrator support: https://ksef.podatki.gov.pl/ksef-na-okres-obligatoryjny/wsparcie-dla-integratorow/
- KSeF production API docs: https://api.ksef.mf.gov.pl/
- KSeF extended integrator guide: https://github.com/CIRFMF/ksef-api
- VIES technical information: https://ec.europa.eu/taxation_customs/vies/technicalInformation.html
- VIES REST OpenAPI contract: https://ec.europa.eu/assets/taxud/vow-information/swagger_publicVAT.yaml
