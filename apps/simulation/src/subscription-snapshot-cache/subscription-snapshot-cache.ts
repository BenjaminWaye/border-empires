import type { PlayerSubscriptionSnapshot, SeasonWinnerSnapshot } from "@border-empires/sim-protocol";

type TileDelta = NonNullable<PlayerSubscriptionSnapshot["tiles"][number]>;
type WorldStatusSnapshot = NonNullable<PlayerSubscriptionSnapshot["worldStatus"]>;
type PlayerStateSnapshot = NonNullable<PlayerSubscriptionSnapshot["player"]>;

const tileKeyFor = (x: number, y: number): string => `${x},${y}`;

// Binary search in a sorted tiles array (sorted by x asc, then y asc).
// Returns the index if found, or ~insertionPoint (bitwise NOT) if not found.
// Avoids the O(n) Map rebuild on every tile-delta application for the common
// case where the delta tiles are already visible in the snapshot.
const binarySearchTile = (tiles: readonly TileDelta[], x: number, y: number): number => {
  let lo = 0;
  let hi = tiles.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const t = tiles[mid]!;
    const dx = t.x - x;
    if (dx < 0) { lo = mid + 1; continue; }
    if (dx > 0) { hi = mid - 1; continue; }
    const dy = t.y - y;
    if (dy < 0) { lo = mid + 1; continue; }
    if (dy > 0) { hi = mid - 1; continue; }
    return mid;
  }
  return ~lo;
};

const playerProgressionFieldsFromPayload = (
  payload: Record<string, unknown>
): Partial<Pick<PlayerStateSnapshot, "techIds" | "domainIds" | "mods" | "modBreakdown">> => ({
  ...(Array.isArray(payload.techIds) ? { techIds: payload.techIds as string[] } : {}),
  ...(Array.isArray(payload.domainIds) ? { domainIds: payload.domainIds as string[] } : {}),
  ...(payload.mods && typeof payload.mods === "object" ? { mods: payload.mods as NonNullable<PlayerStateSnapshot["mods"]> } : {}),
  ...(payload.modBreakdown && typeof payload.modBreakdown === "object"
    ? { modBreakdown: payload.modBreakdown as NonNullable<PlayerStateSnapshot["modBreakdown"]> }
    : {})
});

export const applyTileDeltasToSnapshot = (
  snapshot: PlayerSubscriptionSnapshot,
  tileDeltas: TileDelta[]
): PlayerSubscriptionSnapshot => {
  if (tileDeltas.length === 0) return snapshot;

  // Fast path: binary search each delta in the already-sorted tiles array.
  // Updates (tiles already visible) are O(delta × log n) with no sort.
  // Only falls back to the O(n) Map+sort for insertions (new tiles entering
  // visibility), which is rare relative to state-update deltas.
  let updatedTiles: TileDelta[] | undefined;
  let inserts: TileDelta[] | undefined;

  for (const delta of tileDeltas) {
    const idx = binarySearchTile(snapshot.tiles, delta.x, delta.y);
    if (idx >= 0) {
      if (!updatedTiles) updatedTiles = snapshot.tiles.slice();
      updatedTiles[idx] = { ...updatedTiles[idx]!, ...delta };
    } else if (!delta.ownershipClearOnly) {
      // A clear-only delta is a broadcast-only ghost-ownership cleanup for a
      // tile the player cannot see (see tile-delta-visibility-filter.ts). It
      // may update an already-visible snapshot tile (handled above), but must
      // NEVER insert a new one — inserting accumulates phantom non-visible
      // tiles that leak fog-of-war when the cached snapshot is served on a
      // later reconnect.
      (inserts ??= []).push(delta);
    }
  }

  if (!inserts) {
    // All deltas were updates — no sort needed, array order preserved.
    return updatedTiles ? { ...snapshot, tiles: updatedTiles } : snapshot;
  }

  // At least one new tile: rebuild via Map to handle both updates and inserts.
  const base = updatedTiles ?? snapshot.tiles;
  const map = new Map<string, TileDelta>(base.map((t) => [tileKeyFor(t.x, t.y), t] as const));
  for (const delta of inserts) {
    const key = tileKeyFor(delta.x, delta.y);
    const existing: TileDelta = map.get(key) ?? { x: delta.x, y: delta.y };
    map.set(key, { ...existing, ...delta });
  }
  return {
    ...snapshot,
    tiles: [...map.values()].sort((left, right) => (left.x - right.x) || (left.y - right.y))
  };
};

