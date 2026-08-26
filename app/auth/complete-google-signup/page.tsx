import { redirect } from "next/navigation";
import GoogleSignupCompletion from "@/components/GoogleSignupCompletion";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function hasGoogleIdentity(user: { app_metadata?: Record<string, unknown> }) {
  const provider = user.app_metadata?.provider;
  const providers = user.app_metadata?.providers;
  return provider === "google" || (Array.isArray(providers) && providers.includes("google"));
}

export default async function CompleteGoogleSignupPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membershipError && membership) redirect("/dashboard");
  if (membershipError || !hasGoogleIdentity(user)) {
    redirect("/login?error=google_signup_completion_unavailable");
  }

  return <GoogleSignupCompletion email={user.email ?? "your Google account"} />;
}
