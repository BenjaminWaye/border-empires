import {
  type BuildableStructureType,
  FORT_BUILD_MS,
  FORT_DEFENSE_MULT,
  FRONTIER_CLAIM_COST,
  LIGHT_OUTPOST_ATTACK_MULT,
  LIGHT_OUTPOST_BUILD_MS,
  OBSERVATORY_BUILD_MS,
  SETTLE_COST,
  SIEGE_OUTPOST_ATTACK_MULT,
  SIEGE_OUTPOST_BUILD_MS,
  WOODEN_FORT_BUILD_MS,
  WOODEN_FORT_DEFENSE_MULT,
  structureBuildDurationMs,
  structurePlacementMetadata,
  structureShowsOnTile,
  terrainAt
} from "@border-empires/shared";
import { canAffordCost, frontierClaimCostLabelForTile, isForestTile, settleDurationMsForTile } from "./client-constants.js";
import { connectedEnemyRegionKeys } from "./client-connected-region.js";
import { hasQueuedSettlementForTile } from "./client-development-queue.js";
import { economicStructureBuildMs, economicStructureName } from "./client-map-display.js";
import type { DevelopmentSlotSummary } from "./client-queue-logic.js";
import type { ClientState } from "./client-state.js";
import type {
  ActiveTruceView,
  CrystalTargetingAbility,
  FeedSeverity,
  FeedType,
  Tile,
  TileActionDef
} from "./client-types.js";

type BuildableStructureId = BuildableStructureType;

const structureLabelForRemoval = (tile: Tile): { label: string; durationMs: number } | undefined => {
  if (tile.fort) return { label: "Fort", durationMs: structureBuildDurationMs("FORT") };
  if (tile.observatory) return { label: "Observatory", durationMs: structureBuildDurationMs("OBSERVATORY") };
  if (tile.siegeOutpost) return { label: "Siege Outpost", durationMs: structureBuildDurationMs("SIEGE_OUTPOST") };
  if (tile.economicStructure) return { label: economicStructureName(tile.economicStructure.type), durationMs: economicStructureBuildMs(tile.economicStructure.type) };
  return undefined;
};

type TileActionLogicDeps = {
  keyFor: (x: number, y: number) => string;
  parseKey: (k: string) => { x: number; y: number };
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
  terrainAt: typeof terrainAt;
  chebyshevDistanceClient: (ax: number, ay: number, bx: number, by: number) => number;
  isTileOwnedByAlly: (tile: Tile) => boolean;
  hostileObservatoryProtectingTile: (tile: Tile) => Tile | undefined;
  abilityCooldownRemainingMs: (ability: keyof ClientState["abilityCooldowns"]) => number;
  formatCooldownShort: (ms: number) => string;
  pushFeed: (msg: string, type?: FeedType, severity?: FeedSeverity) => void;
  hideTileActionMenu: () => void;
  hideHoldBuildMenu: () => void;
  selectedTile: () => Tile | undefined;
  renderHud: () => void;
  requireAuthedSession: (message?: string) => boolean;
  ws: WebSocket;
  attackPreviewDetailForTarget: (to: Tile, mode?: "normal" | "breakthrough") => string | undefined;
  attackPreviewPendingForTarget: (to: Tile) => boolean;
  pickOriginForTarget: (x: number, y: number, allowAdjacentToDock?: boolean, allowOptimisticExpandOrigin?: boolean) => Tile | undefined;
  buildDetailTextForAction: (actionId: string, tile: Tile, supportedTown?: Tile) => string | undefined;
  developmentSlotSummary: () => DevelopmentSlotSummary;
  developmentSlotReason: (summary: DevelopmentSlotSummary) => string;
  structureGoldCost: (structureType: BuildableStructureId) => number;
  structureCostText: (structureType: BuildableStructureId, resourceOverride?: string) => string;
  supportedOwnedTownsForTile: (tile: Tile) => Tile[];
  supportedOwnedDocksForTile: (tile: Tile) => Tile[];
  townHasSupportStructure: (
    townTile: Tile | undefined,
    structureType: "MARKET" | "GRANARY" | "BANK" | "CARAVANARY" | "FUR_SYNTHESIZER" | "IRONWORKS" | "CRYSTAL_SYNTHESIZER" | "FUEL_PLANT"
  ) => boolean;
  activeTruceWithPlayer: (playerId?: string | null) => ActiveTruceView | undefined;
  ownerSpawnShieldActive: (ownerId: string) => boolean;
};

export const hasRevealCapability = (state: ClientState): boolean =>
  state.techIds.includes("cryptography") || state.activeRevealTargets.length > 0;

export const hasBreakthroughCapability = (state: ClientState): boolean => state.techIds.includes("breach-doctrine");

export const hasAetherBridgeCapability = (state: ClientState): boolean => state.techIds.includes("navigation");

export const hasSiphonCapability = (state: ClientState): boolean => state.techIds.includes("cryptography");

export const hasTerrainShapingCapability = (state: ClientState): boolean => state.techIds.includes("terrain-engineering");

export const hasOwnedLandWithinClientRange = (
  state: ClientState,
  x: number,
  y: number,
  range: number,
  deps: Pick<TileActionLogicDeps, "chebyshevDistanceClient">
): boolean => {
  for (const tile of state.tiles.values()) {
    if (tile.fogged || tile.ownerId !== state.me || tile.terrain !== "LAND") continue;
    if (deps.chebyshevDistanceClient(tile.x, tile.y, x, y) <= range) return true;
  }
  return false;
};

export const crystalTargetingTitle = (ability: CrystalTargetingAbility): string =>
  ability === "aether_bridge" ? "Aether Bridge" : "Siphon";

export const crystalTargetingTone = (ability: CrystalTargetingAbility): "amber" | "cyan" | "red" =>
  ability === "aether_bridge" ? "cyan" : "red";

export const clearCrystalTargeting = (state: ClientState): void => {
  state.crystalTargeting.active = false;
  state.crystalTargeting.validTargets.clear();
  state.crystalTargeting.originByTarget.clear();
};

export const lineStepsBetween = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  deps: Pick<TileActionLogicDeps, "wrapX" | "wrapY">
): Array<{ x: number; y: number }> => {
  const dx = bx - ax;
  const dy = by - ay;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  if (steps <= 1) return [];
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 1; i < steps; i += 1) {
    out.push({ x: deps.wrapX(Math.round(ax + (dx * i) / steps)), y: deps.wrapY(Math.round(ay + (dy * i) / steps)) });
  }
  return out;
};

export const computeCrystalTargets = (
  state: ClientState,
  ability: CrystalTargetingAbility,
  deps: Pick<TileActionLogicDeps, "keyFor" | "terrainAt" | "isTileOwnedByAlly" | "hostileObservatoryProtectingTile">
): { validTargets: Set<string>; originByTarget: Map<string, string> } => {
  const validTargets = new Set<string>();
  const originByTarget = new Map<string, string>();
  for (const tile of state.tiles.values()) {
    if (tile.fogged || tile.terrain !== "LAND") continue;
    if (ability === "aether_bridge") {
      const isCoastalLand =
        deps.terrainAt(tile.x, tile.y) === "LAND" &&
        [
          deps.terrainAt(tile.x, tile.y - 1),
          deps.terrainAt(tile.x + 1, tile.y),
          deps.terrainAt(tile.x, tile.y + 1),
          deps.terrainAt(tile.x - 1, tile.y)
        ].includes("SEA");
      if (!isCoastalLand) continue;
      validTargets.add(deps.keyFor(tile.x, tile.y));
      continue;
    }
    if (!tile.ownerId || tile.ownerId === state.me || deps.isTileOwnedByAlly(tile)) continue;
    if (deps.hostileObservatoryProtectingTile(tile)) continue;
    if ((tile.resource || tile.town) && !tile.sabotage) validTargets.add(deps.keyFor(tile.x, tile.y));
  }
  return { validTargets, originByTarget };
};

