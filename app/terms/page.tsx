import type { Metadata } from "next";
import Link from "next/link";
import { COMPANY } from "@/lib/company";

export const metadata: Metadata = {
  title: "Terms — GameSignal",
  description: "Closed beta terms for GameSignal operated by Lumino Games sp. z o.o.",
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
        <h1>GameSignal Closed Beta Terms</h1>
        <p>Last updated: {updated}</p>
        <p>
          These terms govern access to the current closed-beta version of GameSignal. GameSignal is a software service operated by {COMPANY.legalName}.
        </p>

        <h2>1. Operator</h2>
        <p>
          <strong>{COMPANY.legalName}</strong><br />
          {COMPANY.registeredAddress}<br />
          KRS {COMPANY.krs} · NIP {COMPANY.nip} · REGON {COMPANY.regon}<br />
          Contact: <a href={`mailto:${COMPANY.supportEmail}`}>{COMPANY.supportEmail}</a>
        </p>

        <h2>2. What GameSignal does</h2>
        <p>
          GameSignal helps game developers, studios and publishers monitor public creator activity connected with their games. The closed beta currently supports YouTube video monitoring and Twitch stream monitoring. Discord alerts are available on eligible plans. Kick monitoring and production email alerts are not currently live features.
        </p>
        <p>
          Monitoring is based on third-party platforms, APIs and public metadata. GameSignal cannot guarantee that every relevant video, stream or mention will be detected, that third-party metrics are perfectly accurate, or that a third-party platform will remain available on unchanged terms.
        </p>

        <h2>3. Closed beta status and billing</h2>
        <p>
          The public site is currently a closed beta. Stripe is configured in sandbox mode and no real money is accepted through the current GameSignal checkout. Pricing and plan structure may be adjusted before paid public launch.
        </p>
        <p>
          When real billing is enabled, paid-service terms, tax information and checkout disclosures will be updated before real charges are accepted. Any mandatory consumer rights applicable to a user cannot be excluded by these beta terms.
        </p>

        <h2>4. Accounts and workspaces</h2>
        <p>
          You are responsible for keeping access to your account secure and for providing accurate account information. You must not share credentials in a way that creates unauthorized access or attempt to access another workspace without permission.
        </p>
        <p>
          Workspace limits depend on the plan assigned to the workspace. GameSignal may pause monitors that exceed the active-game limit after a plan downgrade. Pausing a monitor does not intentionally delete its existing signal history.
        </p>

        <h2>5. Monitoring configuration</h2>
        <p>
          You are responsible for selecting the game titles, aliases, URLs, include phrases and exclusion terms used for monitoring. Common names can generate false positives, and configuration may need adjustment over time.
        </p>
        <p>
          Do not use GameSignal to monitor content for unlawful harassment, impersonation, stalking, credential theft, unauthorized surveillance or another unlawful purpose.
        </p>

        <h2>6. Discord and other integrations</h2>
        <p>
          If you connect a Discord webhook, you confirm that you are authorized to use that webhook and the selected Discord server/channel. Treat webhook URLs as secrets. GameSignal may disable an integration that repeatedly fails or appears compromised.
        </p>
        <p>
          Third-party services such as YouTube, Twitch, Discord, Supabase, Vercel and Stripe operate under their own terms and may change or discontinue features independently of GameSignal.
        </p>

        <h2>7. Acceptable use</h2>
        <p>You must not:</p>
        <ul>
          <li>attempt to bypass plan limits, authentication, rate limits or security controls;</li>
          <li>probe, attack or interfere with GameSignal infrastructure or another user&apos;s workspace;</li>
          <li>upload or configure unlawful content or use the service to infringe third-party rights;</li>
          <li>resell or provide unauthorized shared access to the beta unless we agree otherwise;</li>
          <li>use automated traffic that creates excessive load outside the functionality offered by the product.</li>
        </ul>

        <h2>8. Availability and changes</h2>
        <p>
          Because this is a beta service, functionality can change and temporary interruptions may occur. We may modify or remove beta features where needed for security, platform/API compliance, quota management, product quality or maintenance.
        </p>
        <p>
          We will not intentionally describe a third-party integration as live when the integration has not been enabled for production use.
        </p>

        <h2>9. Intellectual property</h2>
        <p>
          GameSignal software, interface, branding and original product materials belong to {COMPANY.legalName} or its licensors. Third-party video titles, channel names, platform marks and linked content remain subject to the rights of their respective owners.
        </p>
        <p>
          Using GameSignal does not transfer ownership of the service or of third-party content to you.
        </p>

        <h2>10. Account suspension and deletion</h2>
        <p>
          We may suspend access where reasonably necessary to protect the service, investigate abuse, comply with law or respond to a serious breach of these terms. Where practical, we will try to resolve ordinary support or configuration issues before suspension.
        </p>
        <p>
          The product includes an account-deletion flow. During the closed beta, deletion can be blocked where an active subscription record must first be resolved or where deleting an owned workspace could affect other members.
        </p>

        <h2>11. Liability</h2>
        <p>
          GameSignal is a monitoring and notification tool, not a guarantee of complete media coverage, creator outreach results, sales, publicity or commercial performance. You remain responsible for decisions made on the basis of signals shown in the service.
        </p>
        <p>
          Nothing in these terms excludes liability or rights that cannot legally be excluded. Subject to mandatory law, {COMPANY.legalName} is not responsible for failures caused solely by third-party platforms, APIs, internet infrastructure or events outside our reasonable control.
        </p>

        <h2>12. Governing law and contact</h2>
        <p>
          These closed-beta terms are governed by Polish law, without limiting mandatory protections that apply under the law of a user&apos;s place of residence where such protections cannot be waived.
        </p>
        <p>
          Questions or beta issues can be sent to <a href={`mailto:${COMPANY.supportEmail}`}>{COMPANY.supportEmail}</a>.
        </p>

        <div className="dashboard-actions" style={{ marginTop: 28 }}>
          <Link className="btn btn-primary" href="/">Back to GameSignal</Link>
          <Link className="btn btn-ghost" href="/privacy">Privacy Policy</Link>
        </div>
      </article>
    </main>
  );
}
