import type { VisibilityState } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { ensureTileYield } from "../yield-derivation/yield-derivation.js";
import { applyCommonTileFields } from "../client-tile-merge/client-tile-merge.js";
import { debugTileLog, debugTileLoggingEnabled, debugTileSnapshot, tileMatchesDebugKey } from "../client-debug/client-debug.js";
import { enqueueDiscoveryTipForNewlySeenTile } from "../client-discovery-tips/client-discovery-tips.js"; import { unlockMusterOnEnemyContact } from "../client-muster-unlock/client-muster-unlock.js";
import { isMusterUnlocked } from "../client-muster-unlock/client-muster-unlock-storage.js";
import { clearResolvedIncomingAttack } from "../client-siege-tracking/client-siege-tracking.js";
import {
  gatewayTownIdentity,
  gatewayTownSummary,
  parseGatewayStructureJson
} from "./client-gateway-sync-town-summary.js";

// Logs every real ownerId/ownershipState change, gated only by the account-level debugTileLoggingEnabled flag (not a specific watched tile).
const logOwnershipChangeIfAny = (x: number, y: number, before: Tile | undefined, after: Tile | undefined, scope: string): void => {
  if (!debugTileLoggingEnabled()) return;
  if (before?.ownerId === after?.ownerId && before?.ownershipState === after?.ownershipState) return;
  debugTileLog(`${scope}:ownership-changed`, {
    x,
    y,
    before: debugTileSnapshot(before),
    after: debugTileSnapshot(after)
  });
};

type NormalizedGatewayTileUpdate = {
  detailLevel?: Tile["detailLevel"];
  terrain?: Tile["terrain"];
  resource?: Tile["resource"] | undefined;
  dockId?: string | undefined;
  town?: Tile["town"] | undefined;
  townType?: Tile["townType"] | undefined;
  townName?: Tile["townName"] | undefined;
  townPopulationTier?: Tile["townPopulationTier"] | undefined;
  townDataPartial?: boolean;
  fort?: Tile["fort"] | undefined;
  observatory?: Tile["observatory"] | undefined;
  siegeOutpost?: Tile["siegeOutpost"] | undefined;
  economicStructure?: Tile["economicStructure"] | undefined;
  sabotage?: Tile["sabotage"] | undefined;
  shardSite?: Tile["shardSite"] | undefined; naturalWonder?: Tile["naturalWonder"] | undefined;
  watchtower?: Tile["watchtower"] | undefined;
  muster?: Tile["muster"] | undefined;
  ownerId?: Tile["ownerId"] | undefined;
  ownershipState?: Tile["ownershipState"] | undefined;
  frontierDecayAt?: Tile["frontierDecayAt"] | undefined;
  frontierDecayKind?: Tile["frontierDecayKind"] | undefined;
  yield?: Tile["yield"] | undefined;
  yieldRate?: Tile["yieldRate"] | undefined;
  yieldCap?: Tile["yieldCap"] | undefined;
  upkeepEntries?: Tile["upkeepEntries"] | undefined;
  history?: Tile["history"] | undefined;
  landBiome?: Tile["landBiome"] | undefined;
  regionType?: Tile["regionType"] | undefined;
};

export type GatewayTileUpdate = {
  x: number;
  y: number;
  terrain?: Tile["terrain"];
  detailLevel?: Tile["detailLevel"];
  resource?: string;
  dockId?: string;
  ownerId?: string | null;
  ownershipState?: "FRONTIER" | "SETTLED" | "BARBARIAN" | null;
  frontierDecayAt?: number | null;
  frontierDecayKind?: Tile["frontierDecayKind"] | null;
  townJson?: string;
  townType?: "MARKET" | "FARMING";
  townName?: string;
  townPopulationTier?: "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS";
  fortJson?: string;
  observatoryJson?: string;
  siegeOutpostJson?: string;
  economicStructureJson?: string;
  sabotageJson?: string;
  shardSiteJson?: string; naturalWonderJson?: string;
  watchtowerJson?: string;
  musterJson?: string;
  yield?: Tile["yield"];
  yieldRate?: Tile["yieldRate"];
  yieldCap?: Tile["yieldCap"];
  upkeepEntries?: Tile["upkeepEntries"];
  history?: Tile["history"];
  landBiome?: Tile["landBiome"];
  regionType?: Tile["regionType"];
  visibilityState?: VisibilityState;
  ownershipClearOnly?: boolean; combatJson?: string;
};

