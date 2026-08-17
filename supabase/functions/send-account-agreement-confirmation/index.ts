import { authorizeRequest, json, jsonHeaders, serviceClient } from "../_shared/core.ts";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const TERMS_VERSION = "2026-08-17-v1";
const PRIVACY_VERSION = "2026-08-17-v1";
const WITHDRAWAL_VERSION = "2026-08-17-v1";
const COMPANY_NAME = "Lumino Games sp. z o.o.";
const COMPANY_ADDRESS = "ul. Ujastek 1, 31-752 Kraków, Poland";
const COMPANY_KRS = "0000910452";
const COMPANY_NIP = "6762600090";
const COMPANY_REGON = "389433660";
const SUPPORT_EMAIL = "whoplaysmygame@gmail.com";
const PUBLIC_SUPPORT_PHONE = "+48 694 366 395";
const SITE_URL = "https://www.whoplaysmygame.com";

type AcceptanceRow = {
  id: string;
  user_id: string;
  terms_version: string;
  privacy_version: string;
  accepted_at: string;
  confirmation_text: string | null;
  confirmation_sha256: string | null;
  confirmation_status: "pending" | "sending" | "delivered" | "failed" | "needs_review";
  confirmation_provider_message_id: string | null;
  confirmation_attempts: number;
};

function required(value: string | undefined, label: string) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${label} is not configured.`);
  return normalized;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function buildConfirmationText(input: { email: string; acceptedAt: string; phone: string }) {
  return `WHO PLAYS MY GAME — CONFIRMATION OF YOUR ACCOUNT AGREEMENT

This email is your durable-medium confirmation of the online agreement concluded when you created and confirmed your Who Plays My Game account.

Operator
${COMPANY_NAME}
${COMPANY_ADDRESS}
KRS: ${COMPANY_KRS}
NIP: ${COMPANY_NIP}
REGON: ${COMPANY_REGON}
Email: ${SUPPORT_EMAIL}
Phone: ${input.phone}
Website: ${SITE_URL}

Account
Email: ${input.email}
Agreement accepted: ${input.acceptedAt}
Terms version: ${TERMS_VERSION}
Privacy version: ${PRIVACY_VERSION}
Withdrawal information version: ${WITHDRAWAL_VERSION}

Service agreed at signup
- Who Plays My Game is a web-based creator-monitoring service for game developers and publishers.
- The Free public-beta plan costs 0 USD and creates no recurring payment obligation.
- Free includes one active tracked game, YouTube video monitoring, Twitch live-stream monitoring and the authenticated creator-signal dashboard.
- Kick monitoring is not currently available.
- Paid subscriptions are not part of this Free account agreement and require a separate Paddle checkout when Paddle LIVE sales are enabled.
- The service requires internet access, a current mainstream browser and a working email account for authentication.
- Monitoring relies on third-party platforms/APIs, so complete or immediate detection of every public mention cannot be guaranteed.

Duration and termination
The Free account continues until it is deleted or otherwise terminated under the Terms. You can request account deletion through the product subject to legal-record retention and other safeguards described in the Terms and Privacy Policy.

Withdrawal
If mandatory consumer law gives you a right to withdraw from this distance contract, the statutory period is generally 14 days from conclusion of the contract. Starting the Free service does not by itself waive mandatory withdrawal rights. To withdraw, send an unambiguous statement before the deadline to ${SUPPORT_EMAIL} or to the registered address above.

Model withdrawal statement:
"I hereby give notice that I withdraw from my contract for the Who Plays My Game service concluded on ${input.acceptedAt}. Account email: ${input.email}. Name: __________. Date: __________."

Complaints and support
Product-access, functionality, conformity, privacy or legal requests can be sent to ${SUPPORT_EMAIL} or through the contact details above. Mandatory consumer remedies are not excluded.

Personal data
Account and service data are processed as described in Privacy Policy version ${PRIVACY_VERSION}. Payment-card data is not collected for the Free plan.

Applicable documents accepted at signup
Terms: ${SITE_URL}/terms
Privacy Policy: ${SITE_URL}/privacy
Withdrawal information: ${SITE_URL}/withdrawal

