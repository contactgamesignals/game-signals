"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BRAND } from "@/lib/brand";
import { createClient } from "@/lib/supabase/client";

type Props = {
  email: string;
};

export default function GoogleSignupCompletion({ email }: Props) {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function completeSignup() {
    if (!accepted || loading) return;
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/complete-google-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accepted: true }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "We could not finish creating your workspace.");
      }

      const supabase = createClient();
      const { error: confirmationError } = await supabase.functions.invoke(
        "send-account-agreement-confirmation",
        { body: {} },
      );
      if (confirmationError) {
        await supabase.auth.signOut();
        throw new Error(
          "Your workspace was created, but we could not send the required account-agreement confirmation email. Please log in with Google again in a moment.",
        );
      }

      router.replace("/dashboard");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We could not finish creating your workspace.");
      setLoading(false);
    }
  }

  async function useAnotherAccount() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link href="/" className="brand">
          <span className="brand-mark" />
          <span>{BRAND.name}</span>
        </Link>

        <div className="kicker" style={{ marginTop: 24 }}>One last step</div>
        <h1>Finish creating your account</h1>
        <p>
          Google verified <strong>{email}</strong>. Review the legal documents below before we create your monitoring workspace.
        </p>

        {message ? <div className="auth-error">{message}</div> : null}

        <div className="signup-legal-row" style={{ marginTop: 20 }}>
          <input
            id="google-signup-legal-acceptance"
            type="checkbox"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
            disabled={loading}
          />
          <label htmlFor="google-signup-legal-acceptance" className="signup-legal-copy">
            I agree to the{" "}
            <Link href="/terms" target="_blank" rel="noreferrer" className="signup-legal-link">Terms</Link>
            {" "}and acknowledge the{" "}
            <Link href="/privacy" target="_blank" rel="noreferrer" className="signup-legal-link">Privacy Policy</Link>.
          </label>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          style={{ width: "100%", marginTop: 18 }}
          disabled={!accepted || loading}
          onClick={completeSignup}
        >
          {loading ? "Creating workspace..." : "Agree and create workspace"}
        </button>

        <button
          type="button"
          className="btn"
          style={{ width: "100%", marginTop: 10 }}
          disabled={loading}
          onClick={useAnotherAccount}
        >
          Use another account
        </button>
      </section>
    </main>
  );
}