export const beginCrystalTargeting = (
  state: ClientState,
  ability: CrystalTargetingAbility,
  deps: Pick<
    TileActionLogicDeps,
    | "keyFor"
    | "terrainAt"
    | "isTileOwnedByAlly"
    | "hostileObservatoryProtectingTile"
    | "abilityCooldownRemainingMs"
    | "formatCooldownShort"
    | "pushFeed"
    | "hideTileActionMenu"
    | "hideHoldBuildMenu"
    | "selectedTile"
    | "parseKey"
    | "renderHud"
  >
): void => {
  if (ability === "aether_bridge") {
    const cooldown = deps.abilityCooldownRemainingMs("aether_bridge");
    if (!hasAetherBridgeCapability(state)) {
      deps.pushFeed("Aether Bridge requires the Aether Bridge tech.", "combat", "warn");
      return;
    }
    if ((state.strategicResources.CRYSTAL ?? 0) < 30) {
      deps.pushFeed("Aether Bridge needs 30 CRYSTAL.", "combat", "warn");
      return;
    }
    if (cooldown > 0) {
      deps.pushFeed(`Aether Bridge cooling down for ${deps.formatCooldownShort(cooldown)}.`, "combat", "warn");
      return;
    }
  }
  if (ability === "siphon") {
    const cooldown = deps.abilityCooldownRemainingMs("siphon");
    if (!hasSiphonCapability(state)) {
      deps.pushFeed("Siphon requires Cryptography.", "combat", "warn");
      return;
    }
    if ((state.strategicResources.CRYSTAL ?? 0) < 20) {
      deps.pushFeed("Siphon needs 20 CRYSTAL.", "combat", "warn");
      return;
    }
    if (cooldown > 0) {
      deps.pushFeed(`Siphon cooling down for ${deps.formatCooldownShort(cooldown)}.`, "combat", "warn");
      return;
    }
  }

  const { validTargets, originByTarget } = computeCrystalTargets(state, ability, deps);
  if (validTargets.size === 0) {
    deps.pushFeed(`${crystalTargetingTitle(ability)} has no valid targets in view.`, "combat", "warn");
    return;
  }
  state.crystalTargeting.active = true;
  state.crystalTargeting.ability = ability;
  state.crystalTargeting.validTargets = validTargets;
  state.crystalTargeting.originByTarget = originByTarget;
  deps.hideTileActionMenu();
  deps.hideHoldBuildMenu();
  const current = deps.selectedTile();
  if (!current || !validTargets.has(deps.keyFor(current.x, current.y))) {
    const first = [...validTargets][0];
    if (first) state.selected = deps.parseKey(first);
  }
  deps.pushFeed(`${crystalTargetingTitle(ability)} armed. Tap a highlighted target tile.`, "combat", "info");
  deps.renderHud();
};

export const executeCrystalTargeting = (
  state: ClientState,
  tile: Tile,
  deps: Pick<TileActionLogicDeps, "keyFor" | "hostileObservatoryProtectingTile" | "pushFeed" | "requireAuthedSession" | "ws" | "hideTileActionMenu">
): boolean => {
  const targetKey = deps.keyFor(tile.x, tile.y);
  if (!state.crystalTargeting.active || !state.crystalTargeting.validTargets.has(targetKey)) return false;
  if (state.crystalTargeting.ability !== "aether_bridge" && deps.hostileObservatoryProtectingTile(tile)) {
    deps.pushFeed("Blocked by observatory field.", "combat", "warn");
    return false;
  }
  if (!deps.requireAuthedSession()) return false;
  const ability = state.crystalTargeting.ability;
  if (ability === "aether_bridge") {
    deps.ws.send(JSON.stringify({ type: "CAST_AETHER_BRIDGE", x: tile.x, y: tile.y }));
  } else {
    deps.ws.send(JSON.stringify({ type: "SIPHON_TILE", x: tile.x, y: tile.y }));
  }
  clearCrystalTargeting(state);
  deps.hideTileActionMenu();
  return true;
};

export const tileActionAvailability = (
  enabled: boolean,
  reason: string,
  cost?: string
): Pick<TileActionDef, "disabled" | "disabledReason" | "cost"> => {
  if (enabled) return cost ? { disabled: false, cost } : { disabled: false };
  return { disabled: true, disabledReason: reason, cost: reason };
};

const buildShowsOnTile = (
  structureType: BuildableStructureId,
  tile: Tile,
  supportedTownCount: number,
  supportedDockCount: number
): boolean =>
  structureShowsOnTile(structureType, {
    ownershipState: tile.ownershipState,
    resource: tile.resource as
      | "FARM"
      | "WOOD"
      | "IRON"
      | "GEMS"
      | "FISH"
      | "FUR"
      | "OIL"
      | undefined,
    dockId: tile.dockId,
    townPopulationTier: tile.town?.populationTier,
    supportedTownCount,
    supportedDockCount
  });

const buildNeedsBorderOnly = (structureType: BuildableStructureId): boolean =>
  structurePlacementMetadata(structureType).requiresBorder === "border";

export const isOwnedBorderTile = (
  state: ClientState,
  x: number,
  y: number,
  deps: Pick<TileActionLogicDeps, "keyFor" | "wrapX" | "wrapY">
): boolean => {
  const neighbors = [
    state.tiles.get(deps.keyFor(deps.wrapX(x), deps.wrapY(y - 1))),
    state.tiles.get(deps.keyFor(deps.wrapX(x + 1), deps.wrapY(y))),
    state.tiles.get(deps.keyFor(deps.wrapX(x), deps.wrapY(y + 1))),
    state.tiles.get(deps.keyFor(deps.wrapX(x - 1), deps.wrapY(y)))
  ];
  return neighbors.some((tile) => !tile || tile.ownerId !== state.me);
};

export const tileActionAvailabilityWithDevelopmentSlot = (
  enabledWithoutSlot: boolean,
  baseReason: string,
  cost?: string,
  summary?: DevelopmentSlotSummary,
  deps?: Pick<TileActionLogicDeps, "developmentSlotSummary" | "developmentSlotReason">
): Pick<TileActionDef, "disabled" | "disabledReason" | "cost"> => {
  const slotSummary = summary ?? deps?.developmentSlotSummary();
  if (!slotSummary) return tileActionAvailability(enabledWithoutSlot, baseReason, cost);
  if (slotSummary.available <= 0 && enabledWithoutSlot) {
    return tileActionAvailability(true, deps?.developmentSlotReason(slotSummary) ?? baseReason, cost ? `${cost} • queues` : "Queues when slot frees up");
  }
  if (slotSummary.available <= 0) return tileActionAvailability(false, deps?.developmentSlotReason(slotSummary) ?? baseReason, cost);
  return tileActionAvailability(enabledWithoutSlot, baseReason, cost);
};

const isConverterStructureType = (type: NonNullable<Tile["economicStructure"]>["type"]): boolean =>
  type === "FUR_SYNTHESIZER" ||
  type === "ADVANCED_FUR_SYNTHESIZER" ||
  type === "IRONWORKS" ||
  type === "ADVANCED_IRONWORKS" ||
  type === "CRYSTAL_SYNTHESIZER" ||
  type === "ADVANCED_CRYSTAL_SYNTHESIZER" ||
  type === "FUEL_PLANT";
