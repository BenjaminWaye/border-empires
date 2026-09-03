import { keyForTile } from "../client-app-runtime-utils.js";
import type { Tile } from "../client-types.js";

/**
 * Shared field-merge logic extracted from the two independently-duplicated
 * tile-merge blocks:
 *  - `TILE_DELTA` handler in `client-network/client-network.ts`
 *  - `applyGatewayTileUpdate` in `client-gateway-sync/client-gateway-sync.ts`
 *
 * Only fields whose merge logic was verified byte-for-byte identical on both
 * call sites (same delete-vs-set pattern, same order-sensitive interactions)
 * are included here. Several fields the original consolidation plan assumed
 * were identical turned out NOT to be (found while diffing the two blocks
 * line by line) and are deliberately left inline at each call site:
 *
 *  - `resource` / `dockId`: the TILE_DELTA handler only ever SETS these
 *    (`if (value !== undefined) merged.field = value`, no delete branch),
 *    while the gateway path deletes them on an explicit falsy value
 *    (`if ("field" in update) { if (truthy) set; else delete; }`).
 *  - `terrain` / `detailLevel`: TILE_DELTA sets `detailLevel` on a bare
 *    `"detailLevel" in normalizedUpdate` presence check; gateway only sets it
 *    when truthy. Different semantics for an explicit falsy value.
 *  - `landBiome` / `regionType`: both clear on non-LAND terrain or on a
 *    terrain change without a fresh value, but the conditional structure
 *    differs (TILE_DELTA gates on a combined `clearRuntimeLandContext` flag
 *    that also considers `fogged`; gateway checks `merged.terrain !== "LAND"`
 *    directly). Kept separate per the plan's own caution on this field pair.
 *  - `capital` / `breachShockUntil` / `clusterId` / `clusterType` / the
 *    `dock` object field: these are TILE_DELTA-only. The gateway's
 *    `GatewayTileUpdate` type has no such fields and `applyGatewayTileUpdate`
 *    never reads or writes them, so there is nothing to extract for them.
 *  - `ownershipClearOnly` broadcast short-circuit, `fogged` derivation,
 *    town sub-fields (`townType`/`townName`/`townPopulationTier`/
 *    `townDataPartial`), `discoveredTiles.add`, and the stale-yield /
 *    `ensureTileYield` invalidation stay at the gateway call site; debug
 *    logging stays at both call sites. None of these have a client-network
 *    equivalent.
 */
export type CommonTileFieldsUpdate = {
  ownerId?: string | null | undefined;
  ownershipState?: "FRONTIER" | "SETTLED" | "BARBARIAN" | null | undefined;
  /** Persistent-border reach owner, independent of ownerId -- always emitted by the sim exactly like ownerId, so it gets the same set/clear treatment. */
  reachOwnerId?: string | null | undefined;
  frontierDecayAt?: number | null | undefined;
  frontierDecayKind?: Tile["frontierDecayKind"] | null | undefined;
  shardSite?: Tile["shardSite"];
  naturalWonder?: Tile["naturalWonder"];
  watchtower?: Tile["watchtower"];
  town?: Tile["town"];
  fort?: Tile["fort"];
  observatory?: Tile["observatory"];
  economicStructure?: Tile["economicStructure"];
  siegeOutpost?: Tile["siegeOutpost"];
  sabotage?: Tile["sabotage"];
  muster?: Tile["muster"];
  yield?: Tile["yield"];
  yieldRate?: Tile["yieldRate"];
  yieldCap?: Tile["yieldCap"];
  upkeepEntries?: Tile["upkeepEntries"];
  history?: Tile["history"];
};

/**
 * Applies the confirmed-identical field merges to `merged` in place, then
 * returns it. `merged` must already have any call-site-specific fields
 * (terrain, detailLevel, fogged, resource, dockId, etc.) applied by the
 * caller -- this function only touches the fields listed above.
 */
