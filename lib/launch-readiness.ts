import "server-only";

import { getKsefProductionReadiness } from "@/lib/ksef/production-readiness";
import { legalSupportPhoneConfigured, LEGAL_VERSIONS } from "@/lib/legal";
import { ACTIVE_SELLER } from "@/lib/seller-profile";

export type LaunchCheck = {
  key: string;
  label: string;
  ready: boolean;
  detail: string;
};

function approved(name: string) {
  return process.env[name] === "true";
}

/**
 * Administrative launch gate. All explicit approvals default to false.
 *
 * This is intentionally separate from Stripe credentials: even a future
 * Stripe LIVE key must not be treated as permission to start charging users.
 * KSeF is additionally split into prerequisite readiness and final production
 * arming so a manual approval flag can never bypass missing seller/token/
 * InvoiceWrite evidence or the legal-effect production unlock.
 */
export function getLaunchReadiness() {
  const ksef = getKsefProductionReadiness();
  const ksefBlockers = ksef.blockers.length ? ksef.blockers.join(", ") : "none";

  const checks: LaunchCheck[] = [
    {
      key: "seller",
      label: "Final legal seller",
      ready: approved("GAMESIGNAL_LIVE_SELLER_APPROVED"),
      detail: `Current working seller: ${ACTIVE_SELLER.legalName}. Final operator decision is still required immediately before LIVE.`,
    },
    {
      key: "legal_contact",
      label: "Paid-consumer legal contact",
      ready: legalSupportPhoneConfigured(),
      detail: "A direct support phone number must be configured as GAMESIGNAL_SUPPORT_PHONE before paid consumer distance checkout is enabled. The number is intentionally not guessed or hard-coded.",
    },
    {
      key: "legal_documents",
      label: "Current legal document versions",
      ready: approved("GAMESIGNAL_LEGAL_DOCUMENTS_APPROVED"),
      detail: `Final legal/accounting review must approve Terms ${LEGAL_VERSIONS.terms}, Privacy ${LEGAL_VERSIONS.privacy} and Withdrawal ${LEGAL_VERSIONS.withdrawal}.`,
    },
    {
      key: "contract_confirmation",
      label: "Durable contract confirmation",
      ready: approved("GAMESIGNAL_CONTRACT_CONFIRMATION_READY"),
      detail: "Paid consumer launch remains blocked until the exact concluded-contract information is frozen and successfully delivered on a durable medium through a separately verified transactional channel.",
    },
    {
      key: "domestic_vat",
      label: "Polish VAT + Stripe Tax profile",
      ready:
        ACTIVE_SELLER.vatStatus === "active" &&
        ACTIVE_SELLER.automaticStripeTax &&
        ACTIVE_SELLER.stripeTaxPriceBehavior === "inclusive",
      detail: "Seller is verified as active Polish VAT. Stripe Tax sandbox is configured for inclusive SaaS pricing; re-check the official VAT register and mirror the configuration on the final LIVE Stripe account before charging.",
    },
    {
      key: "pl_company_tax_id",
      label: "PL Company Tax ID verification reconciliation",
      ready: approved("GAMESIGNAL_PL_COMPANY_TAX_ID_LIVE_READY"),
      detail: "Sandbox reconciliation is deployed and matches only the exact Tax ID type+value snapshotted on the invoice. Before LIVE, verify one real LIVE Company Tax ID flow and explicitly unlock the Supabase reconciler for sk_live using its separate accounting-effect unlock phrase.",
    },
    {
      key: "vat_ue",
      label: "EU B2B / VAT-UE readiness",
      ready: ACTIVE_SELLER.vatUeStatus === "valid" && approved("GAMESIGNAL_VAT_UE_READY"),
      detail: "Seller VAT-UE is currently verified as valid. EU Company LIVE sales still require an explicitly approved customer VAT-ID/VIES evidence flow and accounting route.",
    },
    {
      key: "eu_b2c",
      label: "EU B2C tax route",
      ready: approved("GAMESIGNAL_EU_B2C_ROUTE_READY"),
      detail: "Confirm the EUR 10,000 cross-border B2C threshold position and configure either the EU small-seller route or destination-VAT/OSS before EU consumer LIVE sales.",
    },
    {
      key: "vies",
      label: "VIES evidence capture",
      ready: approved("GAMESIGNAL_VIES_READY"),
      detail: "EU Company VAT IDs must have a verified transaction-level evidence path; Company selection alone is not enough.",
    },
    {
      key: "fa3",
      label: "Active-VAT FA(3) schema validation",
      ready: approved("GAMESIGNAL_FA3_VALIDATED"),
      detail: "The domestic 23% VAT-inclusive FA(3) generator passes the pinned official MF XSD and has completed an anonymized official KSeF TEST OnlineSession/UPO regression. Keep this approval explicit so a later seller/schema change forces review.",
    },
    {
      key: "ksef",
      label: "KSeF production prerequisites",
      ready: approved("GAMESIGNAL_KSEF_FLOW_READY") && ksef.prerequisitesReady,
      detail: `Read-only production preflight: environment=${ksef.ksef.environment}; prerequisites ready=${ksef.prerequisitesReady ? "yes" : "no"}; blockers=${ksefBlockers}. Numbering, immutable FA(3), token-auth transport, persist-before-send, reconciliation and UPO storage are implemented, but the final seller/token/InvoiceWrite evidence must all pass the preflight.`,
    },
    {
      key: "ksef_production_arm",
      label: "KSeF production legal-effect arm",
      ready: ksef.submissionArmed,
      detail: `Production submission armed=${ksef.submissionArmed ? "yes" : "no"}; KSeF PROD still locked=${ksef.productionStillLocked ? "yes" : "no"}. This must stay false until the separately authorized go-live step sets the production environment, KSEF_ENABLED and the exact legal-effect unlock phrase after prerequisites pass.`,
    },
    {
      key: "supabase_auth",
      label: "Supabase Auth security review",
      ready: approved("GAMESIGNAL_SUPABASE_AUTH_READY"),
      detail: "Enable Leaked Password Protection through Supabase Auth configuration and re-run the security advisor before LIVE. Do not simulate this setting through SQL.",
    },
    {
      key: "stripe_account",
      label: "Stripe LIVE account onboarding",
      ready: approved("GAMESIGNAL_STRIPE_ACCOUNT_READY"),
      detail: "Business profile, website/support details, terms acceptance, charge capability and payouts must all be ready on the final LIVE Stripe account.",
    },
    {
      key: "stripe_recovery",
      label: "Stripe revenue recovery",
      ready: approved("GAMESIGNAL_STRIPE_RECOVERY_READY"),
      detail: "Sandbox Smart Retries, past_due fail-closed entitlements, Hosted Invoice Page Pay now and payment-method recovery are technically verified. Reproduce and approve the same revenue-recovery policy on LIVE.",
    },
    {
      key: "stripe_disputes",
      label: "Stripe disputes / chargebacks",
      ready: approved("GAMESIGNAL_STRIPE_DISPUTES_READY"),
      detail: "Dispute lifecycle persistence is implemented. Approve the final access/accounting policy for open, won and lost disputes before LIVE.",
    },
    {
      key: "stripe_api_version",
      label: "Stripe API / webhook version",
      ready: approved("GAMESIGNAL_STRIPE_API_VERSION_READY"),
      detail: "Pin the final LIVE webhook/API payload version to the sandbox-tested Stripe API version and review upgrades deliberately.",
    },
    {
      key: "email_delivery",
      label: "Product email alert promise",
      ready: approved("GAMESIGNAL_EMAIL_LAUNCH_READY"),
      detail: "Current marketing says product alert email is coming soon, so paid launch may proceed without optional alert email only while that wording remains accurate. This is separate from the mandatory transactional contract-confirmation channel.",
    },
    {
      key: "stripe_review",
      label: "Final Stripe LIVE review",
      ready: approved("GAMESIGNAL_STRIPE_LIVE_APPROVED"),
      detail: "Live products, inclusive prices, Tax registration, webhook, Portal legal links, payment methods and final seller data require one explicit review immediately before LIVE.",
    },
  ];

  const pending = checks.filter((check) => !check.ready);

  return {
    mode: pending.length === 0 ? "ready_for_explicit_live_cutover" : "sandbox_only",
    liveAllowed: pending.length === 0,
    seller: ACTIVE_SELLER.legalName,
    checks,
    pending: pending.map((check) => check.key),
  } as const;
}
