import { RESERVED_COLORS, normalizeHex } from "./player-color-allocation.js";

// Every colour another player already holds, plus the reserved ones. Extracted
// from gateway-app.ts (already over its line cap) so it can be shared and
// tested on its own.
export const buildTakenColorSet = async (
  excludePlayerId: string,
  deps: {
    profileStore: { listAllNamed: () => Promise<Array<{ playerId: string; tileColor?: string }>> };
    profileOverrides: { entries: () => IterableIterator<[string, { tileColor?: string }]> };
  }
): Promise<Set<string>> => {
  const taken = new Set<string>(RESERVED_COLORS);
  // 1. stored profiles
  for (const profile of await deps.profileStore.listAllNamed()) {
    if (profile.playerId === excludePlayerId) continue;
    const n = normalizeHex(profile.tileColor ?? "");
    if (n) taken.add(n);
  }
  // 2. live overrides (supersede stored for active sessions)
  for (const [pid, override] of deps.profileOverrides.entries()) {
    if (pid === excludePlayerId) continue;
    const n = normalizeHex(override.tileColor ?? "");
    if (n) taken.add(n);
  }
  return taken;
};
