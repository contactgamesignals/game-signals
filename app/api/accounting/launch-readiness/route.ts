import { NextResponse } from "next/server";

import { getLaunchReadiness } from "@/lib/launch-readiness";
import { isGameSignalOperator } from "@/lib/operator-access";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  // Launch readiness is global operator/accounting state, not customer-workspace
  // state. A workspace owner/admin role therefore must never grant access.
  if (!isGameSignalOperator(data.user.id)) {
    return NextResponse.json({ error: "Operator access required." }, { status: 403 });
  }

  return NextResponse.json(getLaunchReadiness(), {
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-GameSignal-Live-Gate": "operator-read-only",
    },
  });
}
