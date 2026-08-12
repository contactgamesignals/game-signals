"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Props = {
  userId: string;
  email: string;
  initialDisplayName: string;
  workspaceId: string;
  initialWorkspaceName: string;
};

type DeleteAccountResponse = {
  ok?: boolean;
  error?: string;
  code?: string;
  requires_billing_portal?: boolean;
};

export default function WorkspaceSettings({
  userId,
  email,
  initialDisplayName,
  workspaceId,
  initialWorkspaceName,
}: Props) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [workspaceName, setWorkspaceName] = useState(initialWorkspaceName);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanDisplayName = displayName.trim();
    const cleanWorkspaceName = workspaceName.trim();
    if (!cleanDisplayName || !cleanWorkspaceName) {
      setError("Display name and workspace name are required.");
      return;
    }

    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const supabase = createClient();
      const [profileResult, workspaceResult] = await Promise.all([
        supabase.from("profiles").update({ display_name: cleanDisplayName }).eq("id", userId),
        supabase.from("workspaces").update({ name: cleanWorkspaceName }).eq("id", workspaceId),
      ]);
      if (profileResult.error) throw profileResult.error;
      if (workspaceResult.error) throw workspaceResult.error;
      setDisplayName(cleanDisplayName);
      setWorkspaceName(cleanWorkspaceName);
      setMessage("Workspace settings saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save workspace settings.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount() {
    if (deleteConfirmation !== "DELETE") return;
    if (!window.confirm("Permanently delete your GameSignal account and workspace data? This cannot be undone.")) return;

    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const supabase = createClient();
      const { data, error: functionError } = await supabase.functions.invoke("delete-account", {
        body: { confirmation: deleteConfirmation },
      });
      if (functionError) throw new Error(functionError.message);
      const result = (data ?? {}) as DeleteAccountResponse;
      if (!result.ok) throw new Error(result.error ?? "Account deletion is not available yet.");
      await supabase.auth.signOut();
      window.location.assign("/");
    } catch (accountError) {
      setDeleteError(accountError instanceof Error ? accountError.message : "Could not delete the account.");
      setDeleteBusy(false);
    }
  }

  return (
    <>
      <section className="settings-card">
        <div className="settings-row" style={{ borderTop: 0, paddingTop: 0 }}>
          <div>
            <h2>Workspace & account</h2>
            <p>Update how your workspace and account are displayed inside GameSignal.</p>
          </div>
          <span className="plan-pill">Account</span>
        </div>

        {message ? <div className="auth-success" style={{ marginBottom: 14 }}>{message}</div> : null}
        {error ? <div className="auth-error" style={{ marginBottom: 14 }}>{error}</div> : null}

        <form className="form-grid" onSubmit={save}>
          <label>
            Display name
            <input className="app-input" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={120} required disabled={busy} />
          </label>
          <label>
            Workspace name
            <input className="app-input" value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} maxLength={120} required disabled={busy} />
          </label>
          <label>
            Login email
            <input className="app-input" value={email} readOnly disabled />
          </label>
          <div className="dashboard-actions">
            <button className="btn btn-primary" disabled={busy}>Save changes</button>
            <Link className="btn btn-ghost" href="/forgot-password">Reset password</Link>
            <a className="btn btn-ghost" href="/api/account/export">Download my data</a>
          </div>
        </form>
      </section>

      <section className="settings-card">
        <div className="settings-row" style={{ borderTop: 0, paddingTop: 0 }}>
          <div>
            <h2>Support</h2>
            <p>Need help with monitoring, billing or a false-positive signal? Contact GameSignal support.</p>
          </div>
          <span className="plan-pill">Support</span>
        </div>
        <div className="settings-row">
          <span>Email</span>
          <a href="mailto:contact.gamesignals@gmail.com">contact.gamesignals@gmail.com</a>
        </div>
      </section>

      <section className="settings-card">
        <div className="settings-row" style={{ borderTop: 0, paddingTop: 0 }}>
          <div>
            <h2>Danger zone</h2>
            <p>Permanently delete your GameSignal account and owned workspace data.</p>
          </div>
          <span className="plan-pill">Permanent</span>
        </div>

        <div className="status-message" style={{ marginBottom: 14 }}>
          Paid subscriptions must be cancelled and fully ended before account deletion. If the workspace has other members, deletion is blocked to protect their data.
        </div>
        {deleteError ? <div className="auth-error" style={{ marginBottom: 14 }}>{deleteError}</div> : null}
        <label>
          Type DELETE to confirm
          <input
            className="app-input"
            value={deleteConfirmation}
            onChange={(event) => setDeleteConfirmation(event.target.value)}
            placeholder="DELETE"
            autoComplete="off"
            disabled={deleteBusy}
          />
        </label>
        <div className="dashboard-actions" style={{ marginTop: 14 }}>
          <button
            type="button"
            className="icon-btn danger"
            disabled={deleteBusy || deleteConfirmation !== "DELETE"}
            onClick={deleteAccount}
          >
            {deleteBusy ? "Deleting…" : "Delete account permanently"}
          </button>
        </div>
      </section>
    </>
  );
}
