import AuthCard from "@/components/AuthCard";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export default function SignupPage() {
  return <AuthCard mode="signup" configured={isSupabaseConfigured()} />;
}
