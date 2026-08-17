"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { BRAND } from "@/lib/brand";
import { LEGAL_VERSIONS } from "@/lib/legal-versions";
import { createClient } from "@/lib/supabase/client";
import TurnstileChallenge from "@/components/TurnstileChallenge";

const PUBLIC_SIGNUP_ENABLED = false;

type Props = {
  mode: "login" | "signup";
  configured: boolean;
};

export default function AuthCard({ mode, configured }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const isLogin = mode === "login";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setSuccess(false);

    if (!configured) {
      setMessage("Authentication is temporarily unavailable.");
      return;
    }
    if (!isLogin && !PUBLIC_SIGNUP_ENABLED) {
      setMessage("Public beta signup is opening shortly after final launch contact configuration.");
      return;
    }
    if (!isLogin && !legalAccepted) {
      setMessage("Please agree to the Terms and acknowledge the Privacy Policy to create an account.");
      return;
    }
    if (!captchaToken) {
      setMessage("Please complete the security check and try again.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
          options: { captchaToken },
        });
        if (error) throw error;
        router.push("/dashboard");
        router.refresh();
      } else {
        const redirectTo = `${window.location.origin}/auth/callback?next=/dashboard`;
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirectTo,
            data: {
              display_name: displayName.trim() || email.split("@")[0],
              terms_accepted: true,
              terms_version: LEGAL_VERSIONS.terms,
              privacy_acknowledged: true,
              privacy_version: LEGAL_VERSIONS.privacy,
            },
            captchaToken,
          },
        });
        if (error) throw error;

        if (data.session) {
          router.push("/dashboard");
          router.refresh();
        } else {
          setSuccess(true);
          setMessage("Check your email and confirm the account, then log in.");
        }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setCaptchaResetKey((value) => value + 1);
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link href="/" className="brand">
          <span className="brand-mark" />
          <span>{BRAND.name}</span>
        </Link>
        <div className="kicker" style={{ marginTop: 24 }}>
          {isLogin ? "Account access" : "Create workspace"}
        </div>
        <h1>{isLogin ? "Log in" : "Start monitoring"}</h1>
        <p>
          {isLogin
            ? "Open your creator intelligence dashboard."
            : PUBLIC_SIGNUP_ENABLED
              ? "Create an account and your first monitoring workspace."
              : "Public beta signup is ready and will open after the final customer-contact detail is configured."}
        </p>

        {!isLogin && !PUBLIC_SIGNUP_ENABLED ? (
          <div className="status-message">Signup is temporarily locked for the final launch check. Existing accounts can still log in normally.</div>
        ) : null}
        {message ? <div className={success ? "auth-success" : "auth-error"}>{message}</div> : null}

        <form className="auth-form" onSubmit={submit}>
          {!isLogin ? (
            <label>
              Display name
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your name" autoComplete="name" disabled={!PUBLIC_SIGNUP_ENABLED} />
            </label>
          ) : null}
          <label>
            Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@studio.com" autoComplete="email" required disabled={!isLogin && !PUBLIC_SIGNUP_ENABLED} />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" autoComplete={isLogin ? "current-password" : "new-password"} minLength={8} required disabled={!isLogin && !PUBLIC_SIGNUP_ENABLED} />
          </label>

          {!isLogin ? (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, lineHeight: 1.5 }}>
              <input id="signup-legal-acceptance" type="checkbox" checked={legalAccepted} onChange={(event) => setLegalAccepted(event.target.checked)} required disabled={!PUBLIC_SIGNUP_ENABLED} style={{ width: 16, height: 16, marginTop: 2, flex: "0 0 auto" }} />
              <label htmlFor="signup-legal-acceptance" style={{ margin: 0, fontWeight: 400 }}>
                I agree to the <Link href="/terms" target="_blank" rel="noreferrer">Terms</Link> and acknowledge the{" "}
                <Link href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</Link>.
              </label>
            </div>
          ) : null}

          {(isLogin || PUBLIC_SIGNUP_ENABLED) ? (
            <TurnstileChallenge action={isLogin ? "auth_login" : "auth_signup"} onTokenChange={setCaptchaToken} resetKey={captchaResetKey} />
          ) : null}
          {isLogin ? (
            <div style={{ textAlign: "right", marginTop: -6 }}>
              <Link href="/forgot-password" className="tiny">Forgot password?</Link>
            </div>
          ) : null}
          <button className="btn btn-primary" disabled={loading || (!isLogin && !PUBLIC_SIGNUP_ENABLED) || !captchaToken || success || (!isLogin && !legalAccepted)}>
            {loading ? "Please wait…" : isLogin ? "Log in" : PUBLIC_SIGNUP_ENABLED ? "Create account" : "Signup opening shortly"}
          </button>
        </form>

        <div className="auth-links">
          <Link href="/">← Back to website</Link>
          {isLogin ? <Link href="/signup">Create account</Link> : <Link href="/login">Already have an account?</Link>}
        </div>
      </section>
    </main>
  );
}
