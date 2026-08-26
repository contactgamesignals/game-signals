import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

function safeNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

function hasGoogleIdentity(user: { app_metadata?: Record<string, unknown> }) {
  const provider = user.app_metadata?.provider;
  const providers = user.app_metadata?.providers;
  return provider === "google" || (Array.isArray(providers) && providers.includes("google"));
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        await supabase.auth.signOut();
        return NextResponse.redirect(new URL("/login?error=auth_callback_failed", origin));
      }

      const { data: membership, error: membershipError } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (membershipError) {
        await supabase.auth.signOut();
        return NextResponse.redirect(new URL("/login?error=workspace_lookup_failed", origin));
      }

      if (!membership) {
        if (hasGoogleIdentity(user)) {
          return NextResponse.redirect(new URL("/auth/complete-google-signup", origin));
        }

        await supabase.auth.signOut();
        return NextResponse.redirect(new URL("/login?error=workspace_missing", origin));
      }

      if (next === "/dashboard") {
        const { error: confirmationError } = await supabase.functions.invoke("send-account-agreement-confirmation", {
          body: {},
        });
        if (confirmationError) {
          await supabase.auth.signOut();
          return NextResponse.redirect(new URL("/login?error=agreement_confirmation_failed", origin));
        }
      }
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  return NextResponse.redirect(new URL("/login?error=auth_callback_failed", origin));
}
