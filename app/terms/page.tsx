import type { Metadata } from "next";
import Link from "next/link";
import { COMPANY } from "@/lib/company";
import { getLegalSupportPhone, LEGAL_UPDATED_DATE, LEGAL_VERSIONS } from "@/lib/legal";

export const metadata: Metadata = {
  title: `Terms — ${COMPANY.productName}`,
  description: `Subscription terms for ${COMPANY.productName}, operated by ${COMPANY.legalName}`,
};

export default function TermsPage() {
  const supportPhone = getLegalSupportPhone();

  return (
    <main className="auth-page" style={{ alignItems: "flex-start", paddingTop: 48, paddingBottom: 64 }}>
      <article className="auth-card" style={{ width: "min(920px, 100%)", maxWidth: 920 }}>
        <Link href="/" className="brand">
          <span className="brand-mark" />
          <span>{COMPANY.productName}</span>
        </Link>

        <div className="kicker" style={{ marginTop: 24 }}>Legal · public beta</div>
        <h1>{COMPANY.productName} Subscription Terms</h1>
        <p>Last updated: {LEGAL_UPDATED_DATE} · Terms version: {LEGAL_VERSIONS.terms}</p>
        <p>
          These Terms govern access to {COMPANY.productName}, a software-as-a-service product operated by {COMPANY.legalName}. Public account registration and the core monitoring service are available in beta. New real-money subscriptions remain unavailable until the separate Paddle LIVE checkout is activated.
        </p>

        <h2>1. Operator and contact</h2>
        <p>
          <strong>{COMPANY.legalName}</strong><br />
          {COMPANY.registeredAddress}<br />
          KRS {COMPANY.krs} · NIP {COMPANY.nip} · REGON {COMPANY.regon}<br />
          Email: <a href={`mailto:${COMPANY.supportEmail}`}>{COMPANY.supportEmail}</a><br />
          {supportPhone ? <><span>Phone: </span><a href={`tel:${supportPhone.replaceAll(" ", "")}`}>{supportPhone}</a></> : <span>Phone: will be published before any paid consumer launch.</span>}
        </p>

        <h2>2. Public beta and billing provider</h2>
        <p>
          Public signup and the free product experience are available. New paid checkout is temporarily locked while Paddle LIVE account, domain, catalog and webhook configuration are completed. Paddle Sandbox remains only as internal test history and cannot create a real-money charge.
        </p>
        <p>
          For a transaction completed through Paddle, Paddle acts as Merchant of Record for the customer transaction. Paddle handles the payment transaction, applicable indirect transaction taxes and customer billing documents under its own buyer terms and checkout disclosures. {COMPANY.legalName} remains the operator of the {COMPANY.productName} software and is responsible for the product access and functionality described in these Terms.
        </p>
        <p>
          The codebase also retains a Stripe sandbox/direct-billing fallback for technical rollback and legacy testing. It is not the default checkout for new subscriptions. No direct LIVE billing route will be enabled without separate legal, tax and operational approval.
        </p>

        <h2>3. Individual and company purchases</h2>
        <p>
          Before checkout you may be asked whether the subscription is being purchased as <strong>Individual / solo</strong> or <strong>Company / business</strong>. You must provide truthful information. The selected billing provider may request additional billing, business or tax information needed to complete the transaction.
        </p>
        <p>
          Choosing Company/business does not remove statutory protections that apply by mandatory law, including protections that may apply to a natural person conducting business where the contract is not of a professional nature for that person.
        </p>

        <h2>4. Service, functionality and technical requirements</h2>
        <p>
          {COMPANY.productName} helps users monitor public creator activity connected with games. The public beta currently supports YouTube video monitoring and Twitch stream monitoring. Discord alerts and opt-in daily email digests are available on eligible plans. Kick monitoring remains unavailable until the required API/commercial access is in place.
        </p>
        <p>
          The service is web-based and requires a current mainstream browser, internet access and an account capable of receiving authentication messages. Connected features may require an account, webhook or other access on the relevant third-party service.
        </p>
        <p>
          Monitoring depends on third-party platforms, APIs, search behavior, quotas and public metadata. We do not guarantee that every relevant video, stream or mention will be detected, that detection will be immediate, that third-party metrics are perfectly accurate, or that an external platform will remain available on unchanged terms.
        </p>

        <h2>5. Plans, prices and recurring subscriptions</h2>
        <p>
          Paid plans are intended to be recurring monthly or yearly subscriptions. Before any real payment order, the checkout provider must show the selected product, billing period, recurring nature of the subscription and the final amount due, including applicable transaction taxes handled by that provider.
        </p>
        <p>
          Prices shown on the website before Paddle LIVE activation describe the planned paid plans and do not themselves create a charge. Once LIVE checkout is enabled, the amount displayed in the final Paddle Checkout is controlling for that transaction.
        </p>

        <h2>6. Cancellation and subscription management</h2>
        <p>
          Paddle subscriptions can be managed through Paddle Customer Portal. The portal can be used to review billing information and, where available for the subscription, change or cancel it. Unless mandatory law or the checkout terms require otherwise, cancellation is intended to take effect at the end of the current paid billing period and access continues until that date.
        </p>
        <p>
          If a legacy/direct subscription uses another billing provider, the account will route billing management to the provider associated with that subscription rather than silently switching an existing subscription to Paddle.
        </p>

        <h2>7. Refunds and mandatory rights</h2>
        <p>
          Unless mandatory law or the applicable billing-provider terms require otherwise, subscriptions are generally not intended to be refundable merely because part of a billing period is unused, the account was not used, or cancellation was requested after a renewal.
        </p>
        <p>
          This does not limit withdrawal rights, remedies for a non-conforming digital service, unauthorized-payment rights, statutory refunds or other rights that cannot legally be excluded.
        </p>

        <h2>8. Individual buyers and withdrawal</h2>
        <p>
          If you buy as an individual and applicable consumer law gives you a right to withdraw from a distance contract, the statutory withdrawal period is generally 14 days from conclusion of the contract. Where immediate performance is requested during that period, the legal consequences depend on the applicable law and the circumstances of the transaction.
        </p>
        <p>
          Instructions and a model withdrawal statement are available on the <Link href="/withdrawal">Withdrawal</Link> page. Business buyers do not receive an additional contractual 14-day withdrawal right under these Terms, although mandatory rights that apply by law are not excluded.
        </p>

        <h2>9. Complaints and digital-service conformity</h2>
        <p>
          Product-access, functionality or conformity complaints can be sent to <a href={`mailto:${COMPANY.supportEmail}`}>{COMPANY.supportEmail}</a> or to the registered address above. Please include enough information to identify the account and issue; do not send payment-card credentials.
        </p>
        <p>
          Questions relating specifically to a Paddle payment, customer invoice or Paddle-managed transaction may also be handled through the channels provided by Paddle in its checkout, receipts or customer portal. Mandatory consumer remedies remain unaffected.
        </p>

        <h2>10. Accounts, workspaces and plan limits</h2>
        <p>
          You are responsible for keeping account access secure, using accurate information and controlling who can access your workspace. You must not attempt to access another workspace without permission.
        </p>
        <p>
          Workspace limits depend on the plan. If a plan changes to a lower active-game limit, {COMPANY.productName} may pause excess monitors rather than delete them. Re-activating monitors above the current plan limit is blocked.
        </p>

        <h2>11. Monitoring configuration and false positives</h2>
        <p>
          You are responsible for the game titles, aliases, URLs and exclusion terms used for monitoring. Common or ambiguous titles can generate false positives and configuration may require adjustment over time.
        </p>
        <p>
          Signal scores, view counts, creator names and similar information are informational signals derived from available data and are not business, investment, legal or financial advice.
        </p>

        <h2>12. External services</h2>
        <p>
          YouTube, Twitch, Discord, Paddle, Supabase, Vercel, Resend and any retained legacy Stripe integration are independent third-party services. Their outages, API changes, quotas, policies or discontinuation can affect product functionality. Their own terms and privacy rules apply to their services.
        </p>

        <h2>13. Acceptable use</h2>
        <p>You must not:</p>
        <ul>
          <li>bypass plan limits, authentication, rate limits, quotas or security controls;</li>
          <li>attack, probe, disrupt or overload {COMPANY.productName} or another user&apos;s workspace;</li>
          <li>use the service for unlawful harassment, impersonation, stalking, credential theft or unlawful surveillance;</li>
          <li>configure unlawful material or use the service to infringe third-party rights;</li>
          <li>resell or provide unauthorised shared access unless we agree otherwise;</li>
          <li>use external automation in a way that creates excessive or abusive load.</li>
        </ul>

        <h2>14. Service changes, suspension and availability</h2>
        <p>
          We may modify beta features where reasonably required for security, platform/API compliance, quota management, legal compliance, maintenance, interoperability or product quality. Mandatory rights applicable to a paid digital service are not excluded.
        </p>
        <p>
          We may temporarily suspend access where reasonably necessary to protect the service, investigate abuse, comply with law or address a serious breach. We may also terminate an account for serious or repeated violations, subject to mandatory law.
        </p>

        <h2>15. Intellectual property</h2>
        <p>
          {COMPANY.productName} software, interface, branding and original product materials belong to {COMPANY.legalName} or its licensors. Third-party video titles, channel names, platform marks and linked content remain subject to the rights of their respective owners.
        </p>

        <h2>16. Liability</h2>
        <p>
          {COMPANY.productName} is a monitoring and notification tool, not a guarantee of complete media coverage, creator outreach results, sales, publicity or commercial performance. You remain responsible for decisions made on the basis of signals shown in the service.
        </p>
        <p>
          To the maximum extent permitted by applicable law, {COMPANY.legalName} is not responsible for indirect losses caused solely by third-party platforms, APIs, internet infrastructure or circumstances outside our reasonable control. Nothing in these Terms excludes liability or remedies that cannot legally be excluded or limited.
        </p>

        <h2>17. Account deletion and retained records</h2>
        <p>
          The product includes account-data export and account deletion. Deletion can be blocked while a paid subscription remains active or where deleting an owned workspace would affect other members. Transaction, consent, billing, tax, dispute and contract evidence may be retained where required by law or reasonably needed for legal claims. Data handling is described in the <Link href="/privacy">Privacy Policy</Link>.
        </p>

        <h2>18. Governing law and contact</h2>
        <p>
          These Terms are governed by Polish law, without limiting mandatory protections that apply under the law of a consumer&apos;s place of residence where those protections cannot be waived.
        </p>
        <p>
          Questions, complaints, product issues and legal notices can be sent to <a href={`mailto:${COMPANY.supportEmail}`}>{COMPANY.supportEmail}</a>.
        </p>

        <div className="dashboard-actions" style={{ marginTop: 28 }}>
          <Link className="btn btn-primary" href="/">Back to {COMPANY.productName}</Link>
          <Link className="btn btn-ghost" href="/privacy">Privacy Policy</Link>
          <Link className="btn btn-ghost" href="/withdrawal">Withdrawal</Link>
        </div>
      </article>
    </main>
  );
}