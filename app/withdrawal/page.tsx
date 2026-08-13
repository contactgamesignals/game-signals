import type { Metadata } from "next";
import Link from "next/link";
import { COMPANY } from "@/lib/company";

export const metadata: Metadata = {
  title: "Withdrawal — GameSignal",
  description: "Consumer withdrawal information and model statement for GameSignal.",
};

export default function WithdrawalPage() {
  return (
    <main className="auth-page" style={{ alignItems: "flex-start", paddingTop: 48, paddingBottom: 64 }}>
      <article className="auth-card" style={{ width: "min(920px, 100%)", maxWidth: 920 }}>
        <Link href="/" className="brand">
          <span className="brand-mark" />
          <span>GameSignal</span>
        </Link>

        <div className="kicker" style={{ marginTop: 24 }}>Consumer information</div>
        <h1>Withdrawal from an Individual subscription</h1>
        <p>
          This page is intended for buyers who purchased GameSignal as an individual and who have a statutory right to withdraw from a distance contract. Company/business purchases do not receive an additional contractual 14-day withdrawal right, although mandatory protections that apply by law remain unaffected.
        </p>

        <h2>How to withdraw</h2>
        <p>
          If a 14-day statutory withdrawal right applies to you, you can send an unambiguous statement before the deadline to <a href={`mailto:${COMPANY.supportEmail}`}>{COMPANY.supportEmail}</a>. You do not have to use the wording below, but it can make the request easier to identify.
        </p>
        <p>
          If you expressly requested that GameSignal start immediately during the withdrawal period and you then validly withdraw, applicable law may require payment of a proportionate amount for the service supplied up to the time we receive your withdrawal statement.
        </p>
        <p>
          Cancellation of future renewals is different from statutory withdrawal. Ordinary cancellation is available through Stripe Customer Portal and normally takes effect at the end of the current paid period without a prorated refund or credit, except where applicable law requires otherwise.
        </p>

        <h2>Model withdrawal statement</h2>
        <div className="status-message" style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
{`To: ${COMPANY.legalName}
${COMPANY.registeredAddress}
Email: ${COMPANY.supportEmail}

I hereby give notice that I withdraw from my contract for the GameSignal subscription.

GameSignal account email: __________________________
Plan: __________________________
Order / subscription date: __________________________
Name: __________________________
Address: __________________________
Date: __________________________

Signature (only if sent on paper): __________________________`}
        </div>

        <h2>Refund timing where withdrawal is valid</h2>
        <p>
          Where applicable law requires a refund after a valid withdrawal, it will be processed using the original payment method unless another lawful method is agreed. Any amount lawfully due for service already supplied during the withdrawal period may be deducted where permitted.
        </p>

        <h2>Problems with the service</h2>
        <p>
          Withdrawal is not the only consumer remedy. If the digital service is not supplied or is not in conformity with the contract, mandatory rights to have the service brought into conformity, receive a price reduction, terminate the contract or receive a refund may apply independently of the ordinary refund policy.
        </p>

        <div className="dashboard-actions" style={{ marginTop: 28 }}>
          <a className="btn btn-primary" href={`mailto:${COMPANY.supportEmail}?subject=GameSignal%20withdrawal`}>Email withdrawal</a>
          <Link className="btn btn-ghost" href="/terms">Terms</Link>
          <Link className="btn btn-ghost" href="/privacy">Privacy Policy</Link>
        </div>
      </article>
    </main>
  );
}
