import type { Metadata } from "next";
import Link from "next/link";
import { COMPANY } from "@/lib/company";
import { getLegalSupportPhone, LEGAL_UPDATED_DATE, LEGAL_VERSIONS } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms — GameSignal",
  description: "Closed beta subscription terms for GameSignal operated by Lumino Games sp. z o.o.",
};

export default function TermsPage() {
  const supportPhone = getLegalSupportPhone();

  return (
    <main className="auth-page" style={{ alignItems: "flex-start", paddingTop: 48, paddingBottom: 64 }}>
      <article className="auth-card" style={{ width: "min(920px, 100%)", maxWidth: 920 }}>
        <Link href="/" className="brand">
          <span className="brand-mark" />
          <span>GameSignal</span>
        </Link>

        <div className="kicker" style={{ marginTop: 24 }}>Legal · closed beta</div>
        <h1>GameSignal Subscription Terms</h1>
        <p>Last updated: {LEGAL_UPDATED_DATE} · Terms version: {LEGAL_VERSIONS.terms}</p>
        <p>
          These Terms govern access to GameSignal, a software-as-a-service product operated by {COMPANY.legalName}. The paid checkout is prepared for purchases either as an individual or as a company/business.
        </p>

        <h2>1. Operator and contact</h2>
        <p>
          <strong>{COMPANY.legalName}</strong><br />
          {COMPANY.registeredAddress}<br />
          KRS {COMPANY.krs} · NIP {COMPANY.nip} · REGON {COMPANY.regon}<br />
          Email: <a href={`mailto:${COMPANY.supportEmail}`}>{COMPANY.supportEmail}</a><br />
          {supportPhone ? <><span>Phone: </span><a href={`tel:${supportPhone.replaceAll(" ", "")}`}>{supportPhone}</a></> : <span>Phone: will be published before paid consumer checkout is enabled.</span>}
        </p>
        <p>
          Paid consumer checkout must remain disabled until the required direct-contact information and the durable contract-confirmation flow described below are ready.
        </p>

        <h2>2. Individual and company purchases</h2>
        <p>
          Before the first paid checkout you choose <strong>Individual / solo</strong> or <strong>Company / business</strong>. The choice controls the checkout information and legal disclosures shown to you.
        </p>
        <p>
          Company/business buyers must provide truthful billing details. Stripe may require the legal business name, billing address and VAT or other tax identification number where supported. A person buying primarily for business purposes should select Company/business.
        </p>
        <p>
          Selecting Company/business does not remove mandatory statutory protections that apply by law, including protections that may apply to a natural person conducting business where the contract is not of a professional nature for that person.
        </p>

        <h2>3. Service, functionality and technical requirements</h2>
        <p>
          GameSignal helps users monitor public creator activity connected with games. The closed beta currently supports YouTube video monitoring and Twitch stream monitoring. Discord alerts are available on eligible plans. Kick monitoring and production email alerts are not currently live features.
        </p>
        <p>
          The service is web-based and requires a current mainstream browser, an internet connection and an account capable of receiving authentication messages. Connected features may require an account, webhook or other access on the relevant third-party service. GameSignal is designed for modern desktop and mobile browsers; unsupported or heavily modified browsers, network filters or disabled essential storage can prevent parts of the service from working correctly.
        </p>
        <p>
          Monitoring depends on third-party platforms, APIs, search behavior, quotas and public metadata. We do not guarantee that every relevant video, stream or mention will be detected, that detection will be immediate, that third-party metrics are perfectly accurate, or that any external platform will remain available on unchanged terms.
        </p>

        <h2>4. Prices, ordering and contract conclusion</h2>
        <p>
          Customer-facing prices displayed for the Poland-only paid beta are totals in PLN and include Polish VAT where applicable. The selected monthly or yearly price, billing period, recurring nature of the subscription and any tax shown by Stripe are presented before the final payment order.
        </p>
        <p>
          Choosing a plan inside GameSignal prepares a Stripe Checkout Session; that action alone is not intended to create a paid contract or charge a payment method. The payment order is confirmed in Stripe Checkout, where the final amount and recurring subscription are displayed and the user performs the final action indicating an obligation to pay.
        </p>
        <p>
          During the initial paid beta, checkout is limited to customers with a Polish billing address. Cross-border paid routes remain unavailable until the corresponding tax and evidence flows are explicitly approved.
        </p>

        <h2>5. Subscription, recurring charges and cancellation</h2>
        <p>
          Paid plans are recurring subscriptions billed in advance for the selected monthly or yearly period. Unless cancelled, the subscription renews automatically for another corresponding billing period and the payment method on file may be charged the then-applicable subscription price and taxes.
        </p>
        <p>
          You can cancel through Stripe Customer Portal. Unless mandatory law requires otherwise, cancellation takes effect at the end of the current paid billing period and access continues until that date. Cancelling does not ordinarily create a refund or credit for unused days, months or other unused portions of a billing period.
        </p>
        <p>
          Plan changes can result in a prorated charge or credit when Stripe shows such an adjustment during the change. This is separate from cancellation and does not create a general right to a cash refund for unused subscription time.
        </p>

        <h2>6. Refund policy</h2>
        <p>
          <strong>Payments are generally non-refundable.</strong> We do not normally provide refunds or credits for partially used monthly or yearly subscription periods, unused monitoring capacity, failure to use the account, forgetting to cancel before renewal, or deciding that the service is no longer needed.
        </p>
        <p>
          This policy does not limit refunds, price reductions, withdrawal rights, remedies for a non-conforming digital service, unauthorized-payment rights or other remedies that cannot legally be excluded. Where mandatory law requires a refund or other remedy, that law prevails.
        </p>

        <h2>7. Individual buyers and the 14-day withdrawal period</h2>
        <p>
          If you buy as an individual and consumer law gives you a right to withdraw from a distance contract, the statutory withdrawal period is generally 14 days from conclusion of the contract. Before Checkout, GameSignal asks you to expressly request that the digital service starts immediately rather than waiting for that period to expire.
        </p>
        <p>
          If you validly exercise a statutory withdrawal right after expressly requesting immediate performance, you may be required to pay a proportionate amount for the service supplied up to the moment you notify us of withdrawal, where permitted by law. A withdrawal right is not treated as lost merely because service started; any statutory loss of that right after full performance applies only where all legal conditions for that consequence have been met.
        </p>
        <p>
          Instructions and a model withdrawal statement are available on the <Link href="/withdrawal">Withdrawal</Link> page. Business buyers do not receive an additional contractual 14-day withdrawal right under these Terms, although mandatory rights that apply by law are not excluded.
        </p>

        <h2>8. Durable contract confirmation</h2>
        <p>
          For a paid distance contract where the law requires it, GameSignal will provide a confirmation of the concluded contract and the applicable legal information on a durable medium within the legally required time and before paid consumer service is allowed to begin. The confirmation is intended to preserve the exact contract information applicable to that purchase even if the website is later updated.
        </p>
        <p>
          This delivery flow is still being prepared in the closed beta. Real paid consumer launch remains blocked until the durable-confirmation channel is operational and verified.
        </p>

        <h2>9. Complaints and digital-service conformity</h2>
        <p>
          Complaints about billing, supply, functionality or conformity of the digital service can be sent to <a href={`mailto:${COMPANY.supportEmail}`}>{COMPANY.supportEmail}</a> or to the registered address listed above. Please include enough information to identify the account and the issue; do not send payment-card credentials.
        </p>
        <p>
          Where Polish consumer law applies, we will respond to a consumer complaint within the statutory period, generally 14 days from receipt unless a different mandatory rule applies. The response will be provided on paper or another durable medium as required by law.
        </p>
        <p>
          Mandatory rights concerning a digital service that is not supplied or is not in conformity with the contract remain unaffected. Depending on the circumstances, statutory remedies may include bringing the service into conformity, price reduction or termination/refund rights.
        </p>

        <h2>10. Out-of-court dispute resolution</h2>
        <p>
          After a consumer complaint has been made and cannot be resolved directly, a consumer may consider an authorised out-of-court consumer dispute-resolution body. Information and the current register of authorised Polish ADR bodies are available through the Polish Office of Competition and Consumer Protection (UOKiK) at <a href="https://polubowne.uokik.gov.pl/" target="_blank" rel="noreferrer">polubowne.uokik.gov.pl</a>.
        </p>
        <p>
          Use of a particular ADR procedure depends on its rules and applicable law. These Terms do not remove the right to pursue a claim before a competent court.
        </p>

        <h2>11. Invoices, Stripe documents and KSeF</h2>
        <p>
          Stripe may provide hosted billing or payment documents. Such Stripe-hosted documents are payment/billing evidence and are not automatically a substitute for a Polish statutory invoice or a KSeF invoice where Polish law requires one.
        </p>
        <p>
          Where a Polish business invoice is subject to KSeF, the seller-side invoicing flow will use the applicable KSeF process and retain the relevant KSeF identifiers and confirmation evidence. The paid PL Company route remains blocked until the production KSeF path for the final seller is explicitly prepared and authorised.
        </p>

        <h2>12. Closed beta and billing status</h2>
        <p>
          GameSignal is currently in closed beta. Stripe is presently configured in sandbox mode, so the current test checkout does not accept real money. The billing and legal flow is being prepared in advance for paid launch.
        </p>
        <p>
          Prices, tax handling and product features may be updated before live billing begins. We will not start real charges without a separately authorised change from sandbox to live mode.
        </p>

        <h2>13. Accounts and workspaces</h2>
        <p>
          You are responsible for keeping account access secure, using accurate information and controlling who can access your workspace. You must not attempt to access another workspace without permission.
        </p>
        <p>
          Workspace limits depend on the plan. If a plan changes to a lower active-game limit, GameSignal may automatically pause excess monitors rather than delete them. Re-activating monitors above the current plan limit is blocked.
        </p>

        <h2>14. Monitoring configuration and false positives</h2>
        <p>
          You are responsible for selecting the game titles, aliases, URLs, include phrases and exclusion terms used for monitoring. Common or ambiguous titles can generate false positives, and configuration may require adjustment over time.
        </p>
        <p>
          Signal scores, view counts, creator names and similar information are informational signals derived from available data and are not business, investment, legal or financial advice.
        </p>

        <h2>15. Discord and external services</h2>
        <p>
          If you connect a Discord webhook, you confirm that you are authorised to use that webhook and selected server/channel. Treat webhook URLs as secrets. We may disable an integration that repeatedly fails or appears compromised.
        </p>
        <p>
          YouTube, Twitch, Discord, Stripe, Supabase, Vercel, Resend and other third-party services operate independently under their own terms. Their outages, API changes, quotas, policy changes or discontinuation can affect GameSignal functionality.
        </p>

        <h2>16. Acceptable use</h2>
        <p>You must not:</p>
        <ul>
          <li>bypass plan limits, authentication, rate limits, quotas or security controls;</li>
          <li>attack, probe, disrupt or overload GameSignal or another user&apos;s workspace;</li>
          <li>use GameSignal for unlawful harassment, impersonation, stalking, credential theft or unlawful surveillance;</li>
          <li>upload or configure unlawful material or use the service to infringe third-party rights;</li>
          <li>resell or provide unauthorised shared access unless we agree otherwise;</li>
          <li>use automation outside the product in a way that creates excessive or abusive load.</li>
        </ul>

        <h2>17. Service changes, suspension and availability</h2>
        <p>
          We may modify beta features where reasonably required for security, platform/API compliance, quota management, legal compliance, maintenance, interoperability or product quality. A paid digital service will not be changed contrary to mandatory law. Where applicable law requires a contractual basis and a justified reason for a change, the change will be made without additional cost to the consumer.
        </p>
        <p>
          Where a paid change materially and adversely affects access to or use of the digital service, we will provide the information and durable-medium notice required by applicable law and honour any mandatory right to terminate or other remedy.
        </p>
        <p>
          We may temporarily suspend access where reasonably necessary to protect the service, investigate abuse, comply with law or address a serious breach. We may also terminate an account for serious or repeated violations, subject to mandatory law.
        </p>

        <h2>18. Price changes</h2>
        <p>
          Future subscription prices may change for future billing periods. For an active paid subscription, material price changes will be communicated in advance and will apply no earlier than a future renewal. Where applicable, you may avoid the changed price by cancelling before it takes effect.
        </p>

        <h2>19. Intellectual property</h2>
        <p>
          GameSignal software, interface, branding and original product materials belong to {COMPANY.legalName} or its licensors. Third-party video titles, channel names, platform marks and linked content remain subject to the rights of their respective owners.
        </p>

        <h2>20. Liability</h2>
        <p>
          GameSignal is a monitoring and notification tool, not a guarantee of complete media coverage, creator outreach results, sales, publicity or commercial performance. You remain responsible for decisions made on the basis of signals shown in the service.
        </p>
        <p>
          To the maximum extent permitted by applicable law, {COMPANY.legalName} is not responsible for indirect losses caused solely by third-party platforms, APIs, internet infrastructure or circumstances outside our reasonable control. Nothing in these Terms excludes liability or remedies that cannot legally be excluded or limited.
        </p>

        <h2>21. Account deletion and retained legal/accounting evidence</h2>
        <p>
          The product includes account-data export and account deletion. Deletion can be blocked while a paid subscription remains active or where deleting an owned workspace would affect other members. Product data may be deleted while transaction, tax, invoice, consent, dispute and contract-confirmation evidence is retained where required by law or reasonably needed for legal claims. Data handling is described in the <Link href="/privacy">Privacy Policy</Link>.
        </p>

        <h2>22. Governing law and contact</h2>
        <p>
          These Terms are governed by Polish law, without limiting mandatory protections that apply under the law of a consumer&apos;s place of residence where those protections cannot be waived.
        </p>
        <p>
          Questions, complaints, billing issues and legal notices can be sent to <a href={`mailto:${COMPANY.supportEmail}`}>{COMPANY.supportEmail}</a>.
        </p>

        <div className="dashboard-actions" style={{ marginTop: 28 }}>
          <Link className="btn btn-primary" href="/">Back to GameSignal</Link>
          <Link className="btn btn-ghost" href="/privacy">Privacy Policy</Link>
          <Link className="btn btn-ghost" href="/withdrawal">Withdrawal</Link>
        </div>
      </article>
    </main>
  );
}
