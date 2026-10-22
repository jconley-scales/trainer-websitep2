import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Trainer id -> display name, for client-facing screens.
 *
 * A client cannot read other people's `profiles` rows (RLS), so this goes through
 * the `trainer_public()` SECURITY DEFINER function, which returns only
 * (id, full_name) of trainers. Pass the AUTHENTICATED server client.
 * On error it returns an empty map (and logs) rather than throwing.
 */
export async function getTrainerNames(
  db: SupabaseClient,
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const { data, error } = await db.rpc("trainer_public");
  if (error) {
    // Names are a nicety: never let them hide the client's sessions. Callers
    // fall back to a generic label.
    console.error("trainer_public failed:", error.message);
    return names;
  }
  for (const row of (data ?? []) as { id: string; full_name: string | null }[]) {
    if (row.full_name) names.set(row.id, row.full_name);
  }
  return names;
}
