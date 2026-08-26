import { NextResponse } from "next/server";
import { LEGAL_VERSIONS } from "@/lib/legal-versions";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin && origin !== requestUrl.origin) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { accepted?: boolean } | null;
  if (body?.accepted !== true) {
    return NextResponse.json(
      { error: "You must agree to the Terms and acknowledge the Privacy Policy." },
      { status: 400 },
    );
  }

  const admin = getSupabaseAdminClient();
  const { data: workspaceId, error } = await admin.rpc("complete_google_oauth_signup", {
    p_user_id: user.id,
    p_terms_version: LEGAL_VERSIONS.terms,
    p_privacy_version: LEGAL_VERSIONS.privacy,
  });

  if (error || !workspaceId) {
    console.error("Google OAuth signup provisioning failed", {
      userId: user.id,
      code: error?.code ?? null,
      message: error?.message ?? "No workspace returned",
    });
    return NextResponse.json(
      { error: "We could not finish creating your workspace. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, workspaceId });
}
