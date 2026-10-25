import { structureTypeForTileAction, requiredTechForTileAction } from "./client-build-action-dispatch.js";
export { structureTypeForTileAction, requiredTechForTileAction } from "./client-build-action-dispatch.js";
import { relicCastRadius } from "@border-empires/shared";
import { isAetherTowerSuppressed, WORLD_HEIGHT, WORLD_WIDTH, isTownSupportPlacementStructure, structureShowsOnTile, structureSortRank, type BuildableStructureType, type SlotResource } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import { hostileAetherProtectionAt, type ProtectingAetherTower } from "../client-aether-tower-protection/client-aether-tower-protection.js";
import { ownObservatoryRange } from "../client-observatory-rules/client-observatory-rules.js";
import type { Tile, TileActionDef, TileMenuView } from "../client-types.js";
import { hideTechLockedTileAction as hideTechLockedTileActionFromModule, presentTechLockedTileAction, type TileActionFilterState } from "./client-tech-locked-tile-action.js";
// Re-exported for client-tile-action-logic.ts, whose deps type names them.
export type { ProtectingAetherTower };

export const tileActionIsCrystal = (id: TileActionDef["id"]): boolean =>
  id === "reveal_empire" ||
  id === "reveal_empire_stats" ||
  id === "survey_sweep" ||
  id === "aether_lance" || id === "suppress_aether_tower" ||
  id === "retort_recast_food" ||
  id === "retort_recast_titanium" ||
  id === "retort_recast_crystal" ||
  id === "retort_recast_umbrite" ||
  id === "aether_wall" ||
  id === "aether_bridge" ||
  id === "siphon_tile" ||
  id === "aether_emp" ||
  id === "astral_dock_launch" ||
  id === "aegis_lock" ||
  id === "create_mountain" ||
  id === "remove_mountain";

export const tileActionIsBuilding = (id: TileActionDef["id"]): boolean =>
  id.startsWith("build_") && id !== "build_relay_beacon_frontier";

// Worldgen flips any sea tile touching land (incl. diagonally) to LAND, so
// open sea is never orthogonally adjacent to land -- only diagonally. Any
// "is this land coastal" check must look at all 8 neighbors, not just the 4
// orthogonal ones, or it will never find a real coastal tile.
export const hasAdjacentSeaEightWay = (x: number, y: number, terrainAt: (x: number, y: number) => Tile["terrain"]): boolean =>
  [
    terrainAt(x, y - 1),
    terrainAt(x + 1, y - 1),
    terrainAt(x + 1, y),
    terrainAt(x + 1, y + 1),
    terrainAt(x, y + 1),
    terrainAt(x - 1, y + 1),
    terrainAt(x - 1, y),
    terrainAt(x - 1, y - 1)
  ].some((terrain) => terrain === "SEA" || terrain === "COASTAL_SEA");

// Prefers the real synced tile terrain over the procedural terrainAt()
// guess: server-side overrides (dock/channel carving, player-made
// mountains, connectivity fixes) can make a tile's actual terrain differ
// from what pure worldgen would compute, and those overrides cluster
// exactly where coastlines are. Coordinates are wrapped before the lookup,
// same as every other neighbor-tile lookup, so a target near the world seam
// still finds its wrapped-around neighbor in state.tiles instead of missing
// and silently falling back to the procedural guess.
export const knownTerrainAt =
  (
    state: ClientState,
    keyFor: (x: number, y: number) => string,
    wrapX: (x: number) => number,
    wrapY: (y: number) => number,
    terrainAt: (x: number, y: number) => Tile["terrain"]
  ) =>
  (x: number, y: number): Tile["terrain"] =>
    state.tiles.get(keyFor(wrapX(x), wrapY(y)))?.terrain ?? terrainAt(x, y);

// build_relay_beacon on an owned FRONTIER tile is a settle-then-build chain
// (client-tile-action-logic.ts tags its detail with the same
// " • garrisons this tile first" suffix every other frontier chained-build
// action gets) -- surface it in both tabs there: Actions, next to Settle
// Land, so a player never has to go looking for it (matching
// build_relay_beacon_frontier's parity on a neutral tile), and Buildings
// too, since it's still a real building and that's where a player used to
// browsing the Buildings tab will look for it.
const isReadyHydrogarden = (action: TileActionDef): boolean => action.id === "build_hydrogarden" && !action.disabled;

const isFrontierRelayBeacon = (action: TileActionDef): boolean =>
  action.id === "build_relay_beacon" && Boolean(action.detail?.includes("garrisons this tile first"));

// Hydrogarden is a build_* action, so it's normally Buildings-tab-only. But
// it's also the single most commonly reached-for build on a settled FARM
// tile once researched (build_hydrogarden is FARM-only -- structure-placement-
// metadata.json's HYDROGARDEN.resourceTypes -- since Hydrogarden has no effect
// on fish production, §5.3 in structure-slots.ts), and Buildings is a
// second tab away -- surface it in Actions too, but only while it's
// actually a live thing to do (researched, tile not already carrying it, a
// free slot available): once disabled (built, un-researched, or no slot)
// it drops back to Buildings-only so Actions doesn't fill up with a dead
// button. Both tabs still get it, same as the frontier relay beacon above,
// since a player used to browsing Buildings will look for it there too.


