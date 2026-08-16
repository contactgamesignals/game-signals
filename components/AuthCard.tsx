"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { BRAND } from "@/lib/brand";
import { createClient } from "@/lib/supabase/client";

type Props = {
  mode: "login" | "signup";
  configured: boolean;
};

export default function AuthCard({ mode, configured }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
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

    setLoading(true);
    try {
      const supabase = createClient();
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
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
            data: { display_name: displayName.trim() || email.split("@")[0] },
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
            : "Create an account and your first monitoring workspace."}
        </p>

        {message ? <div className={success ? "auth-success" : "auth-error"}>{message}</div> : null}

        <form className="auth-form" onSubmit={submit}>
          {!isLogin ? (
            <label>
              Display name
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Your name"
                autoComplete="name"
              />
            </label>
          ) : null}
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@studio.com"
              autoComplete="email"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
              autoComplete={isLogin ? "current-password" : "new-password"}
              minLength={8}
              required
            />
          </label>
          {isLogin ? (
            <div style={{ textAlign: "right", marginTop: -6 }}>
              <Link href="/forgot-password" className="tiny">Forgot password?</Link>
            </div>
          ) : null}
          <button className="btn btn-primary" disabled={loading}>
            {loading ? "Please wait…" : isLogin ? "Log in" : "Create account"}
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
