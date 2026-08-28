import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePlan, type PlanName } from "@/lib/plans";

export type ProductAccessKind = "paid" | "trial" | "none";

export type WorkspaceProductAccess = {
  plan: PlanName;
  accessKind: ProductAccessKind;
  trialEndsAt: string | null;
  allowedGames: number;
};

type ProductAccessRow = {
  effective_plan?: unknown;
  access_kind?: unknown;
  trial_ends_at?: unknown;
  allowed_games?: unknown;
};

export async function readWorkspaceProductAccess(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<WorkspaceProductAccess> {
  const { data, error } = await supabase
    .rpc("workspace_product_access", { p_workspace_id: workspaceId })
    .maybeSingle();

  if (error) throw error;

  const row = (data ?? {}) as ProductAccessRow;
  const accessKind: ProductAccessKind = row.access_kind === "paid" || row.access_kind === "trial"
    ? row.access_kind
    : "none";

  return {
    plan: normalizePlan(row.effective_plan),
    accessKind,
    trialEndsAt: typeof row.trial_ends_at === "string" ? row.trial_ends_at : null,
    allowedGames: Math.max(0, Number(row.allowed_games ?? 0)),
  };
}