// Defensive net for the exact bug fixed in #1253 (build_titanium_weapons_factory
// / build_umbrite_weapons_factory) and its build_quartermasters_office /
// build_reserve_lattice / build_ancillary_factory siblings found alongside it:
// structureTypeForTileAction's switch silently falling through to `undefined`
// for a genuine build_* action id makes that build button a no-op — no
// optimistic update, no message sent to the server, no visible error.
// client-action-flow.ts calls this right after structureTypeForTileAction
// comes back empty; a defined return means some build action still has no
// mapping, so surface it instead of silently swallowing the click again.
export const unmappedBuildActionWarning = (actionId: TileActionDef["id"]): string | undefined => {
  if (!tileActionIsBuilding(actionId) || actionId === "build_relay_beacon_frontier") return undefined;
  console.error(`[client-action-flow] build action "${actionId}" has no structureTypeForTileAction mapping — nothing was sent to the server.`);
  return `"${actionId}" isn't wired up to build anything yet — this has been logged, please report it.`;
};

export const shouldOptimisticallyBuildOnSelectedTile = (actionId: TileActionDef["id"], tile: Tile): boolean => {
  const structureType = structureTypeForTileAction(actionId);
  if (!structureType) return true;
  return !(tile.town && isTownSupportPlacementStructure(structureType));
};


export const hideTechLockedTileAction = (
  action: TileActionDef,
  state: TileActionFilterState
): boolean => hideTechLockedTileActionFromModule(action, state, requiredTechForTileAction);

export const splitTileActionsIntoTabs = (
  actions: TileActionDef[],
  state: TileActionFilterState
): Pick<TileMenuView, "actions" | "buildings" | "crystal"> => {
  const filtered = actions.flatMap((action) => presentTechLockedTileAction(action, state, requiredTechForTileAction) ?? []);
  const actionRows = filtered.filter(
    (action) =>
      (!tileActionIsBuilding(action.id) || isFrontierRelayBeacon(action) || isReadyHydrogarden(action)) &&
      !tileActionIsCrystal(action.id)
  );
  const buildingRows = filtered
    .filter((action) => tileActionIsBuilding(action.id))
    .sort((a, b) => {
      const aType = structureTypeForTileAction(a.id);
      const bType = structureTypeForTileAction(b.id);
      const rankDiff = (aType ? structureSortRank(aType) : 99) - (bType ? structureSortRank(bType) : 99);
      if (rankDiff !== 0) return rankDiff;
      return 0;
    });
  const crystalRows = filtered.filter((action) => tileActionIsCrystal(action.id));
  return {
    actions: actionRows,
    buildings: buildingRows.length ? buildingRows : [],
    crystal: crystalRows.length > 0 ? crystalRows : []
  };
};

export const isTileOwnedByAlly = (tile: Tile, state: Pick<ClientState, "allies">): boolean =>
  Boolean(tile.ownerId && state.allies.includes(tile.ownerId));

// A tile counts as the "settled" placement surface once a build queued on it
// is guaranteed to settle first — currently that's any owned FRONTIER tile
// (chainedBuildAvailability/handleBuildAction auto-settle-then-build). Once
// the same chain is extended to unowned/expand targets, add that case here
// rather than special-casing ownershipState at each call site.
const buildSurfaceOwnershipState = (tile: Tile): Tile["ownershipState"] =>
  tile.ownerId && tile.ownershipState === "FRONTIER" ? "SETTLED" : tile.ownershipState;

export const buildShowsOnTile = (
  structureType: BuildableStructureType,
  tile: Tile,
  supportedTownCount: number,
  supportedDockCount: number
): boolean =>
  structureShowsOnTile(structureType, {
    ownershipState: buildSurfaceOwnershipState(tile),
    resource: tile.resource as import("@border-empires/shared").ResourceType | undefined,
    dockId: tile.dockId,
    townPopulationTier: tile.town?.populationTier,
    supportedTownCount,
    supportedDockCount
  });

export const chebyshevDistanceClient = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = Math.min(Math.abs(ax - bx), WORLD_WIDTH - Math.abs(ax - bx));
  const dy = Math.min(Math.abs(ay - by), WORLD_HEIGHT - Math.abs(ay - by));
  return Math.max(dx, dy);
};

// Same field the map's red protection tint is painted from, so a tile greys
// out exactly when it is tinted red -- including for a tower hidden in fog.
export const hostileObservatoryProtectingTile = (
  state: Parameters<typeof hostileAetherProtectionAt>[0],
  tile: Tile
): ProtectingAetherTower | undefined => hostileAetherProtectionAt(state, tile, Date.now());

