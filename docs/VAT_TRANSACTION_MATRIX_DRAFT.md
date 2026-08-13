# GameSignal VAT transaction matrix — draft for launch review

Status: **DRAFT / no automatic tax decisions yet**.

GameSignal is an automated SaaS/digital monitoring service. The working assumption for EU B2C analysis is that it is likely an electronically supplied service, but that classification must be approved before Stripe LIVE or Stripe Tax is enabled.

The buyer's `Individual / Company` choice is evidence only. It must never, by itself, decide VAT treatment.

## Evidence captured for every paid checkout

- buyer type declaration,
- billing country,
- full billing address,
- customer name,
- Stripe customer/subscription/invoice IDs,
- service period,
- currency and amounts,
- checkout consent evidence.

Additional Company evidence:
- legal/business name,
- tax/VAT ID where supported,
- verification status when Stripe/VIES evidence is available.

## Working matrix

### 1. Poland — Individual

- Domestic B2C candidate.
- Polish VAT treatment depends on Lumino Games' actual VAT status at the transaction date.
- B2C invoices are not subject to mandatory KSeF under the 2026 rules; they may be issued in KSeF voluntarily.
- Do not hard-code `23%`, `ZW`, or another rate until seller status is confirmed.

### 2. Poland — Company

- Domestic B2B candidate.
- Polish VAT treatment depends on Lumino Games' actual VAT status and the transaction.
- KSeF handling must follow the rules and transitional thresholds applicable on the invoice date.
- Company checkbox alone is not sufficient tax evidence.

### 3. EU other than Poland — Individual

- Cross-border B2C candidate.
- If GameSignal is confirmed as an electronically supplied service, customer-location rules apply subject to the EU-wide EUR 10,000 threshold conditions.
- If the threshold conditions are met and the threshold is not exceeded in the current and preceding calendar year, the place of supply may remain in the supplier Member State unless the supplier opts into destination-country treatment.
- Once the threshold is exceeded (or destination-country treatment is elected), destination-country VAT/OSS handling must be used where applicable.
- The application needs a controlled threshold/OSS decision, not a guess based on country alone.

### 4. EU other than Poland — Company

- Cross-border B2B candidate.
- Under the general EU rule for services supplied to a taxable person, the place of taxation is normally where the customer is established.
- Where Article 196 conditions are met, the customer is generally liable for VAT under reverse charge.
- A valid EU VAT ID is strong evidence but the app must preserve verification evidence and must not treat the Company checkbox alone as proof of taxable-person status.
- VAT-UE registration/reporting obligations for Lumino Games must be confirmed before LIVE.

### 5. Outside EU — Individual

- Non-EU B2C candidate.
- For electronically supplied services, customer-location rules can place the supply outside Poland/EU VAT.
- Local GST/VAT/sales-tax obligations in the customer's country can still arise and must be reviewed by target market.
- Do not reuse EU OSS assumptions for non-EU countries.

### 6. Outside EU — Company

- Non-EU B2B candidate.
- Under the general B2B service rule, place of supply is normally where the business customer is established if it is acting as a taxable person.
- Local reverse-charge or registration rules may apply in the destination country.
- Keep business/tax evidence and require accounting review until launch-country rules are approved.

## KSeF working rule

- Mandatory KSeF does not cover invoices to private consumers (B2C) under the 2026 rules; B2C use is voluntary.
- B2B KSeF obligations depend on the statutory rules and transitional relief applicable to Lumino Games on the invoice date.
- Stripe invoice PDFs remain payment/billing evidence only and must not be treated as a substitute for a required Polish structured invoice.

## What must be confirmed before implementation

1. Lumino Games' VAT status on launch date: active / exempt / not registered.
2. Lumino Games' VAT-UE registration status.
3. Whether GameSignal is formally treated as an electronically supplied service for the relevant B2C rules.
4. Current + preceding-year cross-border EU B2C amount relevant to the EUR 10,000 threshold and whether destination taxation has been elected.
5. Whether Lumino Games will use OSS when required.
6. Exact KSeF obligation/transitional threshold applicable to Lumino Games on launch date.
7. Initial non-EU launch countries and any local indirect-tax registration thresholds.

Until all launch-critical items above are approved, Stripe remains SANDBOX and `automatic_tax` stays OFF.

## Primary sources to re-check immediately before LIVE

- Polish Ministry of Finance — place of supply: https://podatki.gov.pl/podatki-firmowe/vat/poradniki-i-informatory/miejsce-swiadczenia-opodatkowania
- Polish Ministry of Finance — KSeF: https://ksef.podatki.gov.pl/
- European Commission — VAT place of taxation: https://taxation-customs.ec.europa.eu/taxation/vat/vat-directive/place-taxation_en
- European Commission — OSS: https://vat-one-stop-shop.ec.europa.eu/one-stop-shop_en
- European Commission — VIES: https://taxation-customs.ec.europa.eu/online-services_en