The links above are provided for convenience. The information in this email is itself the stored confirmation sent to you and is intended to remain reproducible in unchanged form.
`;
}

function providerError(payload: unknown, status: number) {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>;
    const message = typeof record.message === "string" ? record.message : null;
    if (message) return `Resend HTTP ${status}: ${message}`;
  }
  return `Resend HTTP ${status}.`;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: jsonHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const auth = await authorizeRequest(request);
    if (auth.internal || !auth.userId) return json({ error: "Forbidden." }, 403);

    const supabase = serviceClient();
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(auth.userId);
    const recipient = userData.user?.email?.trim();
    if (userError || !recipient) throw new Error("Authenticated account email could not be resolved.");

    const { data: rowData, error: rowError } = await supabase
      .from("account_legal_acceptances")
      .select("id,user_id,terms_version,privacy_version,accepted_at,confirmation_text,confirmation_sha256,confirmation_status,confirmation_provider_message_id,confirmation_attempts")
      .eq("user_id", auth.userId)
      .eq("terms_version", TERMS_VERSION)
      .eq("privacy_version", PRIVACY_VERSION)
      .eq("source", "signup")
      .order("accepted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (rowError) throw new Error(`Could not read account agreement acceptance: ${rowError.message}`);

    if (!rowData) return json({ ok: true, legacy_account: true });

    let row = rowData as AcceptanceRow;
    if (row.confirmation_status === "delivered") {
      return json({ ok: true, already_delivered: true, provider_message_id: row.confirmation_provider_message_id });
    }
    if (row.confirmation_status === "sending" || row.confirmation_status === "needs_review") {
      return json({ error: "Agreement confirmation delivery needs reconciliation before another send." }, 409);
    }

    const apiKey = required(Deno.env.get("RESEND_API_KEY"), "RESEND_API_KEY");
    const fromEmail = Deno.env.get("ACCOUNT_AGREEMENT_FROM_EMAIL")?.trim()
      || Deno.env.get("RESEND_FROM_EMAIL")?.trim()
      || "Who Plays My Game <updates@auth.whoplaysmygame.com>";
    const supportPhone = Deno.env.get("GAMESIGNAL_SUPPORT_PHONE")?.trim() || PUBLIC_SUPPORT_PHONE;

    if (!row.confirmation_text || !row.confirmation_sha256) {
      const confirmationText = buildConfirmationText({ email: recipient, acceptedAt: row.accepted_at, phone: supportPhone });
      const confirmationHash = await sha256(confirmationText);
      const { data: prepared, error: prepareError } = await supabase
        .from("account_legal_acceptances")
        .update({ confirmation_text: confirmationText, confirmation_sha256: confirmationHash, confirmation_status: "pending", confirmation_last_error: null })
        .eq("id", row.id)
        .is("confirmation_text", null)
        .select("id,user_id,terms_version,privacy_version,accepted_at,confirmation_text,confirmation_sha256,confirmation_status,confirmation_provider_message_id,confirmation_attempts")
        .maybeSingle();
      if (prepareError) throw new Error(`Could not freeze account agreement confirmation: ${prepareError.message}`);
      if (prepared) row = prepared as AcceptanceRow;
      else {
        const { data: refreshed, error: refreshError } = await supabase
          .from("account_legal_acceptances")
          .select("id,user_id,terms_version,privacy_version,accepted_at,confirmation_text,confirmation_sha256,confirmation_status,confirmation_provider_message_id,confirmation_attempts")
          .eq("id", row.id)
          .single();
        if (refreshError || !refreshed) throw new Error("Could not reload frozen account agreement confirmation.");
        row = refreshed as AcceptanceRow;
      }
    }

    if (!row.confirmation_text || !row.confirmation_sha256) throw new Error("Frozen account agreement confirmation is incomplete.");
    if (await sha256(row.confirmation_text) !== row.confirmation_sha256) throw new Error("Frozen account agreement confirmation hash mismatch.");

    const { data: claimed, error: claimError } = await supabase
      .from("account_legal_acceptances")
      .update({ confirmation_status: "sending", confirmation_attempts: row.confirmation_attempts + 1, confirmation_last_error: null })
      .eq("id", row.id)
      .in("confirmation_status", ["pending", "failed"])
      .select("id")
      .maybeSingle();
    if (claimError) throw new Error(`Could not claim agreement confirmation delivery: ${claimError.message}`);
    if (!claimed) return json({ error: "Agreement confirmation is already being processed." }, 409);

    let response: Response;
    try {
      response = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `account-agreement/${row.id}/${row.confirmation_sha256}`,
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [recipient],
          subject: "Who Plays My Game — confirmation of your account agreement",
          text: row.confirmation_text,
          html: `<pre style="white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;line-height:1.55">${escapeHtml(row.confirmation_text)}</pre>`,
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      await supabase.from("account_legal_acceptances").update({
        confirmation_status: "needs_review",
        confirmation_last_error: "Ambiguous Resend network failure after delivery POST began; automatic resend disabled.",
      }).eq("id", row.id);
      return json({ error: "Agreement confirmation delivery outcome is ambiguous and needs review." }, 503);
    }

    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (response.ok) {
      const providerId = typeof payload?.id === "string" ? payload.id.trim() : "";
      if (!providerId) {
        await supabase.from("account_legal_acceptances").update({
          confirmation_status: "needs_review",
          confirmation_last_error: "Resend returned success without a provider message ID.",
        }).eq("id", row.id);
        return json({ error: "Agreement confirmation provider response needs review." }, 503);
      }
      const { error: deliveredError } = await supabase.from("account_legal_acceptances").update({
        confirmation_status: "delivered",
        confirmation_provider_message_id: providerId,
        confirmation_sent_at: new Date().toISOString(),
        confirmation_last_error: null,
      }).eq("id", row.id).eq("confirmation_status", "sending");
      if (deliveredError) throw new Error(`Email was accepted but delivery evidence could not be persisted: ${deliveredError.message}`);
      return json({ ok: true, delivered: true, provider_message_id: providerId });
    }

    const errorText = providerError(payload, response.status).slice(0, 4000);
    const retryable = response.status === 429 || response.status >= 500;
    await supabase.from("account_legal_acceptances").update({
      confirmation_status: retryable ? "failed" : "needs_review",
      confirmation_last_error: errorText,
    }).eq("id", row.id);
    return json({ error: errorText, retryable }, retryable ? 503 : 500);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Account agreement confirmation failed.";
    const status = /Unauthorized/.test(message) ? 401 : /Forbidden/.test(message) ? 403 : /not configured/.test(message) ? 503 : 500;
    return json({ error: message.slice(0, 500) }, status);
  }
});