type GatewayTileSyncDeps = {
  state: Pick<ClientState, "tiles" | "tilesRevision" | "incomingAttacksByTile" | "discoveredTiles"> & {
    me?: string | undefined;
    mods?: Partial<ClientState["mods"]>;
    upkeepLastTick: { foodCoverage?: number };
    discoveryTipQueue?: ClientState["discoveryTipQueue"];
    authEmail?: ClientState["authEmail"];
  };
  keyFor: (x: number, y: number) => string;
  mergeIncomingTileDetail: (existing: Tile | undefined, incoming: Tile) => Tile;
  mergeServerTileWithOptimisticState: (tile: Tile) => Tile;
  clearRenderCaches?: () => void;
  buildMiniMapBase?: () => void;
};

export const normalizeGatewayTileUpdate = (
  update: GatewayTileUpdate,
  args: {
    existing: Tile | undefined;
    tiles: ReadonlyMap<string, Tile>;
    keyFor: (x: number, y: number) => string;
    foodCoverage: number | undefined;
  }
): NormalizedGatewayTileUpdate => {
  const normalized: NormalizedGatewayTileUpdate = {};
  if (update.detailLevel) normalized.detailLevel = update.detailLevel;
  if (update.terrain) normalized.terrain = update.terrain;
  if ("resource" in update) normalized.resource = update.resource;
  if ("dockId" in update) normalized.dockId = update.dockId;
  if ("townJson" in update || "townType" in update || "townName" in update || "townPopulationTier" in update) {
    const summary = gatewayTownSummary(update, args.existing);
    normalized.town = summary.town;
    normalized.townDataPartial = summary.partial;
    const townIdentity = gatewayTownIdentity(update, args.existing, normalized.town);
    if (townIdentity) Object.assign(normalized, townIdentity);
  }
  if ("fortJson" in update) normalized.fort = parseGatewayStructureJson<Tile["fort"]>(update.fortJson);
  if ("observatoryJson" in update) normalized.observatory = parseGatewayStructureJson<Tile["observatory"]>(update.observatoryJson);
  if ("siegeOutpostJson" in update) normalized.siegeOutpost = parseGatewayStructureJson<Tile["siegeOutpost"]>(update.siegeOutpostJson);
  if ("economicStructureJson" in update) {
    normalized.economicStructure = parseGatewayStructureJson<Tile["economicStructure"]>(update.economicStructureJson);
  }
  if ("sabotageJson" in update) normalized.sabotage = parseGatewayStructureJson<Tile["sabotage"]>(update.sabotageJson);
  if ("shardSiteJson" in update) normalized.shardSite = parseGatewayStructureJson<NonNullable<Tile["shardSite"]>>(update.shardSiteJson);
  if ("naturalWonderJson" in update) normalized.naturalWonder = parseGatewayStructureJson<NonNullable<Tile["naturalWonder"]>>(update.naturalWonderJson); if ("watchtowerJson" in update) normalized.watchtower = parseGatewayStructureJson<NonNullable<Tile["watchtower"]>>(update.watchtowerJson);
  if ("musterJson" in update) normalized.muster = parseGatewayStructureJson<Tile["muster"]>(update.musterJson);
  if ("ownerId" in update) normalized.ownerId = typeof update.ownerId === "string" ? update.ownerId : undefined;
  if ("ownershipState" in update) {
    normalized.ownershipState =
      update.ownershipState === "FRONTIER" || update.ownershipState === "SETTLED" || update.ownershipState === "BARBARIAN"
        ? update.ownershipState
        : undefined;
  }
  if ("frontierDecayAt" in update) {
    normalized.frontierDecayAt = typeof update.frontierDecayAt === "number" && update.frontierDecayAt > 0
      ? update.frontierDecayAt
      : undefined;
  }
  if ("frontierDecayKind" in update) {
    normalized.frontierDecayKind =
      update.frontierDecayKind === "ENCIRCLEMENT" || update.frontierDecayKind === "OUT_OF_REACH"
        ? update.frontierDecayKind
        : undefined;
  }
  if ("yield" in update) normalized.yield = update.yield;
  if ("yieldRate" in update) normalized.yieldRate = update.yieldRate;
  if ("yieldCap" in update) normalized.yieldCap = update.yieldCap;
  if ("upkeepEntries" in update) normalized.upkeepEntries = update.upkeepEntries;
  if ("history" in update) normalized.history = update.history;
  if ("landBiome" in update) normalized.landBiome = update.landBiome;
  if ("regionType" in update) normalized.regionType = update.regionType;
  return normalized;
};

