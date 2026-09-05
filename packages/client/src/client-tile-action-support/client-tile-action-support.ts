import { WORLD_HEIGHT, WORLD_WIDTH, isTownSupportPlacementStructure, structureShowsOnTile, structureSortRank, type BuildableStructureType } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import { hostileObservatoryProtectingTileAt } from "../client-observatory-cooldown/client-observatory-cooldown.js";
import { ownObservatoryRange } from "../client-observatory-rules/client-observatory-rules.js";
import type { Tile, TileActionDef, TileMenuView } from "../client-types.js";

export const tileActionIsCrystal = (id: TileActionDef["id"]): boolean =>
  id === "reveal_empire" ||
  id === "reveal_empire_stats" ||
  id === "survey_sweep" ||
  id === "aether_lance" ||
  id === "retort_recast_food" ||
  id === "retort_recast_titanium" ||
  id === "retort_recast_crystal" ||
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
// " • settles this tile first" suffix every other frontier chained-build
// action gets) -- surface it in both tabs there: Actions, next to Settle
// Land, so a player never has to go looking for it (matching
// build_relay_beacon_frontier's parity on a neutral tile), and Buildings
// too, since it's still a real building and that's where a player used to
// browsing the Buildings tab will look for it.
const isFrontierRelayBeacon = (action: TileActionDef): boolean =>
  action.id === "build_relay_beacon" && Boolean(action.detail?.includes("settles this tile first"));

export const structureTypeForTileAction = (actionId: TileActionDef["id"]): BuildableStructureType | undefined => {
  switch (actionId) {
    case "build_fortification":
      return "FORT";
    case "build_observatory":
      return "OBSERVATORY";
    case "build_siege_camp":
      return "SIEGE_OUTPOST";
    case "build_farmstead":
      return "FARMSTEAD";
    case "build_waterworks":
      return "WATERWORKS";
    case "build_umbrite_rig":
      return "UMBRITE_RIG";
    case "build_mine":
      return "MINE";
    case "build_mintworks":
      return "MINTWORKS";
    case "build_granary":
      return "GRANARY";
    case "build_census_hall":
      return "CENSUS_HALL";
    case "build_clearing_house":
      return "CLEARING_HOUSE";
    case "build_airport":
      return "AIRPORT";
    case "build_aether_tower":
      return "AETHER_TOWER";
    case "build_wooden_fort":
      return "WOODEN_FORT";
    case "build_relay_beacon":
      return "RELAY_BEACON";
    case "build_umbrite_synthesizer":
      return "UMBRITE_SYNTHESIZER";
    case "build_titanium_works":
      return "TITANIUM_WORKS";
    case "build_crystal_synthesizer":
      return "CRYSTAL_SYNTHESIZER";
    case "build_caravanary":
      return "CARAVANARY";
    case "build_foundry":
      return "FOUNDRY";
    case "build_garrison_hall":
      return "GARRISON_HALL";
    case "build_customs_house":
      return "CUSTOMS_HOUSE";
    case "build_rail_depot":
      return "RAIL_DEPOT";
    case "build_imperial_exchange_part_1":
      return "IMPERIAL_EXCHANGE_PART_1";
    case "build_imperial_exchange_part_2":
      return "IMPERIAL_EXCHANGE_PART_2";
    case "build_imperial_exchange_part_3":
      return "IMPERIAL_EXCHANGE_PART_3";
    case "build_world_engine_part_1":
      return "WORLD_ENGINE_PART_1";
    case "build_world_engine_part_2":
      return "WORLD_ENGINE_PART_2";
    case "build_world_engine_part_3":
      return "WORLD_ENGINE_PART_3";
    case "build_aegis_dome_part_1":
      return "AEGIS_DOME_PART_1";
    case "build_aegis_dome_part_2":
      return "AEGIS_DOME_PART_2";
    case "build_aegis_dome_part_3":
      return "AEGIS_DOME_PART_3";
    case "build_astral_dock_part_1":
      return "ASTRAL_DOCK_PART_1";
    case "build_astral_dock_part_2":
      return "ASTRAL_DOCK_PART_2";
    case "build_astral_dock_part_3":
      return "ASTRAL_DOCK_PART_3";
    case "build_population_bureau_part_1":
      return "POPULATION_BUREAU_PART_1";
    case "build_population_bureau_part_2":
      return "POPULATION_BUREAU_PART_2";
    case "build_population_bureau_part_3":
      return "POPULATION_BUREAU_PART_3";
    case "build_titanium_levy_part_1":
      return "TITANIUM_LEVY_PART_1";
    case "build_titanium_levy_part_2":
      return "TITANIUM_LEVY_PART_2";
    case "build_titanium_levy_part_3":
      return "TITANIUM_LEVY_PART_3";
    case "build_imperial_exchange":
      return "IMPERIAL_EXCHANGE";
    case "build_world_engine":
      return "WORLD_ENGINE";
    case "build_aegis_dome":
      return "AEGIS_DOME";
    case "build_astral_dock":
      return "ASTRAL_DOCK";
    case "build_population_bureau":
      return "POPULATION_BUREAU";
    case "build_titanium_levy":
      return "TITANIUM_LEVY";
    case "build_governors_office":
      return "GOVERNORS_OFFICE";
    case "build_radar_system":
      return "RADAR_SYSTEM";
    case "build_titanium_weapons_factory":
      return "TITANIUM_WEAPONS_FACTORY";
    case "build_umbrite_weapons_factory":
      return "UMBRITE_WEAPONS_FACTORY";
    case "build_assembly_works":
      return "ASSEMBLY_WORKS";
    case "build_logistics_guild":
      return "LOGISTICS_GUILD";
    default:
      return undefined;
  }
};

