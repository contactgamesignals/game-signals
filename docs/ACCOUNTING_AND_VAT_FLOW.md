# GameSignal — accounting and VAT workflow

GameSignal is operated by Lumino Games sp. z o.o. This document describes what the product captures and how billing records should be routed for accounting review. It intentionally does **not** hard-code a tax conclusion from a buyer's UI choice alone.

## Core rule

`Individual / Company` is a billing/customer declaration, not an automatic VAT verdict.

GameSignal stores factual evidence first:
- buyer type selected before Checkout,
- billing country and billing address,
- legal/customer name,
- Stripe tax IDs and their verification status when present,
- invoice currency and amounts in Stripe minor units,
- Stripe invoice/customer/subscription IDs,
- service period and invoice timestamps,
- checkout-consent evidence,
- neutral jurisdiction bucket: `pl`, `eu`, `non_eu`, `unknown`.

The application must not automatically label a transaction as `reverse charge`, `OSS`, `23% VAT`, `NP`, `ZW`, or another tax treatment until Lumino Games' current VAT status and the buyer evidence are evaluated under the rules applicable at the transaction date.

## Neutral routing

### Poland (`pl`)
- Individual: domestic B2C candidate.
- Company: domestic B2B candidate.
- Do not infer VAT rate merely from the buyer type.
- KSeF handling depends on whether the invoice is B2B or B2C and on the statutory rules in force at the invoice date.

### EU other than Poland (`eu`)
- Individual: cross-border B2C candidate. For electronically supplied services, customer location, the EU EUR 10,000 threshold and OSS rules may matter.
- Company: cross-border B2B candidate. A company checkbox alone is not enough to conclude reverse charge. Keep the billing address and tax ID evidence and review the buyer's taxable-person status.
- If the service falls under the general B2B place-of-supply rule and the buyer is a qualifying EU taxable person, VAT-UE reporting/registration obligations may apply even where Lumino Games otherwise uses a domestic VAT exemption.

### Outside the EU (`non_eu`)
- Individual and Company transactions require separate place-of-supply review.
- Keep country, address, tax/business identifiers and invoice snapshot. Do not reuse EU assumptions.

### Unknown
- Do not finalize tax treatment until buyer location/evidence is complete.

## Stripe configuration policy

Until the tax model is approved for paid launch:
- Stripe remains in sandbox mode.
- `automatic_tax` / Stripe Tax stays OFF.
- Checkout collects a full billing address for all paid buyers.
- Company Checkout additionally collects tax ID where Stripe supports it.
- Card data remains entirely at Stripe and must never be copied into Supabase.

## Billing ledger

`public.billing_invoice_records` is the accounting snapshot table. Stripe invoice webhooks upsert one record per Stripe invoice.

The snapshot is intentionally retained separately from the mutable Stripe Customer profile. If a buyer changes their name/address later, historical invoice evidence must not silently become the new customer profile.

Owner/admin can export the ledger from Settings. The CSV is an accounting aid, not a tax filing or KSeF document.

## Checkout consent evidence

`public.billing_checkout_consents` is server-only evidence of the terms accepted immediately before Checkout. It records buyer type, plan, period, Terms/Privacy versions, recurring-billing acknowledgement and, for Individuals, the request to begin service immediately.

Do not expose this table for client writes or deletion.

## KSeF handoff

Before Stripe LIVE, implement a separate document-generation/submission layer for invoices that must be issued in KSeF. Stripe invoice PDFs are billing/payment documents and must not be assumed to replace a Polish structured e-invoice where KSeF is legally required.

The KSeF layer should receive a reviewed accounting record, not infer tax treatment directly from the Checkout checkbox.

For B2C invoices, KSeF is currently voluntary under the 2026 rules. For transactions whose place of supply is outside Poland or where the buyer cannot receive through KSeF, delivery outside KSeF may still be required even when the Polish supplier issues the invoice through KSeF. Re-check the current Ministry of Finance rules immediately before launch.

## Refunds and credit notes

Commercial policy: subscription fees are generally non-refundable and no credit is due for an unused part of a billing period, except where mandatory law or Lumino Games' explicit decision requires otherwise.

Accounting implementation must nevertheless record every actual refund, credit note or payment dispute. A restrictive refund policy must never cause financial adjustments to disappear from accounting records.

## Launch checklist

Before switching Stripe to LIVE:
1. Confirm Lumino Games' current Polish VAT status and VAT-UE status.
2. Decide treatment of Polish Individual and Company subscriptions.
3. Decide EU B2C electronic-service handling, including whether/when OSS is used and how the EUR 10,000 threshold is monitored.
4. Define evidence required before an EU Company is treated as a taxable-person B2B customer.
5. Define non-EU B2C/B2B treatment for target launch countries.
6. Implement KSeF output/submission for transactions that require it.
7. Configure invoice numbering/document workflow so Stripe IDs do not become the only Polish accounting document identifiers.
8. Run sandbox Checkout tests for both Individual and Company, including one EU company with a valid tax ID and one EU consumer.
9. Verify refund/credit-note accounting in sandbox.
10. Only then enable Stripe LIVE and tax automation selected for the approved model.

## Official sources to re-check before launch

- Polish Ministry of Finance — place of supply (VAT): https://podatki.gov.pl/podatki-firmowe/vat/poradniki-i-informatory/miejsce-swiadczenia-opodatkowania
- Polish Ministry of Finance — VAT / VAT-UE basics: https://www.podatki.gov.pl/podatki-firmowe/vat/informacje-podstawowe
- Polish Ministry of Finance — KSeF 2.0 Q&A: https://ksef.podatki.gov.pl/pytania-i-odpowiedzi-ksef-20/
- European Commission — One Stop Shop: https://vat-one-stop-shop.ec.europa.eu/one-stop-shop_en
- Your Europe — cross-border VAT: https://europa.eu/youreurope/business/taxation/vat/cross-border-vat/index_en.htm