export const refreshAllGatewayDerivedTownSummaries = (
  _deps: Pick<GatewayTileSyncDeps, "state" | "keyFor">
): void => {};

export const refreshGatewayDerivedTownSummariesAroundTile = (
  _deps: Pick<GatewayTileSyncDeps, "state" | "keyFor">,
  _x: number,
  _y: number
): void => {};

const applyGatewayTileUpdate = (deps: GatewayTileSyncDeps, update: GatewayTileUpdate, skipRevision = false): boolean => {
  const tileKey = deps.keyFor(update.x, update.y);
  const existing = deps.state.tiles.get(tileKey);
  clearResolvedIncomingAttack(deps.state, tileKey, update, existing);

  // Broadcast-only ghost-ownership cleanup: sent to every player regardless of visibility (see tile-delta-visibility-filter.ts). Must update stale ownership on a tile we already know about, but must NEVER discover or unfog a tile.
  if (update.ownershipClearOnly === true) {
    // Nothing to correct if never seen or already unowned — skip the revision bump so a flood of distant barbarian clears can't churn re-renders.
    if (!existing || (existing.ownerId === undefined && existing.ownershipState === undefined)) {
      if (tileMatchesDebugKey(update.x, update.y, 1)) {
        debugTileLog("ownership-clear-only-skip", {
          x: update.x,
          y: update.y,
          reason: !existing ? "tile-not-known" : "already-unowned",
          existing: debugTileSnapshot(existing)
        });
      }
      return false;
    }
    const cleared: Tile = { ...existing };
    delete cleared.ownerId;
    delete cleared.ownershipState;
    if (tileMatchesDebugKey(update.x, update.y, 1)) {
      debugTileLog("ownership-clear-only-applied", {
        x: update.x,
        y: update.y,
        before: debugTileSnapshot(existing),
        after: debugTileSnapshot(cleared)
      });
    }
    logOwnershipChangeIfAny(update.x, update.y, existing, cleared, "ownership-clear-only");
    deps.state.tiles.set(tileKey, cleared);
    if (!skipRevision) deps.state.tilesRevision += 1;
    return false;
  }

  deps.state.discoveredTiles.add(tileKey);
  const previousTerrain = existing?.terrain;
  const previousLandBiome = existing?.landBiome;
  const previousRegionType = existing?.regionType;
  const merged: Tile = existing
    ? { ...existing, x: update.x, y: update.y }
    : {
        x: update.x,
        y: update.y,
        terrain: update.terrain ?? "LAND",
        detailLevel: "summary",
        fogged: false
      };
  merged.fogged = update.visibilityState === "FOG"; // freezes at this delta's post-mutation fields (e.g. a witnessed ownership flip); VISIBLE/omitted clears fogged

  const normalizedGateway = normalizeGatewayTileUpdate(update, {
    existing,
    tiles: deps.state.tiles,
    keyFor: deps.keyFor,
    foodCoverage: deps.state.upkeepLastTick.foodCoverage
  });

  if (normalizedGateway.terrain) merged.terrain = normalizedGateway.terrain;
  if (normalizedGateway.detailLevel) merged.detailLevel = normalizedGateway.detailLevel;
  const terrainChanged = previousTerrain !== merged.terrain;
  if (merged.terrain !== "LAND") {
    delete merged.landBiome;
    delete merged.regionType;
  } else if (terrainChanged) {
    if (!("landBiome" in normalizedGateway)) delete merged.landBiome;
    if (!("regionType" in normalizedGateway)) delete merged.regionType;
  }
  // resource/dockId stay inline: this path deletes on an explicit falsy
  // value, unlike the TILE_DELTA handler which only ever sets them -- see
  // client-tile-merge.ts for the full explanation of why these aren't shared.
  if ("resource" in normalizedGateway) {
    if (normalizedGateway.resource) merged.resource = normalizedGateway.resource;
    else delete merged.resource;
  }
  if ("dockId" in normalizedGateway) {
    if (normalizedGateway.dockId) merged.dockId = normalizedGateway.dockId;
    else delete merged.dockId;
  }
  // Confirmed-identical fields (ownerId/ownershipState/frontierDecayAt/
  // frontierDecayKind/shardSite/town/fort/observatory/economicStructure/
  // siegeOutpost/sabotage/muster/yield/yieldRate/yieldCap/upkeepEntries/
  // history) merged via the shared helper -- see client-tile-merge.ts.
  applyCommonTileFields(existing, merged, normalizedGateway, { me: deps.state.me });

  // townType/townName/townPopulationTier derivation is gateway-only and
  // depends on merged.town, which the call above just populated.
  if ("townType" in normalizedGateway) {
    if (normalizedGateway.townType) merged.townType = normalizedGateway.townType;
    else delete merged.townType;
  }
  if ("townName" in normalizedGateway) {
    if (normalizedGateway.townName) merged.townName = normalizedGateway.townName;
    else delete merged.townName;
  }
  if ("townPopulationTier" in normalizedGateway) {
    if (normalizedGateway.townPopulationTier) merged.townPopulationTier = normalizedGateway.townPopulationTier;
    else delete merged.townPopulationTier;
  }
  if (merged.town) {
    merged.townType = merged.town.type;
    if (merged.town.name) merged.townName = merged.town.name;
    merged.townPopulationTier = merged.town.populationTier;
  }
  if ("townDataPartial" in normalizedGateway) {
    if (normalizedGateway.townDataPartial) merged.townDataPartial = true;
    else delete merged.townDataPartial;
  }
  if ("landBiome" in normalizedGateway) {
    if (normalizedGateway.landBiome) merged.landBiome = normalizedGateway.landBiome;
    else delete merged.landBiome;
  }
  if ("regionType" in normalizedGateway) {
    if (normalizedGateway.regionType) merged.regionType = normalizedGateway.regionType;
    else delete merged.regionType;
  }

  const detailMerged = deps.mergeIncomingTileDetail(existing, merged);
  const resolved = deps.mergeServerTileWithOptimisticState(detailMerged);
  if (tileMatchesDebugKey(update.x, update.y, 1)) {
    debugTileLog("apply-gateway-tile-update", {
      x: update.x,
      y: update.y,
      wireOwnerId: update.ownerId,
      wireOwnershipState: update.ownershipState,
      existing: debugTileSnapshot(existing),
      merged: debugTileSnapshot(merged),
      detailMerged: debugTileSnapshot(detailMerged),
      resolved: debugTileSnapshot(resolved)
    });
  }
  logOwnershipChangeIfAny(update.x, update.y, existing, resolved, "apply-gateway-tile-update");
  // Structure/resource/dock change without a fresh server rate clears the stale value (radius-yield-delivery plan Phase 4).
  const staleYieldInputsChanged =
    ("economicStructure" in normalizedGateway && JSON.stringify(normalizedGateway.economicStructure) !== JSON.stringify(existing?.economicStructure)) ||
    ("resource" in normalizedGateway && normalizedGateway.resource !== existing?.resource) ||
    ("dockId" in normalizedGateway && normalizedGateway.dockId !== existing?.dockId);
  if (staleYieldInputsChanged && !("yieldRate" in normalizedGateway)) delete resolved.yieldRate;
  if (staleYieldInputsChanged && !("yieldCap" in normalizedGateway)) delete resolved.yieldCap;
  const ownIncomeMultiplier =
    resolved.ownerId && deps.state.me && resolved.ownerId === deps.state.me
      ? deps.state.mods?.income ?? 1.0
      : 1.0;
  ensureTileYield(resolved as Parameters<typeof ensureTileYield>[0], ownIncomeMultiplier);
  deps.state.tiles.set(tileKey, resolved);
  if (!skipRevision) deps.state.tilesRevision += 1;
  refreshGatewayDerivedTownSummariesAroundTile(deps, update.x, update.y);
  return previousTerrain !== resolved.terrain || previousLandBiome !== resolved.landBiome || previousRegionType !== resolved.regionType;
};

