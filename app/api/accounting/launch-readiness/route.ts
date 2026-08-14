import { NextResponse } from "next/server";

import { getLaunchReadiness } from "@/lib/launch-readiness";
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

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("user_id", data.user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  if (membership.role !== "owner" && membership.role !== "admin") {
    return NextResponse.json({ error: "Only workspace owners and admins can view launch readiness." }, { status: 403 });
  }

  return NextResponse.json(getLaunchReadiness(), {
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-GameSignal-Live-Gate": "administrative-read-only",
    },
  });
}
