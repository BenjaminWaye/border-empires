import { RESERVED_COLORS, assignUniqueColor, normalizeHex } from "./player-color-allocation.js";

// AI empire colours, seeded at boot and re-seeded at season rollover. Humans
// are never recoloured (only new picks are checked, see
// docs/map-readability-plan.md), so the AIs yield instead: each is assigned
// against the reserved colours plus every human's current colour, which keeps
// an AI from sitting next to a human on a near-identical shade.
export type SeedAiColorsDeps = {
  aiPlayerIds: Iterable<string>;
  profileStore: {
    listAllNamed: () => Promise<Array<{ playerId: string; tileColor?: string }>>;
    setTileColor: (playerId: string, tileColor: string) => Promise<unknown>;
  };
  profileOverrides: {
    entries: () => IterableIterator<[string, { tileColor?: string }]>;
    upsert: (playerId: string, patch: { tileColor?: string }) => unknown;
  };
  /** Called for each AI whose colour changed from what the overrides held. */
  onColorChanged?: (playerId: string, tileColor: string) => void;
};

export const seedAiColors = async (deps: SeedAiColorsDeps): Promise<Map<string, string>> => {
  const aiIds = new Set(deps.aiPlayerIds);
  const previous = new Map<string, string>();
  const taken = new Set<string>(RESERVED_COLORS);
  for (const profile of await deps.profileStore.listAllNamed()) {
    const color = normalizeHex(profile.tileColor ?? "");
    if (!color || aiIds.has(profile.playerId)) continue;
    taken.add(color);
  }
  for (const [playerId, override] of deps.profileOverrides.entries()) {
    const color = normalizeHex(override.tileColor ?? "");
    if (!color) continue;
    if (aiIds.has(playerId)) previous.set(playerId, color);
    else taken.add(color);
  }
  const assigned = new Map<string, string>();
  for (const aiId of [...aiIds].sort()) {
    const color = assignUniqueColor(aiId, taken);
    taken.add(color);
    assigned.set(aiId, color);
    await deps.profileStore.setTileColor(aiId, color);
    deps.profileOverrides.upsert(aiId, { tileColor: color });
    if (previous.has(aiId) && previous.get(aiId) !== color) deps.onColorChanged?.(aiId, color);
  }
  return assigned;
};
