# GameSignal VAT transaction matrix - draft for launch review

Status: **DRAFT / seller VAT-exempt assumption recorded / no automatic tax decisions yet**.

GameSignal is an automated SaaS/digital monitoring service. The working assumption for EU B2C analysis is that it is likely an electronically supplied service, but that classification should still be re-checked before Stripe LIVE or any automated tax treatment is enabled.

## Seller tax assumption confirmed for launch planning

Lumino Games sp. z o.o. currently uses the Polish domestic small-business VAT exemption and intends to remain **VAT-exempt rather than VAT-active**.

Working consequences for GameSignal:
- do not add Polish output VAT to domestic sales while the exemption remains available,
- do not enable Stripe Tax as if Lumino Games were a normal VAT-active seller,
- monitor the Polish exemption threshold and excluded activities,
- keep VAT-UE separate from domestic VAT-active status: VAT-UE registration can be required for certain EU B2B services without converting Lumino Games into a domestic VAT-active taxpayer,
- preserve factual buyer/location/tax-ID evidence so cross-border treatment can be decided correctly.

The buyer's `Individual / Company` choice is evidence only. It must never, by itself, decide VAT treatment.

## 2026 thresholds and special regimes relevant to launch

- Polish domestic VAT exemption threshold for 2026: PLN 240,000, subject to the statutory exclusions and other conditions.
- EU cross-border SME scheme has been available since 2025. A qualifying Polish small enterprise can request VAT exemption in selected other EU Member States when its Union annual turnover does not exceed EUR 100,000 and it also stays within the relevant national thresholds. This requires a prior notification and an EX identification number.
- The cross-border SME scheme is optional and can coexist with OSS. Whether GameSignal should use it for EU B2C must be decided before LIVE.
- For electronically supplied EU B2C services, the ordinary place-of-supply framework also includes the EUR 10,000 cross-border threshold. The application must not assume OSS merely because the customer is in another EU country.

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

### 1. Poland - Individual

- Domestic B2C candidate.
- While Lumino Games validly uses the Polish VAT exemption, GameSignal should not charge Polish output VAT on this domestic sale.
- B2C invoices are outside mandatory KSeF under the 2026 rules; they can be issued in KSeF voluntarily.
- Keep seller-exemption status and transaction evidence in the accounting workflow rather than deriving a tax conclusion from Stripe alone.

### 2. Poland - Company

- Domestic B2B candidate.
- While the seller remains validly VAT-exempt, the domestic sale remains exempt from Polish VAT rather than being treated as a normal 23% VAT sale.
- VAT-exempt taxpayers are still within the 2026 KSeF regime for B2B invoices. For the smallest taxpayers, an episodic relief applies through the end of 2026 when monthly sales documented by invoices do not exceed PLN 10,000 gross; otherwise the general obligation applies from 1 April 2026.
- Stripe invoice PDFs are not a substitute for a Polish structured invoice when KSeF is required.

### 3. EU other than Poland - Individual

- Cross-border B2C candidate.
- First determine whether GameSignal is an electronically supplied service for VAT purposes.
- For launch, evaluate the cross-border SME scheme as the preferred path if Lumino Games wants to remain VAT-exempt across eligible EU consumer sales and the Union/national thresholds are satisfied.
- If the SME exemption is not used or cannot be used, apply the ordinary electronically supplied service rules, including the EUR 10,000 threshold and OSS/destination-country VAT where applicable.
- Do not enable Stripe automatic tax until this route is explicitly chosen.

### 4. EU other than Poland - Company

- Cross-border B2B candidate.
- A Company checkbox is not enough: keep VAT/tax ID and verification evidence and confirm that the customer is acting as a taxable person.
- For services falling under the general B2B place-of-supply rule, the customer is generally liable in its Member State under reverse charge.
- Polish Ministry of Finance guidance states that even a taxpayer using the domestic VAT exemption must register as VAT-UE when supplying qualifying services to another EU Member State for which the customer is liable for VAT.
- VAT-UE registration does **not** by itself make Lumino Games a Polish VAT-active taxpayer; this is the expected route if GameSignal launches EU B2B while preserving the domestic exemption.

### 5. Outside EU - Individual

- Non-EU B2C candidate.
- For electronically supplied services, place-of-supply rules can put the transaction outside Polish/EU VAT.
- Local GST/VAT/sales-tax obligations can still arise in the customer's country and must be reviewed for target launch markets.
- Do not reuse EU OSS/SME assumptions for non-EU countries.

### 6. Outside EU - Company

- Non-EU B2B candidate.
- Under the general B2B service rule, place of supply is normally where the business customer is established if it is acting as a taxable person.
- Local reverse-charge or registration rules may apply in the destination country.
- Keep business/tax evidence and require accounting review until launch-country rules are approved.

## KSeF working rule

- B2C invoices are outside mandatory KSeF in 2026; voluntary KSeF remains possible.
- VAT-exempt sellers are not generally excluded from mandatory KSeF for B2B invoices.
- From 1 April 2026 the general KSeF obligation covers the remaining taxpayers, including VAT-exempt taxpayers, subject to the temporary smallest-taxpayer relief through the end of 2026 where monthly invoiced sales stay at or below PLN 10,000 gross.
- From 1 January 2027 that temporary smallest-taxpayer relief ends under the current roadmap.
- Stripe invoice PDFs remain payment/billing evidence only and must not be treated as a substitute for a required Polish structured invoice.

## Remaining launch decisions

1. Confirm whether Lumino Games is currently registered for VAT-UE. Domestic VAT-exempt status is already treated as confirmed for project planning.
2. Confirm the VAT classification of GameSignal as an electronically supplied service for B2C.
3. Decide whether EU B2C launch should use the cross-border SME scheme (EX number) while eligible, rather than immediately charging destination-country VAT through OSS.
4. Track domestic PLN 240,000 exemption eligibility and EU-wide EUR 100,000 cross-border SME eligibility separately.
5. Implement KSeF output/submission for transactions where it is required; keep B2C delivery outside mandatory KSeF.
6. Define initial non-EU launch countries and review local indirect-tax thresholds before meaningful consumer scale there.

Until the remaining launch-critical items are approved, Stripe remains SANDBOX and `automatic_tax` stays OFF.

## Primary sources to re-check immediately before LIVE

- Polish Ministry of Finance - domestic VAT exemption: https://www.podatki.gov.pl/podatki-firmowe/vat/poradniki-i-informatory/zwolnienie-podmiotowe-od-podatku-vat
- Polish Ministry of Finance - VAT / VAT-UE: https://www.podatki.gov.pl/podatki-firmowe/vat/informacje-podstawowe
- Polish Ministry of Finance - SME procedure for Polish taxpayers: https://www.podatki.gov.pl/pozostale/procedura-szczegolna-sme/informacje-dla-polskich-podatnikow
- Polish Ministry of Finance - KSeF: https://ksef.podatki.gov.pl/
- European Commission - VAT place of taxation: https://taxation-customs.ec.europa.eu/taxation/vat/vat-directive/place-taxation_en
- European Commission - cross-border SME scheme: https://sme-vat-rules.ec.europa.eu/sme-scheme/cross-border-sme-scheme_en
- European Commission - OSS: https://vat-one-stop-shop.ec.europa.eu/one-stop-shop_en
- European Commission - VIES: https://taxation-customs.ec.europa.eu/online-services_en
