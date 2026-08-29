import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type WorkspaceTrialHistory = {
  redeemedAt: string | null;
  endsAt: string | null;
  hasPaidHistory: boolean;
};

type TrialHistoryRow = {
  redeemed_at?: unknown;
  ends_at?: unknown;
  has_paid_history?: unknown;
};

export async function readWorkspaceTrialHistory(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<WorkspaceTrialHistory> {
  const { data, error } = await supabase
    .rpc("workspace_trial_history", { p_workspace_id: workspaceId })
    .maybeSingle();

  if (error) throw error;

  const row = (data ?? {}) as TrialHistoryRow;
  return {
    redeemedAt: typeof row.redeemed_at === "string" ? row.redeemed_at : null,
    endsAt: typeof row.ends_at === "string" ? row.ends_at : null,
    hasPaidHistory: row.has_paid_history === true,
  };
}
