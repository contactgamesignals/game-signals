"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Props = {
  mode: "request" | "reset";
};

export default function PasswordRecoveryCard({ mode }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const requesting = mode === "request";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setSuccess(false);

    try {
      const supabase = createClient();
      if (requesting) {
        const redirectTo = `${window.location.origin}/auth/callback?next=/reset-password`;
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
        if (error) throw error;
        setSuccess(true);
        setMessage("If an account exists for this email, a password reset link has been sent.");
      } else {
        if (password.length < 8) throw new Error("Password must be at least 8 characters long.");
        if (password !== confirmation) throw new Error("Passwords do not match.");
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setSuccess(true);
        setMessage("Password updated. Redirecting to your dashboard…");
        window.setTimeout(() => {
          router.push("/dashboard");
          router.refresh();
        }, 700);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Password recovery failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link href="/" className="brand">
          <span className="brand-mark" />
          <span>GameSignal</span>
        </Link>
        <div className="kicker" style={{ marginTop: 24 }}>Account recovery</div>
        <h1>{requesting ? "Reset your password" : "Choose a new password"}</h1>
        <p>
          {requesting
            ? "Enter your account email and we’ll send a secure recovery link."
            : "Set a new password for your GameSignal account."}
        </p>

        {message ? <div className={success ? "auth-success" : "auth-error"}>{message}</div> : null}

        <form className="auth-form" onSubmit={submit}>
          {requesting ? (
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@studio.com"
                autoComplete="email"
                required
                disabled={loading}
              />
            </label>
          ) : (
            <>
              <label>
                New password
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  disabled={loading}
                />
              </label>
              <label>
                Confirm new password
                <input
                  type="password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  placeholder="Repeat password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  disabled={loading}
                />
              </label>
            </>
          )}
          <button className="btn btn-primary" disabled={loading || success}>
            {loading ? "Please wait…" : requesting ? "Send reset link" : "Update password"}
          </button>
        </form>

        <div className="auth-links">
          <Link href="/">← Back to website</Link>
          <Link href="/login">Back to login</Link>
        </div>
      </section>
    </main>
  );
}
