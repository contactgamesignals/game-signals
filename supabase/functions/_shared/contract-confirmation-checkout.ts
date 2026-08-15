import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  prepareCheckoutContractConfirmation,
  type CheckoutConsentSnapshot,
  type ContractSellerSnapshot,
} from "./contract-confirmation-checkout-core.ts";
import { CONTRACT_LEGAL_VERSIONS } from "./contract-confirmation-core.ts";

type ConsentRow = {
  id: string;
  billing_account_id: string;
  buyer_type: string;
  plan: string;
  billing_period: string;
  terms_version: string;
  privacy_version: string;
  withdrawal_version: string | null;
  terms_accepted: boolean;
  recurring_billing_accepted: boolean;
  immediate_service_requested: boolean;
  stripe_checkout_session_id: string | null;
};

type SellerRow = {
  profile_key: string;
  legal_name: string;
  nip: string;
  registered_address: string;
  country_code: string;
};

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isBuyerType(value: string): value is "individual" | "company" {
  return value === "individual" || value === "company";
}

function isPaidPlan(value: string): value is "indie" | "studio" | "publisher" {
  return value === "indie" || value === "studio" || value === "publisher";
}

function isBillingPeriod(value: string): value is "monthly" | "yearly" {
  return value === "monthly" || value === "yearly";
}

function required(value: string | null | undefined, label: string) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${label} is required for contract confirmation.`);
  return normalized;
}

async function sha256Utf8(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function loadConsent(service: SupabaseClient, consentId: string): Promise<CheckoutConsentSnapshot> {
  const { data, error } = await service
    .from("billing_checkout_consents")
    .select("id, billing_account_id, buyer_type, plan, billing_period, terms_version, privacy_version, withdrawal_version, terms_accepted, recurring_billing_accepted, immediate_service_requested, stripe_checkout_session_id")
    .eq("id", consentId)
    .maybeSingle();
  if (error) throw new Error(`Could not load checkout consent for contract confirmation: ${error.message}`);
  if (!data) throw new Error("Checkout consent referenced by Stripe metadata was not found.");

  const row = data as ConsentRow;
  if (!isBuyerType(row.buyer_type)) throw new Error("Checkout consent buyer_type is invalid.");
  if (!isPaidPlan(row.plan)) throw new Error("Checkout consent plan is invalid.");
  if (!isBillingPeriod(row.billing_period)) throw new Error("Checkout consent billing_period is invalid.");

  return {
    id: row.id,
    billingAccountId: required(row.billing_account_id, "billing account ID"),
    buyerType: row.buyer_type,
    plan: row.plan,
    billingPeriod: row.billing_period,
    termsVersion: required(row.terms_version, "Terms version"),
    privacyVersion: required(row.privacy_version, "Privacy version"),
    withdrawalVersion: row.withdrawal_version?.trim() || null,
    termsAccepted: row.terms_accepted === true,
    recurringBillingAccepted: row.recurring_billing_accepted === true,
    immediateServiceRequested: row.immediate_service_requested === true,
    stripeCheckoutSessionId: row.stripe_checkout_session_id?.trim() || null,
  };
}

async function loadActiveSeller(service: SupabaseClient): Promise<ContractSellerSnapshot> {
  const { data, error } = await service
    .from("billing_seller_profiles")
    .select("profile_key, legal_name, nip, registered_address, country_code")
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error(`Could not load the active seller profile: ${error.message}`);
  if (!data) throw new Error("No active seller profile exists for contract confirmation.");

  const row = data as SellerRow;
  return {
    profileKey: required(row.profile_key, "seller profile key"),
    legalName: required(row.legal_name, "seller legal name"),
    nip: required(row.nip, "seller NIP"),
    registeredAddress: required(row.registered_address, "seller registered address"),
    countryCode: required(row.country_code, "seller country code").toUpperCase(),
  };
}

export async function recordCheckoutContractConfirmation(input: {
  service: SupabaseClient;
  eventId: string;
  eventType: string;
  eventCreated: number;
  expectedLivemode: boolean;
  session: Record<string, unknown>;
  siteUrl: string;
  supportEmail: string;
  supportPhone: string;
}) {
  if (input.eventType !== "checkout.session.completed") {
    return { kind: "ignored", reason: "event_type" } as const;
  }

  const metadata = objectValue(input.session.metadata) ?? {};
  const consentId = text(metadata.consent_id);
  if (!consentId) {
    return { kind: "ignored", reason: "not_gamesignal_checkout" } as const;
  }

  const [consent, seller] = await Promise.all([
    loadConsent(input.service, consentId),
    loadActiveSeller(input.service),
  ]);

  const prepared = prepareCheckoutContractConfirmation({
    eventId: input.eventId,
    eventType: input.eventType,
    eventCreated: input.eventCreated,
    expectedLivemode: input.expectedLivemode,
    session: input.session,
    consent,
    seller,
    siteUrl: required(input.siteUrl, "GameSignal site URL"),
    supportEmail: required(input.supportEmail, "GameSignal support email"),
    supportPhone: required(input.supportPhone, "GameSignal support phone"),
  });
  if (!("confirmationText" in prepared)) return prepared;

  const digest = await sha256Utf8(prepared.confirmationText);
  const row = {
    billing_account_id: consent.billingAccountId,
    checkout_consent_id: consent.id,
    stripe_checkout_session_id: prepared.stripeCheckoutSessionId,
    seller_profile_key: seller.profileKey,
    seller_legal_name: seller.legalName,
    seller_nip: seller.nip,
    seller_registered_address: seller.registeredAddress,
    seller_country_code: seller.countryCode,
    buyer_type: consent.buyerType,
    plan: consent.plan,
    billing_period: consent.billingPeriod,
    recipient_email: prepared.recipientEmail,
    terms_version: CONTRACT_LEGAL_VERSIONS.terms,
    privacy_version: CONTRACT_LEGAL_VERSIONS.privacy,
    withdrawal_version: CONTRACT_LEGAL_VERSIONS.withdrawal,
    confirmation_version: CONTRACT_LEGAL_VERSIONS.confirmation,
    confirmation_text: prepared.confirmationText,
    confirmation_sha256: digest,
    contract_concluded_at: prepared.contractConcludedAt,
    source_stripe_event_id: prepared.eventId,
  };

  const inserted = await input.service
    .from("billing_contract_confirmations")
    .insert(row)
    .select("id, confirmation_sha256, stripe_checkout_session_id, billing_account_id")
    .single();

  if (!inserted.error && inserted.data?.id) {
    return { kind: "created", id: String(inserted.data.id), confirmationSha256: digest } as const;
  }

  if (inserted.error?.code !== "23505") {
    throw new Error(`Could not persist immutable contract confirmation: ${inserted.error?.message ?? "unknown database error"}`);
  }

  const existing = await input.service
    .from("billing_contract_confirmations")
    .select("id, confirmation_sha256, stripe_checkout_session_id, billing_account_id")
    .eq("checkout_consent_id", consent.id)
    .maybeSingle();
  if (existing.error) throw new Error(`Could not reconcile existing contract confirmation: ${existing.error.message}`);
  if (!existing.data) throw new Error("Contract-confirmation uniqueness conflict could not be reconciled.");

  if (
    existing.data.confirmation_sha256 !== digest ||
    existing.data.stripe_checkout_session_id !== prepared.stripeCheckoutSessionId ||
    existing.data.billing_account_id !== consent.billingAccountId
  ) {
    throw new Error("Existing contract confirmation conflicts with the signed Checkout event; manual review is required.");
  }

  return { kind: "existing", id: String(existing.data.id), confirmationSha256: digest } as const;
}
