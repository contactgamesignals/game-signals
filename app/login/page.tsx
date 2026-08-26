import AuthCard from "@/components/AuthCard";
import { isGoogleAuthEnabled } from "@/lib/supabase/auth-provider-settings";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const revalidate = 60;

export default async function LoginPage() {
  const googleEnabled = isSupabaseConfigured() ? await isGoogleAuthEnabled() : false;
  return <AuthCard mode="login" configured={isSupabaseConfigured()} googleEnabled={googleEnabled} />;
}
