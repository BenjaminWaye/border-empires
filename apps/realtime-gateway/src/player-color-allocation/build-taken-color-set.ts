import { aiDisplayNameForId, type EmpireColorEntry } from "@border-empires/shared";
import { RESERVED_COLORS, normalizeHex } from "./player-color-allocation.js";
import { TakenColorSet } from "./taken-color-set.js";

/**
 * A stored profile written within this window counts as an active empire
 * even when its player has not logged in since this gateway booted. Older
 * profiles only block their exact colour: checking every account ever made
 * by perceptual distance would soon leave no colour to pick.
 */
export const ACTIVE_EMPIRE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/** Barbarian land is drawn in the reserved grey, so no empire may sit near it either. */
const BARBARIAN_ENTRY_NAME = "the barbarians";

type StoredColorProfile = { playerId: string; name?: string; tileColor?: string; updatedAt?: number };

export type TakenColorSetDeps = {
  profileStore: { listAllNamed: () => Promise<StoredColorProfile[]> };
  profileOverrides: { entries: () => IterableIterator<[string, { name?: string; tileColor?: string }]> };
  now?: () => number;
};

// Every colour another player already holds, plus the reserved ones, and the
// active empires a new pick must keep its distance from. Extracted from
// gateway-app.ts (already over its line cap) so it can be shared and tested
// on its own.
export const buildTakenColorSet = async (excludePlayerId: string, deps: TakenColorSetDeps): Promise<TakenColorSet> => {
  const exact = new Set<string>(RESERVED_COLORS);
  const active = new Map<string, EmpireColorEntry>();
  for (const color of RESERVED_COLORS) active.set(`reserved:${color}`, { playerId: "barbarian", name: BARBARIAN_ENTRY_NAME, color });
  const activeSince = (deps.now ?? Date.now)() - ACTIVE_EMPIRE_WINDOW_MS;
  const storedNames = new Map<string, string>();
  // 1. stored profiles
  for (const profile of await deps.profileStore.listAllNamed()) {
    if (profile.playerId === excludePlayerId) continue;
    if (profile.name) storedNames.set(profile.playerId, profile.name);
    const n = normalizeHex(profile.tileColor ?? "");
    if (!n) continue;
    exact.add(n);
    if ((profile.updatedAt ?? 0) >= activeSince) active.set(profile.playerId, { playerId: profile.playerId, name: profile.name, color: n });
  }
  // 2. live overrides (supersede stored for active sessions)
  for (const [pid, override] of deps.profileOverrides.entries()) {
    if (pid === excludePlayerId) continue;
    const n = normalizeHex(override.tileColor ?? "");
    if (!n) continue;
    exact.add(n);
    active.set(pid, { playerId: pid, name: override.name ?? storedNames.get(pid) ?? aiDisplayNameForId(pid), color: n });
  }
  return new TakenColorSet(exact, active.values());
};
