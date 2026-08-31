import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export type TrialAttributionRow = {
  code: string;
  label: string | null;
  assignedTo: string | null;
  redemptions: number;
  purchases: number;
};

export type ProductFunnelSnapshot = {
  cohortSince: string | null;
  generatedAt: string | null;
  signups: number;
  addedGame: number;
  trialRedeemed: number;
  discordConnectedCurrent: number;
  checkoutStarted: number;
  purchaseCompleted: number;
  trialAttribution: TrialAttributionRow[];
};

type RecordValue = Record<string, unknown>;

function objectValue(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function countValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function attributionRows(value: unknown): TrialAttributionRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const row = objectValue(entry);
    const code = stringValue(row.code);
    if (!code) return [];
    return [{
      code,
      label: stringValue(row.label),
      assignedTo: stringValue(row.assigned_to),
      redemptions: countValue(row.redemptions),
      purchases: countValue(row.purchases),
    }];
  });
}

export async function readProductFunnelSnapshot(since: string | null): Promise<ProductFunnelSnapshot> {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.rpc("operator_product_funnel_snapshot", { p_since: since });
  if (error) throw error;

  const row = objectValue(data);
  return {
    cohortSince: stringValue(row.cohort_since),
    generatedAt: stringValue(row.generated_at),
    signups: countValue(row.signups),
    addedGame: countValue(row.added_game),
    trialRedeemed: countValue(row.trial_redeemed),
    discordConnectedCurrent: countValue(row.discord_connected_current),
    checkoutStarted: countValue(row.checkout_started),
    purchaseCompleted: countValue(row.purchase_completed),
    trialAttribution: attributionRows(row.trial_attribution),
  };
}
