import type { Metadata } from "next";
import Link from "next/link";
import { COMPANY } from "@/lib/company";

export const metadata: Metadata = {
  title: "Terms — GameSignal",
  description: "Closed beta subscription terms for GameSignal operated by Lumino Games sp. z o.o.",
};

const updated = "13 August 2026";

export default function TermsPage() {
  return (
    <main className="auth-page" style={{ alignItems: "flex-start", paddingTop: 48, paddingBottom: 64 }}>
      <article className="auth-card" style={{ width: "min(920px, 100%)", maxWidth: 920 }}>
        <Link href="/" className="brand">
          <span className="brand-mark" />
          <span>GameSignal</span>
        </Link>

        <div className="kicker" style={{ marginTop: 24 }}>Legal · closed beta</div>
        <h1>GameSignal Subscription Terms</h1>
        <p>Last updated: {updated}</p>
        <p>
          These terms govern access to GameSignal. GameSignal is a software-as-a-service product operated by {COMPANY.legalName}. The checkout lets you buy either as an individual or as a company/business.
        </p>

        <h2>1. Operator</h2>
        <p>
          <strong>{COMPANY.legalName}</strong><br />
          {COMPANY.registeredAddress}<br />
          KRS {COMPANY.krs} · NIP {COMPANY.nip} · REGON {COMPANY.regon}<br />
          Contact: <a href={`mailto:${COMPANY.supportEmail}`}>{COMPANY.supportEmail}</a>
        </p>

        <h2>2. Individual and company purchases</h2>
        <p>
          Before the first paid checkout you choose <strong>Individual / solo</strong> or <strong>Company / business</strong>. The choice controls the checkout information and the legal disclosures shown to you.
        </p>
        <p>
          Company/business buyers must provide truthful billing details. Stripe may require the legal business name, billing address and VAT or other tax identification number where supported for the selected country. A person buying for business purposes should select Company/business.
        </p>
        <p>
          Selecting Company/business does not remove mandatory statutory protections that may apply to a particular buyer under applicable law, including protections that may apply to qualifying sole traders or natural persons conducting business.
        </p>

        <h2>3. What GameSignal does</h2>
        <p>
          GameSignal helps users monitor public creator activity connected with games. The closed beta currently supports YouTube video monitoring and Twitch stream monitoring. Discord alerts are available on eligible plans. Kick monitoring and production email alerts are not currently live features.
        </p>
        <p>
          Monitoring depends on third-party platforms, APIs, search behavior, quotas and public metadata. We do not guarantee that every relevant video, stream or mention will be detected, that a signal will be detected immediately, that third-party metrics are perfectly accurate, or that any external platform will remain available on unchanged terms.
        </p>

        <h2>4. Subscription, recurring charges and cancellation</h2>
        <p>
          Paid plans are recurring subscriptions billed in advance for the selected monthly or yearly period. Unless cancelled, the subscription renews automatically for another corresponding billing period and the payment method on file may be charged the then-applicable subscription price and taxes.
        </p>
        <p>
          You can cancel through Stripe Customer Portal. Unless mandatory law requires otherwise, cancellation takes effect at the end of the current paid billing period and access continues until that date. Cancelling does not ordinarily create a refund or credit for unused days, months or other unused portions of a billing period.
        </p>
        <p>
          Plan changes can result in a prorated charge or credit when Stripe shows such an adjustment during the change. This is separate from cancellation and does not create a general right to a cash refund for unused subscription time.
        </p>

        <h2>5. Refund policy</h2>
        <p>
          <strong>Payments are generally non-refundable.</strong> We do not normally provide refunds or credits for partially used monthly or yearly subscription periods, unused monitoring capacity, failure to use the account, forgetting to cancel before renewal, or deciding that the service is no longer needed.
        </p>
        <p>
          This policy does not limit refunds, price reductions, withdrawal rights, remedies for a non-conforming digital service, unauthorized-payment rights or other remedies that cannot legally be excluded. Where applicable law requires a refund or other remedy, that law prevails over this section.
        </p>
        <p>
          Before disputing an authorized charge, please contact <a href={`mailto:${COMPANY.supportEmail}`}>{COMPANY.supportEmail}</a> so that billing errors can be investigated quickly. Nothing here prevents a lawful payment dispute or chargeback.
        </p>

        <h2>6. Individual buyers and the 14-day withdrawal period</h2>
        <p>
          If you buy as an individual and consumer law gives you a right to withdraw from a distance contract, the statutory withdrawal period is generally 14 days from conclusion of the contract. Before Checkout, GameSignal asks you to expressly request that the digital service starts immediately rather than waiting for that period to expire.
        </p>
        <p>
          If you validly exercise a statutory withdrawal right after expressly requesting immediate performance, you may be required to pay a proportionate amount for the service supplied up to the moment you notify us of withdrawal, where permitted by law. Mandatory rights relating to defects or non-conformity remain unaffected.
        </p>
        <p>
          Instructions and a model withdrawal statement are available on the <Link href="/withdrawal">Withdrawal</Link> page. Business buyers do not receive a contractual 14-day withdrawal right from these Terms, although mandatory rights that apply by law are not excluded.
        </p>

        <h2>7. Closed beta and billing status</h2>
        <p>
          GameSignal is currently in closed beta. Stripe is presently configured in sandbox mode, so the current test checkout does not accept real money. The billing and legal flow is being prepared in advance for paid launch.
        </p>
        <p>
          Prices, tax handling and product features may be updated before live billing begins. We will not start real charges without changing the checkout from sandbox to live mode.
        </p>

        <h2>8. Accounts and workspaces</h2>
        <p>
          You are responsible for keeping account access secure, using accurate information and controlling who can access your workspace. You must not attempt to access another workspace without permission.
        </p>
        <p>
          Workspace limits depend on the plan. If a plan changes to a lower active-game limit, GameSignal may automatically pause excess monitors rather than delete them. Re-activating monitors above the current plan limit is blocked.
        </p>

        <h2>9. Monitoring configuration and false positives</h2>
        <p>
          You are responsible for selecting the game titles, aliases, URLs, include phrases and exclusion terms used for monitoring. Common or ambiguous titles can generate false positives, and configuration may require adjustment over time.
        </p>
        <p>
          Signal scores, view counts, creator names and similar information are informational signals derived from available data and are not business, investment, legal or financial advice.
        </p>

        <h2>10. Discord and external services</h2>
        <p>
          If you connect a Discord webhook, you confirm that you are authorized to use that webhook and selected server/channel. Treat webhook URLs as secrets. We may disable an integration that repeatedly fails or appears compromised.
        </p>
        <p>
          YouTube, Twitch, Discord, Stripe, Supabase, Vercel, Resend and other third-party services operate independently under their own terms. Their outages, API changes, quotas, policy changes or discontinuation can affect GameSignal functionality.
        </p>

        <h2>11. Acceptable use</h2>
        <p>You must not:</p>
        <ul>
          <li>bypass plan limits, authentication, rate limits, quotas or security controls;</li>
          <li>attack, probe, disrupt or overload GameSignal or another user&apos;s workspace;</li>
          <li>use GameSignal for unlawful harassment, impersonation, stalking, credential theft or unlawful surveillance;</li>
          <li>upload or configure unlawful material or use the service to infringe third-party rights;</li>
          <li>resell or provide unauthorized shared access unless we agree otherwise;</li>
          <li>use automation outside the product in a way that creates excessive or abusive load.</li>
        </ul>

        <h2>12. Service changes, suspension and availability</h2>
        <p>
          We may modify beta features where reasonably required for security, platform/API compliance, quota management, legal compliance, maintenance or product quality. For paid subscriptions, material adverse changes will be handled subject to applicable law and the rights stated in the subscription terms in force at that time.
        </p>
        <p>
          We may temporarily suspend access where reasonably necessary to protect the service, investigate abuse, comply with law or address a serious breach. We may also terminate an account for serious or repeated violations, subject to mandatory law.
        </p>

        <h2>13. Price changes</h2>
        <p>
          Future subscription prices may change for future billing periods. For an active paid subscription, material price changes will be communicated in advance and will apply no earlier than a future renewal. Where applicable, you may avoid the changed price by cancelling before it takes effect.
        </p>

        <h2>14. Intellectual property</h2>
        <p>
          GameSignal software, interface, branding and original product materials belong to {COMPANY.legalName} or its licensors. Third-party video titles, channel names, platform marks and linked content remain subject to the rights of their respective owners.
        </p>

        <h2>15. Liability</h2>
        <p>
          GameSignal is a monitoring and notification tool, not a guarantee of complete media coverage, creator outreach results, sales, publicity or commercial performance. You remain responsible for decisions made on the basis of signals shown in the service.
        </p>
        <p>
          To the maximum extent permitted by applicable law, {COMPANY.legalName} is not responsible for indirect losses caused solely by third-party platforms, APIs, internet infrastructure or circumstances outside our reasonable control. Nothing in these Terms excludes liability or remedies that cannot legally be excluded or limited.
        </p>

        <h2>16. Account deletion and data</h2>
        <p>
          The product includes account-data export and account deletion. Deletion can be blocked while a paid subscription remains active or where deleting an owned workspace would affect other members. Data handling is described in the <Link href="/privacy">Privacy Policy</Link>.
        </p>

        <h2>17. Governing law and contact</h2>
        <p>
          These Terms are governed by Polish law, without limiting mandatory protections that apply under the law of a consumer&apos;s place of residence where those protections cannot be waived.
        </p>
        <p>
          Questions, billing issues and legal notices can be sent to <a href={`mailto:${COMPANY.supportEmail}`}>{COMPANY.supportEmail}</a>.
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