export const applyGatewayInitialState = (
  deps: GatewayTileSyncDeps,
  initialState?: { tiles?: GatewayTileUpdate[] },
  options?: { preserveExistingDiscoveredTiles?: boolean }
): number => {
  const tiles = initialState?.tiles;
  // Missing tiles field is a no-op. An EMPTY tiles array is a valid replacement intent (TILE_SNAPSHOT_REPLACE can hand back a small/empty fog-on snapshot) and must still clear state.tiles.
  if (!Array.isArray(tiles)) return 0;
  const preserveExistingDiscoveredTiles = options?.preserveExistingDiscoveredTiles === true;
  if (preserveExistingDiscoveredTiles) {
    for (const [tileKey, tile] of deps.state.tiles) {
      deps.state.tiles.set(tileKey, {
        ...tile,
        fogged: true
      });
    }
    deps.state.incomingAttacksByTile.clear();
  } else {
    deps.state.tiles.clear();
    deps.state.incomingAttacksByTile.clear();
    deps.state.discoveredTiles.clear();
  }
  deps.state.tilesRevision += 1; // single bump for the whole batch
  let invalidatedTerrainCache = false;
  // Re-derive the muster unlock from the bootstrap snapshot too: a fresh
  // device has no localStorage flag, and without this an already-visible
  // rival tile in the initial load would leave mustering hidden until some
  // later delta happened to touch an enemy tile. This also enqueues the
  // ENEMY_EMPIRE discovery tip on that first-ever contact, same as the live
  // delta path. `musterUnlockPending` stops the per-tile localStorage check
  // once unlocked instead of re-reading storage for every remaining tile.
  let musterUnlockPending = !isMusterUnlocked(deps.state.authEmail);
  for (const tile of tiles) {
    invalidatedTerrainCache = applyGatewayTileUpdate(deps, tile, true) || invalidatedTerrainCache;
    if (musterUnlockPending) {
      const seenTile = deps.state.tiles.get(deps.keyFor(tile.x, tile.y));
      unlockMusterOnEnemyContact(seenTile, deps.state.me, deps.state.authEmail, deps.state.discoveryTipQueue);
      musterUnlockPending = !isMusterUnlocked(deps.state.authEmail);
    }
  }
  if (invalidatedTerrainCache) {
    deps.clearRenderCaches?.();
    deps.buildMiniMapBase?.();
  }
  return tiles.length;
};