// Defensive net for the exact bug fixed in #1253 (build_titanium_weapons_factory
// / build_umbrite_weapons_factory) and its build_quartermasters_office /
// build_assembly_works / build_logistics_guild siblings found alongside it:
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

export const requiredTechForTileAction = (actionId: TileActionDef["id"]): string | undefined => {
  switch (actionId) {
    case "build_foundry":
      return "industrial-extraction";
    case "build_fortification":
    case "build_titanium_weapons_factory":
      return "masonry";
    case "build_observatory":
      return "crystal-lattices";
    case "build_airport":
      return "aeronautics";
    case "build_aether_tower":
      return "plastics";
    case "build_radar_system":
      return "radar";
    case "build_governors_office":
      return "civil-service";
    case "build_garrison_hall":
      return "organized-supply";
    case "build_siege_camp":
    case "build_umbrite_rig":
    case "build_umbrite_weapons_factory":
      return "leatherworking";
    case "build_farmstead":
      return "agriculture";
    case "build_waterworks":
      return "irrigation";
    case "build_mine":
      return "mining";
    case "build_mintworks":
      return "trade";
    case "build_granary":
      return "pottery";
    case "build_clearing_house":
      return "coinage";
    case "build_caravanary":
      return "ledger-keeping";
    case "build_umbrite_synthesizer":
      return "workshops";
    case "build_titanium_works":
      return "alchemy";
    case "build_crystal_synthesizer":
      return "crystal-lattices";
    case "build_customs_house":
      return "harborcraft";
    case "build_lockworks_port":
      return "port-infrastructure";
    case "build_rail_depot":
      return "global-trade-networks";
    case "build_imperial_exchange_part_1":
    case "build_imperial_exchange_part_2":
    case "build_imperial_exchange_part_3":
    case "build_imperial_exchange":
      return "urban-mintworks";
    case "build_world_engine_part_1":
    case "build_world_engine_part_2":
    case "build_world_engine_part_3":
    case "build_world_engine":
      return "world-engine";
    case "build_aegis_dome_part_1":
    case "build_aegis_dome_part_2":
    case "build_aegis_dome_part_3":
    case "build_aegis_dome":
    case "aegis_lock":
      return "aegis-dome";
    case "build_astral_dock_part_1":
    case "build_astral_dock_part_2":
    case "build_astral_dock_part_3":
    case "build_astral_dock":
    case "astral_dock_launch":
      return "astral-dock";
    case "build_population_bureau_part_1":
    case "build_population_bureau_part_2":
    case "build_population_bureau_part_3":
    case "build_population_bureau":
      return "demographic-registry";
    case "build_titanium_levy_part_1":
    case "build_titanium_levy_part_2":
    case "build_titanium_levy_part_3":
    case "build_titanium_levy":
      return "grand-levy-doctrine";
    case "reveal_empire":
      return "beacon-towers";
    case "reveal_empire_stats":
      return "surveying";
    case "siphon_tile":
      return "logistics";
    case "survey_sweep":
      return "surveying";
    case "aether_lance":
      return "crystal-lattices";
    case "aether_emp":
      return "cryptography";
    case "aether_wall":
      return "harborcraft";
    case "aether_bridge":
      return "navigation";
    case "create_mountain":
    case "remove_mountain":
      return "terrain-engineering";
    case "build_assembly_works":
      return "conveyor-networks";
    case "build_logistics_guild":
      return "remade-concordat";
    default:
      return undefined;
  }
};

export const hideTechLockedTileAction = (
  action: TileActionDef,
  state: Pick<ClientState, "techIds" | "localhostDevAetherWall">
): boolean => {
  if (action.id === "aether_wall" && state.localhostDevAetherWall) return false;
  const requiredTech = requiredTechForTileAction(action.id);
  if (requiredTech && !state.techIds.includes(requiredTech)) return true;
  if (requiredTech) return false;
  if (!action.disabled || !action.disabledReason) return false;
  return /^Requires\b/i.test(action.disabledReason) || /^Need reveal capability\b/i.test(action.disabledReason);
};

export const splitTileActionsIntoTabs = (
  actions: TileActionDef[],
  state: Pick<ClientState, "techIds" | "localhostDevAetherWall">
): Pick<TileMenuView, "actions" | "buildings" | "crystal"> => {
  const filtered = actions.filter((action) => !hideTechLockedTileAction(action, state));
  const visibleIfShown = (action: TileActionDef): boolean => !action.disabled;
  const actionRows = filtered.filter(
    (action) => (!tileActionIsBuilding(action.id) || isFrontierRelayBeacon(action)) && !tileActionIsCrystal(action.id)
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
    resource: tile.resource as "FARM" | "TITANIUM" | "GEMS" | "FISH" | "UMBRITE" | undefined,
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

export const hostileObservatoryProtectingTile = (
  state: Pick<ClientState, "tiles" | "me" | "allies">,
  tile: Tile
): Tile | undefined => hostileObservatoryProtectingTileAt(state.tiles.values(), state.me, state.allies, tile, Date.now());

export const ownedActiveObservatoryWithinRange = (
  state: Pick<ClientState, "tiles" | "me" | "techIds" | "techCatalog" | "domainIds" | "domainCatalog">,
  tile: Tile
): boolean => {
  const range = ownObservatoryRange(state);
  for (const candidate of state.tiles.values()) {
    if (candidate.fogged || candidate.ownerId !== state.me || candidate.terrain !== "LAND") continue;
    if (candidate.observatory?.ownerId !== state.me || candidate.observatory.status !== "active") continue;
    if (chebyshevDistanceClient(candidate.x, candidate.y, tile.x, tile.y) <= range) return true;
  }
  return false;
};
