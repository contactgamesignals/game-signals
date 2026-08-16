"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { COMPANY } from "@/lib/company";

type Props = {
  userId: string;
  email: string;
  initialDisplayName: string;
  workspaceId: string;
  initialWorkspaceName: string;
  canManageBilling: boolean;
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
  canManageBilling,
}: Props) {
  const router = useRouter();
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
    if (!window.confirm(`Permanently delete your ${COMPANY.productName} account and workspace data? Required billing/accounting records may be retained separately where legally required. This cannot be undone.`)) return;

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
      router.push("/");
      router.refresh();
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
            <p>Update how your workspace and account are displayed inside {COMPANY.productName}.</p>
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
            <h2>Operator & legal</h2>
            <p>{COMPANY.productName} is operated by {COMPANY.legalName}.</p>
          </div>
          <span className="plan-pill">Operator</span>
        </div>
        <div className="settings-row">
          <span>Company</span>
          <span>{COMPANY.legalName}</span>
        </div>
        <div className="settings-row">
          <span>Registered office</span>
          <span>{COMPANY.registeredAddress}</span>
        </div>
        <div className="settings-row">
          <span>Company IDs</span>
          <span>KRS {COMPANY.krs} · NIP {COMPANY.nip}</span>
        </div>
        <div className="settings-row">
          <span>Support</span>
          <a href={`mailto:${COMPANY.supportEmail}`}>{COMPANY.supportEmail}</a>
        </div>
        <div className="dashboard-actions" style={{ marginTop: 14 }}>
          <Link className="btn btn-ghost" href="/privacy">Privacy Policy</Link>
          <Link className="btn btn-ghost" href="/terms">Terms</Link>
          <Link className="btn btn-ghost" href="/withdrawal">Withdrawal</Link>
        </div>
      </section>

      {canManageBilling ? (
        <section className="settings-card">
          <div className="settings-row" style={{ borderTop: 0, paddingTop: 0 }}>
            <div>
              <h2>Legacy direct-billing export</h2>
              <p>Download retained Stripe direct-billing records used by the legacy/rollback billing route.</p>
            </div>
            <span className="plan-pill">Owner / admin</span>
          </div>
          <div className="status-message" style={{ marginBottom: 14 }}>
            New subscriptions currently use Paddle Sandbox. These exports are kept for historical direct-billing/accounting records and do not replace Paddle customer documents.
          </div>
          <div className="dashboard-actions">
            <a className="btn btn-ghost" href="/api/accounting/billing-export">Download invoices CSV</a>
            <a className="btn btn-ghost" href="/api/accounting/adjustments-export">Download adjustments CSV</a>
          </div>
        </section>
      ) : null}

      <section className="settings-card">
        <div className="settings-row" style={{ borderTop: 0, paddingTop: 0 }}>
          <div>
            <h2>Danger zone</h2>
            <p>Permanently delete your {COMPANY.productName} account and owned workspace data.</p>
          </div>
          <span className="plan-pill">Permanent</span>
        </div>

        <div className="status-message" style={{ marginBottom: 14 }}>
          Paid subscriptions must be cancelled and fully ended before account deletion. If the workspace has other members, deletion is blocked to protect their data. Billing, tax, accounting, consent and dispute records that must be retained may remain in a separate seller-side archive after the product account is deleted, as described in the Privacy Policy.
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
