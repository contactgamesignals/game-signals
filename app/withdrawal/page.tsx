import type { Metadata } from "next";
import Link from "next/link";
import { COMPANY } from "@/lib/company";
import { LEGAL_UPDATED_DATES, LEGAL_VERSIONS } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Withdrawal - Who Plays My Game",
  description: "Consumer withdrawal information for Who Plays My Game purchases processed through Paddle.",
};

export default function WithdrawalPage() {
  return (
    <main className="auth-page" style={{ alignItems: "flex-start", paddingTop: 48, paddingBottom: 64 }}>
      <article className="auth-card" style={{ width: "min(920px, 100%)", maxWidth: 920 }}>
        <Link href="/" className="brand">
          <span className="brand-mark" />
          <span>{COMPANY.productName}</span>
        </Link>

        <div className="kicker" style={{ marginTop: 24 }}>Consumer information</div>
        <h1>Withdrawal from an Individual subscription</h1>
        <p>Last updated: {LEGAL_UPDATED_DATES.withdrawal} · Withdrawal information version: {LEGAL_VERSIONS.withdrawal}</p>
        <p>
          This page is intended for buyers who purchased {COMPANY.productName} as an individual and may have a statutory right to withdraw from a distance transaction. Company or business purchases do not receive an additional contractual 14-day withdrawal right from {COMPANY.legalName}, although mandatory protections that apply by law remain unaffected.
        </p>

        <h2>Purchases processed through Paddle</h2>
        <p>
          New paid {COMPANY.productName} subscriptions are processed through Paddle. For Paddle transactions, Paddle is the Merchant of Record and seller for the customer transaction and handles payment-side refunds and applicable statutory withdrawal requests under the Paddle Buyer Terms and Refund Policy.
        </p>
        <p>
          To request a refund or exercise an applicable statutory withdrawal right for a Paddle purchase, submit the request through <a href="https://paddle.net" target="_blank" rel="noreferrer">Paddle Buyer Support</a>. You can also review the <a href="https://www.paddle.com/legal/refund-policy" target="_blank" rel="noreferrer">Paddle Refund Policy</a>. The transaction confirmation or Paddle Customer Portal can help identify the relevant subscription or transaction.
        </p>
        <p>
          You may also contact <a href={`mailto:${COMPANY.supportEmail}`}>{COMPANY.supportEmail}</a> if you need product-side assistance or help identifying the purchase. For a Paddle transaction, {COMPANY.legalName} does not issue the payment refund directly to the buyer; the payment-side request is handled through Paddle.
        </p>

        <h2>Withdrawal period and immediate access</h2>
        <p>
          Paddle&apos;s current Buyer Terms and Refund Policy describe the withdrawal period and the effect that immediate access, use of the product, or other transaction circumstances may have on a refund or withdrawal request. Mandatory consumer rights that cannot legally be excluded remain unaffected.
        </p>
        <p>
          Cancellation of future renewals is different from statutory withdrawal. A Paddle subscription can be cancelled through Paddle Customer Portal. Cancellation normally takes effect at the end of the current paid billing period, subject to Paddle&apos;s applicable terms and mandatory law.
        </p>

        <h2>Example withdrawal request</h2>
        <p>
          Paddle Buyer Support provides the payment-side request route. If useful, the following information can help identify your purchase when submitting a request there:
        </p>
        <div className="status-message" style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
{`I would like to exercise any applicable statutory withdrawal right for my ${COMPANY.productName} subscription purchased through Paddle.

${COMPANY.productName} account email: __________________________
Paddle transaction or subscription ID: __________________________
Plan: __________________________
Purchase or renewal date: __________________________
Name: __________________________
Date: __________________________`}
        </div>

        <h2>Refund handling where withdrawal is valid</h2>
        <p>
          For a Paddle transaction, Paddle handles any payment-side reimbursement under its Refund Policy, Buyer Terms and applicable mandatory law. The payment method, timing and any effect of product use are therefore handled through the Paddle transaction rather than by a separate direct payment from {COMPANY.legalName}.
        </p>

        <h2>Complaints and problems with the service</h2>
        <p>
          Withdrawal is not the only consumer remedy. Product-access, functionality or service-quality problems can be reported directly to <a href={`mailto:${COMPANY.supportEmail}`}>{COMPANY.supportEmail}</a>. Mandatory remedies for a digital service that is not supplied or is not in conformity with the contract remain unaffected.
        </p>
        <p>
          If your purchase was not processed through Paddle, contact <a href={`mailto:${COMPANY.supportEmail}`}>{COMPANY.supportEmail}</a> and we will help identify the billing route associated with that transaction.
        </p>

        <div className="dashboard-actions" style={{ marginTop: 28 }}>
          <a className="btn btn-primary" href="https://paddle.net" target="_blank" rel="noreferrer">Open Paddle Buyer Support</a>
          <Link className="btn btn-ghost" href="/terms">Terms</Link>
          <Link className="btn btn-ghost" href="/privacy">Privacy Policy</Link>
          <Link className="btn btn-ghost" href="/refunds">Refund Policy</Link>
        </div>
      </article>
    </main>
  );
}
