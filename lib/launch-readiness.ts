import "server-only";

import { getKsefServerConfig } from "@/lib/ksef/server";
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
 */
export function getLaunchReadiness() {
  const ksef = getKsefServerConfig();

  const checks: LaunchCheck[] = [
    {
      key: "seller",
      label: "Final legal seller",
      ready: approved("GAMESIGNAL_LIVE_SELLER_APPROVED"),
      detail: `Current working seller: ${ACTIVE_SELLER.legalName}. Final operator decision is still required immediately before LIVE.`,
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
      detail: "The domestic active-VAT FA(3) generator must pass the pinned official MF schema. The earlier VAT-exempt FA(3) proof is not sufficient for the now-verified active-VAT seller.",
    },
    {
      key: "ksef",
      label: "KSeF active-VAT document lifecycle",
      ready: approved("GAMESIGNAL_KSEF_FLOW_READY"),
      detail: `Current KSeF environment: ${ksef.environment}; submission enabled: ${ksef.enabled ? "yes" : "no"}. TEST auth/send/status/UPO plumbing is proven, but the active-VAT invoice payload and final seller credentials/numbering still require approval before PROD.`,
    },
    {
      key: "supabase_auth",
      label: "Supabase Auth security review",
      ready: approved("GAMESIGNAL_SUPABASE_AUTH_READY"),
      detail: "Enable Leaked Password Protection and re-run the Supabase security advisor before LIVE. Keep any remaining advisor warnings explicitly reviewed.",
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
      label: "Email alert promise",
      ready: approved("GAMESIGNAL_EMAIL_LAUNCH_READY"),
      detail: "Current marketing says email is coming soon, so paid launch may proceed without email only while that wording remains accurate. Do not enable sending until the sender domain is verified.",
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
