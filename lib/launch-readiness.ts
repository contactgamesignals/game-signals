import "server-only";

import { configuredBillingProvider } from "@/lib/billing-provider";
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
 * Global operator launch gate for the CURRENT customer billing route.
 *
 * New subscriptions use Paddle Merchant of Record. Stripe/KSeF readiness is
 * retained below as legacy/direct-billing rollback evidence, but it must not
 * block or accidentally authorize the separate Paddle LIVE cutover.
 *
 * All legal/operational approvals remain explicit and fail closed. Paddle LIVE
 * also has its own runtime lock inside the billing Edge Function, so these
 * administrative flags cannot enable real charging by themselves.
 */
export function getLaunchReadiness() {
  const billingProvider = configuredBillingProvider();
  const checks: LaunchCheck[] = [
    {
      key: "billing_provider",
      label: "Current customer billing provider",
      ready: billingProvider === "paddle",
      detail: `Configured default provider is ${billingProvider}. The production launch checklist is currently designed for Paddle Merchant of Record; changing the provider requires a separate review.`,
    },
    {
      key: "seller",
      label: "Final product operator",
      ready: approved("GAMESIGNAL_LIVE_SELLER_APPROVED"),
      detail: `Current operator: ${ACTIVE_SELLER.legalName}. Confirm the final operator immediately before LIVE and keep public legal pages, Paddle account details and payout/accounting records aligned.`,
    },
    {
      key: "legal_contact",
      label: "Paid-consumer legal contact",
      ready: legalSupportPhoneConfigured(),
      detail: "Configure and verify GAMESIGNAL_SUPPORT_PHONE before paid consumer launch if the final legal review requires a direct phone contact for this sales route. The number is intentionally never guessed or hard-coded.",
    },
    {
      key: "legal_documents",
      label: "Current legal document versions",
      ready: approved("GAMESIGNAL_LEGAL_DOCUMENTS_APPROVED"),
      detail: `Final legal review must approve Terms ${LEGAL_VERSIONS.terms}, Privacy ${LEGAL_VERSIONS.privacy} and Withdrawal ${LEGAL_VERSIONS.withdrawal} for the Paddle Merchant-of-Record route.`,
    },
    {
      key: "contract_confirmation",
      label: "Durable contract / consumer information review",
      ready: approved("GAMESIGNAL_CONTRACT_CONFIRMATION_READY"),
      detail: "Before paid consumer launch, confirm which durable-medium information Paddle supplies as Merchant of Record and which product/consumer information Lumino Games must separately deliver. Do not reuse the legacy Stripe contract-confirmation flow without this review.",
    },
    {
      key: "paddle_account",
      label: "Paddle LIVE account verification",
      ready: approved("GAMESIGNAL_PADDLE_ACCOUNT_READY"),
      detail: "Paddle LIVE business/identity verification must be approved. Sandbox approval or sandbox credentials do not satisfy this check.",
    },
    {
      key: "paddle_domain",
      label: "Paddle LIVE domain approval",
      ready: approved("GAMESIGNAL_PADDLE_DOMAIN_READY"),
      detail: "Verify that whoplaysmygame.com / www.whoplaysmygame.com is approved for Paddle LIVE Checkout and that the LIVE default payment link points to the canonical /pay page.",
    },
    {
      key: "paddle_catalog",
      label: "Paddle LIVE catalog",
      ready: approved("GAMESIGNAL_PADDLE_CATALOG_READY"),
      detail: "Recreate and verify all six LIVE recurring prices (Indie/Studio/Publisher monthly + yearly). LIVE Paddle IDs are different from Sandbox IDs and must be mapped explicitly.",
    },
    {
      key: "paddle_webhook",
      label: "Paddle LIVE webhook",
      ready: approved("GAMESIGNAL_PADDLE_WEBHOOK_READY"),
      detail: "Create the separate LIVE notification destination, configure its LIVE secret, verify Paddle-Signature on the raw request body, and test the subscription lifecycle before launch.",
    },
    {
      key: "paddle_portal",
      label: "Paddle LIVE customer portal",
      ready: approved("GAMESIGNAL_PADDLE_PORTAL_READY"),
      detail: "Verify Customer Portal access, invoice/receipt visibility and cancellation at period end against a LIVE test subscription before launch.",
    },
    {
      key: "paddle_accounting",
      label: "Paddle MoR accounting route",
      ready: approved("GAMESIGNAL_PADDLE_ACCOUNTING_READY"),
      detail: "Approve the accounting treatment and reconciliation of Paddle payouts, fees and Paddle-issued seller/reverse-invoice records before real revenue is accepted. Legacy direct Stripe/KSeF customer-invoice logic is not the Paddle customer-sales route.",
    },
    {
      key: "supabase_auth",
      label: "Supabase Auth production security",
      ready: approved("GAMESIGNAL_SUPABASE_AUTH_READY"),
      detail: "Re-run the Supabase security advisor before LIVE. Leaked Password Protection should be enabled once the project is on a plan that supports it, and the canonical production Site URL/redirect configuration must remain verified.",
    },
    {
      key: "auth_email",
      label: "Production authentication email delivery",
      ready: approved("GAMESIGNAL_AUTH_EMAIL_READY"),
      detail: "Verify a production-ready SMTP sender and end-to-end signup confirmation plus password-reset delivery on the whoplaysmygame.com Auth redirect flow before a public paid launch.",
    },
    {
      key: "paddle_live_review",
      label: "Final Paddle LIVE cutover review",
      ready: approved("GAMESIGNAL_PADDLE_LIVE_APPROVED"),
      detail: "Final explicit review must confirm LIVE credentials, client token, catalog, approved domain, notification destination, portal, legal pages and accounting route. This approval still does not bypass PADDLE_LIVE_BILLING_ENABLED in the Edge Function.",
    },
  ];

  const ksef = getKsefProductionReadiness();
  const legacyDirectBillingChecks: LaunchCheck[] = [
    {
      key: "legacy_stripe_account",
      label: "Legacy Stripe LIVE account",
      ready: approved("GAMESIGNAL_STRIPE_ACCOUNT_READY"),
      detail: "Historical/direct-billing rollback only. Not a Paddle launch blocker.",
    },
    {
      key: "legacy_stripe_recovery",
      label: "Legacy Stripe revenue recovery",
      ready: approved("GAMESIGNAL_STRIPE_RECOVERY_READY"),
      detail: "Historical/direct-billing rollback only. Sandbox recovery logic remains preserved.",
    },
    {
      key: "legacy_stripe_disputes",
      label: "Legacy Stripe disputes",
      ready: approved("GAMESIGNAL_STRIPE_DISPUTES_READY"),
      detail: "Historical/direct-billing rollback only. Dispute persistence remains preserved.",
    },
    {
      key: "legacy_ksef_prerequisites",
      label: "Legacy direct-billing KSeF prerequisites",
      ready: approved("GAMESIGNAL_KSEF_FLOW_READY") && ksef.prerequisitesReady,
      detail: `Direct seller-invoice rollback path only. prerequisites=${ksef.prerequisitesReady ? "ready" : "blocked"}; production armed=${ksef.submissionArmed ? "yes" : "no"}. KSeF PROD must stay locked unless the direct-billing route is separately authorized.`,
    },
  ];

  const pending = checks.filter((check) => !check.ready);

  return {
    mode: pending.length === 0 ? "ready_for_explicit_paddle_live_cutover" : "sandbox_only",
    liveAllowed: pending.length === 0,
    billingProvider,
    seller: ACTIVE_SELLER.legalName,
    checks,
    pending: pending.map((check) => check.key),
    legacyDirectBilling: {
      mode: "rollback_only",
      checks: legacyDirectBillingChecks,
      productionSubmissionArmed: ksef.submissionArmed,
    },
  } as const;
}