export const applyCommonTileFields = (
  existing: Tile | undefined,
  merged: Tile,
  normalizedUpdate: CommonTileFieldsUpdate,
  ctx: { me?: string | undefined }
): Tile => {
  if ("ownerId" in normalizedUpdate) {
    if (normalizedUpdate.ownerId) merged.ownerId = normalizedUpdate.ownerId;
    else delete merged.ownerId;
  }
  if ("ownershipState" in normalizedUpdate) {
    if (normalizedUpdate.ownershipState) merged.ownershipState = normalizedUpdate.ownershipState;
    else delete merged.ownershipState;
  }
  if ("frontierDecayAt" in normalizedUpdate) {
    if (typeof normalizedUpdate.frontierDecayAt === "number") merged.frontierDecayAt = normalizedUpdate.frontierDecayAt;
    else delete merged.frontierDecayAt;
  }
  if ("frontierDecayKind" in normalizedUpdate) {
    if (normalizedUpdate.frontierDecayKind) merged.frontierDecayKind = normalizedUpdate.frontierDecayKind;
    else delete merged.frontierDecayKind;
  }
  if ("ownerId" in normalizedUpdate && !normalizedUpdate.ownerId) delete merged.ownershipState;

  if ("reachOwnerId" in normalizedUpdate) {
    if (normalizedUpdate.reachOwnerId) merged.reachOwnerId = normalizedUpdate.reachOwnerId;
    else delete merged.reachOwnerId;
  }

  const claimedShardSite = !existing?.ownerId && existing?.shardSite ? existing.shardSite : undefined;
  if ("shardSite" in normalizedUpdate) {
    if (normalizedUpdate.shardSite) merged.shardSite = normalizedUpdate.shardSite;
    else if (claimedShardSite && normalizedUpdate.ownerId === ctx.me && normalizedUpdate.ownershipState === "FRONTIER") {
      merged.shardSite = claimedShardSite;
    } else delete merged.shardSite;
  }

  if ("naturalWonder" in normalizedUpdate) {
    if (normalizedUpdate.naturalWonder) merged.naturalWonder = normalizedUpdate.naturalWonder;
    else delete merged.naturalWonder;
  }

  if ("watchtower" in normalizedUpdate) {
    if (normalizedUpdate.watchtower) merged.watchtower = normalizedUpdate.watchtower;
    else delete merged.watchtower;
  }

  if (normalizedUpdate.town !== undefined) merged.town = normalizedUpdate.town;
  if ("town" in normalizedUpdate && !normalizedUpdate.town) delete merged.town;

  if ("fort" in normalizedUpdate) {
    if (normalizedUpdate.fort) merged.fort = normalizedUpdate.fort;
    else delete merged.fort;
  }
  if ("observatory" in normalizedUpdate) {
    if (normalizedUpdate.observatory) merged.observatory = normalizedUpdate.observatory;
    else delete merged.observatory;
  }
  if ("economicStructure" in normalizedUpdate) {
    if (normalizedUpdate.economicStructure) merged.economicStructure = normalizedUpdate.economicStructure;
    else delete merged.economicStructure;
  }
  if ("siegeOutpost" in normalizedUpdate) {
    if (normalizedUpdate.siegeOutpost) merged.siegeOutpost = normalizedUpdate.siegeOutpost;
    else delete merged.siegeOutpost;
  }
  if ("sabotage" in normalizedUpdate) {
    if (normalizedUpdate.sabotage) merged.sabotage = normalizedUpdate.sabotage;
    else delete merged.sabotage;
  }
  if ("muster" in normalizedUpdate) {
    if (normalizedUpdate.muster) merged.muster = normalizedUpdate.muster;
    else delete merged.muster;
  }
  if ("yield" in normalizedUpdate) {
    if (normalizedUpdate.yield) merged.yield = normalizedUpdate.yield;
    else delete merged.yield;
  }
  if ("yieldRate" in normalizedUpdate) {
    if (normalizedUpdate.yieldRate) merged.yieldRate = normalizedUpdate.yieldRate;
    else delete merged.yieldRate;
  }
  if ("yieldCap" in normalizedUpdate) {
    if (normalizedUpdate.yieldCap) merged.yieldCap = normalizedUpdate.yieldCap;
    else delete merged.yieldCap;
  }
  if ("upkeepEntries" in normalizedUpdate) {
    if (normalizedUpdate.upkeepEntries) merged.upkeepEntries = normalizedUpdate.upkeepEntries;
    else delete merged.upkeepEntries;
  }
  if ("history" in normalizedUpdate) {
    if (normalizedUpdate.history) merged.history = normalizedUpdate.history;
    else delete merged.history;
  }

  return merged;
};

