import { redirect } from "next/navigation";
import LandingPage from "@/components/LandingPage";
import MarketingRealityPatch from "@/components/MarketingRealityPatch";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (data.user) redirect("/dashboard");
  }

  return (
    <>
      <LandingPage />
      <MarketingRealityPatch />
    </>
  );
}