// §14.2: state.dormantStructures only ever describes the logged-in player's
// own structures (PLAYER_UPDATE is a private per-player message), so a
// foreign tile never gets a dormancy lookup. Extracted from
// client-action-flow.ts (file-line-cap) — kept as a plain function of
// state so both it and dockSupportedByHarborExchangeForTile below can share it.
export const dormantResourcesForTile = (
  state: Pick<ClientState, "me" | "dormantStructures">,
  tile: Tile,
  field: "fort" | "observatory" | "siegeBattery" | "economicStructure"
): SlotResource[] | undefined => {
  if (tile.ownerId !== state.me) return undefined;
  const key = `${tile.x},${tile.y}:${field}`;
  return state.dormantStructures.find((entry) => entry.key === key)?.resources;
};

// Mirrors dockSupportedByHarborExchange (apps/simulation/src/economy-network/economy-network.ts):
// true when `tile` (a dock) has an adjacent (8-neighbor) owned, SETTLED,
// active HARBOR_EXCHANGE (Harbor Exchange) that isn't dormant. Used to
// determine whether the Harbor Exchange gold bonus applies for the tile
// menu's dock income display.
export const dockSupportedByHarborExchangeForTile = (
  state: Pick<ClientState, "tiles" | "me" | "dormantStructures">,
  tile: Pick<Tile, "x" | "y">
): boolean => {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const neighbor = state.tiles.get(`${tile.x + dx},${tile.y + dy}`);
      if (
        neighbor?.ownerId === state.me &&
        neighbor.ownershipState === "SETTLED" &&
        neighbor.economicStructure?.type === "HARBOR_EXCHANGE" &&
        neighbor.economicStructure.status === "active" &&
        !(dormantResourcesForTile(state, neighbor, "economicStructure")?.length)
      ) {
        return true;
      }
    }
  }
  return false;
};

// User decision: each additional Observatory a player owns costs
// progressively more CRYSTAL upkeep (observatoryCrystalSlotCostForOwnedCount,
// shared with apps/simulation's resource-slot-view.ts). This counts how many
// the player already owns so the build button and info modal can predict
// the next one's cost. Watchtower Engine's own observatory is exempt from
// upkeep entirely (server-side: buildDemandContributors skips it the same
// way) -- it must not count toward a real Observatory's rank here, or this
// mirror would overstate the CRYSTAL cost the server will charge.
export const ownedActiveOrBuildingObservatoryCount = (state: Pick<ClientState, "tiles" | "me">): number => {
  let count = 0;
  for (const tile of state.tiles.values()) {
    if (tile.observatory?.ownerId === state.me && tile.observatory.status !== "inactive" && tile.naturalWonder?.type !== "WATCHTOWER_ENGINE") count += 1;
  }
  return count;
};

// Dormancy-line helper: this specific tile's current CRYSTAL requirement
// relative to the player's other Observatories. The client is never sent a
// real activatedAt for an already-active Observatory (the server strips
// completesAt on build completion, runtime-structure-build-completion.ts,
// and never sends activatedAt at all), so this can't reproduce the server's
// exact earliest-build-first tie-break -- it falls back to a stable tile-key
// sort instead, the same kind of simplification already used for Treasury
// State's town ordering (resource-slot-view.ts: "towns carry no founding
// timestamp"). Good enough to show "some of your Observatories cost more
// than others" instead of a flat, always-wrong 1; not guaranteed to name the
// same physical tile as the server's real rank.
export const observatoryTileRank = (state: Pick<ClientState, "tiles" | "me">, tile: Pick<Tile, "x" | "y">): number => {
  const keys: string[] = [];
  for (const candidate of state.tiles.values()) {
    if (candidate.observatory?.ownerId === state.me && candidate.observatory.status !== "inactive" && candidate.naturalWonder?.type !== "WATCHTOWER_ENGINE") {
      keys.push(`${candidate.x},${candidate.y}`);
    }
  }
  keys.sort();
  const index = keys.indexOf(`${tile.x},${tile.y}`);
  return index >= 0 ? index + 1 : 1;
};

export const ownedActiveObservatoryWithinRange = (
  state: Pick<ClientState, "tiles" | "me" | "techIds" | "techCatalog" | "domainIds" | "domainCatalog">,
  tile: Tile
): boolean => {
  const range = ownObservatoryRange(state);
  for (const candidate of state.tiles.values()) {
    if (candidate.fogged || candidate.ownerId !== state.me || candidate.terrain !== "LAND") continue;
    if (candidate.observatory?.ownerId !== state.me || candidate.observatory.status !== "active") continue;
    if (isAetherTowerSuppressed(candidate.observatory, Date.now())) continue;
    if (chebyshevDistanceClient(candidate.x, candidate.y, tile.x, tile.y) <= relicCastRadius(candidate.naturalWonder, range)) return true;
  }
  return false;
};