// Fields confirmed (by grep across every client-map-3d-*.ts and client-map-
// display.ts, the 2D canvas painter) to never be read by either map
// renderer -- they only ever surface in the tile info panel / economy UI,
// which reads state.tiles directly on demand rather than reacting to
// tilesRevision. These tick on essentially every server economy step (yield
// recompute, upkeep accounting, the view-history log), so comparing a
// TILE_DELTA's full JSON including them made tilesRevisionRelevantChange
// return true almost every time ANY visible tile had server-side economic
// activity -- forcing the true-3D renderer's full terrain/water/structure
// rebuild continuously, not just on an actual visual change. That's what
// made the 3D map's sea wave/lighting animation keep visibly restarting.
const VOLATILE_NON_VISUAL_FIELDS = ["yield", "yieldRate", "yieldCap", "upkeepEntries", "history"] as const satisfies ReadonlyArray<keyof Tile>;

// True when `resolved` differs from `existing` in a way either map renderer
// (2D or 3D) could actually show -- i.e. excluding the volatile economy-only
// fields above. Callers use this to gate a tilesRevision bump instead of a
// straight full-object comparison; see the two callers in client-network.ts
// and client-gateway-sync.ts for why an unconditional bump was the bug.
export const tileRevisionRelevantChange = (existing: Tile | undefined, resolved: Tile): boolean => {
  if (!existing) return true;
  const strip = (tile: Tile): Tile => {
    const copy: Tile = { ...tile };
    for (const field of VOLATILE_NON_VISUAL_FIELDS) delete copy[field];
    return copy;
  };
  return JSON.stringify(strip(existing)) !== JSON.stringify(strip(resolved));
};

// Bound on state.tilesRevisionChangedKeys (see client-state.ts) -- the 3D
// renderer's maybeRebuild drains this set on every rebuild it commits, so
// under normal operation it never approaches this cap. It only exists as a
// backstop for stretches where nothing drains it (true-3D renderer inactive,
// or many rebuild-throttled frames in a row): past the cap we stop tracking
// individual keys and fall back to "assume the change is window-relevant"
// via tilesRevisionOverflowed, rather than growing the set unboundedly.
export const TILES_REVISION_CHANGED_KEYS_CAP = 256;

// Records that tile (x, y) changed in a way tilesRevisionRelevantChange (or
// an unconditional bump, e.g. ownership-clear-only) already decided was
// visually relevant. Called at every state.tilesRevision += 1 site alongside
// the bump, so client-map-3d.ts's maybeRebuild can test whether the change
// actually falls inside its currently built terrain window instead of
// treating every tilesRevision change -- anywhere on the whole known map --
// as reason to rebuild the entire visible window.
export const recordTileRevisionChange = (
  state: { tilesRevisionChangedKeys: Set<string>; tilesRevisionOverflowed: boolean },
  x: number,
  y: number
): void => {
  if (state.tilesRevisionOverflowed) return;
  if (state.tilesRevisionChangedKeys.size >= TILES_REVISION_CHANGED_KEYS_CAP) {
    state.tilesRevisionChangedKeys.clear();
    state.tilesRevisionOverflowed = true;
    return;
  }
  state.tilesRevisionChangedKeys.add(keyForTile(x, y));
};
