import AuthCard from "@/components/AuthCard";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export default function LoginPage() {
  return <AuthCard mode="login" configured={isSupabaseConfigured()} />;
}
