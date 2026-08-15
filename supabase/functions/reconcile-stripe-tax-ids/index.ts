import { authorizeRequest, json, jsonHeaders, serviceClient } from "../_shared/core.ts";

type InvoiceRow = {
  id: string;
  stripe_invoice_id: string;
  stripe_customer_id: string | null;
  customer_tax_ids: unknown;
  buyer_type: string | null;
  customer_country: string | null;
  stripe_status: string | null;
  livemode: boolean;
};

type SnapshotTaxId = Record<string, unknown> & {
  type?: string | null;
  value?: string | null;
  verification_status?: string | null;
};

type StripeTaxId = {
  id?: string;
  type?: string;
  value?: string;
  verification?: { status?: string | null } | null;
};

type StripeMode = {
  livemode: boolean;
  label: "stripe_sandbox" | "stripe_live_explicitly_unlocked";
};

const STRIPE_API_VERSION = "2026-06-24.dahlia";
const STRIPE_TEST_KEY_PATTERN = /^sk_test_[A-Za-z0-9_]+$/;
const STRIPE_LIVE_KEY_PATTERN = /^sk_live_[A-Za-z0-9_]+$/;
const LIVE_UNLOCK_ENV = "GAMESIGNAL_STRIPE_LIVE_TAX_ID_RECONCILER_UNLOCK";
const LIVE_UNLOCK_PHRASE = "I_UNDERSTAND_STRIPE_LIVE_TAX_ID_RECONCILIATION_HAS_ACCOUNTING_EFFECT";
const MAX_INVOICES_PER_RUN = 50;
const MAX_TAX_ID_PAGES = 10;

function resolveStripeMode(secretKey: string): StripeMode {
  if (STRIPE_TEST_KEY_PATTERN.test(secretKey)) {
    return { livemode: false, label: "stripe_sandbox" };
  }
  if (STRIPE_LIVE_KEY_PATTERN.test(secretKey)) {
    if (Deno.env.get(LIVE_UNLOCK_ENV) !== LIVE_UNLOCK_PHRASE) {
      throw new Error("Stripe LIVE Tax ID reconciliation is locked pending explicit accounting approval.");
    }
    return { livemode: true, label: "stripe_live_explicitly_unlocked" };
  }
  throw new Error("Stripe Tax ID reconciler requires a recognized restricted test or live secret key.");
}

function taxIdKey(type: unknown, value: unknown) {
  if (typeof type !== "string" || typeof value !== "string") return null;
  const normalizedType = type.trim();
  const normalizedValue = value.trim();
  if (!normalizedType || !normalizedValue) return null;
  return `${normalizedType}\u0000${normalizedValue}`;
}

function snapshotTaxIds(value: unknown): SnapshotTaxId[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is SnapshotTaxId => Boolean(item) && typeof item === "object" && !Array.isArray(item));
}

function needsVerificationRefresh(items: SnapshotTaxId[]) {
  return items.some((item) => {
    const key = taxIdKey(item.type, item.value);
    return Boolean(key) && String(item.verification_status ?? "").toLowerCase() !== "verified";
  });
}

