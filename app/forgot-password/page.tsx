import { redirect } from "next/navigation";
import PasswordRecoveryCard from "@/components/PasswordRecoveryCard";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export default function ForgotPasswordPage() {
  if (!isSupabaseConfigured()) redirect("/login");
  return <PasswordRecoveryCard mode="request" />;
}
