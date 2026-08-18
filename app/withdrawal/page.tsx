import type { Metadata } from "next";
import Link from "next/link";
import { COMPANY } from "@/lib/company";
import { getLegalSupportPhone, LEGAL_UPDATED_DATE, LEGAL_VERSIONS } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Withdrawal - Who Plays My Game",
  description: "Consumer withdrawal information and model statement for Who Plays My Game.",
};

export default function WithdrawalPage() {
  const supportPhone = getLegalSupportPhone();

  return (
    <main className="auth-page" style={{ alignItems: "flex-start", paddingTop: 48, paddingBottom: 64 }}>
      <article className="auth-card" style={{ width: "min(920px, 100%)", maxWidth: 920 }}>
        <Link href="/" className="brand">
          <span className="brand-mark" />
          <span>{COMPANY.productName}</span>
        </Link>

        <div className="kicker" style={{ marginTop: 24 }}>Consumer information</div>
        <h1>Withdrawal from an Individual subscription</h1>
        <p>Last updated: {LEGAL_UPDATED_DATE} · Withdrawal information version: {LEGAL_VERSIONS.withdrawal}</p>
        <p>
          This page is intended for buyers who purchased {COMPANY.productName} as an individual and who have a statutory right to withdraw from a distance contract. Company/business purchases do not receive an additional contractual 14-day withdrawal right, although mandatory protections that apply by law remain unaffected.
        </p>

        <h2>How to withdraw</h2>
        <p>
          If a 14-day statutory withdrawal right applies to you, you can send an unambiguous statement before the deadline to <a href={`mailto:${COMPANY.supportEmail}`}>{COMPANY.supportEmail}</a> or by post to {COMPANY.registeredAddress}. You do not have to use the wording below, but it can make the request easier to identify.
        </p>
        {supportPhone ? <p>Phone contact: <a href={`tel:${supportPhone.replaceAll(" ", "")}`}>{supportPhone}</a>.</p> : null}
        <p>
          If {COMPANY.productName} later provides an electronic withdrawal form, a withdrawal submitted through that form will be acknowledged without undue delay on a durable medium as required by applicable law. Email withdrawal remains available independently of such a form.
        </p>
        <p>
          If you expressly requested that {COMPANY.productName} start immediately during the withdrawal period and you then validly withdraw, applicable law may require payment of a proportionate amount for the service supplied up to the time we receive your withdrawal statement.
        </p>
        <p>
          Starting the service does not by itself mean that a statutory withdrawal right is lost. Any loss of the right after full performance applies only where all statutory conditions for that consequence have been satisfied.
        </p>
        <p>
          Cancellation of future renewals is different from statutory withdrawal. Ordinary subscription cancellation is available through the applicable billing provider&apos;s customer portal; the current Paddle integration uses Paddle Customer Portal. Cancellation normally takes effect at the end of the current paid period without a prorated refund or credit, except where applicable law requires otherwise.
        </p>

        <h2>Model withdrawal statement</h2>
        <div className="status-message" style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
{`To: ${COMPANY.legalName}
${COMPANY.registeredAddress}
Email: ${COMPANY.supportEmail}${supportPhone ? `\nPhone: ${supportPhone}` : ""}

I hereby give notice that I withdraw from my contract for the ${COMPANY.productName} subscription.

${COMPANY.productName} account email: __________________________
Plan: __________________________
Order / subscription date: __________________________
Name: __________________________
Address: __________________________
Date: __________________________

Signature (only if sent on paper): __________________________`}
        </div>

        <h2>Refund timing where withdrawal is valid</h2>
        <p>
          Where a valid withdrawal requires repayment, the amount due will be returned without undue delay and, in any event, no later than the statutory deadline, generally 14 days from the day we are informed of the withdrawal. Repayment will normally use the same payment method used for the original transaction unless another lawful method is expressly agreed, without imposing additional fees on the consumer because of that alternative.
        </p>
        <p>
          Any amount lawfully due for service already supplied during the withdrawal period after an express request for immediate performance may be deducted where permitted by law.
        </p>

        <h2>Complaints and problems with the service</h2>
        <p>
          Withdrawal is not the only consumer remedy. If the digital service is not supplied or is not in conformity with the contract, mandatory rights to have the service brought into conformity, receive a price reduction, terminate the contract or receive a refund may apply independently of the ordinary refund policy.
        </p>
        <p>
          Complaints can be sent to <a href={`mailto:${COMPANY.supportEmail}`}>{COMPANY.supportEmail}</a> or to the registered address above. Where Polish consumer law applies, the complaint will be answered within the statutory period, generally 14 days from receipt unless another mandatory rule applies.
        </p>

        <div className="dashboard-actions" style={{ marginTop: 28 }}>
          <a className="btn btn-primary" href={`mailto:${COMPANY.supportEmail}?subject=Who%20Plays%20My%20Game%20withdrawal`}>Email withdrawal</a>
          <Link className="btn btn-ghost" href="/terms">Terms</Link>
          <Link className="btn btn-ghost" href="/privacy">Privacy Policy</Link>
        </div>
      </article>
    </main>
  );
}
