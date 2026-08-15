export const CONTRACT_LEGAL_VERSIONS = {
  terms: "2026-08-15-v3",
  privacy: "2026-08-15-v3",
  withdrawal: "2026-08-15-v1",
  confirmation: "2026-08-15-v1",
} as const;

export type ContractConfirmationInput = {
  productName: string;
  siteUrl: string;
  seller: {
    profileKey: string;
    legalName: string;
    nip: string;
    registeredAddress: string;
    countryCode: string;
    supportEmail: string;
    supportPhone: string;
  };
  buyer: {
    type: "individual" | "company";
    email: string;
    name: string | null;
    billingCountry: string;
  };
  subscription: {
    plan: "indie" | "studio" | "publisher";
    billingPeriod: "monthly" | "yearly";
    currency: string;
    subtotalAmount: number;
    discountAmount: number;
    taxAmount: number;
    totalAmount: number;
    paymentStatus: "paid" | "unpaid" | "no_payment_required";
  };
  consent: {
    termsAccepted: boolean;
    recurringBillingAccepted: boolean;
    immediateServiceRequested: boolean;
  };
  stripeCheckoutSessionId: string;
  contractConcludedAt: string;
};

function required(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required for contract confirmation.`);
  return normalized;
}

function normalizeCurrency(value: string) {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) throw new Error("A three-letter currency code is required.");
  return normalized;
}

function money(minor: number, currency: string) {
  if (!Number.isSafeInteger(minor) || minor < 0) throw new Error("Contract amount must be a non-negative integer in minor units.");
  return `${(minor / 100).toFixed(2)} ${currency}`;
}

function iso(value: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error("contractConcludedAt must be a valid date-time.");
  return new Date(parsed).toISOString();
}

function yesNo(value: boolean) {
  return value ? "YES" : "NO";
}

/**
 * Builds the exact immutable plain-text durable-medium confirmation payload.
 *
 * Pure and deterministic: no environment reads, no network calls, no database
 * calls and no current-time dependency. The caller hashes these exact UTF-8
 * bytes and PostgreSQL independently verifies the digest on insert.
 */
export function buildContractConfirmationText(input: ContractConfirmationInput) {
  const productName = required(input.productName, "productName");
  const siteUrl = required(input.siteUrl, "siteUrl").replace(/\/$/, "");
  const sellerName = required(input.seller.legalName, "seller legal name");
  const sellerNip = required(input.seller.nip, "seller NIP");
  if (!/^\d{10}$/.test(sellerNip)) throw new Error("Seller NIP must contain exactly 10 digits.");
  const sellerAddress = required(input.seller.registeredAddress, "seller registered address");
  const supportEmail = required(input.seller.supportEmail, "support email");
  const supportPhone = required(input.seller.supportPhone, "support phone");
  const buyerEmail = required(input.buyer.email, "buyer email");
  const billingCountry = required(input.buyer.billingCountry, "buyer billing country").toUpperCase();
  const checkoutSessionId = required(input.stripeCheckoutSessionId, "Stripe Checkout Session ID");
  const currency = normalizeCurrency(input.subscription.currency);
  const concludedAt = iso(input.contractConcludedAt);

  if (!input.consent.termsAccepted || !input.consent.recurringBillingAccepted) {
    throw new Error("Contract confirmation cannot be built without required checkout acceptance evidence.");
  }
  if (input.buyer.type === "individual" && !input.consent.immediateServiceRequested) {
    throw new Error("Individual paid checkout requires an explicit immediate-service request.");
  }

  const buyerName = input.buyer.name?.trim() || "not provided";
  const periodLabel = input.subscription.billingPeriod === "monthly" ? "monthly" : "yearly";
  const renewalLabel = input.subscription.billingPeriod === "monthly" ? "each month" : "each year";

  return [
    `${productName} — confirmation of concluded subscription contract`,
    `Confirmation version: ${CONTRACT_LEGAL_VERSIONS.confirmation}`,
    `Contract concluded at: ${concludedAt}`,
    `Stripe Checkout Session: ${checkoutSessionId}`,
    "",
    "SELLER",
    sellerName,
    sellerAddress,
    `NIP: ${sellerNip}`,
    `Country: ${required(input.seller.countryCode, "seller country code").toUpperCase()}`,
    `Support email: ${supportEmail}`,
    `Support phone: ${supportPhone}`,
    `Seller profile: ${required(input.seller.profileKey, "seller profile key")}`,
    "",
    "BUYER",
    `Buyer route: ${input.buyer.type === "individual" ? "Individual / consumer route" : "Company / business route"}`,
    `Name: ${buyerName}`,
    `Email: ${buyerEmail}`,
    `Billing country: ${billingCountry}`,
    "",
    "SUBSCRIPTION ORDER",
    `Plan: ${input.subscription.plan}`,
    `Billing period: ${periodLabel}`,
    `Checkout subtotal: ${money(input.subscription.subtotalAmount, currency)}`,
    `Discount: ${money(input.subscription.discountAmount, currency)}`,
    `Tax included or charged by Checkout: ${money(input.subscription.taxAmount, currency)}`,
    `Total for the initial billing period: ${money(input.subscription.totalAmount, currency)}`,
    `Checkout payment status at contract confirmation: ${input.subscription.paymentStatus}`,
    `Currency: ${currency}`,
    `Recurring billing accepted: ${yesNo(input.consent.recurringBillingAccepted)}`,
    `Terms accepted: ${yesNo(input.consent.termsAccepted)}`,
    `Immediate service requested: ${yesNo(input.consent.immediateServiceRequested)}`,
    "",
    "RECURRING BILLING AND CANCELLATION",
    `This is a recurring ${periodLabel} subscription. Unless cancelled, it renews automatically and the payment method on file may be charged ${renewalLabel} for the then-applicable subscription price and taxes.`,
    "Cancellation is available through Stripe Customer Portal. Unless mandatory law requires otherwise, cancellation takes effect at the end of the current paid billing period and does not ordinarily create a prorated refund or credit for unused time.",
    "",
    "SERVICE AND TECHNICAL REQUIREMENTS",
    `${productName} is a web-based creator-signal monitoring service. The closed paid-beta route is prepared for YouTube video monitoring and Twitch stream monitoring; eligible plans may also use Discord notifications. Kick and product email alerts are not promised as live paid features until separately enabled.`,
    "The service requires an internet connection, a current mainstream browser and an authenticated account. Third-party API availability, quotas, platform policy changes and public metadata can affect completeness and timing of detected signals.",
    "",
    "WITHDRAWAL AND IMMEDIATE PERFORMANCE",
    input.buyer.type === "individual"
      ? "A statutory distance-contract withdrawal period is generally 14 days where consumer law applies. You expressly requested immediate performance before that period ends. Starting the service does not by itself remove the withdrawal right; any statutory loss after full performance applies only if all legal conditions are met. If you validly withdraw after requesting immediate performance, a proportionate amount for service already supplied may be payable where the law permits."
      : "No additional contractual 14-day consumer withdrawal right is granted solely because this purchase used the Company/business route. Mandatory statutory protections that apply to the particular buyer remain unaffected.",
    "Withdrawal instructions and model statement are included in the versioned Withdrawal information identified below.",
    "",
    "COMPLAINTS AND CONFORMITY",
    `Complaints can be sent to ${supportEmail} or to the seller address above. Where Polish consumer law applies, a consumer complaint is answered within the statutory period, generally 14 days unless another mandatory rule applies.`,
    "Mandatory remedies for a digital service that is not supplied or is not in conformity with the contract remain unaffected.",
    "",
    "OUT-OF-COURT DISPUTE RESOLUTION",
    "After an unresolved consumer complaint, information about authorised Polish ADR bodies is available through UOKiK at https://polubowne.uokik.gov.pl/. Court remedies remain available.",
    "",
    "INVOICING AND KSEF",
    "Stripe-hosted billing/payment documents are payment evidence and are not automatically a substitute for a Polish statutory invoice or KSeF invoice where Polish law requires one. Where a Polish business invoice is subject to KSeF, the seller-side invoicing process and KSeF evidence apply.",
    "",
    "SERVICE CHANGES",
    "Paid digital-service changes are subject to mandatory law. Where required, material adverse changes will be notified on a durable medium and statutory termination or other remedies will be honoured.",
    "",
    "VERSIONED LEGAL INFORMATION",
    `Terms version: ${CONTRACT_LEGAL_VERSIONS.terms}`,
    `Privacy version: ${CONTRACT_LEGAL_VERSIONS.privacy}`,
    `Withdrawal information version: ${CONTRACT_LEGAL_VERSIONS.withdrawal}`,
    `Terms URL: ${siteUrl}/terms`,
    `Privacy URL: ${siteUrl}/privacy`,
    `Withdrawal URL: ${siteUrl}/withdrawal`,
    "",
    "This confirmation is an immutable transactional snapshot intended to remain readable independently of later changes to the website. Keep it for your records.",
  ].join("\n");
}
