import {
  buildContractConfirmationText,
  CONTRACT_LEGAL_VERSIONS,
  type ContractConfirmationInput,
} from "./contract-confirmation-core.ts";

export type CheckoutConsentSnapshot = {
  id: string;
  billingAccountId: string;
  buyerType: "individual" | "company";
  plan: "indie" | "studio" | "publisher";
  billingPeriod: "monthly" | "yearly";
  termsVersion: string;
  privacyVersion: string;
  withdrawalVersion: string | null;
  termsAccepted: boolean;
  recurringBillingAccepted: boolean;
  immediateServiceRequested: boolean;
  stripeCheckoutSessionId: string | null;
};

export type ContractSellerSnapshot = {
  profileKey: string;
  legalName: string;
  nip: string;
  registeredAddress: string;
  countryCode: string;
};

export type PreparedCheckoutContractConfirmation = {
  eventId: string;
  contractConcludedAt: string;
  stripeCheckoutSessionId: string;
  recipientEmail: string;
  confirmationText: string;
  confirmationInput: ContractConfirmationInput;
};

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function integer(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer in minor units.`);
  }
  return value;
}

function requiredMatch(value: unknown, expected: string, label: string) {
  if (text(value) !== expected) throw new Error(`${label} does not match frozen checkout consent.`);
}

function eventIso(created: unknown) {
  if (typeof created !== "number" || !Number.isSafeInteger(created) || created <= 0) {
    throw new Error("Stripe event.created must be a positive integer timestamp.");
  }
  return new Date(created * 1000).toISOString();
}

/**
 * Parses the already signature-verified Stripe checkout.session.completed object
 * into the exact immutable confirmation input. This function is pure and has no
 * environment, database, network or wall-clock dependency.
 */
export function prepareCheckoutContractConfirmation(input: {
  eventId: string;
  eventType: string;
  eventCreated: number;
  expectedLivemode: boolean;
  session: Record<string, unknown>;
  consent: CheckoutConsentSnapshot;
  seller: ContractSellerSnapshot;
  siteUrl: string;
  supportEmail: string;
  supportPhone: string;
}): PreparedCheckoutContractConfirmation | { kind: "ignored"; reason: "event_type" | "not_gamesignal_checkout" } {
  if (input.eventType !== "checkout.session.completed") {
    return { kind: "ignored", reason: "event_type" };
  }

  const metadata = objectValue(input.session.metadata) ?? {};
  const metadataConsentId = text(metadata.consent_id);
  if (!metadataConsentId) {
    return { kind: "ignored", reason: "not_gamesignal_checkout" };
  }

  const eventId = text(input.eventId);
  if (!eventId) throw new Error("Stripe event ID is required for contract confirmation.");
  const concludedAt = eventIso(input.eventCreated);

  const sessionId = text(input.session.id);
  if (!sessionId) throw new Error("Stripe Checkout Session ID is required.");
  if (input.session.mode !== "subscription") throw new Error("Contract confirmation requires a subscription-mode Checkout Session.");
  if (input.session.status !== "complete") throw new Error("Contract confirmation requires a completed Checkout Session.");
  if (typeof input.session.livemode !== "boolean" || input.session.livemode !== input.expectedLivemode) {
    throw new Error("Checkout Session livemode does not match the verified Stripe runtime.");
  }

  requiredMatch(metadataConsentId, input.consent.id, "Checkout metadata consent_id");
  requiredMatch(metadata.buyer_type, input.consent.buyerType, "Checkout metadata buyer_type");
  requiredMatch(metadata.plan, input.consent.plan, "Checkout metadata plan");
  requiredMatch(metadata.billing_period, input.consent.billingPeriod, "Checkout metadata billing_period");

  if (input.consent.stripeCheckoutSessionId !== sessionId) {
    throw new Error("Checkout Session ID does not match the frozen consent evidence.");
  }
  if (input.consent.termsVersion !== CONTRACT_LEGAL_VERSIONS.terms) {
    throw new Error("Checkout consent Terms version is not the current contract-confirmation version.");
  }
  if (input.consent.privacyVersion !== CONTRACT_LEGAL_VERSIONS.privacy) {
    throw new Error("Checkout consent Privacy version is not the current contract-confirmation version.");
  }
  if (input.consent.withdrawalVersion !== CONTRACT_LEGAL_VERSIONS.withdrawal) {
    throw new Error("Checkout consent Withdrawal version is missing or not the current contract-confirmation version.");
  }
  if (!input.consent.termsAccepted || !input.consent.recurringBillingAccepted) {
    throw new Error("Checkout consent does not contain required acceptance evidence.");
  }
  if (input.consent.buyerType === "individual" && !input.consent.immediateServiceRequested) {
    throw new Error("Individual checkout consent does not contain the immediate-service request.");
  }

  const customerDetails = objectValue(input.session.customer_details);
  const address = objectValue(customerDetails?.address);
  const email = text(customerDetails?.email);
  const billingCountry = text(address?.country)?.toUpperCase() ?? null;
  if (!email) throw new Error("Completed Checkout Session is missing customer email.");
  if (billingCountry !== "PL") throw new Error("Contract-confirmation launch route currently requires Polish billing country evidence.");

  const buyerName = input.consent.buyerType === "company"
    ? text(customerDetails?.business_name) ?? text(customerDetails?.name)
    : text(customerDetails?.individual_name) ?? text(customerDetails?.name);

  const paymentStatus = text(input.session.payment_status);
  if (paymentStatus !== "paid" && paymentStatus !== "unpaid" && paymentStatus !== "no_payment_required") {
    throw new Error("Checkout Session payment_status is missing or unsupported.");
  }

  const totalDetails = objectValue(input.session.total_details);
  if (!totalDetails) throw new Error("Checkout Session total_details are required.");

  const confirmationInput: ContractConfirmationInput = {
    productName: "GameSignal",
    siteUrl: input.siteUrl,
    seller: {
      profileKey: input.seller.profileKey,
      legalName: input.seller.legalName,
      nip: input.seller.nip,
      registeredAddress: input.seller.registeredAddress,
      countryCode: input.seller.countryCode,
      supportEmail: input.supportEmail,
      supportPhone: input.supportPhone,
    },
    buyer: {
      type: input.consent.buyerType,
      email,
      name: buyerName,
      billingCountry,
    },
    subscription: {
      plan: input.consent.plan,
      billingPeriod: input.consent.billingPeriod,
      currency: text(input.session.currency) ?? "",
      subtotalAmount: integer(input.session.amount_subtotal, "Checkout amount_subtotal"),
      discountAmount: integer(totalDetails.amount_discount, "Checkout total_details.amount_discount"),
      taxAmount: integer(totalDetails.amount_tax, "Checkout total_details.amount_tax"),
      totalAmount: integer(input.session.amount_total, "Checkout amount_total"),
      paymentStatus,
    },
    consent: {
      termsAccepted: input.consent.termsAccepted,
      recurringBillingAccepted: input.consent.recurringBillingAccepted,
      immediateServiceRequested: input.consent.immediateServiceRequested,
    },
    stripeCheckoutSessionId: sessionId,
    contractConcludedAt: concludedAt,
  };

  return {
    eventId,
    contractConcludedAt: concludedAt,
    stripeCheckoutSessionId: sessionId,
    recipientEmail: email,
    confirmationText: buildContractConfirmationText(confirmationInput),
    confirmationInput,
  };
}
