"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SettingsTopbarActions({ email }: { email: string }) {
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="app-topbar-right">
      <span>{email}</span>
      <button className="icon-btn" onClick={signOut}>Log out</button>
    </div>
  );
}
