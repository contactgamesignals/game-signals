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
 * Administrative launch gate. All approvals default to false.
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
      detail: `Current working seller: ${ACTIVE_SELLER.legalName}. Final operator decision is required immediately before LIVE.`,
    },
    {
      key: "domestic_vat",
      label: "Polish VAT-exempt seller profile",
      ready: ACTIVE_SELLER.vatStatus === "exempt" && !ACTIVE_SELLER.automaticStripeTax,
      detail: "Domestic launch profile is VAT-exempt and Stripe automatic tax remains off.",
    },
    {
      key: "vat_ue",
      label: "EU B2B / VAT-UE readiness",
      ready: approved("GAMESIGNAL_VAT_UE_READY"),
      detail: "Must be explicitly approved before accepting qualifying EU Company sales.",
    },
    {
      key: "eu_b2c",
      label: "EU B2C tax route",
      ready: approved("GAMESIGNAL_EU_B2C_ROUTE_READY"),
      detail: "SME/EX or the alternative destination-VAT/OSS route must be chosen and configured before EU consumer LIVE sales.",
    },
    {
      key: "vies",
      label: "VIES evidence capture",
      ready: approved("GAMESIGNAL_VIES_READY"),
      detail: "EU Company VAT IDs must have a verified evidence path; Company selection alone is not enough.",
    },
    {
      key: "fa3",
      label: "FA(3) schema validation",
      ready: approved("GAMESIGNAL_FA3_VALIDATED"),
      detail: "The generated XML must pass the pinned official MF FA(3) XSD before KSeF TEST submission.",
    },
    {
      key: "ksef",
      label: "KSeF TEST document lifecycle",
      ready: approved("GAMESIGNAL_KSEF_FLOW_READY"),
      detail: `Current KSeF environment: ${ksef.environment}; submission enabled: ${ksef.enabled ? "yes" : "no"}. TEST auth, send, status and UPO must be verified first.`,
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
      detail: "Review Stripe Billing revenue-recovery settings before LIVE: Smart Retries, failed-payment customer emails, automatic card updates and the final subscription state after retries are exhausted.",
    },
    {
      key: "stripe_disputes",
      label: "Stripe disputes / chargebacks",
      ready: approved("GAMESIGNAL_STRIPE_DISPUTES_READY"),
      detail: "Before LIVE, persist charge.dispute lifecycle events and approve a clear access/accounting policy for open, won and lost disputes. A refund is not a substitute for dispute handling.",
    },
    {
      key: "stripe_api_version",
      label: "Stripe API / webhook version",
      ready: approved("GAMESIGNAL_STRIPE_API_VERSION_READY"),
      detail: "Pin the final LIVE webhook/API payload version to a tested Stripe API version and review upgrades deliberately. Do not launch with an unreviewed account-default webhook schema.",
    },
    {
      key: "email_delivery",
      label: "Email alert promise",
      ready: approved("GAMESIGNAL_EMAIL_LAUNCH_READY"),
      detail: "Either verify the sender domain and enable the tested email delivery path, or remove email-alert claims from paid-plan marketing before LIVE.",
    },
    {
      key: "stripe_review",
      label: "Final Stripe LIVE review",
      ready: approved("GAMESIGNAL_STRIPE_LIVE_APPROVED"),
      detail: "Live products, prices, webhook, portal legal links, payment methods and legal/tax configuration require a final explicit review.",
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
