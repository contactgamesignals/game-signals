import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RedeemBody = {
  code?: unknown;
};

type RedeemRow = {
  trial_ends_at?: unknown;
  effective_plan?: unknown;
  allowed_games?: unknown;
};

function friendlyTrialError(message: string) {
  if (message.includes("TRIAL_ALREADY_USED")) {
    return "A promotional trial has already been used on this account or workspace.";
  }
  if (message.includes("TRIAL_PAID_PLAN_ACTIVE")) {
    return "This workspace already has an active paid plan.";
  }
  if (message.includes("TRIAL_FORBIDDEN")) {
    return "Only a workspace owner or admin can activate a trial code.";
  }
  if (message.includes("TRIAL_CODE_USED")) {
    return "This trial code has already been used.";
  }
  if (message.includes("TRIAL_CODE_DISABLED")) {
    return "This trial code is no longer available.";
  }
  if (message.includes("TRIAL_CODE_INVALID")) {
    return "This trial code is invalid.";
  }
  return "Could not activate the trial code.";
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as RedeemBody;
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!/^[A-Z0-9][A-Z0-9-]{3,31}$/.test(code)) {
    return NextResponse.json({ error: "Enter a valid trial code." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", authData.user.id)
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    return NextResponse.json({ error: "Could not load the workspace." }, { status: 500 });
  }
  if (!membership) {
    return NextResponse.json({ error: "No workspace found." }, { status: 404 });
  }
  if (membership.role !== "owner" && membership.role !== "admin") {
    return NextResponse.json({ error: "Only a workspace owner or admin can activate a trial code." }, { status: 403 });
  }

  const { data, error } = await supabase
    .rpc("redeem_trial_code", {
      p_workspace_id: membership.workspace_id,
      p_code: code,
    })
    .maybeSingle();

  if (error) {
    const message = friendlyTrialError(error.message);
    const status = error.message.includes("TRIAL_FORBIDDEN") ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }

  const row = (data ?? {}) as RedeemRow;
  const trialEndsAt = typeof row.trial_ends_at === "string" ? row.trial_ends_at : null;
  if (!trialEndsAt) {
    return NextResponse.json({ error: "Could not activate the trial code." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    trialEndsAt,
    plan: String(row.effective_plan ?? "indie"),
    allowedGames: Math.max(0, Number(row.allowed_games ?? 1)),
  });
}
