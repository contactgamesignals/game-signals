import "server-only";

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/supabase/config";

let adminClient: ReturnType<typeof createClient> | null = null;

function requireServiceRoleKey() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  return key;
}

/**
 * Server-only Supabase client for tightly scoped billing/KSeF RPCs.
 * The service-role key is never exposed through NEXT_PUBLIC_* variables.
 */
export function getSupabaseAdminClient() {
  if (adminClient) return adminClient;
  adminClient = createClient(SUPABASE_URL, requireServiceRoleKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return adminClient;
}
