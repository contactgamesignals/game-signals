import { authorizeRequest, json, jsonHeaders, serviceClient } from "../_shared/core.ts";

type ConfirmationRow = {
  id: string;
  recipient_email: string;
  confirmation_text: string;
  confirmation_sha256: string;
  delivery_attempts: number;
};

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const BATCH_LIMIT = 10;

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

function idempotencyKey(row: ConfirmationRow) {
  return `contract-confirmation/${row.id}/${row.confirmation_sha256}`;
}

async function transition(
  supabase: ReturnType<typeof serviceClient>,
  row: ConfirmationRow,
  target: "delivered" | "retryable" | "failed" | "needs_review",
  options: { providerMessageId?: string | null; error?: string | null } = {},
) {
  const { data, error } = await supabase.rpc("transition_billing_contract_confirmation_delivery", {
    p_confirmation_id: row.id,
    p_expected_sha256: row.confirmation_sha256,
    p_target_status: target,
    p_provider_message_id: options.providerMessageId ?? null,
    p_error: options.error?.slice(0, 4000) ?? null,
  });
  if (error) throw new Error(`Could not persist contract-confirmation ${target} transition: ${error.message}`);
  if (data !== true) throw new Error(`Contract-confirmation ${target} transition did not update exactly one row.`);
}

function providerError(payload: unknown, status: number) {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const object = payload as Record<string, unknown>;
    const name = typeof object.name === "string" ? object.name : null;
    const message = typeof object.message === "string" ? object.message : null;
    if (name && message) return `Resend HTTP ${status} ${name}: ${message}`;
    if (message) return `Resend HTTP ${status}: ${message}`;
  }
  return `Resend HTTP ${status}.`;
}

async function deliverOne(
  supabase: ReturnType<typeof serviceClient>,
  row: ConfirmationRow,
  apiKey: string,
  fromEmail: string,
) {
  if (!/^[0-9a-f]{64}$/.test(row.confirmation_sha256)) {
    await transition(supabase, row, "failed", { error: "Stored contract-confirmation SHA-256 is invalid." });
    return "failed" as const;
  }
  if (!row.confirmation_text || row.confirmation_text.length < 100) {
    await transition(supabase, row, "failed", { error: "Stored contract-confirmation text is missing or unexpectedly short." });
    return "failed" as const;
  }
  if (!row.recipient_email?.trim()) {
    await transition(supabase, row, "failed", { error: "Contract-confirmation recipient email is missing." });
    return "failed" as const;
  }

  let response: Response;
  try {
    response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey(row),
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [row.recipient_email.trim()],
        subject: "Who Plays My Game — confirmation of your subscription contract",
        text: row.confirmation_text,
        html: `<pre style="white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;line-height:1.55">${escapeHtml(row.confirmation_text)}</pre>`,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    // A network/timeout error after POST begins is ambiguous: the provider may
    // have accepted the email. Never put it back into automatic retry.
    await transition(supabase, row, "needs_review", {
      error: "Ambiguous Resend network failure after delivery POST began; automatic retry disabled.",
    });
    return "needs_review" as const;
  }

  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (response.ok) {
    const providerId = typeof payload?.id === "string" ? payload.id.trim() : "";
    if (!providerId) {
      await transition(supabase, row, "needs_review", {
        error: "Resend returned success without a provider message ID; automatic retry disabled.",
      });
      return "needs_review" as const;
    }
    await transition(supabase, row, "delivered", { providerMessageId: providerId });
    return "delivered" as const;
  }

  const errorText = providerError(payload, response.status);
  if (response.status === 429 || response.status >= 500) {
    await transition(supabase, row, "retryable", { error: errorText });
    return "retryable" as const;
  }

  if (response.status === 409 || response.status === 408) {
    await transition(supabase, row, "needs_review", { error: `${errorText} Automatic retry disabled.` });
    return "needs_review" as const;
  }

  await transition(supabase, row, "failed", { error: errorText });
  return "failed" as const;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: jsonHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const auth = await authorizeRequest(request);
    if (!auth.internal) return json({ error: "Forbidden." }, 403);

    const apiKey = required(Deno.env.get("RESEND_API_KEY"), "RESEND_API_KEY");
    const fromEmail = required(Deno.env.get("RESEND_FROM_EMAIL"), "RESEND_FROM_EMAIL");

    const supabase = serviceClient();
    const { data, error } = await supabase.rpc("claim_billing_contract_confirmations_for_delivery", {
      p_limit: BATCH_LIMIT,
    });
    if (error) throw new Error(`Could not claim contract confirmations: ${error.message}`);

    const rows = (Array.isArray(data) ? data : []) as ConfirmationRow[];
    const summary = {
      claimed: rows.length,
      delivered: 0,
      retryable: 0,
      failed: 0,
      needs_review: 0,
      transition_errors: 0,
    };

    for (const row of rows) {
      try {
        const result = await deliverOne(supabase, row, apiKey, fromEmail);
        summary[result] += 1;
      } catch (error) {
        summary.transition_errors += 1;
        console.error("Contract-confirmation delivery transition error", row.id, error);
      }
    }

    return json({ ok: true, mode: "transactional_contract_confirmation", ...summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Contract-confirmation delivery failed.";
    const status = /Unauthorized/.test(message) ? 401 : /Forbidden/.test(message) ? 403 : /not configured/.test(message) ? 503 : 500;
    return json({ error: message.slice(0, 500) }, status);
  }
});
