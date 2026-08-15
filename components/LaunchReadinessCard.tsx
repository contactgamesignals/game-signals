import { getLaunchReadiness } from "@/lib/launch-readiness";

export default function LaunchReadinessCard() {
  const readiness = getLaunchReadiness();

  return (
    <section className="settings-card" style={{ marginBottom: 16 }}>
      <div className="settings-row" style={{ borderTop: 0, paddingTop: 0 }}>
        <div>
          <h2>Launch readiness</h2>
          <p>
            Pre-LIVE safeguards for billing, tax evidence and Polish invoicing. Stripe remains sandbox-only until every required gate is explicitly approved.
          </p>
        </div>
        <span className="plan-pill">
          {readiness.liveAllowed ? "Ready for reviewed LIVE cutover" : "Sandbox locked"}
        </span>
      </div>

      <div className="form-grid">
        {readiness.checks.map((check) => (
          <div key={check.key} className="settings-row">
            <div>
              <strong>{check.label}</strong>
              <p className="form-help" style={{ marginTop: 5 }}>{check.detail}</p>
            </div>
            <span className="plan-pill">{check.ready ? "Ready" : "Pending"}</span>
          </div>
        ))}
      </div>

      <div className="status-message" style={{ marginTop: 14 }}>
        Seller switch note: the final Lumino Games vs Lumino Tax decision is intentionally deferred until the explicit pre-LIVE review. The current sandbox work does not make that choice irreversible.
      </div>
    </section>
  );
}