async function stripeRequest(path: string, secretKey: string) {
  let response: Response;
  try {
    response = await fetch(`https://api.stripe.com${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Stripe-Version": STRIPE_API_VERSION,
      },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error("Stripe Tax ID request failed before a response was received.");
  }
  if (!response.ok) throw new Error(`Stripe Tax ID request failed with HTTP ${response.status}.`);
  try {
    return await response.json() as { data?: StripeTaxId[]; has_more?: boolean };
  } catch {
    throw new Error("Stripe Tax ID response is not valid JSON.");
  }
}

async function customerTaxIds(customerId: string, secretKey: string) {
  const result: StripeTaxId[] = [];
  let startingAfter: string | null = null;

  for (let page = 0; page < MAX_TAX_ID_PAGES; page += 1) {
    const params = new URLSearchParams({ limit: "100" });
    if (startingAfter) params.set("starting_after", startingAfter);
    const payload = await stripeRequest(
      `/v1/customers/${encodeURIComponent(customerId)}/tax_ids?${params.toString()}`,
      secretKey,
    );
    const items = Array.isArray(payload.data) ? payload.data : [];
    result.push(...items);
    if (payload.has_more !== true) return result;
    const lastId = items.at(-1)?.id?.trim();
    if (!lastId) throw new Error("Stripe Tax ID pagination did not return a cursor.");
    startingAfter = lastId;
  }

  throw new Error("Stripe Tax ID pagination exceeded the safety limit.");
}

function enrichSnapshot(snapshot: SnapshotTaxId[], current: StripeTaxId[]) {
  const verificationByExactTaxId = new Map<string, string>();
  for (const taxId of current) {
    const key = taxIdKey(taxId.type, taxId.value);
    const status = taxId.verification?.status?.trim().toLowerCase();
    if (key && status) verificationByExactTaxId.set(key, status);
  }

  let changed = false;
  let matched = 0;
  const enriched = snapshot.map((item) => {
    const key = taxIdKey(item.type, item.value);
    if (!key) return item;
    const status = verificationByExactTaxId.get(key);
    if (!status) return item;
    matched += 1;
    if (String(item.verification_status ?? "").toLowerCase() === status) return item;
    changed = true;
    return { ...item, verification_status: status };
  });
  return { enriched, changed, matched };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: jsonHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const auth = await authorizeRequest(request);
    if (!auth.internal) return json({ error: "Forbidden" }, 403);

    const secretKey = Deno.env.get("STRIPE_SECRET_KEY")?.trim() ?? "";
    const stripeMode = resolveStripeMode(secretKey);

    const supabase = serviceClient();
    const { data, error } = await supabase
      .from("billing_invoice_records")
      .select("id, stripe_invoice_id, stripe_customer_id, customer_tax_ids, buyer_type, customer_country, stripe_status, livemode")
      .eq("buyer_type", "company")
      .eq("customer_country", "PL")
      .eq("stripe_status", "paid")
      .eq("livemode", stripeMode.livemode)
      .not("stripe_customer_id", "is", null)
      .order("updated_at", { ascending: true })
      .limit(MAX_INVOICES_PER_RUN);
    if (error) throw error;

    let inspected = 0;
    let candidates = 0;
    let updated = 0;
    let exactMatches = 0;
    let unmatched = 0;
    let stripeErrors = 0;

    for (const invoice of (data ?? []) as InvoiceRow[]) {
      inspected += 1;
      const snapshot = snapshotTaxIds(invoice.customer_tax_ids);
      if (!snapshot.length || !needsVerificationRefresh(snapshot) || !invoice.stripe_customer_id) continue;
      candidates += 1;

      try {
        const current = await customerTaxIds(invoice.stripe_customer_id, secretKey);
        const result = enrichSnapshot(snapshot, current);
        exactMatches += result.matched;
        if (!result.matched) unmatched += 1;
        if (!result.changed) continue;

        const { error: updateError } = await supabase
          .from("billing_invoice_records")
          .update({
            customer_tax_ids: result.enriched,
            updated_at: new Date().toISOString(),
          })
          .eq("id", invoice.id)
          .eq("livemode", stripeMode.livemode);
        if (updateError) throw updateError;
        updated += 1;
      } catch {
        stripeErrors += 1;
      }
    }

    return json({
      ok: true,
      mode: stripeMode.label,
      livemode: stripeMode.livemode,
      inspected,
      candidates,
      updated,
      exact_matches: exactMatches,
      unmatched,
      stripe_errors: stripeErrors,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stripe Tax ID reconciliation failed.";
    const status = /Unauthorized/.test(message)
      ? 401
      : /Forbidden/.test(message)
        ? 403
        : /LIVE Tax ID reconciliation is locked/.test(message)
          ? 503
          : 500;
    return json({ error: message.slice(0, 500) }, status);
  }
});
