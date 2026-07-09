import { isChosenTrickleResource } from "@border-empires/shared";
import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

type TileDelta = NonNullable<PlayerSubscriptionSnapshot["tiles"][number]>;
type WorldStatusSnapshot = NonNullable<PlayerSubscriptionSnapshot["worldStatus"]>;
type PlayerStateSnapshot = NonNullable<PlayerSubscriptionSnapshot["player"]>;

const tileKeyFor = (x: number, y: number): string => `${x},${y}`;

// Cache tile key → array-index for each tiles array so applyTileDeltasToSnapshot
// can look up positions in O(delta) instead of scanning O(N_tiles) every call.
// WeakMap ensures the index is GC'd alongside the tiles array itself.
const tileIndexByArray = new WeakMap<
  ReadonlyArray<TileDelta>,
  Map<string, number>
>();

const buildTileIndex = (tiles: ReadonlyArray<TileDelta>): Map<string, number> => {
  const index = new Map<string, number>();
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i]!;
    index.set(tileKeyFor(t.x, t.y), i);
  }
  return index;
};

const playerProgressionFieldsFromPayload = (
  payload: Record<string, unknown>
): Partial<Pick<PlayerStateSnapshot, "techIds" | "domainIds" | "mods" | "modBreakdown" | "chosenTrickleResource">> => {
  const trickle = payload.chosenTrickleResource;
  return {
    ...(Array.isArray(payload.techIds) ? { techIds: payload.techIds as string[] } : {}),
    ...(Array.isArray(payload.domainIds) ? { domainIds: payload.domainIds as string[] } : {}),
    ...(payload.mods && typeof payload.mods === "object" ? { mods: payload.mods as NonNullable<PlayerStateSnapshot["mods"]> } : {}),
    ...(payload.modBreakdown && typeof payload.modBreakdown === "object"
      ? { modBreakdown: payload.modBreakdown as NonNullable<PlayerStateSnapshot["modBreakdown"]> }
      : {}),
    ...(isChosenTrickleResource(trickle) ? { chosenTrickleResource: trickle } : {})
  };
};

export const applyTileDeltasToSnapshot = (
  snapshot: PlayerSubscriptionSnapshot,
  tileDeltas: TileDelta[]
): PlayerSubscriptionSnapshot => {
  if (tileDeltas.length === 0) return snapshot;

  // Get or build the key→index map for this tiles array. O(N) only on first
  // call per array reference; subsequent calls are O(delta).
  let index = tileIndexByArray.get(snapshot.tiles);
  if (!index) {
    index = buildTileIndex(snapshot.tiles);
    tileIndexByArray.set(snapshot.tiles, index);
  }

  // Shallow-copy the array so we can update individual positions without
  // mutating the existing snapshot (immutable update pattern).
  const nextTiles = snapshot.tiles.slice() as TileDelta[];
  let hasInsertions = false;

  for (const delta of tileDeltas) {
    const key = tileKeyFor(delta.x, delta.y);
    const pos = index.get(key);
    if (pos !== undefined) {
      nextTiles[pos] = { ...nextTiles[pos]!, ...delta };
    } else if (!delta.ownershipClearOnly) {
      // A clear-only delta is a broadcast-only ghost-ownership cleanup for a
      // tile the player cannot see (see tile-delta-visibility-filter.ts). It
      // may update an already-visible snapshot tile (handled above), but must
      // NEVER insert a new one — inserting accumulates phantom non-visible
      // tiles that leak fog-of-war when the cached snapshot is served on a
      // later reconnect.
      nextTiles.push({ ...delta });
      hasInsertions = true;
    }
  }

  if (hasInsertions) {
    nextTiles.sort((left, right) => (left.x - right.x) || (left.y - right.y));
    // Array positions shifted by sort — rebuild the index from scratch.
    tileIndexByArray.set(nextTiles, buildTileIndex(nextTiles));
  } else {
    // No insertions: positions unchanged, reuse the same index for the next call.
    tileIndexByArray.set(nextTiles, index);
  }

  return { ...snapshot, tiles: nextTiles };
};

export const applyPlayerMessageToSnapshot = (
  snapshot: PlayerSubscriptionSnapshot,
  payload: Record<string, unknown>
): PlayerSubscriptionSnapshot => {
  if (payload.type === "GLOBAL_STATUS_UPDATE") {
    const previousWorldStatus = snapshot.worldStatus;
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
          []
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
        ...(typeof payload.developmentProcessLimit === "number" ? { developmentProcessLimit: payload.developmentProcessLimit } : {}),
        ...(typeof payload.activeDevelopmentProcessCount === "number"
          ? { activeDevelopmentProcessCount: payload.activeDevelopmentProcessCount }
          : {}),
        ...(Array.isArray(payload.pendingSettlements)
          ? {
              pendingSettlements: payload.pendingSettlements as PlayerStateSnapshot["pendingSettlements"]
            }
          : {}),
        ...(Array.isArray(payload.autoSettlementQueue)
          ? { autoSettlementQueue: payload.autoSettlementQueue as NonNullable<PlayerStateSnapshot["autoSettlementQueue"]> }
          : {}),
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