export const menuActionsForSingleTile = (state: ClientState, tile: Tile, deps: TileActionLogicDeps): TileActionDef[] => {
  if (tile.fogged) return [];
  if (tile.terrain === "SEA") return [];
  if (tile.terrain === "MOUNTAIN") {
    const removeCooldown = deps.abilityCooldownRemainingMs("remove_mountain");
    const observatoryProtection = deps.hostileObservatoryProtectingTile(tile);
    return [
      {
        id: "remove_mountain",
        label: "Remove Mountain",
        ...tileActionAvailability(
          hasTerrainShapingCapability(state) &&
            !observatoryProtection &&
            hasOwnedLandWithinClientRange(state, tile.x, tile.y, 2, deps) &&
            removeCooldown <= 0 &&
            state.gold >= 8000 &&
            (state.strategicResources.CRYSTAL ?? 0) >= 400,
          !hasTerrainShapingCapability(state)
            ? "Requires Terrain Engineering"
            : observatoryProtection
              ? "Blocked by observatory field"
              : !hasOwnedLandWithinClientRange(state, tile.x, tile.y, 2, deps)
                ? "Must be within 2 tiles of your land"
                : removeCooldown > 0
                  ? `Cooldown ${deps.formatCooldownShort(removeCooldown)}`
                  : state.gold < 8000
                    ? "Need 8000 gold"
                    : "Need 400 CRYSTAL",
          "8000 gold + 400 CRYSTAL"
        )
      }
    ];
  }
  if (tile.terrain !== "LAND") return [];
  const queuedSettlement = hasQueuedSettlementForTile(state.developmentQueue, deps.keyFor(tile.x, tile.y));
  const createMountainAction = (): TileActionDef => {
    const createCooldown = deps.abilityCooldownRemainingMs("create_mountain");
    const observatoryProtection = deps.hostileObservatoryProtectingTile(tile);
    const hasRange = hasOwnedLandWithinClientRange(state, tile.x, tile.y, 2, deps);
    const blockedBySite = Boolean(tile.town || tile.dockId || tile.fort || tile.siegeOutpost || tile.observatory || tile.economicStructure);
    return {
      id: "create_mountain",
      label: "Create Mountain",
      ...tileActionAvailability(
        hasTerrainShapingCapability(state) &&
          !observatoryProtection &&
          hasRange &&
          !blockedBySite &&
          createCooldown <= 0 &&
          state.gold >= 8000 &&
          (state.strategicResources.CRYSTAL ?? 0) >= 400,
        !hasTerrainShapingCapability(state)
          ? "Requires Terrain Engineering"
          : observatoryProtection
            ? "Blocked by observatory field"
            : !hasRange
              ? "Must be within 2 tiles of your land"
              : blockedBySite
                ? "Town, dock, or structure blocks terrain shaping"
                : createCooldown > 0
                  ? `Cooldown ${deps.formatCooldownShort(createCooldown)}`
                  : state.gold < 8000
                    ? "Need 8000 gold"
                    : "Need 400 CRYSTAL",
        "8000 gold + 400 CRYSTAL"
      )
    };
  };
  if (tile.shardSite) {
    return [
      {
        id: "collect_shard",
        label: tile.shardSite.kind === "FALL" ? "Collect Shardfall" : "Collect Shards",
        detail:
          tile.shardSite.kind === "FALL"
            ? `${tile.shardSite.amount} shard${tile.shardSite.amount === 1 ? "" : "s"} from active shard rain`
            : `${tile.shardSite.amount} shard${tile.shardSite.amount === 1 ? "" : "s"} recovered from this cache`
      },
      createMountainAction()
    ];
  }
  if (!tile.ownerId) {
    const reachable = Boolean(deps.pickOriginForTarget(tile.x, tile.y, false));
    const hasGold = state.gold >= FRONTIER_CLAIM_COST;
    const frontierCostLabel = frontierClaimCostLabelForTile(tile.x, tile.y);
    const out: TileActionDef[] = [
      {
        id: "settle_land",
        label: "Settle Land",
        ...tileActionAvailability(
          reachable && hasGold,
          !reachable ? "Must touch your territory" : `Need ${FRONTIER_CLAIM_COST} gold`,
          frontierCostLabel
        )
      }
    ];
    out.push({
      id: "build_foundry",
      label: "Build Foundry",
      detail: deps.buildDetailTextForAction("build_foundry", tile),
      ...tileActionAvailabilityWithDevelopmentSlot(
        reachable && state.techIds.includes("industrial-extraction") && state.gold >= 4500 && !tile.resource && !tile.town && !tile.dockId,
        !reachable
          ? "Must touch your territory"
          : !state.techIds.includes("industrial-extraction")
            ? "Requires Industrial Extraction"
            : tile.resource || tile.town || tile.dockId
              ? "Needs empty land"
              : "Need 4500 gold",
        `4500 gold • ${Math.round(economicStructureBuildMs("FOUNDRY") / 60000)}m • doubles mines within 10 tiles`,
        deps.developmentSlotSummary(),
        deps
      )
    });
    out.push(createMountainAction());
    return out;
  }
  if (tile.ownerId === state.me) {
    const slots = deps.developmentSlotSummary();
    const out: TileActionDef[] = [];
    const isSettlementTile = tile.town?.populationTier === "SETTLEMENT";
    const y = (tile as Tile & { yield?: { gold?: number; strategic?: Record<string, number> } }).yield;
    const hasYield =
      Boolean(y && ((y.gold ?? 0) > 0.01 || Object.values(y.strategic ?? {}).some((v) => Number(v) > 0.01)));
    const hasBlockingStructure = Boolean(tile.fort || tile.siegeOutpost || tile.observatory || tile.economicStructure);
    const supportedTowns = tile.ownershipState === "SETTLED" ? deps.supportedOwnedTownsForTile(tile) : [];
    const supportedTown = supportedTowns.length === 1 ? supportedTowns[0] : undefined;
    const supportedDocks = tile.ownershipState === "SETTLED" ? deps.supportedOwnedDocksForTile(tile) : [];
    const townBuildSource =
      tile.town && tile.town.populationTier !== "SETTLEMENT" && tile.ownershipState === "SETTLED" ? tile : supportedTown;
    const supportPlacementBlocked = Boolean(hasBlockingStructure && townBuildSource && townBuildSource !== tile);
    if (tile.ownershipState === "SETTLED" && hasYield) out.push({ id: "collect_yield", label: "Collect Yield" });
    if (tile.sabotage) {
      out.push({
        id: "purge_siphon",
        label: "Purge Siphon",
        ...tileActionAvailability((state.strategicResources.CRYSTAL ?? 0) >= 10, "Need 10 CRYSTAL", "10 CRYSTAL")
      });
    }
    if (tile.economicStructure?.type === "FUR_SYNTHESIZER" || tile.economicStructure?.type === "ADVANCED_FUR_SYNTHESIZER") {
      const downtimeRemainingMs = Math.max(0, (tile.economicStructure.disabledUntil ?? 0) - Date.now());
      out.push({
        id: "overload_fur_synthesizer" as TileActionDef["id"],
        label: "Overload Fur Synth",
        detail: deps.buildDetailTextForAction("overload_fur_synthesizer", tile),
        ...tileActionAvailability(
          state.techIds.includes("overload-protocols") && state.gold >= 1000 && tile.economicStructure.status !== "under_construction" && downtimeRemainingMs <= 0,
          !state.techIds.includes("overload-protocols")
            ? "Requires Overload Protocols"
            : tile.economicStructure.status === "under_construction"
              ? "Fur Synthesizer still building"
              : downtimeRemainingMs > 0
                ? `Recovering for ${Math.ceil(downtimeRemainingMs / 3600000)}h`
                : "Need 1000 gold",
          "1000 gold • instant 25 SUPPLY • 24h shutdown"
        )
      });
    }
    if (tile.economicStructure?.type === "IRONWORKS" || tile.economicStructure?.type === "ADVANCED_IRONWORKS") {
      const downtimeRemainingMs = Math.max(0, (tile.economicStructure.disabledUntil ?? 0) - Date.now());
      out.push({
        id: "overload_ironworks" as TileActionDef["id"],
        label: "Overload Ironworks",
        detail: deps.buildDetailTextForAction("overload_ironworks", tile),
        ...tileActionAvailability(
          state.techIds.includes("overload-protocols") && state.gold >= 1000 && tile.economicStructure.status !== "under_construction" && downtimeRemainingMs <= 0,
          !state.techIds.includes("overload-protocols")
            ? "Requires Overload Protocols"
            : tile.economicStructure.status === "under_construction"
              ? "Ironworks still building"
              : downtimeRemainingMs > 0
                ? `Recovering for ${Math.ceil(downtimeRemainingMs / 3600000)}h`
                : "Need 1000 gold",
          "1000 gold • instant 25 IRON • 24h shutdown"
        )
      });
    }
    if (tile.economicStructure?.type === "CRYSTAL_SYNTHESIZER" || tile.economicStructure?.type === "ADVANCED_CRYSTAL_SYNTHESIZER") {
      const downtimeRemainingMs = Math.max(0, (tile.economicStructure.disabledUntil ?? 0) - Date.now());
      out.push({
        id: "overload_crystal_synthesizer" as TileActionDef["id"],
        label: "Overload Synthesizer",
        detail: deps.buildDetailTextForAction("overload_crystal_synthesizer", tile),
        ...tileActionAvailability(
          state.techIds.includes("overload-protocols") && state.gold >= 1000 && tile.economicStructure.status !== "under_construction" && downtimeRemainingMs <= 0,
          !state.techIds.includes("overload-protocols")
            ? "Requires Overload Protocols"
            : tile.economicStructure.status === "under_construction"
              ? "Synthesizer still building"
              : downtimeRemainingMs > 0
                ? `Recovering for ${Math.ceil(downtimeRemainingMs / 3600000)}h`
                : "Need 1000 gold",
          "1000 gold • instant 16 CRYSTAL • 24h shutdown"
        )
      });
    }
    if (tile.economicStructure && isConverterStructureType(tile.economicStructure.type)) {
      const downtimeRemainingMs = Math.max(0, (tile.economicStructure.disabledUntil ?? 0) - Date.now());
      if (tile.economicStructure.status === "active") {
        out.push({
          id: "disable_converter_structure" as TileActionDef["id"],
          label: `Disable ${economicStructureName(tile.economicStructure.type)}`,
          detail: deps.buildDetailTextForAction("disable_converter_structure", tile)
        });
      } else {
        out.push({
          id: "enable_converter_structure" as TileActionDef["id"],
          label: `Enable ${economicStructureName(tile.economicStructure.type)}`,
          detail: deps.buildDetailTextForAction("enable_converter_structure", tile),
          ...tileActionAvailability(
            tile.economicStructure.status !== "under_construction" && downtimeRemainingMs <= 0,
            tile.economicStructure.status === "under_construction"
              ? `${economicStructureName(tile.economicStructure.type)} still building`
              : downtimeRemainingMs > 0
                ? `Recovering for ${Math.ceil(downtimeRemainingMs / 3600000)}h`
                : "Needs enough gold for one upkeep tick",
            "Pays one upkeep tick immediately"
          )
        });
      }
    }
    if (tile.economicStructure?.type === "FUR_SYNTHESIZER") {
      out.push({
        id: "upgrade_fur_synthesizer" as TileActionDef["id"],
        label: "Upgrade Fur Synth",
        detail: deps.buildDetailTextForAction("upgrade_fur_synthesizer", tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          state.techIds.includes("advanced-synthetication") && state.gold >= deps.structureGoldCost("ADVANCED_FUR_SYNTHESIZER") && (state.strategicResources.SUPPLY ?? 0) >= 40,
          !state.techIds.includes("advanced-synthetication") ? "Requires Advanced Synthetication" : state.gold < deps.structureGoldCost("ADVANCED_FUR_SYNTHESIZER") ? `Need ${deps.structureGoldCost("ADVANCED_FUR_SYNTHESIZER")} gold` : "Need 40 SUPPLY",
          `${deps.structureCostText("ADVANCED_FUR_SYNTHESIZER")} • ${Math.round(economicStructureBuildMs("ADVANCED_FUR_SYNTHESIZER") / 60000)}m • 21.6 SUPPLY/day`,
          slots,
          deps
        )
      });
    }
    if (tile.economicStructure?.type === "IRONWORKS") {
      out.push({
        id: "upgrade_ironworks" as TileActionDef["id"],
        label: "Upgrade Ironworks",
        detail: deps.buildDetailTextForAction("upgrade_ironworks", tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          state.techIds.includes("advanced-synthetication") && state.gold >= deps.structureGoldCost("ADVANCED_IRONWORKS") && (state.strategicResources.IRON ?? 0) >= 40,
          !state.techIds.includes("advanced-synthetication") ? "Requires Advanced Synthetication" : state.gold < deps.structureGoldCost("ADVANCED_IRONWORKS") ? `Need ${deps.structureGoldCost("ADVANCED_IRONWORKS")} gold` : "Need 40 IRON",
          `${deps.structureCostText("ADVANCED_IRONWORKS")} • ${Math.round(economicStructureBuildMs("ADVANCED_IRONWORKS") / 60000)}m • 21.6 IRON/day`,
          slots,
          deps
        )
      });
    }
    if (tile.economicStructure?.type === "CRYSTAL_SYNTHESIZER") {
      out.push({
        id: "upgrade_crystal_synthesizer" as TileActionDef["id"],
        label: "Upgrade Crystal Synth",
        detail: deps.buildDetailTextForAction("upgrade_crystal_synthesizer", tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          state.techIds.includes("advanced-synthetication") && state.gold >= deps.structureGoldCost("ADVANCED_CRYSTAL_SYNTHESIZER") && (state.strategicResources.CRYSTAL ?? 0) >= 40,
          !state.techIds.includes("advanced-synthetication") ? "Requires Advanced Synthetication" : state.gold < deps.structureGoldCost("ADVANCED_CRYSTAL_SYNTHESIZER") ? `Need ${deps.structureGoldCost("ADVANCED_CRYSTAL_SYNTHESIZER")} gold` : "Need 40 CRYSTAL",
          `${deps.structureCostText("ADVANCED_CRYSTAL_SYNTHESIZER")} • ${Math.round(economicStructureBuildMs("ADVANCED_CRYSTAL_SYNTHESIZER") / 60000)}m • 14.4 CRYSTAL/day`,
          slots,
          deps
        )
      });
    }
    const removableStructure = structureLabelForRemoval(tile);
    const structureBusyRemoving =
      tile.fort?.status === "removing" ||
      tile.observatory?.status === "removing" ||
      tile.siegeOutpost?.status === "removing" ||
      tile.economicStructure?.status === "removing";
    const structureBusyConstructing =
      tile.fort?.status === "under_construction" ||
      tile.observatory?.status === "under_construction" ||
      tile.siegeOutpost?.status === "under_construction" ||
      tile.economicStructure?.status === "under_construction";
    if (removableStructure && !structureBusyConstructing && !structureBusyRemoving) {
      out.push({
        id: "remove_structure",
        label: `Remove ${removableStructure.label}`,
        detail: deps.buildDetailTextForAction("remove_structure", tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          tile.ownershipState === "SETTLED",
          "Requires settled owned tile",
          `${Math.round(removableStructure.durationMs / 60000)}m • disables structure effects during removal`,
          slots,
          deps
        )
      });
    }
    if (tile.ownershipState === "FRONTIER" && !queuedSettlement)
      out.push({
        id: "settle_land",
        label: "Settle Land",
        detail: deps.buildDetailTextForAction("settle_land", tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          canAffordCost(state.gold, SETTLE_COST),
          `Need ${SETTLE_COST} gold`,
          `${SETTLE_COST} gold • ${Math.round(settleDurationMsForTile(tile.x, tile.y) / 1000)}s${isForestTile(tile.x, tile.y) ? " (Forest)" : ""}`,
          slots,
          deps
        )
      });
    const hasWoodenFort = tile.economicStructure?.type === "WOODEN_FORT";
    const hasLightOutpost = tile.economicStructure?.type === "LIGHT_OUTPOST";
    if (
      tile.ownershipState === "SETTLED" &&
      buildShowsOnTile("WOODEN_FORT", tile, supportedTowns.length, supportedDocks.length) &&
      !tile.fort &&
      !tile.siegeOutpost &&
      !tile.observatory &&
      !tile.economicStructure &&
      !state.techIds.includes("masonry")
    ) {
      out.push({
        id: "build_wooden_fort" as TileActionDef["id"],
        label: "Build Wooden Fort",
        detail: deps.buildDetailTextForAction("build_wooden_fort", tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          state.gold >= deps.structureGoldCost("WOODEN_FORT"),
          `Need ${deps.structureGoldCost("WOODEN_FORT")} gold`,
          `${deps.structureCostText("WOODEN_FORT")} • ${Math.round(WOODEN_FORT_BUILD_MS / 60000)}m • def x${WOODEN_FORT_DEFENSE_MULT.toFixed(2)}`,
          slots,
          deps
        )
      });
    }
    if (
      tile.ownerId === state.me &&
      tile.ownershipState === "SETTLED" &&
      !tile.fort &&
      !tile.siegeOutpost &&
      !tile.observatory &&
      (!tile.economicStructure || hasWoodenFort)
    ) {
      const hasTech = state.techIds.includes("masonry");
      const fortGoldCost = deps.structureGoldCost("FORT");
      const hasGold = state.gold >= fortGoldCost;
      const hasIron = (state.strategicResources.IRON ?? 0) >= 45;
      out.push({
        id: "build_fortification",
        label: hasWoodenFort ? "Upgrade to Fort" : "Build Fort",
        detail: deps.buildDetailTextForAction("build_fortification", tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          hasTech && hasGold && hasIron && (!tile.economicStructure || hasWoodenFort),
          !hasTech
            ? "Requires Masonry"
            : tile.economicStructure && !hasWoodenFort
                ? "Tile already has structure"
                : !hasGold
                  ? `Need ${fortGoldCost} gold`
                  : !hasIron
                    ? "Need 45 IRON"
                    : "Unavailable",
          `${deps.structureCostText("FORT")} • ${Math.round(FORT_BUILD_MS / 60000)}m`,
          slots,
          deps
        )
      });
    }
    if (tile.ownershipState === "SETTLED" && buildShowsOnTile("OBSERVATORY", tile, supportedTowns.length, supportedDocks.length) && !tile.observatory) {
      const hasTech = state.techIds.includes("cartography");
      const observatoryGoldCost = deps.structureGoldCost("OBSERVATORY");
      const hasGold = state.gold >= observatoryGoldCost;
      const hasCrystal = (state.strategicResources.CRYSTAL ?? 0) >= 45;
      out.push({
        id: "build_observatory",
        label: "Build Observatory",
        detail: deps.buildDetailTextForAction("build_observatory", tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          hasTech && hasGold && hasCrystal && !tile.fort && !tile.siegeOutpost && !tile.economicStructure,
          !hasTech
            ? "Requires Cartography"
            : tile.fort || tile.siegeOutpost || tile.economicStructure
              ? "Tile already has structure"
              : !hasGold
                ? `Need ${observatoryGoldCost} gold`
                : !hasCrystal
                  ? "Need 45 CRYSTAL"
                  : "Unavailable",
          `${deps.structureCostText("OBSERVATORY")} • ${Math.round(OBSERVATORY_BUILD_MS / 60000)}m`,
          slots,
          deps
        )
      });
    }
    if (tile.ownershipState === "SETTLED" && !tile.economicStructure) {
      const airportGoldCost = deps.structureGoldCost("AIRPORT");
      if (buildShowsOnTile("AIRPORT", tile, supportedTowns.length, supportedDocks.length)) {
        out.push({
          id: "build_airport",
          label: "Build Airport",
          detail: deps.buildDetailTextForAction("build_airport", tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            state.techIds.includes("aeronautics") &&
              state.gold >= airportGoldCost &&
              (state.strategicResources.CRYSTAL ?? 0) >= 80 &&
              !tile.fort &&
              !tile.siegeOutpost &&
              !tile.observatory,
            !state.techIds.includes("aeronautics")
              ? "Requires Aeronautics"
              : tile.fort || tile.siegeOutpost || tile.observatory
                ? "Tile already has structure"
                : state.gold < airportGoldCost
                  ? `Need ${airportGoldCost} gold`
                  : "Need 80 CRYSTAL",
            `${deps.structureCostText("AIRPORT")} • ${Math.round(economicStructureBuildMs("AIRPORT") / 60000)}m`,
            slots,
            deps
          )
        });
      }
      if (buildShowsOnTile("RADAR_SYSTEM", tile, supportedTowns.length, supportedDocks.length)) {
        out.push({
          id: "build_radar_system",
          label: "Build Radar System",
          detail: deps.buildDetailTextForAction("build_radar_system", tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            state.techIds.includes("radar") &&
              state.gold >= 4000 &&
              (state.strategicResources.CRYSTAL ?? 0) >= 120 &&
              !tile.fort &&
              !tile.siegeOutpost &&
              !tile.observatory,
            !state.techIds.includes("radar")
              ? "Requires Radar"
              : tile.fort || tile.siegeOutpost || tile.observatory
                ? "Tile already has structure"
                : state.gold < 4000
                  ? "Need 4000 gold"
                  : "Need 120 CRYSTAL",
            `${deps.structureCostText("RADAR_SYSTEM")} • ${Math.round(economicStructureBuildMs("RADAR_SYSTEM") / 60000)}m • blocks bombardment within 30 tiles`,
            slots,
            deps
          )
        });
      }
      if (buildShowsOnTile("GOVERNORS_OFFICE", tile, supportedTowns.length, supportedDocks.length)) {
        out.push({
          id: "build_governors_office",
          label: "Build Governor's Office",
          detail: deps.buildDetailTextForAction("build_governors_office", tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            state.techIds.includes("civil-service") &&
              state.gold >= 2600 &&
              !tile.fort &&
              !tile.siegeOutpost &&
              !tile.observatory,
            !state.techIds.includes("civil-service")
              ? "Requires Civil Service"
              : tile.fort || tile.siegeOutpost || tile.observatory
                ? "Tile already has structure"
                : "Need 2600 gold",
            `${deps.structureCostText("GOVERNORS_OFFICE")} • ${Math.round(economicStructureBuildMs("GOVERNORS_OFFICE") / 60000)}m • reduces local upkeep`,
            slots,
            deps
          )
        });
      }
      if (buildShowsOnTile("FOUNDRY", tile, supportedTowns.length, supportedDocks.length)) {
        out.push({
          id: "build_foundry",
          label: "Build Foundry",
          detail: deps.buildDetailTextForAction("build_foundry", tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            state.techIds.includes("industrial-extraction") &&
              state.gold >= 4500 &&
              !tile.fort &&
              !tile.siegeOutpost &&
              !tile.observatory,
            !state.techIds.includes("industrial-extraction")
              ? "Requires Industrial Extraction"
              : tile.fort || tile.siegeOutpost || tile.observatory
                ? "Tile already has structure"
                : "Need 4500 gold",
            `${deps.structureCostText("FOUNDRY")} • ${Math.round(economicStructureBuildMs("FOUNDRY") / 60000)}m • doubles mines within 10 tiles`,
            slots,
            deps
          )
        });
      }
      if (buildShowsOnTile("GARRISON_HALL", tile, supportedTowns.length, supportedDocks.length)) {
        out.push({
          id: "build_garrison_hall",
          label: "Build Garrison Hall",
          detail: deps.buildDetailTextForAction("build_garrison_hall", tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            state.techIds.includes("standing-army") &&
              state.gold >= 2200 &&
              (state.strategicResources.CRYSTAL ?? 0) >= 80 &&
              !tile.fort &&
              !tile.siegeOutpost &&
              !tile.observatory,
            !state.techIds.includes("standing-army")
              ? "Requires Standing Army"
              : tile.fort || tile.siegeOutpost || tile.observatory
                ? "Tile already has structure"
                : state.gold < 2200
                  ? "Need 2200 gold"
                  : "Need 80 CRYSTAL",
            `${deps.structureCostText("GARRISON_HALL")} • ${Math.round(economicStructureBuildMs("GARRISON_HALL") / 60000)}m • +20% defense within 10 tiles • 25 gold / 10m`,
            slots,
            deps
          )
        });
      }
    }
    if (
      tile.ownershipState === "SETTLED" &&
      buildShowsOnTile("LIGHT_OUTPOST", tile, supportedTowns.length, supportedDocks.length) &&
      !tile.fort &&
      !tile.siegeOutpost &&
      !tile.observatory &&
      !tile.economicStructure &&
      !state.techIds.includes("leatherworking")
    ) {
      out.push({
        id: "build_light_outpost" as TileActionDef["id"],
        label: "Build Light Outpost",
        detail: deps.buildDetailTextForAction("build_light_outpost", tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          state.gold >= deps.structureGoldCost("LIGHT_OUTPOST"),
          `Need ${deps.structureGoldCost("LIGHT_OUTPOST")} gold`,
          `${deps.structureCostText("LIGHT_OUTPOST")} • ${Math.round(LIGHT_OUTPOST_BUILD_MS / 60000)}m • atk x${LIGHT_OUTPOST_ATTACK_MULT.toFixed(2)}`,
          slots,
          deps
        )
      });
    }
    if (
      tile.ownerId === state.me &&
      tile.ownershipState === "SETTLED" &&
      !tile.siegeOutpost &&
      !tile.fort &&
      !tile.observatory &&
      (!tile.economicStructure || hasLightOutpost)
    ) {
      const hasTech = state.techIds.includes("leatherworking");
      const siegeGoldCost = deps.structureGoldCost("SIEGE_OUTPOST");
      const hasGold = state.gold >= siegeGoldCost;
      const hasSupply = (state.strategicResources.SUPPLY ?? 0) >= 45;
      out.push({
        id: "build_siege_camp",
        label: hasLightOutpost ? "Upgrade to Siege Outpost" : "Build Siege Outpost",
        detail: deps.buildDetailTextForAction("build_siege_camp", tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          hasTech && hasGold && hasSupply && (!tile.economicStructure || hasLightOutpost),
          !hasTech
            ? "Requires Leatherworking"
            : tile.economicStructure && !hasLightOutpost
                ? "Tile already has structure"
                : !hasGold
                  ? `Need ${siegeGoldCost} gold`
                  : !hasSupply
                    ? "Need 45 SUPPLY"
                    : "Unavailable",
          `${deps.structureCostText("SIEGE_OUTPOST")} • ${Math.round(SIEGE_OUTPOST_BUILD_MS / 60000)}m`,
          slots,
          deps
        )
      });
    }
    if (tile.ownershipState === "SETTLED") {
      if (tile.resource === "FARM" || tile.resource === "FISH") {
        out.push({
          id: "build_farmstead",
          label: "Build Farmstead",
          detail: deps.buildDetailTextForAction("build_farmstead", tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            !hasBlockingStructure && state.techIds.includes("agriculture") && state.gold >= 700 && (state.strategicResources.FOOD ?? 0) >= 20,
            hasBlockingStructure ? "Tile already has structure" : !state.techIds.includes("agriculture") ? "Requires Agriculture" : state.gold < 700 ? "Need 700 gold" : "Need 20 FOOD",
            `700 gold + 20 FOOD • ${Math.round(economicStructureBuildMs("FARMSTEAD") / 60000)}m`,
            slots,
            deps
          )
        });
      }
      if (tile.resource === "WOOD" || tile.resource === "FUR") {
        out.push({
          id: "build_camp",
          label: "Build Camp",
          detail: deps.buildDetailTextForAction("build_camp", tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            !hasBlockingStructure && state.techIds.includes("leatherworking") && state.gold >= 800 && (state.strategicResources.SUPPLY ?? 0) >= 30,
            hasBlockingStructure ? "Tile already has structure" : !state.techIds.includes("leatherworking") ? "Requires Leatherworking" : state.gold < 800 ? "Need 800 gold" : "Need 30 SUPPLY",
            `800 gold + 30 SUPPLY • ${Math.round(economicStructureBuildMs("CAMP") / 60000)}m`,
            slots,
            deps
          )
        });
      }
      if (tile.resource === "IRON" || tile.resource === "GEMS") {
        const matchingNeed = tile.resource === "IRON" ? "IRON" : "CRYSTAL";
        out.push({
          id: "build_mine",
          label: "Build Mine",
          detail: deps.buildDetailTextForAction("build_mine", tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            !hasBlockingStructure && state.techIds.includes("mining") && state.gold >= 800 && (state.strategicResources[matchingNeed] ?? 0) >= 30,
            hasBlockingStructure ? "Tile already has structure" : !state.techIds.includes("mining") ? "Requires Mining" : state.gold < 800 ? "Need 800 gold" : `Need 30 ${matchingNeed}`,
            `800 gold + 30 ${matchingNeed} • ${Math.round(economicStructureBuildMs("MINE") / 60000)}m`,
            slots,
            deps
          )
        });
      }
      if (townBuildSource) {
        const townHasMarket = Boolean(townBuildSource.town?.hasMarket) || deps.townHasSupportStructure(townBuildSource, "MARKET");
        const townHasGranary = Boolean(townBuildSource.town?.hasGranary) || deps.townHasSupportStructure(townBuildSource, "GRANARY");
        const townHasBank = Boolean(townBuildSource.town?.hasBank) || deps.townHasSupportStructure(townBuildSource, "BANK");
        const townHasCaravanary = deps.townHasSupportStructure(townBuildSource, "CARAVANARY");
        const townHasFurSynth = deps.townHasSupportStructure(townBuildSource, "FUR_SYNTHESIZER");
        const townHasIronworks = deps.townHasSupportStructure(townBuildSource, "IRONWORKS");
        const townHasCrystalSynth = deps.townHasSupportStructure(townBuildSource, "CRYSTAL_SYNTHESIZER");
        const townHasFuelPlant = deps.townHasSupportStructure(townBuildSource, "FUEL_PLANT");
        out.push({
          id: "build_market",
          label: "Build Market",
          detail: deps.buildDetailTextForAction("build_market", tile, townBuildSource),
          ...tileActionAvailabilityWithDevelopmentSlot(
            !supportPlacementBlocked && !townHasMarket && state.techIds.includes("trade") && state.gold >= 1200 && (state.strategicResources.CRYSTAL ?? 0) >= 40,
            supportPlacementBlocked
              ? "Tile already has structure"
              : townHasMarket
                ? "Nearby town already has Market"
                : !state.techIds.includes("trade")
                  ? "Requires Trade"
                  : state.gold < 1200
                    ? "Need 1200 gold"
                    : "Need 40 CRYSTAL",
            `1200 gold + 40 CRYSTAL • ${Math.round(economicStructureBuildMs("MARKET") / 60000)}m`,
            slots,
            deps
          )
        });
        out.push({
          id: "build_granary",
          label: "Build Granary",
          detail: deps.buildDetailTextForAction("build_granary", tile, townBuildSource),
          ...tileActionAvailabilityWithDevelopmentSlot(
            !supportPlacementBlocked && !townHasGranary && state.techIds.includes("pottery") && state.gold >= 700 && (state.strategicResources.FOOD ?? 0) >= 40,
            supportPlacementBlocked
              ? "Tile already has structure"
              : townHasGranary
                ? "Nearby town already has Granary"
                : !state.techIds.includes("pottery")
                  ? "Requires Pottery"
                  : state.gold < 700
                    ? "Need 700 gold"
                    : "Need 40 FOOD",
            `700 gold + 40 FOOD • ${Math.round(economicStructureBuildMs("GRANARY") / 60000)}m`,
            slots,
            deps
          )
        });
        out.push({
          id: "build_bank",
          label: "Build Bank",
          detail: deps.buildDetailTextForAction("build_bank", tile, townBuildSource),
          ...tileActionAvailabilityWithDevelopmentSlot(
            !supportPlacementBlocked && !townHasBank && state.techIds.includes("coinage") && state.gold >= 1600 && (state.strategicResources.CRYSTAL ?? 0) >= 60,
            supportPlacementBlocked
              ? "Tile already has structure"
              : townHasBank
                ? "Nearby town already has Bank"
                : !state.techIds.includes("coinage")
                  ? "Requires Coinage"
                  : state.gold < 1600
                    ? "Need 1600 gold"
                    : "Need 60 CRYSTAL",
            `1600 gold + 60 CRYSTAL • ${Math.round(economicStructureBuildMs("BANK") / 60000)}m`,
            slots,
            deps
          )
        });
        out.push({
          id: "build_caravanary",
          label: "Build Caravanary",
          detail: deps.buildDetailTextForAction("build_caravanary", tile, townBuildSource),
          ...tileActionAvailabilityWithDevelopmentSlot(
            !supportPlacementBlocked && !townHasCaravanary && state.techIds.includes("ledger-keeping") && state.gold >= 1800 && (state.strategicResources.CRYSTAL ?? 0) >= 60,
            supportPlacementBlocked ? "Tile already has structure" : townHasCaravanary ? "Nearby town already has Caravanary" : !state.techIds.includes("ledger-keeping") ? "Requires Ledger Keeping" : state.gold < 1800 ? "Need 1800 gold" : "Need 60 CRYSTAL",
            `1800 gold + 60 CRYSTAL • ${Math.round(economicStructureBuildMs("CARAVANARY") / 60000)}m • +25% connected-town bonus • 1.5 gold / minute`,
            slots,
            deps
          )
        });
        out.push({
          id: "build_fur_synthesizer",
          label: "Build Fur Synthesizer",
          detail: deps.buildDetailTextForAction("build_fur_synthesizer", tile, townBuildSource),
          ...tileActionAvailabilityWithDevelopmentSlot(
            !supportPlacementBlocked && !townHasFurSynth && state.techIds.includes("workshops") && state.gold >= 2200,
            supportPlacementBlocked ? "Tile already has structure" : townHasFurSynth ? "Nearby town already has Fur Synthesizer" : !state.techIds.includes("workshops") ? "Requires Workshops" : "Need 2200 gold",
            `2200 gold • ${Math.round(economicStructureBuildMs("FUR_SYNTHESIZER") / 60000)}m • 18 SUPPLY/day • 12 gold / minute`,
            slots,
            deps
          )
        });
        out.push({
          id: "build_ironworks",
          label: "Build Ironworks",
          detail: deps.buildDetailTextForAction("build_ironworks", tile, townBuildSource),
          ...tileActionAvailabilityWithDevelopmentSlot(
            !supportPlacementBlocked && !townHasIronworks && state.techIds.includes("alchemy") && state.gold >= 2400,
            supportPlacementBlocked ? "Tile already has structure" : townHasIronworks ? "Nearby town already has Ironworks" : !state.techIds.includes("alchemy") ? "Requires Alchemy" : "Need 2400 gold",
            `2400 gold • ${Math.round(economicStructureBuildMs("IRONWORKS") / 60000)}m • 18 IRON/day • 12 gold / minute`,
            slots,
            deps
          )
        });
        out.push({
          id: "build_crystal_synthesizer",
          label: "Build Crystal Synthesizer",
          detail: deps.buildDetailTextForAction("build_crystal_synthesizer", tile, townBuildSource),
          ...tileActionAvailabilityWithDevelopmentSlot(
            !supportPlacementBlocked && !townHasCrystalSynth && state.techIds.includes("crystal-lattices") && state.gold >= 2800,
            supportPlacementBlocked ? "Tile already has structure" : townHasCrystalSynth ? "Nearby town already has Crystal Synthesizer" : !state.techIds.includes("crystal-lattices") ? "Requires Crystal Lattices" : "Need 2800 gold",
            `2800 gold • ${Math.round(economicStructureBuildMs("CRYSTAL_SYNTHESIZER") / 60000)}m • 12 CRYSTAL/day • 16 gold / minute`,
            slots,
            deps
          )
        });
        out.push({
          id: "build_fuel_plant",
          label: "Build Fuel Plant",
          detail: deps.buildDetailTextForAction("build_fuel_plant", tile, townBuildSource),
          ...tileActionAvailabilityWithDevelopmentSlot(
            !supportPlacementBlocked && !townHasFuelPlant && state.techIds.includes("plastics") && state.gold >= 3200,
            supportPlacementBlocked ? "Tile already has structure" : townHasFuelPlant ? "Nearby town already has Fuel Plant" : !state.techIds.includes("plastics") ? "Requires Plastics" : "Need 3200 gold",
            `3200 gold • ${Math.round(economicStructureBuildMs("FUEL_PLANT") / 60000)}m • 10 OIL/day • 18 gold / minute`,
            slots,
            deps
          )
        });
      } else if (!tile.town && supportedTowns.length > 1) {
        out.push({
          id: "build_market",
          label: "Build Market",
          disabled: true,
          disabledReason: "Support tile touches multiple towns"
        });
        out.push({
          id: "build_granary",
          label: "Build Granary",
          disabled: true,
          disabledReason: "Support tile touches multiple towns"
        });
        out.push({ id: "build_bank", label: "Build Bank", disabled: true, disabledReason: "Support tile touches multiple towns" });
        out.push({ id: "build_caravanary", label: "Build Caravanary", disabled: true, disabledReason: "Support tile touches multiple towns" });
        out.push({ id: "build_fur_synthesizer", label: "Build Fur Synthesizer", disabled: true, disabledReason: "Support tile touches multiple towns" });
        out.push({ id: "build_ironworks", label: "Build Ironworks", disabled: true, disabledReason: "Support tile touches multiple towns" });
        out.push({ id: "build_crystal_synthesizer", label: "Build Crystal Synthesizer", disabled: true, disabledReason: "Support tile touches multiple towns" });
        out.push({ id: "build_fuel_plant", label: "Build Fuel Plant", disabled: true, disabledReason: "Support tile touches multiple towns" });
      }
      if (tile.dockId) {
        out.push({
          id: "build_customs_house",
          label: "Build Customs House",
          detail: deps.buildDetailTextForAction("build_customs_house", tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            !hasBlockingStructure && state.techIds.includes("global-trade-networks") && state.gold >= 1800 && (state.strategicResources.CRYSTAL ?? 0) >= 60,
            hasBlockingStructure ? "Tile already has structure" : !state.techIds.includes("global-trade-networks") ? "Requires Global Trade Networks" : state.gold < 1800 ? "Need 1800 gold" : "Need 60 CRYSTAL",
            `1800 gold + 60 CRYSTAL • ${Math.round(economicStructureBuildMs("CUSTOMS_HOUSE") / 60000)}m • +50% dock income • 1.5 gold / minute`,
            slots,
            deps
          )
        });
      }
    }
    out.push(createMountainAction());
    if (tile.town?.populationTier !== "SETTLEMENT") out.push({ id: "abandon_territory", label: "Abandon Territory" });
    return out;
  }
  if (deps.isTileOwnedByAlly(tile)) return [];
  if (tile.ownerId === "barbarian") {
    const previewDetail = deps.attackPreviewDetailForTarget(tile);
    const breachPreviewDetail = deps.attackPreviewDetailForTarget(tile, "breakthrough");
    const previewPending = deps.attackPreviewPendingForTarget(tile);
    const reachable = Boolean(deps.pickOriginForTarget(tile.x, tile.y, false)) || Boolean(tile.dockId);
    const actions: TileActionDef[] = [
      {
        id: "launch_attack",
        label: "Launch Attack",
        ...(previewDetail || previewPending ? { detail: previewDetail ?? "Calculating win chance...", loading: previewPending } : {}),
        ...tileActionAvailability(
          reachable && state.gold >= FRONTIER_CLAIM_COST,
          !reachable ? "No bordering origin tile or linked dock" : `Need ${FRONTIER_CLAIM_COST} gold`,
          `${FRONTIER_CLAIM_COST} gold`
        )
      }
    ];
    if (hasBreakthroughCapability(state)) {
      actions.push({
        id: "launch_breach_attack",
        label: "Launch Breach Attack",
        ...(breachPreviewDetail || previewPending ? { detail: breachPreviewDetail ?? "Calculating breach chance...", loading: previewPending } : {}),
        ...tileActionAvailability(
          (Boolean(deps.pickOriginForTarget(tile.x, tile.y)) || Boolean(tile.dockId)) && state.gold >= 2 && (state.strategicResources.IRON ?? 0) >= 1,
          !(Boolean(deps.pickOriginForTarget(tile.x, tile.y)) || Boolean(tile.dockId))
            ? "No bordering origin tile or linked dock"
            : state.gold < 2
              ? "Need 2 gold"
              : "Need 1 IRON",
          "2 gold + 1 IRON"
        )
      });
    }
    actions.push(createMountainAction());
    return actions;
  }
  const reachable = Boolean(deps.pickOriginForTarget(tile.x, tile.y, false)) || Boolean(tile.dockId);
  const targetShielded = Boolean(tile.ownerId && tile.ownerId !== state.me && deps.ownerSpawnShieldActive(tile.ownerId));
  const targetShieldedReason = "Empire is under spawn protection";
  const previewDetail = deps.attackPreviewDetailForTarget(tile);
  const breachPreviewDetail = deps.attackPreviewDetailForTarget(tile, "breakthrough");
  const previewPending = deps.attackPreviewPendingForTarget(tile);
  const connectedRegionSize = connectedEnemyRegionKeys(state, tile, {
    keyFor: deps.keyFor,
    wrapX: deps.wrapX,
    wrapY: deps.wrapY
  }).length;
  const out: TileActionDef[] = [
    {
      id: "launch_attack",
      label: "Launch Attack",
      ...(previewDetail || previewPending ? { detail: previewDetail ?? "Calculating win chance...", loading: previewPending } : {}),
      ...tileActionAvailability(
        !targetShielded && reachable && state.gold >= FRONTIER_CLAIM_COST,
        targetShielded ? targetShieldedReason : !reachable ? "No bordering origin tile or linked dock" : `Need ${FRONTIER_CLAIM_COST} gold`,
        `${FRONTIER_CLAIM_COST} gold`
      )
    }
  ];
  if (connectedRegionSize > 1) {
    out.push({
      id: "attack_connected_region",
      label: `Attack Connected Region (${connectedRegionSize})`,
      detail: "Queue attacks across this visible connected enemy region from the edge inward.",
      ...tileActionAvailability(
        !targetShielded && reachable && state.gold >= FRONTIER_CLAIM_COST,
        targetShielded ? targetShieldedReason : !reachable ? "No bordering origin tile or linked dock" : `Need ${FRONTIER_CLAIM_COST} gold`,
        `${FRONTIER_CLAIM_COST} gold each`
      )
    });
  }
  if (hasBreakthroughCapability(state)) {
    out.push({
      id: "launch_breach_attack",
      label: "Launch Breach Attack",
      ...(breachPreviewDetail || previewPending ? { detail: breachPreviewDetail ?? "Calculating breach chance...", loading: previewPending } : {}),
      ...tileActionAvailability(
        !targetShielded && reachable && state.gold >= 2 && (state.strategicResources.IRON ?? 0) >= 1,
        targetShielded
          ? targetShieldedReason
          : !reachable
            ? "No bordering origin tile or linked dock"
            : state.gold < 2
              ? "Need 2 gold"
              : "Need 1 IRON",
        "2 gold + 1 IRON"
      )
    });
  }
  const observatoryProtection = deps.hostileObservatoryProtectingTile(tile);
  out.push({
    id: "aether_bridge",
    label: "Aether Bridge",
    ...tileActionAvailability(
      hasAetherBridgeCapability(state) &&
        tile.terrain === "LAND" &&
        [
          deps.terrainAt(tile.x, tile.y - 1),
          deps.terrainAt(tile.x + 1, tile.y),
          deps.terrainAt(tile.x, tile.y + 1),
          deps.terrainAt(tile.x - 1, tile.y)
        ].includes("SEA") &&
        (!tile.ownerId || !observatoryProtection) &&
        deps.abilityCooldownRemainingMs("aether_bridge") <= 0 &&
        (state.strategicResources.CRYSTAL ?? 0) >= 30,
      !hasAetherBridgeCapability(state)
        ? "Requires Aether Bridge"
        : tile.terrain !== "LAND" || ![
              deps.terrainAt(tile.x, tile.y - 1),
              deps.terrainAt(tile.x + 1, tile.y),
              deps.terrainAt(tile.x, tile.y + 1),
              deps.terrainAt(tile.x - 1, tile.y)
            ].includes("SEA")
          ? "Target must be coastal land"
          : tile.ownerId && observatoryProtection
            ? "Landing blocked by enemy observatory"
            : deps.abilityCooldownRemainingMs("aether_bridge") > 0
              ? `Cooldown ${deps.formatCooldownShort(deps.abilityCooldownRemainingMs("aether_bridge"))}`
              : "Need 30 CRYSTAL",
      "30 CRYSTAL • crosses up to 4 sea tiles"
    )
  });
  if (tile.ownerId && tile.ownerId !== state.me && tile.ownerId !== "barbarian") {
    const activeTruce = deps.activeTruceWithPlayer(tile.ownerId);
    if (activeTruce) {
      out.push({
        id: "break_truce",
        label: "Break Truce",
        ...tileActionAvailability(true, "", "Break current truce")
      });
    } else {
      out.push({
        id: "offer_truce_12h",
        label: "Offer Truce 12h",
        ...tileActionAvailability(state.activeTruces.length < 1, "You already have an active truce", "12h")
      });
      out.push({
        id: "offer_truce_24h",
        label: "Offer Truce 24h",
        ...tileActionAvailability(state.activeTruces.length < 1, "You already have an active truce", "24h")
      });
    }
    const revealCost = 20;
    const revealActive = state.activeRevealTargets.includes(tile.ownerId);
    const hasCapability = hasRevealCapability(state);
    const hasCapacity = state.revealCapacity > 0 && state.activeRevealTargets.length < 1;
    const hasCrystal = (state.strategicResources.CRYSTAL ?? 0) >= revealCost;
    out.push({
      id: "reveal_empire",
      label: revealActive ? "Cancel Reveal Empire" : "Reveal Empire",
      ...tileActionAvailability(
        revealActive || (hasCapability && hasCapacity && hasCrystal),
        revealActive ? "Stop revealing this empire" : !hasCapability ? "Requires Cryptography" : !hasCapacity ? "Reveal capacity full" : "Need crystal",
        revealActive ? "Cancel current reveal" : "20 CRYSTAL • 0.15 / 10m"
      )
    });
    const sabotageCooldown = deps.abilityCooldownRemainingMs("siphon");
    out.push({
      id: "siphon_tile",
      label: "Siphon",
      ...tileActionAvailability(
        hasSiphonCapability(state) &&
          !observatoryProtection &&
          sabotageCooldown <= 0 &&
          (state.strategicResources.CRYSTAL ?? 0) >= 20 &&
          Boolean(tile.resource || tile.town) &&
          !tile.sabotage,
        !hasSiphonCapability(state)
          ? "Requires Cryptography"
          : observatoryProtection
            ? "Blocked by observatory field"
            : tile.sabotage
              ? "Already siphoned"
              : !(tile.resource || tile.town)
                ? "Town or resource only"
                : sabotageCooldown > 0
                  ? `Cooldown ${deps.formatCooldownShort(sabotageCooldown)}`
                  : "Need 20 CRYSTAL",
        "20 CRYSTAL • steals 50% for 30m"
      )
    });
  }
  out.push(createMountainAction());
  return out;
};
