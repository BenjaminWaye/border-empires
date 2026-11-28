import { aiDisplayNameForId, type EmpireColorEntry } from "@border-empires/shared";
import { RESERVED_COLORS, normalizeHex } from "./player-color-allocation.js";
import { TakenColorSet } from "./taken-color-set.js";

/**
 * Fallback only, for when the current contest's empires are unknown (see
 * contestPlayerIds): a stored profile written within this window counts as an
 * active empire even when its player has not logged in since this gateway
 * booted. Older profiles only block their exact colour.
 */
export const ACTIVE_EMPIRE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

type StoredColorProfile = { playerId: string; name?: string; tileColor?: string; updatedAt?: number };

export type TakenColorSetDeps = {
  profileStore: { listAllNamed: () => Promise<StoredColorProfile[]> };
  profileOverrides: { entries: () => IterableIterator<[string, { name?: string; tileColor?: string }]> };
  /**
   * The empires taking part in the current contest (contestPlayerIdsFrom),
   * or undefined when that is unknown. When known, only they hold colours:
   * abandoned guests and players from other contests no longer use up the
   * colour space (owner decision 2026-11-28).
   */
  contestPlayerIds?: () => Promise<ReadonlySet<string> | undefined>;
  now?: () => number;
};

// Every colour another empire holds, plus the reserved ones, and the active
// empires a new pick must keep its distance from. Barbarian grey stays an
// exact-only block: the rule is between empires. Extracted from
// gateway-app.ts (already over its line cap) so it can be shared and tested
// on its own.
export const buildTakenColorSet = async (excludePlayerId: string, deps: TakenColorSetDeps): Promise<TakenColorSet> => {
  const exact = new Set<string>(RESERVED_COLORS);
  const active = new Map<string, EmpireColorEntry>();
  const contest = await deps.contestPlayerIds?.();
  const counts = (playerId: string): boolean => playerId !== excludePlayerId && (!contest || contest.has(playerId));
  const activeSince = (deps.now ?? Date.now)() - ACTIVE_EMPIRE_WINDOW_MS;
  const storedNames = new Map<string, string>();
  // 1. stored profiles
  for (const profile of await deps.profileStore.listAllNamed()) {
    if (!counts(profile.playerId)) continue;
    if (profile.name) storedNames.set(profile.playerId, profile.name);
    const n = normalizeHex(profile.tileColor ?? "");
    if (!n) continue;
    exact.add(n);
    // A contest empire holds its land whether or not its player is about.
    if (contest || (profile.updatedAt ?? 0) >= activeSince) active.set(profile.playerId, { playerId: profile.playerId, name: profile.name, color: n });
  }
  // 2. live overrides (supersede stored for active sessions)
  for (const [pid, override] of deps.profileOverrides.entries()) {
    if (!counts(pid)) continue;
    const n = normalizeHex(override.tileColor ?? "");
    if (!n) continue;
    exact.add(n);
    active.set(pid, { playerId: pid, name: override.name ?? storedNames.get(pid) ?? aiDisplayNameForId(pid), color: n });
  }
  return new TakenColorSet(exact, active.values());
};

// The empires taking part in the current Sector Contest, for the colour rule
// (buildTakenColorSet above). The simulation's current-season leaderboard
// lists every competitive empire that has landed (it leaves out empires with
// no tiles, income or techs). Undefined while no contest is running or the
// simulation cannot answer within CONTEST_LOOKUP_TIMEOUT_MS (this runs on the
// login path), so callers fall back to the older rule rather than treating
// every colour as free.

export const CONTEST_LOOKUP_TIMEOUT_MS = 2_000;

type ContestSummary = { status: string; overall: ReadonlyArray<{ id: string }> };

export const contestPlayerIdsFrom = async (
  getSummary: () => Promise<ContestSummary>,
  timeoutMs: number = CONTEST_LOOKUP_TIMEOUT_MS
): Promise<ReadonlySet<string> | undefined> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), timeoutMs);
  });
  try {
    const summary = await Promise.race([getSummary(), timedOut]);
    return summary?.status === "active" ? new Set(summary.overall.map((entry) => entry.id)) : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
};

/** How long a contest lookup is served without asking the simulation again. */
export const CONTEST_IDS_REFRESH_MS = 30_000;

/**
 * contestPlayerIdsFrom behind a one-value memo, so a login does not wait on a
 * simulation round-trip: once one answer is in, it is served at once and
 * refreshed in the background every CONTEST_IDS_REFRESH_MS (one lookup in
 * flight at a time). Only the very first call (gateway boot, AI colour
 * seeding) waits. A player who joined in the last half minute may not hold
 * their colour yet; they still block its exact hex through their own pick.
 */
export const createContestPlayerIdsSource = (
  getSummary: () => Promise<ContestSummary>,
  options: { now?: () => number; refreshMs?: number; timeoutMs?: number } = {}
): (() => Promise<ReadonlySet<string> | undefined>) => {
  const now = options.now ?? Date.now;
  const refreshMs = options.refreshMs ?? CONTEST_IDS_REFRESH_MS;
  let last: { ids: ReadonlySet<string> | undefined; at: number } | undefined;
  let inFlight: Promise<ReadonlySet<string> | undefined> | undefined;
  const refresh = (): Promise<ReadonlySet<string> | undefined> => {
    inFlight ??= contestPlayerIdsFrom(getSummary, options.timeoutMs).then((ids) => {
      last = { ids, at: now() };
      inFlight = undefined;
      return ids;
    });
    return inFlight;
  };
  return async () => {
    if (!last) return refresh();
    if (now() - last.at >= refreshMs) void refresh();
    return last.ids;
  };
};