export const applyGatewayTileDeltaBatch = (
  deps: GatewayTileSyncDeps,
  updates?: GatewayTileUpdate[]
): void => {
  if (!Array.isArray(updates) || updates.length === 0) return;
  let invalidatedTerrainCache = false;
  for (const update of updates) {
    // "Newly seen" gates first-discovery tips (first town/resource of a kind) to live deltas only, to avoid spamming them all at once on load — the initial bootstrap has its own muster-unlock pass above, which can still enqueue the one-off ENEMY_EMPIRE tip on first contact.
    const tileKey = deps.keyFor(update.x, update.y);
    const wasKnown = deps.state.tiles.has(tileKey); const priorOwnerId = deps.state.tiles.get(tileKey)?.ownerId; // priorOwnerId: read before the merge, so an ownership FLIP (not just a first sighting) can also unlock mustering
    invalidatedTerrainCache = applyGatewayTileUpdate(deps, update) || invalidatedTerrainCache; const seenTile = deps.state.tiles.get(tileKey);
    if (!wasKnown && deps.state.discoveryTipQueue) enqueueDiscoveryTipForNewlySeenTile(deps.state.discoveryTipQueue, seenTile, deps.state.authEmail); if (seenTile?.ownerId !== priorOwnerId) unlockMusterOnEnemyContact(seenTile, deps.state.me, deps.state.authEmail, deps.state.discoveryTipQueue);
  }
  if (invalidatedTerrainCache) {
    deps.clearRenderCaches?.();
    deps.buildMiniMapBase?.();
  }
};
