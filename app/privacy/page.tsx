import type { Metadata } from "next";
import Link from "next/link";
import { COMPANY } from "@/lib/company";
import { LEGAL_UPDATED_DATE, LEGAL_VERSIONS } from "@/lib/legal";

export const metadata: Metadata = {
  title: `Privacy Policy - ${COMPANY.productName}`,
  description: `Privacy information for ${COMPANY.productName}, operated by ${COMPANY.legalName}`,
};

export default function PrivacyPage() {
  return (
    <main className="auth-page" style={{ alignItems: "flex-start", paddingTop: 48, paddingBottom: 64 }}>
      <article className="auth-card" style={{ width: "min(920px, 100%)", maxWidth: 920 }}>
        <Link href="/" className="brand">
          <span className="brand-mark" />
          <span>{COMPANY.productName}</span>
        </Link>

        <div className="kicker" style={{ marginTop: 24 }}>Legal · public beta</div>
        <h1>Privacy Policy</h1>
        <p>Last updated: {LEGAL_UPDATED_DATE} · Privacy version: {LEGAL_VERSIONS.privacy}</p>
        <p>
          This policy explains how personal data is handled in {COMPANY.productName}, a product operated by {COMPANY.legalName}.
        </p>

        <h2>1. Data controller</h2>
        <p>
          The controller for product-account and service-operation data is <strong>{COMPANY.legalName}</strong>, {COMPANY.registeredAddress}. KRS {COMPANY.krs}, NIP {COMPANY.nip}, REGON {COMPANY.regon}.
        </p>
        <p>
          Privacy and support contact: <a href={`mailto:${COMPANY.supportEmail}`}>{COMPANY.supportEmail}</a>.
        </p>
        <p>
          When a customer transaction is completed through Paddle, Paddle acts as Merchant of Record for that transaction and processes payment, transaction-tax and customer-billing data under its own privacy terms and legal responsibilities. This policy describes the data handled by {COMPANY.productName} and {COMPANY.legalName} in connection with the product.
        </p>

        <h2>2. Data we process</h2>
        <p>Depending on how you use {COMPANY.productName}, we may process:</p>
        <ul>
          <li>account data, such as email address, display name and authentication identifiers;</li>
          <li>workspace and monitoring configuration, including game titles, aliases, URLs and exclusion terms;</li>
          <li>billing-choice information, including the selected plan/period and whether checkout was started as an individual or company/business;</li>
          <li>checkout-consent evidence, including accepted Terms/Privacy versions, recurring-billing acknowledgement, immediate-service request where applicable, timestamp and billing-provider/checkout identifiers;</li>
          <li>subscription identifiers and status information returned by the billing provider, including Paddle customer, transaction and subscription references for the current integration;</li>
          <li>where a legacy/direct billing route has been tested or used, associated Stripe billing identifiers and retained accounting/compliance evidence relevant to that route;</li>
          <li>notification settings, including a Discord webhook or email destination if you configure those features;</li>
          <li>technical and security information needed to operate and protect the service, such as timestamps, request metadata, user-agent information and service logs;</li>
          <li>support and legal messages you send to us, including withdrawal, complaint or billing requests;</li>
          <li>publicly available creator and content metadata discovered through supported platforms, such as creator/channel names, video or stream titles, URLs, view counts and live-viewer counts.</li>
        </ul>
        <p>
          We do not receive or store full payment-card details. Payment details for Paddle transactions are handled by Paddle. Password handling is provided through Supabase Auth; {COMPANY.productName} does not expose your password to workspace users or administrators.
        </p>

        <h2>3. Why we use the data and legal bases</h2>
        <ul>
          <li><strong>Providing the service and account:</strong> to create and operate your account, workspace, monitors, dashboard, subscription state and settings. The legal basis is performance of a contract or steps taken at your request before entering a contract.</li>
          <li><strong>Billing and checkout evidence:</strong> to initiate the selected checkout, synchronize subscription access, retain checkout choices and handle cancellation, withdrawal, refund, complaint or dispute requests. The legal bases may include performance of the contract, legal obligations and legitimate interests in maintaining reliable transaction records and defending legal claims.</li>
          <li><strong>Security, abuse prevention and support:</strong> to protect accounts, diagnose problems and respond to support requests. The legal basis is our legitimate interest in operating a secure and reliable service.</li>
          <li><strong>Creator-signal monitoring:</strong> to identify public mentions of monitored games and present those signals to the relevant workspace. The legal basis is our legitimate interest in providing creator-intelligence monitoring from publicly available sources.</li>
          <li><strong>Legal and accounting duties:</strong> where applicable, to comply with tax, accounting, consumer-protection and other legal obligations. New real-money subscriptions remain unavailable until Paddle LIVE is activated.</li>
          <li><strong>Consent:</strong> where we specifically ask for consent for a separate purpose.</li>
        </ul>

        <h2>4. Data required to use the service</h2>
        <p>
          Some data is necessary to create an account or perform the service, for example an email address and information required for the selected monitoring configuration. If required account or service information is not provided, we may be unable to create the account or provide the requested feature.
        </p>
        <p>
          A billing provider may require additional payment, address, business or tax information to complete a transaction. That information is handled according to the provider&apos;s checkout and privacy terms. {COMPANY.productName} stores only the billing/subscription metadata and evidence reasonably needed to provision access and maintain records.
        </p>

        <h2>5. Service providers, recipients and external platforms</h2>
        <p>
          We use specialist providers to operate {COMPANY.productName}. These include Supabase for database and authentication infrastructure, Vercel for application hosting, Paddle for the Merchant-of-Record billing integration, and Resend for authentication email delivery and opt-in product email digests. A legacy Stripe sandbox integration remains in the codebase as a rollback/testing route. Discord receives notifications only if you configure a Discord webhook.
        </p>
        <p>
          Professional advisers and competent public authorities may receive information where necessary for accounting, legal compliance, dispute handling, security or a binding legal requirement, subject to applicable confidentiality and data-protection rules.
        </p>
        <p>
          YouTube/Google and Twitch are external platforms and data sources used to discover public content. Their own terms and privacy rules also apply when you visit or interact with those services.
        </p>

        <h2>6. Paddle transactions</h2>
        <p>
          Paddle acts as Merchant of Record for transactions processed through Paddle. Paddle may collect billing identity, address, payment-method and tax information, calculate applicable transaction taxes, process the payment, issue customer billing documents and provide customer self-service through Paddle Customer Portal. We receive the identifiers and transaction/subscription information needed to associate the Paddle purchase with the correct workspace and access level.
        </p>
        <p>
          The verified integration currently remains in Sandbox while the separate Paddle LIVE account, domain, catalog, credentials and notification destination are prepared. Public Sandbox checkout is disabled and does not accept real money.
        </p>

        <h2>7. International processing</h2>
        <p>
          Some technology providers may process data outside Poland or the European Economic Area. Where required, transfers are handled using safeguards available under applicable data-protection law, such as adequacy decisions or standard contractual clauses used by the relevant provider.
        </p>

        <h2>8. Retention and account deletion</h2>
        <p>
          Account, authentication, owned workspace, monitoring configuration and related product data are generally kept while the account or workspace is active. When an account is eligible for permanent deletion, the product-deletion flow removes product data subject to information that must still be retained for legal obligations, transaction/accounting records, disputes, fraud/security prevention or backup lifecycles.
        </p>
        <p>
          Checkout-consent evidence, subscription references, transaction evidence and legally required accounting or dispute records may remain longer than the active product account. Retained records should be minimized and kept only for the period justified by the relevant legal, accounting, fraud-prevention or claims-defense purpose.
        </p>

        <h2>9. Automated processing</h2>
        <p>
          {COMPANY.productName} uses automation to scan supported platforms, calculate signal scores, apply plan limits and synchronize subscription states. These processes support operation of the service, but the product does not currently use solely automated decision-making intended to produce legal effects concerning an individual or similarly significantly affect that individual within the meaning of Article 22 GDPR.
        </p>

        <h2>10. Your rights</h2>
        <p>
          Subject to the GDPR and applicable law, you may have rights to access your data, correct it, request deletion or restriction, receive certain data in a portable format, and object to processing based on legitimate interests. Where processing is based on consent, you can withdraw that consent without affecting processing that took place before withdrawal.
        </p>
        <p>
          You can also lodge a complaint with the competent supervisory authority. In Poland this is the President of the Personal Data Protection Office (Prezes Urzędu Ochrony Danych Osobowych).
        </p>

        <h2>11. Cookies and local storage</h2>
        <p>
          {COMPANY.productName} uses technical storage needed for authentication, session continuity, onboarding state and product operation. The public beta does not intentionally deploy advertising cookies. If analytics or optional marketing technologies are introduced later, this policy and any required consent mechanism will be updated first.
        </p>

        <h2>12. Public beta changes</h2>
        <p>
          {COMPANY.productName} is in public beta. Features, providers and retention rules may evolve. Material changes to this policy will be reflected by updating this page and its revision date before they apply where required.
        </p>

        <div className="dashboard-actions" style={{ marginTop: 28 }}>
          <Link className="btn btn-primary" href="/">Back to {COMPANY.productName}</Link>
          <Link className="btn btn-ghost" href="/terms">Terms</Link>
          <Link className="btn btn-ghost" href="/withdrawal">Withdrawal</Link>
        </div>
      </article>
    </main>
  );
}