export const applyPlayerMessageToSnapshot = (
  snapshot: PlayerSubscriptionSnapshot,
  payload: Record<string, unknown>
): PlayerSubscriptionSnapshot => {
  if (payload.type === "GLOBAL_STATUS_UPDATE") {
    const previousWorldStatus = snapshot.worldStatus;
    const incomingSeasonWinner = payload.seasonWinner as SeasonWinnerSnapshot | undefined;
    const resolvedSeasonWinner = incomingSeasonWinner ?? previousWorldStatus?.seasonWinner;
    return {
      ...snapshot,
      worldStatus: {
        leaderboard:
          (payload.leaderboard as WorldStatusSnapshot["leaderboard"]) ??
          previousWorldStatus?.leaderboard ?? {
            overall: [],
            byTiles: [],
            byIncome: [],
            byTechs: []
          },
        seasonVictory:
          (payload.seasonVictory as WorldStatusSnapshot["seasonVictory"]) ??
          previousWorldStatus?.seasonVictory ??
          [],
        ...(resolvedSeasonWinner !== undefined ? { seasonWinner: resolvedSeasonWinner as SeasonWinnerSnapshot } : {})
      }
    };
  }

  if (payload.type === "PLAYER_UPDATE" && snapshot.player) {
    const currentPlayer = snapshot.player as PlayerStateSnapshot;
    return {
      ...snapshot,
      player: {
        ...currentPlayer,
        ...(typeof payload.gold === "number" ? { gold: payload.gold } : {}),
        ...(typeof payload.manpower === "number" ? { manpower: payload.manpower } : {}),
        ...(typeof payload.manpowerCap === "number" ? { manpowerCap: payload.manpowerCap } : {}),
        ...(typeof payload.manpowerRegenPerMinute === "number" ? { manpowerRegenPerMinute: payload.manpowerRegenPerMinute } : {}),
        ...(payload.manpowerBreakdown && typeof payload.manpowerBreakdown === "object"
          ? { manpowerBreakdown: payload.manpowerBreakdown as NonNullable<PlayerStateSnapshot["manpowerBreakdown"]> }
          : {}),
        ...(typeof payload.incomePerMinute === "number" ? { incomePerMinute: payload.incomePerMinute } : {}),
        ...(payload.strategicResources && typeof payload.strategicResources === "object"
          ? { strategicResources: payload.strategicResources as PlayerStateSnapshot["strategicResources"] }
          : {}),
        ...(payload.strategicProductionPerMinute && typeof payload.strategicProductionPerMinute === "object"
          ? { strategicProductionPerMinute: payload.strategicProductionPerMinute as PlayerStateSnapshot["strategicProductionPerMinute"] }
          : {}),
        ...(payload.resourceSlots && typeof payload.resourceSlots === "object"
          ? { resourceSlots: payload.resourceSlots as NonNullable<PlayerStateSnapshot["resourceSlots"]> }
          : {}),
        ...(Array.isArray(payload.dormantStructures)
          ? { dormantStructures: payload.dormantStructures as NonNullable<PlayerStateSnapshot["dormantStructures"]> }
          : {}),
        ...(typeof payload.economyBreakdown === "object" && payload.economyBreakdown !== null
          ? { economyBreakdown: payload.economyBreakdown as Record<string, unknown> }
          : {}),
        ...(typeof payload.upkeepPerMinute === "object" && payload.upkeepPerMinute !== null
          ? { upkeepPerMinute: payload.upkeepPerMinute as NonNullable<PlayerStateSnapshot["upkeepPerMinute"]> }
          : {}),
        ...(typeof payload.upkeepLastTick === "object" && payload.upkeepLastTick !== null
          ? { upkeepLastTick: payload.upkeepLastTick as Record<string, unknown> }
          : {}),
        ...(typeof payload.developmentProcessLimit === "number" ? { developmentProcessLimit: payload.developmentProcessLimit } : {}),
        ...(typeof payload.activeDevelopmentProcessCount === "number"
          ? { activeDevelopmentProcessCount: payload.activeDevelopmentProcessCount }
          : {}),
        ...(Array.isArray(payload.pendingSettlements)
          ? { pendingSettlements: payload.pendingSettlements as PlayerStateSnapshot["pendingSettlements"] }
          : {}),
        ...(Array.isArray(payload.autoSettlementQueue)
          ? { autoSettlementQueue: payload.autoSettlementQueue as NonNullable<PlayerStateSnapshot["autoSettlementQueue"]> }
          : {}),
        ...(payload.storageCap && typeof payload.storageCap === "object"
          ? { storageCap: payload.storageCap as Record<string, number> }
          : {}),
        // devQueue/waypointQueue were missing here until this fix -- this is
        // the sim's OWN player-snapshot cache (used to serve a fast
        // bootstrap/reconnect subscribe without a full re-export, and
        // reachable even while a player is offline via
        // applyNonTileEventToCache in simulation-service.ts), a *separate*
        // copy of this merge function from the gateway's identically-named
        // one in subscription-snapshot-sync.ts. Queuing/cancelling a
        // waypoint or dev-queue entry changes no tile state, so nothing else
        // ever invalidated a stale cached entry for these two fields --
        // meaning a reconnect could be served a snapshot missing an entry
        // that had already been pushed via emitPlayerStateUpdate, even
        // though the live in-memory state was correct. See PR #1633/#1634
        // for the matching (but incomplete, for this exact reason) fix.
        ...(Array.isArray(payload.devQueue) ? { devQueue: payload.devQueue as NonNullable<PlayerStateSnapshot["devQueue"]> } : {}),
        ...(Array.isArray(payload.waypointQueue) ? { waypointQueue: payload.waypointQueue as NonNullable<PlayerStateSnapshot["waypointQueue"]> } : {}),
        ...playerProgressionFieldsFromPayload(payload)
      }
    };
  }

  if ((payload.type === "TECH_UPDATE" || payload.type === "DOMAIN_UPDATE") && snapshot.player) {
    return {
      ...snapshot,
      player: {
        ...snapshot.player,
        ...(typeof payload.gold === "number" ? { gold: payload.gold } : {}),
        ...(payload.strategicResources && typeof payload.strategicResources === "object"
          ? { strategicResources: payload.strategicResources as PlayerStateSnapshot["strategicResources"] }
          : {}),
        ...(typeof payload.incomePerMinute === "number" ? { incomePerMinute: payload.incomePerMinute } : {}),
        ...playerProgressionFieldsFromPayload(payload)
      }
    };
  }

  return snapshot;
};
