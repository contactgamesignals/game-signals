import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export type GameSlotState = {
  active_games: number;
  cooldown_slots: number;
  allowed_slots: number;
  effective_used_slots: number;
  available_slots: number;
  next_slot_available_at: string | null;
};

type CooldownRpcResult = {
  data: GameSlotState[] | null;
  error: { message: string } | null;
};

type CooldownRpcClient = {
  rpc: (
    functionName: "workspace_game_slot_cooldown_state",
    args: { p_workspace_id: string },
  ) => PromiseLike<CooldownRpcResult>;
};

export async function readGameSlotState(workspaceId: string) {
  try {
    const client = getSupabaseAdminClient() as unknown as CooldownRpcClient;
    const { data, error } = await client.rpc("workspace_game_slot_cooldown_state", {
      p_workspace_id: workspaceId,
    });

    if (error) {
      return { state: null, error: error.message };
    }

    return { state: data?.[0] ?? null, error: null };
  } catch (error) {
    return {
      state: null,
      error: error instanceof Error ? error.message : "Could not read game slot cooldown state.",
    };
  }
}
