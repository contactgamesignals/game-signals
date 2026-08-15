"use client";

import Link from "next/link";
import Script from "next/script";
import { useState } from "react";

type PaddleWindow = Window & {
  Paddle?: {
    Environment: { set: (environment: "sandbox") => void };
    Initialize: (options: Record<string, unknown>) => void;
  };
};

type Props = {
  clientToken: string;
  environment: "sandbox" | "live";
};

export default function PaddleCheckoutPage({ clientToken, environment }: Props) {
  const [error, setError] = useState<string | null>(null);

  function initialize() {
    try {
      const paddle = (window as PaddleWindow).Paddle;
      if (!paddle) throw new Error("Paddle.js did not load.");
      if (!clientToken) throw new Error("Paddle checkout is not configured yet.");
      if (environment === "sandbox") paddle.Environment.set("sandbox");
      paddle.Initialize({
        token: clientToken,
        checkout: {
          settings: {
            displayMode: "overlay",
            theme: "dark",
            locale: "en",
            successUrl: `${window.location.origin}/dashboard/settings?billing=success`,
          },
        },
      });
    } catch (initializationError) {
      setError(initializationError instanceof Error ? initializationError.message : "Could not initialize Paddle checkout.");
    }
  }

  return (
    <main className="auth-page">
      <Script src="https://cdn.paddle.com/paddle/v2/paddle.js" strategy="afterInteractive" onLoad={initialize} onError={() => setError("Could not load Paddle checkout.")} />
      <section className="auth-card">
        <Link href="/" className="brand"><span className="brand-mark" /><span>GameSignal</span></Link>
        <div className="kicker" style={{ marginTop: 24 }}>Secure checkout</div>
        <h1>Paddle checkout</h1>
        <p>Paddle is preparing the secure checkout overlay for your GameSignal subscription.</p>
        {error ? <div className="auth-error">{error}</div> : <div className="status-message">Checkout should open automatically. If it does not, return to Billing and try again.</div>}
        <div className="dashboard-actions" style={{ marginTop: 18 }}>
          <Link className="btn btn-ghost" href="/dashboard/settings">Back to billing</Link>
        </div>
      </section>
    </main>
  );
}
