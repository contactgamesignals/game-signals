import type { Metadata } from "next";
import Link from "next/link";
import { COMPANY } from "@/lib/company";
import { BRAND } from "@/lib/brand";
import { LEGAL_UPDATED_DATE } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Refund Policy — Who Plays My Game",
  description: "Refund and cancellation policy for Who Plays My Game subscriptions.",
  alternates: { canonical: `${BRAND.siteUrl}/refunds` },
};

export default function RefundPolicyPage() {
  return (
    <main className="auth-page" style={{ alignItems: "flex-start", paddingTop: 48, paddingBottom: 64 }}>
      <article className="auth-card" style={{ width: "min(920px, 100%)", maxWidth: 920 }}>
        <Link href="/" className="brand">
          <span className="brand-mark" />
          <span>{COMPANY.productName}</span>
        </Link>

        <div className="kicker" style={{ marginTop: 24 }}>Billing policy</div>
        <h1>Refund Policy</h1>
        <p>Last updated: {LEGAL_UPDATED_DATE}</p>

        <p>
          Paid {COMPANY.productName} subscriptions are processed through Paddle, which acts as Merchant of Record for Paddle transactions. Paddle handles the customer payment, applicable transaction taxes, customer billing documents and payment-side refund processing under its buyer terms and refund policy.
        </p>

        <h2>Ordinary subscription cancellation</h2>
        <p>
          You can cancel a Paddle subscription through Paddle Customer Portal. Unless mandatory law or Paddle&apos;s applicable buyer terms require otherwise, cancellation takes effect at the end of the current paid billing period and access continues until that date.
        </p>
        <p>
          Unused time in a billing period is not normally refunded or credited merely because the account was not used or cancellation was requested after a renewal.
        </p>

        <h2>Refund requests</h2>
        <p>
          Refund eligibility is determined under Paddle&apos;s applicable refund policy, mandatory consumer law and any non-waivable rights that apply to the purchase. Paddle may process full or partial refunds where the applicable rules permit or require them.
        </p>
        <p>
          For payment or refund assistance, customers may use the support options provided by Paddle in checkout, receipts, Paddle Customer Portal or Paddle buyer support. Product-access or service-quality issues can also be reported to <a href={`mailto:${COMPANY.supportEmail}`}>{COMPANY.supportEmail}</a> so we can investigate the product side of the request.
        </p>

        <h2>Withdrawal and mandatory consumer rights</h2>
        <p>
          This policy does not limit statutory withdrawal rights, remedies for a digital service that is not supplied or is not in conformity with the contract, unauthorized-payment rights, chargeback rights or any other protection that cannot legally be excluded.
        </p>
        <p>
          Information for individual buyers about statutory withdrawal is available on the <Link href="/withdrawal">Withdrawal</Link> page.
        </p>

        <div className="dashboard-actions" style={{ marginTop: 28 }}>
          <Link className="btn btn-primary" href="/">Back to {COMPANY.productName}</Link>
          <Link className="btn btn-ghost" href="/terms">Terms</Link>
          <Link className="btn btn-ghost" href="/privacy">Privacy Policy</Link>
          <Link className="btn btn-ghost" href="/withdrawal">Withdrawal</Link>
        </div>
      </article>
    </main>
  );
}
