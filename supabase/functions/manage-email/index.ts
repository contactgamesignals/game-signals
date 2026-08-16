import { createClient } from "npm:@supabase/supabase-js@2";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers });
}

function validEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function sendResendEmail(to: string, subject: string, text: string, html: string, idempotencyKey: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM_EMAIL");
  if (!apiKey || !from) throw new Error("Email provider is not configured.");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ from, to: [to], subject, text, html }),
  });

  if (!response.ok) {
    throw new Error(`Email provider rejected the request (${response.status}): ${(await response.text()).slice(0, 800)}`);
  }

  return response.json().catch(() => ({}));
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authHeader = request.headers.get("Authorization");
    if (!supabaseUrl || !anonKey || !serviceKey || !authHeader) return json({ error: "Unauthorized." }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "Unauthorized." }, 401);

    const body = await request.json().catch(() => ({})) as {
      action?: "status" | "upsert" | "delete" | "test";
      workspace_id?: string;
      email?: string;
      minimum_signal_score?: number;
      minimum_live_viewers?: number;
    };
    if (!body.workspace_id || !body.action) return json({ error: "Missing workspace or action." }, 400);

    const [{ data: membership, error: membershipError }, { data: subscription }] = await Promise.all([
      userClient.from("workspace_members").select("role").eq("workspace_id", body.workspace_id).eq("user_id", authData.user.id).maybeSingle(),
      userClient.from("subscriptions").select("plan, status").eq("workspace_id", body.workspace_id).maybeSingle(),
    ]);
    if (membershipError || !membership) return json({ error: "Forbidden." }, 403);

    const plan = String(subscription?.plan ?? "free");
    const subscriptionActive = subscription?.status === "active" || subscription?.status === "trialing";
    const allowed = subscriptionActive && (plan === "indie" || plan === "studio" || plan === "publisher");
    const providerConfigured = Boolean(Deno.env.get("RESEND_API_KEY") && Deno.env.get("RESEND_FROM_EMAIL"));

    const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: existing, error: channelError } = await service
      .from("notification_channels")
      .select("id, enabled, minimum_signal_score, minimum_live_viewers, destination")
      .eq("workspace_id", body.workspace_id)
      .eq("type", "email")
      .limit(1)
      .maybeSingle();
    if (channelError) throw channelError;

    if (body.action === "status") {
      return json({
        configured: Boolean(existing),
        enabled: existing?.enabled ?? false,
        destination: existing?.destination ?? authData.user.email ?? "",
        minimum_signal_score: existing?.minimum_signal_score ?? 0,
        minimum_live_viewers: existing?.minimum_live_viewers ?? 0,
        allowed,
        plan,
        provider_configured: providerConfigured,
      });
    }

    if (membership.role !== "owner" && membership.role !== "admin") {
      return json({ error: "Only workspace owners and admins can change email settings." }, 403);
    }

    if (body.action === "delete") {
      if (existing) {
        const { error } = await service.from("notification_channels").delete().eq("id", existing.id);
        if (error) throw error;
      }
      return json({ ok: true, configured: false, allowed, plan, provider_configured: providerConfigured });
    }

    if (!allowed) {
      return json({ error: "Email alerts require an active paid plan." }, 403);
    }

    if (body.action === "test") {
      if (!providerConfigured) return json({ error: "Email provider is not configured yet." }, 503);
      if (!existing) return json({ error: "Configure an email destination first." }, 409);
      await sendResendEmail(
        existing.destination,
        "Who Plays My Game test notification",
        "Your Who Plays My Game email alerts are connected correctly.",
        `<div style="font-family:system-ui,sans-serif;line-height:1.5"><h2>Who Plays My Game test notification</h2><p>Your email alerts are connected correctly.</p><p style="color:#667085">Workspace: ${escapeHtml(body.workspace_id)}</p></div>`,
        `gamesignal-test:${body.workspace_id}:${crypto.randomUUID()}`,
      );
      return json({ ok: true });
    }

    if (!providerConfigured) return json({ error: "Email provider is not configured yet." }, 503);
    const email = body.email?.trim().toLowerCase() ?? "";
    if (!validEmail(email)) return json({ error: "Enter a valid email address." }, 400);
    const minimumSignalScore = Math.max(0, Math.min(100, Math.round(Number(body.minimum_signal_score ?? 0))));
    const minimumLiveViewers = Math.max(0, Math.round(Number(body.minimum_live_viewers ?? 0)));

    const { error: upsertError } = await service.from("notification_channels").upsert({
      workspace_id: body.workspace_id,
      type: "email",
      destination: email,
      enabled: true,
      minimum_signal_score: minimumSignalScore,
      minimum_live_viewers: minimumLiveViewers,
    }, { onConflict: "workspace_id,type" });
    if (upsertError) throw upsertError;

    return json({
      ok: true,
      configured: true,
      destination: email,
      allowed,
      plan,
      provider_configured: providerConfigured,
      minimum_signal_score: minimumSignalScore,
      minimum_live_viewers: minimumLiveViewers,
    });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Unexpected error." }, 500);
  }
});
