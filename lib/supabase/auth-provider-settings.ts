import "server-only";

import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase/config";

type AuthSettingsResponse = {
  external?: Record<string, boolean | undefined>;
};

export async function isGoogleAuthEnabled() {
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      },
      next: { revalidate: 60 },
    });

    if (!response.ok) return false;
    const settings = (await response.json()) as AuthSettingsResponse;
    return settings.external?.google === true;
  } catch {
    return false;
  }
}
