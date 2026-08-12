import { redirect } from "next/navigation";
import PasswordRecoveryCard from "@/components/PasswordRecoveryCard";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  if (!isSupabaseConfigured()) redirect("/login");
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/forgot-password");
  return <PasswordRecoveryCard mode="reset" />;
}
