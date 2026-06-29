import {
  buildAetherWallSegments,
  type TownGrowthUpgradeView,
  nextTownGrowthUpgrade,
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
  structureBuildGoldCost,
  structureBuildManpowerCost,
  structureBuildDurationMs,
  structurePlacementMetadata,
  structureShowsOnTile,
  bestFortTierForTech,
  FORT_VARIANT_LABELS,
  nextFortTierForUpgrade,
  type FortTierInfo,
  bestSiegeTierForTech,
  nextSiegeTierForUpgrade,
  SIEGE_VARIANT_LABELS,
  type SiegeTierInfo,
  terrainAt
} from "@border-empires/shared";
import { AIRPORT_BOMBARD_RADIUS, OBSERVATORY_VISION_BONUS, canAffordCost, frontierClaimCostLabelForTile, isForestTile } from "../client-constants.js";
import { tileSyncDebugEnabled } from "../client-debug/client-debug.js";
import { connectedEnemyRegionKeys } from "../client-connected-region/client-connected-region.js";
import { hasQueuedSettlementForTile } from "../client-development-queue/client-development-queue.js";
import { economicStructureBuildMs, economicStructureName } from "../client-map-display.js";
import { settleDurationMsForState, type DevelopmentSlotSummary } from "../client-queue-logic/client-queue-logic.js";
import type { RealtimeSocket } from "../client-socket-types.js";
import type { ClientState } from "../client-state/client-state.js";
import type {
  ActiveTruceView,
  CrystalTargetingAbility,
  FeedSeverity,
  FeedType,
  Tile,
  TileActionDef
} from "../client-types.js";
import { ownedActiveObservatoryWithinRange } from "../client-tile-action-support/client-tile-action-support.js";
import { readyOwnedObservatoryCooldownRemainingMs } from "../client-observatory-cooldown/client-observatory-cooldown.js";
import { ownObservatoryRange } from "../client-observatory-rules/client-observatory-rules.js";
import { buildMusterActions } from "../client-muster-tile-actions.js";

type BuildableStructureId = BuildableStructureType;
type AbilityCooldownId = keyof ClientState["abilityCooldowns"];
type AetherWallLength = 1 | 2 | 3;

const structureLabelForRemoval = (tile: Tile): { label: string; durationMs: number } | undefined => {
  if (tile.fort) return { label: "Fort", durationMs: structureBuildDurationMs("FORT") };
  if (tile.observatory) return { label: "Observatory", durationMs: structureBuildDurationMs("OBSERVATORY") };
  if (tile.siegeOutpost) return { label: "Siege Outpost", durationMs: structureBuildDurationMs("SIEGE_OUTPOST") };
  if (tile.economicStructure) return { label: economicStructureName(tile.economicStructure.type), durationMs: economicStructureBuildMs(tile.economicStructure.type) };
  return undefined;
};

const townGrowthActionForUpgrade = (
  state: ClientState,
  upgrade: TownGrowthUpgradeView | undefined
): TileActionDef | undefined => {
  if (!upgrade?.available) return undefined;
  const food = state.strategicResources?.FOOD ?? 0;
  const enabled = food >= upgrade.foodCost;
  const id =
    upgrade.targetTier === "CITY"
      ? "grow_town_to_city"
      : upgrade.targetTier === "GREAT_CITY"
        ? "grow_city_to_great_city"
        : "grow_great_city_to_monumental_city";
  const label =
    upgrade.targetTier === "CITY"
      ? "Upgrade Town to City"
      : upgrade.targetTier === "GREAT_CITY"
        ? "Upgrade City to Great City"
        : "Upgrade Great City to Metropolis";
  const detail =
    upgrade.targetTier === "CITY"
      ? "Unlocks city-tier income and manpower. Food upkeep rises to 0.3/m."
      : upgrade.targetTier === "GREAT_CITY"
        ? "Unlocks great-city income and manpower. Food upkeep rises to 0.6/m."
        : "Unlocks metropolis-tier income and manpower. Food upkeep rises to 1.0/m.";
  return {
    id,
    label,
    ...(enabled ? { detail } : {}),
    ...tileActionAvailability(enabled, `Need ${upgrade.foodCost} food`, `${upgrade.foodCost} food`)
  };
};

export {
  crystalTargetingTitle,
  crystalTargetingTone,
  clearCrystalTargeting,
  computeCrystalTargets,
  beginCrystalTargeting,
  executeCrystalTargeting
} from "./client-crystal-targeting.js";

export type TileActionLogicDeps = {
  keyFor: (x: number, y: number) => string;
  parseKey: (k: string) => { x: number; y: number };
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
  terrainAt: typeof terrainAt;
  chebyshevDistanceClient: (ax: number, ay: number, bx: number, by: number) => number;
  isTileOwnedByAlly: (tile: Tile) => boolean;
  hostileObservatoryProtectingTile: (tile: Tile) => Tile | undefined;
  abilityCooldownRemainingMs: (ability: AbilityCooldownId) => number;
  formatCooldownShort: (ms: number) => string;
  pushFeed: (msg: string, type?: FeedType, severity?: FeedSeverity) => void;
  hideTileActionMenu: () => void;
  selectedTile: () => Tile | undefined;
  renderHud: () => void;
  requireAuthedSession: (message?: string) => boolean;
  ws: RealtimeSocket;
  attackPreviewDetailForTarget: (to: Tile) => string | undefined;
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
    structureType:
      | "MARKET"
      | "GRANARY"
      | "CENSUS_HALL"
      | "BANK"
      | "CLEARING_HOUSE"
      | "CARAVANARY"
      | "FUR_SYNTHESIZER"
      | "IRONWORKS"
      | "CRYSTAL_SYNTHESIZER"
      | "EXCHANGE_HOUSE"
      | "RAIL_DEPOT"
      | "IMPERIAL_EXCHANGE_PART"
      | "WORLD_ENGINE_PART"
      | "AEGIS_DOME_PART"
      | "ASTRAL_DOCK_PART"
  ) => boolean;
  activeTruceWithPlayer: (playerId?: string | null) => ActiveTruceView | undefined;
  pendingTruceWithPlayer: (playerId?: string | null) => "incoming" | "outgoing" | undefined;
  ownerSpawnShieldActive: (ownerId: string) => boolean;
  connectedOwnedFrontierKeysFor: (tile: Tile) => string[];
};

export const hasRevealCapability = (state: ClientState): boolean =>
  state.techIds.includes("beacon-towers") || state.activeRevealTargets.length > 0;

export const hasAetherBridgeCapability = (state: ClientState): boolean => state.techIds.includes("navigation");

export const hasLocalDevAetherWallOverride = (state: ClientState): boolean => state.localhostDevAetherWall === true;

export const hasAetherWallCapability = (state: ClientState): boolean =>
  state.techIds.includes("harborcraft") || hasLocalDevAetherWallOverride(state);
export const hasSiphonCapability = (state: ClientState): boolean => state.techIds.includes("logistics");
export const hasRetortRecastingCapability = (state: ClientState): boolean => state.techIds.includes("advanced-synthetication");

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

export const aetherWallDirectionLabel = (direction: ClientState["aetherWallTargeting"]["direction"]): string => {
  if (direction === "N") return "North";
  if (direction === "E") return "East";
  if (direction === "S") return "South";
  return "West";
};

export const canPlaceAetherWallFromOrigin = (
  state: ClientState,
  originX: number,
  originY: number,
  direction: ClientState["aetherWallTargeting"]["direction"],
  length: AetherWallLength,
  deps: Pick<TileActionLogicDeps, "wrapX" | "wrapY" | "keyFor" | "terrainAt">
): boolean => {
  const localhostOverride = hasLocalDevAetherWallOverride(state);
  const segments = buildAetherWallSegments(originX, originY, direction, length, deps.wrapX, deps.wrapY);
  if (segments.length !== length) return false;
  for (const segment of segments) {
    const baseTile = state.tiles.get(deps.keyFor(segment.baseX, segment.baseY));
    if (!baseTile || baseTile.fogged || baseTile.ownerId !== state.me || baseTile.terrain !== "LAND") {
      return false;
    }
    if (!localhostOverride && baseTile.ownershipState !== "SETTLED") {
      return false;
    }
    const outwardTile = state.tiles.get(deps.keyFor(segment.toX, segment.toY));
    if (outwardTile) {
      if (outwardTile.fogged || outwardTile.terrain !== "LAND" || outwardTile.ownerId === state.me) return false;
      continue;
    }
    if (!localhostOverride) return false;
    if (deps.terrainAt(segment.toX, segment.toY) !== "LAND") return false;
  }
  return true;
};

export const validAetherWallDirectionsForTile = (
  state: ClientState,
  tile: Tile,
  deps: Pick<TileActionLogicDeps, "wrapX" | "wrapY" | "keyFor" | "terrainAt">
): Array<ClientState["aetherWallTargeting"]["direction"]> => {
  if (tile.fogged || tile.ownerId !== state.me || tile.terrain !== "LAND") return [];
  if (!hasLocalDevAetherWallOverride(state) && tile.ownershipState !== "SETTLED") return [];
  const out: Array<ClientState["aetherWallTargeting"]["direction"]> = [];
  const directions: Array<ClientState["aetherWallTargeting"]["direction"]> = ["N", "E", "S", "W"];
  for (const direction of directions) {
    if ([1, 2, 3].some((length) => canPlaceAetherWallFromOrigin(state, tile.x, tile.y, direction, length as 1 | 2 | 3, deps))) out.push(direction);
  }
  return out;
};

export const aetherWallDirectionTargetTiles = (
  state: ClientState,
  tile: Tile,
  deps: Pick<TileActionLogicDeps, "wrapX" | "wrapY" | "keyFor" | "terrainAt">
): Array<{ x: number; y: number; direction: ClientState["aetherWallTargeting"]["direction"]; dx: number; dy: number }> =>
  validAetherWallDirectionsForTile(state, tile, deps)
    .map((direction) => {
      const segment = buildAetherWallSegments(tile.x, tile.y, direction, 1, deps.wrapX, deps.wrapY)[0];
      if (!segment) return undefined;
      return {
        x: segment.toX,
        y: segment.toY,
        direction,
        dx: segment.toX - segment.baseX,
        dy: segment.toY - segment.baseY
      };
    })
    .filter((value): value is { x: number; y: number; direction: ClientState["aetherWallTargeting"]["direction"]; dx: number; dy: number } => Boolean(value));

type FortVariantAction = { label: string; gold: number; iron: number; defenseMult: number; summary: string };

const fortActionFromTier = (tier: FortTierInfo): FortVariantAction => ({
  label: FORT_VARIANT_LABELS[tier.variant],
  gold: tier.gold,
  iron: tier.iron,
  defenseMult: tier.defenseMult,
  summary: `${tier.gold} gold + ${tier.manpower} manpower + ${tier.iron} IRON`,
});

const fortBuildVariantForState = (state: ClientState): FortVariantAction =>
  fortActionFromTier(bestFortTierForTech((id) => state.techIds.includes(id)));

const nextFortVariantForTile = (
  state: ClientState,
  tile: Tile,
): FortVariantAction | undefined => {
  if (tile.fort) {
    const result = nextFortTierForUpgrade(tile.fort.variant, (id) => state.techIds.includes(id));
    return result ? fortActionFromTier(result) : undefined;
  }
  return fortBuildVariantForState(state);
};

type SiegeVariantAction = { label: string; gold: number; supply: number; iron: number; attackMult: number; summary: string };

const siegeActionFromTier = (tier: SiegeTierInfo): SiegeVariantAction => ({
  label: SIEGE_VARIANT_LABELS[tier.variant],
  gold: tier.gold,
  supply: tier.supply,
  iron: tier.iron,
  attackMult: tier.attackMult,
  summary: tier.iron > 0
    ? `${tier.gold} gold + ${tier.manpower} manpower + ${tier.supply} SUPPLY + ${tier.iron} IRON`
    : `${tier.gold} gold + ${tier.manpower} manpower + ${tier.supply} SUPPLY`,
});

const siegeBuildVariantForState = (state: ClientState): SiegeVariantAction =>
  siegeActionFromTier(bestSiegeTierForTech((id) => state.techIds.includes(id)));

const nextSiegeVariantForTile = (
  state: ClientState,
  tile: Tile,
): SiegeVariantAction | undefined => {
  if (tile.siegeOutpost) {
    const result = nextSiegeTierForUpgrade(tile.siegeOutpost.variant, (id) => state.techIds.includes(id));
    return result ? siegeActionFromTier(result) : undefined;
  }
  return siegeBuildVariantForState(state);
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



export const tileActionAvailability = (
  enabled: boolean,
  reason: string,
  cost?: string
): Pick<TileActionDef, "disabled" | "disabledReason" | "cost"> => {
  if (enabled) return cost ? { disabled: false, cost } : { disabled: false };
  return cost ? { disabled: true, disabledReason: reason, cost } : { disabled: true, disabledReason: reason };
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
  deps?: Partial<Pick<TileActionLogicDeps, "developmentSlotSummary" | "developmentSlotReason">>
): Pick<TileActionDef, "disabled" | "disabledReason" | "cost"> => {
  const slotSummary = summary ?? deps?.developmentSlotSummary?.();
  if (!slotSummary) return tileActionAvailability(enabledWithoutSlot, baseReason, cost);
  if (slotSummary.available <= 0 && enabledWithoutSlot) {
    return tileActionAvailability(
      true,
      deps?.developmentSlotReason?.(slotSummary) ?? baseReason,
      cost ? `${cost} • queues` : "Queues when slot frees up"
    );
  }
  if (slotSummary.available <= 0) return tileActionAvailability(false, baseReason, cost);
  return tileActionAvailability(enabledWithoutSlot, baseReason, cost);
};

const isConverterStructureType = (type: NonNullable<Tile["economicStructure"]>["type"]): boolean =>
  type === "FUR_SYNTHESIZER" ||
  type === "ADVANCED_FUR_SYNTHESIZER" ||
  type === "IRONWORKS" ||
  type === "ADVANCED_IRONWORKS" ||
  type === "CRYSTAL_SYNTHESIZER" ||
  type === "ADVANCED_CRYSTAL_SYNTHESIZER";

const resourceClassForTile = (resource: Tile["resource"]): "food" | "supply" | "iron" | "crystal" | undefined => {
  if (resource === "FARM" || resource === "FISH") return "food";
  if (resource === "WOOD" || resource === "FUR") return "supply";
  if (resource === "IRON") return "iron";
  if (resource === "GEMS") return "crystal";
  return undefined;
};

export const menuActionsForSingleTile = (state: ClientState, tile: Tile, deps: TileActionLogicDeps): TileActionDef[] => {
  if (tile.fogged) return [];
  if (tile.terrain === "SEA" || tile.terrain === "COASTAL_SEA") return [];
  if (tile.terrain === "MOUNTAIN") {
    const observatoryProtection = deps.hostileObservatoryProtectingTile(tile);
    const inObsRange = ownedActiveObservatoryWithinRange(state, tile);
    const obsCooldownMs = readyOwnedObservatoryCooldownRemainingMs(state.tiles.values(), state.me, tile, Date.now(), ownObservatoryRange(state));
    const removeCooldown = Math.max(obsCooldownMs, deps.abilityCooldownRemainingMs("remove_mountain"));
    return [
      {
        id: "remove_mountain",
        label: "Remove Mountain",
        ...tileActionAvailability(
          hasTerrainShapingCapability(state) &&
            !observatoryProtection &&
            inObsRange &&
            removeCooldown <= 0 &&
            state.gold >= 8000 &&
            (state.strategicResources.CRYSTAL ?? 0) >= 400,
          !hasTerrainShapingCapability(state)
            ? "Requires Aether Moorings"
            : observatoryProtection
              ? "Blocked by observatory field"
              : !inObsRange
                ? "Need active observatory in range"
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
    const observatoryProtection = deps.hostileObservatoryProtectingTile(tile);
    const inObsRange = ownedActiveObservatoryWithinRange(state, tile);
    const obsCooldownMs = readyOwnedObservatoryCooldownRemainingMs(state.tiles.values(), state.me, tile, Date.now(), ownObservatoryRange(state));
    const createCooldown = Math.max(obsCooldownMs, deps.abilityCooldownRemainingMs("create_mountain"));
    const blockedBySite = Boolean(tile.town || tile.dockId || tile.fort || tile.siegeOutpost || tile.observatory || tile.economicStructure);
    return {
      id: "create_mountain",
      label: "Create Mountain",
      ...tileActionAvailability(
        hasTerrainShapingCapability(state) &&
          !observatoryProtection &&
          inObsRange &&
          !blockedBySite &&
          createCooldown <= 0 &&
          state.gold >= 8000 &&
          (state.strategicResources.CRYSTAL ?? 0) >= 400,
        !hasTerrainShapingCapability(state)
          ? "Requires Aether Moorings"
          : observatoryProtection
            ? "Blocked by observatory field"
            : !inObsRange
              ? "Need active observatory in range"
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
  const retortRecastActions = (): TileActionDef[] => {
    const currentClass = resourceClassForTile(tile.resource);
    if (!currentClass) return [];
    const inObservatoryRange = ownedActiveObservatoryWithinRange(state, tile);
    const observatoryProtection = deps.hostileObservatoryProtectingTile(tile);
    const blockedBySite = Boolean(tile.town || tile.dockId || tile.fort || tile.siegeOutpost || tile.observatory || tile.economicStructure);
    const cooldown = Math.max(
      readyOwnedObservatoryCooldownRemainingMs(state.tiles.values(), state.me, tile, Date.now(), ownObservatoryRange(state)),
      deps.abilityCooldownRemainingMs("retort_recasting")
    );
    const canCast =
      hasRetortRecastingCapability(state) &&
      inObservatoryRange &&
      !observatoryProtection &&
      !blockedBySite &&
      cooldown <= 0 &&
      state.gold >= 6000 &&
      (state.strategicResources.CRYSTAL ?? 0) >= 120;
    const reason = !hasRetortRecastingCapability(state)
      ? "Requires Grand Synthesis"
      : !inObservatoryRange
        ? "Must be within observatory range"
      : observatoryProtection
        ? "Blocked by observatory field"
        : blockedBySite
          ? "Town, dock, or structure blocks recasting"
          : cooldown > 0
            ? `Cooldown ${deps.formatCooldownShort(cooldown)}`
            : state.gold < 6000
              ? "Need 6000 gold"
              : "Need 120 CRYSTAL";
    const targets: Array<{ id: TileActionDef["id"]; label: string; className: "food" | "supply" | "iron" | "crystal"; summary: string }> = [
      { id: "retort_recast_food", label: "Recast to Food", className: "food", summary: "6000 gold + 120 CRYSTAL • retune this tile into food" },
      { id: "retort_recast_supply", label: "Recast to Supply", className: "supply", summary: "6000 gold + 120 CRYSTAL • retune this tile into supply" },
      { id: "retort_recast_iron", label: "Recast to Iron", className: "iron", summary: "6000 gold + 120 CRYSTAL • retune this tile into iron" },
      { id: "retort_recast_crystal", label: "Recast to Crystal", className: "crystal", summary: "6000 gold + 120 CRYSTAL • retune this tile into crystal" }
    ];
    return targets
      .filter((target) => target.className !== currentClass)
      .map((target) => ({
        id: target.id,
        label: target.label,
        ...tileActionAvailability(canCast, reason, target.summary)
      }));
  };
  // Lance/EMP/Wall/Bridge: always emit a row when the player has the tech, with a
  // priority-ordered disabledReason ladder. Observatory range + per-observatory cooldown
  // are the universal first gates per design.
  const crystalCoreActions = (): TileActionDef[] => {
    const out: TileActionDef[] = [];
    const now = Date.now();
    const obsInRange = ownedActiveObservatoryWithinRange(state, tile);
    const obsCooldownMs = readyOwnedObservatoryCooldownRemainingMs(state.tiles.values(), state.me, tile, now, ownObservatoryRange(state));
    const observatoryProtection = deps.hostileObservatoryProtectingTile(tile);
    const crystalAmt = state.strategicResources.CRYSTAL ?? 0;
    const isOwnTile = Boolean(tile.ownerId && tile.ownerId === state.me);
    const isUnclaimed = !tile.ownerId;
    const targetHasPurgeableOwnership = tile.ownershipState === "SETTLED" || tile.ownershipState === "FRONTIER";
    const economicStructureType = tile.economicStructure?.type;
    const isMonumentType =
      economicStructureType === "IMPERIAL_EXCHANGE" ||
      economicStructureType === "WORLD_ENGINE" ||
      economicStructureType === "AEGIS_DOME" ||
      economicStructureType === "ASTRAL_DOCK";
    const isMonumentPartType =
      economicStructureType === "IMPERIAL_EXCHANGE_PART" ||
      economicStructureType === "WORLD_ENGINE_PART" ||
      economicStructureType === "AEGIS_DOME_PART" ||
      economicStructureType === "ASTRAL_DOCK_PART";

    // Aether Purge (wire command remains AETHER_LANCE for compatibility).
    if (state.techIds.includes("signal-fires")) {
      const lanceCooldown = Math.max(obsCooldownMs, deps.abilityCooldownRemainingMs("aether_lance"));
      const lanceCost = 3000;
      const lanceCrystal = 100;
      const reason =
        !obsInRange
          ? "Need active observatory in range"
          : isOwnTile
            ? "Cannot purge your own tiles"
            : isUnclaimed || !targetHasPurgeableOwnership
              ? "Target enemy settled or frontier land"
              : observatoryProtection
                ? "Blocked by observatory field"
                : lanceCooldown > 0
                  ? `Cooldown ${deps.formatCooldownShort(lanceCooldown)}`
                  : state.gold < lanceCost
                    ? `Need ${lanceCost} gold`
                    : crystalAmt < lanceCrystal
                      ? `Need ${lanceCrystal} CRYSTAL`
                      : "";
      out.push({
        id: "aether_lance",
        label: "Aether Purge",
        ...tileActionAvailability(reason === "", reason, "3000 gold + 100 CRYSTAL • turn enemy control neutral")
      });
    }

    // Aether EMP
    if (state.techIds.includes("cryptography")) {
      const empCooldown = Math.max(obsCooldownMs, deps.abilityCooldownRemainingMs("aether_emp"));
      const empCrystal = 160;
      const reason =
        !obsInRange
          ? "Need active observatory in range"
          : isOwnTile
            ? "Cannot EMP your own tiles"
            : isUnclaimed
              ? "Cannot EMP unclaimed land"
              : !isMonumentType &&
                !isMonumentPartType &&
                economicStructureType !== "AETHER_TOWER" &&
                economicStructureType !== "AIRPORT" &&
                economicStructureType !== "RADAR_SYSTEM"
                ? "Target a powered structure or monument"
                : observatoryProtection
                  ? "Blocked by observatory field"
                  : empCooldown > 0
                    ? `Cooldown ${deps.formatCooldownShort(empCooldown)}`
                    : crystalAmt < empCrystal
                      ? `Need ${empCrystal} CRYSTAL`
                      : "";
      out.push({
        id: "aether_emp",
        label: "Aether EMP",
        ...tileActionAvailability(reason === "", reason, "160 CRYSTAL • disable one powered enemy structure for 20m")
      });
    }

    // Aether Wall
    if (hasAetherWallCapability(state)) {
      const devOverride = hasLocalDevAetherWallOverride(state);
      const wallCooldown = Math.max(obsCooldownMs, deps.abilityCooldownRemainingMs("aether_wall"));
      const wallCrystal = 25;
      const reason = devOverride
        ? ""
        : !obsInRange
          ? "Need active observatory in range"
          : wallCooldown > 0
            ? `Cooldown ${deps.formatCooldownShort(wallCooldown)}`
            : crystalAmt < wallCrystal
              ? `Need ${wallCrystal} CRYSTAL`
              : "";
      out.push({
        id: "aether_wall",
        label: "Aether Wall",
        ...tileActionAvailability(reason === "", reason, "25 CRYSTAL • 20m duration • up to 3 borders")
      });
    }

    // Aether Bridge
    if (hasAetherBridgeCapability(state)) {
      const bridgeCooldown = Math.max(obsCooldownMs, deps.abilityCooldownRemainingMs("aether_bridge"));
      const adjacentTerrains = [
        deps.terrainAt(tile.x, tile.y - 1),
        deps.terrainAt(tile.x + 1, tile.y),
        deps.terrainAt(tile.x, tile.y + 1),
        deps.terrainAt(tile.x - 1, tile.y)
      ];
      const hasSeaNeighbor = adjacentTerrains.some((t) => t === "SEA" || t === "COASTAL_SEA");
      const bridgeCrystal = 30;
      const reason =
        !obsInRange
          ? "Need active observatory in range"
          : tile.terrain !== "LAND" || !hasSeaNeighbor
            ? "Target must be coastal land"
            : tile.ownerId && tile.ownerId !== state.me && observatoryProtection
              ? "Landing blocked by enemy observatory"
              : bridgeCooldown > 0
                ? `Cooldown ${deps.formatCooldownShort(bridgeCooldown)}`
                : crystalAmt < bridgeCrystal
                  ? `Need ${bridgeCrystal} CRYSTAL`
                  : "";
      out.push({
        id: "aether_bridge",
        label: "Aether Bridge",
        ...tileActionAvailability(reason === "", reason, "30 CRYSTAL • crosses up to 4 sea tiles")
      });
    }

    return out;
  };
  if (tile.shardSite) {
    const ownsShardTile =
      tile.ownerId === state.me &&
      (tile.ownershipState === "FRONTIER" || tile.ownershipState === "SETTLED");
    if (ownsShardTile) {
      return [
        {
          id: "collect_shard",
          label: tile.shardSite.kind === "FALL" ? "Collect Shardfall" : "Collect Shards",
          detail:
            tile.shardSite.kind === "FALL"
              ? `${tile.shardSite.amount} shard${tile.shardSite.amount === 1 ? "" : "s"} from active shard rain`
              : `${tile.shardSite.amount} shard${tile.shardSite.amount === 1 ? "" : "s"} recovered from this cache`
        },
        ...retortRecastActions(),
        ...crystalCoreActions(),
        createMountainAction()
      ];
    }
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
        `4500 gold • ${Math.round(economicStructureBuildMs("FOUNDRY") / 60000)}m • doubles mines within 5 tiles; boosted production raises iron/crystal cap`,
        deps.developmentSlotSummary(),
        deps
      )
    });
    out.push(...retortRecastActions());
    out.push(...crystalCoreActions());
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
    const supportedTown = supportedTowns[0];
    const supportedDocks = tile.ownershipState === "SETTLED" ? deps.supportedOwnedDocksForTile(tile) : [];
    const townBuildSource =
      tile.town && tile.town.populationTier !== "SETTLEMENT" && tile.ownershipState === "SETTLED" ? tile : supportedTown;
    const supportPlacementBlocked = Boolean(hasBlockingStructure && townBuildSource && townBuildSource !== tile);
    if (tile.observatory?.ownerId === state.me && tile.observatory.status === "active") {
      const cooldown = deps.abilityCooldownRemainingMs("survey_sweep");
      out.push({
        id: "survey_sweep",
        label: "Survey Sweep",
        ...tileActionAvailability(
          state.techIds.includes("surveying") && cooldown <= 0 && (state.strategicResources.CRYSTAL ?? 0) >= 30,
          !state.techIds.includes("surveying")
            ? "Requires Surveying"
            : cooldown > 0
              ? `Cooldown ${deps.formatCooldownShort(cooldown)}`
              : "Need 30 CRYSTAL",
          "30 CRYSTAL • pings hidden resources + towns in a 50x50 area"
        )
      });
    }
    const economicStructure = tile.economicStructure;
    if (economicStructure?.type === "IMPERIAL_EXCHANGE" && economicStructure.ownerId === state.me) {
      const cooldown = deps.abilityCooldownRemainingMs("imperial_exchange_levy");
      const isPowered = economicStructure.powered !== false;
      const levyAvailability = (resourceLabel: string): Pick<TileActionDef, "disabled" | "disabledReason" | "cost"> =>
        tileActionAvailability(
          economicStructure.status === "active" && isPowered && cooldown <= 0 && (state.strategicResources.CRYSTAL ?? 0) >= 300,
          economicStructure.status !== "active"
            ? "Monument still offline"
            : !isPowered
              ? "Needs nearby Aether Tower"
              : cooldown > 0
                ? `Cooldown ${deps.formatCooldownShort(cooldown)}`
                : "Need 300 CRYSTAL",
          `300 CRYSTAL • seize all rival ${resourceLabel}`
        );
      out.push({ id: "imperial_exchange_levy_food", label: "Levy Food", ...levyAvailability("FOOD") });
      out.push({ id: "imperial_exchange_levy_iron", label: "Levy Iron", ...levyAvailability("IRON") });
      out.push({ id: "imperial_exchange_levy_crystal", label: "Levy Crystal", ...levyAvailability("CRYSTAL") });
      out.push({ id: "imperial_exchange_levy_supply", label: "Levy Supply", ...levyAvailability("SUPPLY") });
    }
    if (economicStructure?.type === "WORLD_ENGINE" && economicStructure.ownerId === state.me) {
      const cooldown = deps.abilityCooldownRemainingMs("world_engine_strike");
      const isPowered = economicStructure.powered !== false;
      out.push({
        id: "world_engine_strike",
        label: "Worldbreaker Shot",
        ...tileActionAvailability(
          economicStructure.status === "active" && isPowered && cooldown <= 0 && (state.strategicResources.CRYSTAL ?? 0) >= 400,
          economicStructure.status !== "active"
            ? "Monument still offline"
            : !isPowered
              ? "Needs nearby Aether Tower"
              : cooldown > 0
                ? `Cooldown ${deps.formatCooldownShort(cooldown)}`
                : "Need 400 CRYSTAL",
          "400 CRYSTAL • shatter one enemy land tile into mountain"
        )
      });
    }
    if (economicStructure?.type === "AEGIS_DOME" && economicStructure.ownerId === state.me) {
      const cooldown = deps.abilityCooldownRemainingMs("aegis_lock");
      const isPowered = economicStructure.powered !== false;
      out.push({
        id: "aegis_lock",
        label: "Aegis Lock",
        ...tileActionAvailability(
          economicStructure.status === "active" && isPowered && cooldown <= 0 && (state.strategicResources.CRYSTAL ?? 0) >= 220,
          economicStructure.status !== "active"
            ? "Monument still offline"
            : !isPowered
              ? "Needs nearby Aether Tower"
              : cooldown > 0
                ? `Cooldown ${deps.formatCooldownShort(cooldown)}`
                : "Need 220 CRYSTAL",
          "220 CRYSTAL • 15m regional lockdown"
        )
      });
    }
    if (economicStructure?.type === "ASTRAL_DOCK" && economicStructure.ownerId === state.me) {
      const cooldown = deps.abilityCooldownRemainingMs("astral_dock_launch");
      const isPowered = economicStructure.powered !== false;
      out.push({
        id: "astral_dock_launch",
        label: "Launch Satellite",
        ...tileActionAvailability(
          economicStructure.status === "active" && isPowered && cooldown <= 0 && (state.strategicResources.CRYSTAL ?? 0) >= 300,
          economicStructure.status !== "active"
            ? "Monument still offline"
            : !isPowered
              ? "Needs nearby Aether Tower"
              : cooldown > 0
                ? `Cooldown ${deps.formatCooldownShort(cooldown)}`
                : "Need 300 CRYSTAL",
          "300 CRYSTAL • full-map vision for 24h"
        )
      });
    }
    if (economicStructure?.type === "AIRPORT" && economicStructure.ownerId === state.me) {
      const isPowered = economicStructure.powered !== false;
      const bombardCooldownUntil = economicStructure.bombardCooldownUntil ?? 0;
      const bombardOnCooldown = bombardCooldownUntil > Date.now();
      out.push({
        id: "airport_bombard",
        label: "Sky Dock Bombard",
        ...tileActionAvailability(
          economicStructure.status === "active" && isPowered && !bombardOnCooldown
            && (state.strategicResources.CRYSTAL ?? 0) >= 200
            && (state.gold ?? 0) >= 5_000,
          economicStructure.status !== "active"
            ? "Sky Dock still building"
            : !isPowered
              ? "Needs nearby Aether Tower"
              : bombardOnCooldown
                ? `Cooldown ${deps.formatCooldownShort(Math.max(0, bombardCooldownUntil - Date.now()))}`
                : (state.strategicResources.CRYSTAL ?? 0) < 200
                  ? "Need 200 CRYSTAL"
                  : "Need 5,000 gold",
          "200 CRYSTAL + 5,000 gold • 20m cooldown • strip ownership from 3×3 (per-tile miss, +25% near forts)"
        )
      });
    }
    if (
      tile.ownerId === state.me &&
      tile.ownershipState === "SETTLED" &&
      tile.town &&
      (tile.town.populationTier === "CITY" || tile.town.populationTier === "GREAT_CITY" || tile.town.populationTier === "METROPOLIS")
    ) {
      const cooldown = deps.abilityCooldownRemainingMs("city_overclock");
      out.push({
        id: "city_overclock",
        label: "City Overclock",
        ...tileActionAvailability(
          state.techIds.includes("imperial-roads") && cooldown <= 0 && (state.strategicResources.CRYSTAL ?? 0) >= 180,
          !state.techIds.includes("imperial-roads")
            ? "Requires Monument Cities"
            : cooldown > 0
              ? `Cooldown ${deps.formatCooldownShort(cooldown)}`
              : "Need 180 CRYSTAL",
          "180 CRYSTAL • 15m city overclock"
        )
      });
    }
    if (tile.economicStructure?.type === "FUR_SYNTHESIZER" || tile.economicStructure?.type === "ADVANCED_FUR_SYNTHESIZER") {
      const downtimeRemainingMs = Math.max(0, (tile.economicStructure.disabledUntil ?? 0) - Date.now());
      out.push({
        id: "overload_fur_synthesizer" as TileActionDef["id"],
        label: "Overload Fur Synth",
        detail: deps.buildDetailTextForAction("overload_fur_synthesizer", tile),
        ...tileActionAvailability(
          state.techIds.includes("overload-protocols") && state.gold >= 12500 && tile.economicStructure.status !== "under_construction" && downtimeRemainingMs <= 0,
          !state.techIds.includes("overload-protocols")
            ? "Requires Overload Protocols"
            : tile.economicStructure.status === "under_construction"
              ? "Fur Synthesizer still building"
              : downtimeRemainingMs > 0
                ? `Recovering for ${Math.ceil(downtimeRemainingMs / 3600000)}h`
                : "Need 12500 gold",
          "12500 gold • instant 15 SUPPLY • 24h shutdown"
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
          state.techIds.includes("overload-protocols") && state.gold >= 12500 && tile.economicStructure.status !== "under_construction" && downtimeRemainingMs <= 0,
          !state.techIds.includes("overload-protocols")
            ? "Requires Overload Protocols"
            : tile.economicStructure.status === "under_construction"
              ? "Ironworks still building"
              : downtimeRemainingMs > 0
                ? `Recovering for ${Math.ceil(downtimeRemainingMs / 3600000)}h`
                : "Need 12500 gold",
          "12500 gold • instant 15 IRON • 24h shutdown"
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
          state.techIds.includes("overload-protocols") && state.gold >= 12500 && tile.economicStructure.status !== "under_construction" && downtimeRemainingMs <= 0,
          !state.techIds.includes("overload-protocols")
            ? "Requires Overload Protocols"
            : tile.economicStructure.status === "under_construction"
              ? "Synthesizer still building"
              : downtimeRemainingMs > 0
                ? `Recovering for ${Math.ceil(downtimeRemainingMs / 3600000)}h`
                : "Need 12500 gold",
          "12500 gold • instant 10 CRYSTAL • 24h shutdown"
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
          `${deps.structureCostText("ADVANCED_FUR_SYNTHESIZER")} • ${Math.round(economicStructureBuildMs("ADVANCED_FUR_SYNTHESIZER") / 60000)}m • 21.6 SUPPLY/day • 6 gold/min`,
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
          `${deps.structureCostText("ADVANCED_IRONWORKS")} • ${Math.round(economicStructureBuildMs("ADVANCED_IRONWORKS") / 60000)}m • 21.6 IRON/day • 6 gold/min`,
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
          `${deps.structureCostText("ADVANCED_CRYSTAL_SYNTHESIZER")} • ${Math.round(economicStructureBuildMs("ADVANCED_CRYSTAL_SYNTHESIZER") / 60000)}m • 14.4 CRYSTAL/day • 8 gold/min`,
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
          `${SETTLE_COST} gold • ${Math.round(settleDurationMsForState(state, tile) / 1000)}s${isForestTile(tile.x, tile.y) ? " (Forest)" : ""}`,
          slots,
          deps
        )
      });
    if (tile.ownershipState === "FRONTIER" && !queuedSettlement) {
      const connectedKeys = deps.connectedOwnedFrontierKeysFor(tile);
      const actionableKeys = connectedKeys.filter(
        (k) =>
          !state.settleProgressByTile.has(k) &&
          !hasQueuedSettlementForTile(state.developmentQueue, k)
      );
      if (actionableKeys.length >= 2) {
        const totalCost = SETTLE_COST * actionableKeys.length;
        out.push({
          id: "settle_connected_frontier",
          label: `Settle Connected (${actionableKeys.length})`,
          detail: deps.buildDetailTextForAction("settle_connected_frontier", tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            canAffordCost(state.gold, SETTLE_COST),
            `Need ${SETTLE_COST} gold`,
            `${totalCost} gold total • fills slots, rest queue`,
            slots,
            deps
          )
        });
      }
    }
    const townGrowthAction = tile.town?.populationTier && typeof tile.town.population === "number"
      ? townGrowthActionForUpgrade(state, nextTownGrowthUpgrade(tile.town.populationTier, tile.town.population))
      : undefined;
    if (townGrowthAction) out.push(townGrowthAction);
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
          state.gold >= deps.structureGoldCost("WOODEN_FORT") && state.manpower >= structureBuildManpowerCost("WOODEN_FORT"),
          state.gold < deps.structureGoldCost("WOODEN_FORT")
            ? `Need ${deps.structureGoldCost("WOODEN_FORT")} gold`
            : `Need ${structureBuildManpowerCost("WOODEN_FORT")} manpower`,
          `${deps.structureCostText("WOODEN_FORT")} • ${Math.round(WOODEN_FORT_BUILD_MS / 60000)}m • def x${WOODEN_FORT_DEFENSE_MULT.toFixed(2)} • 0.05 gold/min`,
          slots,
          deps
        )
      });
    }
    if (
      tile.ownerId === state.me &&
      tile.ownershipState === "SETTLED" &&
      !tile.siegeOutpost &&
      !tile.observatory &&
      (tile.fort || !tile.economicStructure || hasWoodenFort)
    ) {
      const fortVariant = nextFortVariantForTile(state, tile);
      if (fortVariant) {
        const hasTech = tile.fort ? true : state.techIds.includes("masonry");
        const canUseTile = Boolean(tile.fort) || !tile.economicStructure || hasWoodenFort;
        const hasGold = state.gold >= fortVariant.gold;
        const hasManpower = state.manpower >= structureBuildManpowerCost("FORT");
        const hasIron = (state.strategicResources.IRON ?? 0) >= fortVariant.iron;
        out.push({
          id: "build_fortification",
          label: tile.fort || hasWoodenFort ? `Upgrade to ${fortVariant.label}` : `Build ${fortVariant.label}`,
          detail: deps.buildDetailTextForAction("build_fortification", tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            hasTech && hasGold && hasManpower && hasIron && canUseTile,
            !hasTech
              ? "Requires Stoneworks"
              : !canUseTile
                  ? "Tile already has structure"
                  : !hasGold
                    ? `Need ${fortVariant.gold} gold`
                    : !hasManpower
                      ? `Need ${structureBuildManpowerCost("FORT")} manpower`
                    : !hasIron
                      ? `Need ${fortVariant.iron} IRON`
                      : "Unavailable",
            `${fortVariant.summary} • ${Math.round(FORT_BUILD_MS / 60000)}m • def x${fortVariant.defenseMult.toFixed(2)}`,
            slots,
            deps
          )
        });
      }
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
          `${deps.structureCostText("OBSERVATORY")} • ${Math.round(OBSERVATORY_BUILD_MS / 60000)}m • +${OBSERVATORY_VISION_BONUS} vision • 0.025 crystal/min`,
          slots,
          deps
        )
      });
    }
    if (tile.ownershipState === "SETTLED" && !tile.economicStructure) {
      const airportGoldCost = deps.structureGoldCost("AIRPORT");
      const aetherTowerGoldCost = deps.structureGoldCost("AETHER_TOWER");
      const imperialExchangeBuilt = [...state.tiles.values()].some((candidate) => candidate.economicStructure?.type === "IMPERIAL_EXCHANGE");
      const worldEngineBuilt = [...state.tiles.values()].some((candidate) => candidate.economicStructure?.type === "WORLD_ENGINE");
      const aegisDomeBuilt = [...state.tiles.values()].some((candidate) => candidate.economicStructure?.type === "AEGIS_DOME");
      const astralDockBuilt = [...state.tiles.values()].some((candidate) => candidate.economicStructure?.type === "ASTRAL_DOCK");
      const imperialExchangePartCount = [...state.tiles.values()].filter((candidate) => candidate.economicStructure?.ownerId === state.me && candidate.economicStructure?.type === "IMPERIAL_EXCHANGE_PART").length;
      const worldEnginePartCount = [...state.tiles.values()].filter((candidate) => candidate.economicStructure?.ownerId === state.me && candidate.economicStructure?.type === "WORLD_ENGINE_PART").length;
      const aegisDomePartCount = [...state.tiles.values()].filter((candidate) => candidate.economicStructure?.ownerId === state.me && candidate.economicStructure?.type === "AEGIS_DOME_PART").length;
      const astralDockPartCount = [...state.tiles.values()].filter((candidate) => candidate.economicStructure?.ownerId === state.me && candidate.economicStructure?.type === "ASTRAL_DOCK_PART").length;
      if (buildShowsOnTile("AIRPORT", tile, supportedTowns.length, supportedDocks.length)) {
        out.push({
          id: "build_airport",
          label: "Build Sky Dock",
          detail: deps.buildDetailTextForAction("build_airport", tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            state.techIds.includes("aeronautics") &&
              state.gold >= airportGoldCost &&
              (state.strategicResources.CRYSTAL ?? 0) >= 80 &&
              !tile.fort &&
              !tile.siegeOutpost &&
              !tile.observatory,
            !state.techIds.includes("aeronautics")
              ? "Requires Sky Docks"
              : tile.fort || tile.siegeOutpost || tile.observatory
                ? "Tile already has structure"
                : state.gold < airportGoldCost
                  ? `Need ${airportGoldCost} gold`
                  : "Need 80 CRYSTAL",
            `${deps.structureCostText("AIRPORT")} • ${Math.round(economicStructureBuildMs("AIRPORT") / 60000)}m • ${AIRPORT_BOMBARD_RADIUS}-tile bombard range • 200 crystal + 5k gold/shot • 20m cooldown • 0.025 crystal/min upkeep`,
            slots,
            deps
          )
        });
      }
      if (buildShowsOnTile("AETHER_TOWER", tile, supportedTowns.length, supportedDocks.length)) {
        out.push({
          id: "build_aether_tower",
          label: "Build Aether Tower",
          detail: deps.buildDetailTextForAction("build_aether_tower", tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            state.techIds.includes("plastics") &&
              state.gold >= aetherTowerGoldCost &&
              (state.strategicResources.CRYSTAL ?? 0) >= 160 &&
              !tile.fort &&
              !tile.siegeOutpost &&
              !tile.observatory,
            !state.techIds.includes("plastics")
              ? "Requires Aether Towers"
              : tile.fort || tile.siegeOutpost || tile.observatory
                ? "Tile already has structure"
                : state.gold < aetherTowerGoldCost
                  ? `Need ${aetherTowerGoldCost} gold`
                  : "Need 160 CRYSTAL",
            `${deps.structureCostText("AETHER_TOWER")} • ${Math.round(economicStructureBuildMs("AETHER_TOWER") / 60000)}m • powers nearby late structures`,
            slots,
            deps
          )
        });
      }
      if (buildShowsOnTile("RADAR_SYSTEM", tile, supportedTowns.length, supportedDocks.length)) {
        out.push({
          id: "build_radar_system",
          label: "Build Resonance Grid",
          detail: deps.buildDetailTextForAction("build_radar_system", tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            state.techIds.includes("radar") &&
              state.gold >= 4000 &&
              (state.strategicResources.CRYSTAL ?? 0) >= 120 &&
              !tile.fort &&
              !tile.siegeOutpost &&
              !tile.observatory,
            !state.techIds.includes("radar")
              ? "Requires Resonance Grid"
              : tile.fort || tile.siegeOutpost || tile.observatory
                ? "Tile already has structure"
                : state.gold < 4000
                  ? "Need 4000 gold"
                  : "Need 120 CRYSTAL",
            `${deps.structureCostText("RADAR_SYSTEM")} • ${Math.round(economicStructureBuildMs("RADAR_SYSTEM") / 60000)}m • blocks bombardment within 30 tiles • 4.5 gold/min`,
            slots,
            deps
          )
        });
      }
      if (buildShowsOnTile("IMPERIAL_EXCHANGE", tile, supportedTowns.length, supportedDocks.length)) {
        out.push({
          id: "build_imperial_exchange",
          label: "Build Imperial Exchange",
          detail: deps.buildDetailTextForAction("build_imperial_exchange", tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            state.techIds.includes("urban-markets") &&
              imperialExchangePartCount >= 3 &&
              !imperialExchangeBuilt &&
              !tile.fort &&
              !tile.siegeOutpost &&
              !tile.observatory,
            !state.techIds.includes("urban-markets")
              ? "Requires Imperial Exchange"
              : imperialExchangeBuilt
                ? "Imperial Exchange already built"
                : imperialExchangePartCount < 3
                  ? "Build 3 Imperial Exchange parts first"
                  : tile.fort || tile.siegeOutpost || tile.observatory
                    ? "Tile already has structure"
                    : "Unavailable",
            `Free after 3 parts • ${Math.round(economicStructureBuildMs("IMPERIAL_EXCHANGE") / 60000)}m`,
            slots,
            deps
          )
        });
      }
      if (buildShowsOnTile("WORLD_ENGINE", tile, supportedTowns.length, supportedDocks.length)) {
        out.push({
          id: "build_world_engine",
          label: "Build Worldbreaker Cannon",
          detail: deps.buildDetailTextForAction("build_world_engine", tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            state.techIds.includes("world-engine") &&
              worldEnginePartCount >= 3 &&
              !worldEngineBuilt &&
              !tile.fort &&
              !tile.siegeOutpost &&
              !tile.observatory,
            !state.techIds.includes("world-engine")
              ? "Requires Worldbreaker Cannon"
                : worldEngineBuilt
                ? "Worldbreaker Cannon already built"
                : worldEnginePartCount < 3
                  ? "Build 3 Worldbreaker Cannon parts first"
                  : tile.fort || tile.siegeOutpost || tile.observatory
                    ? "Tile already has structure"
                    : "Unavailable",
            `Free after 3 parts • ${Math.round(economicStructureBuildMs("WORLD_ENGINE") / 60000)}m`,
            slots,
            deps
          )
        });
      }
      if (buildShowsOnTile("AEGIS_DOME", tile, supportedTowns.length, supportedDocks.length)) {
        out.push({
          id: "build_aegis_dome",
          label: "Build Aegis Dome",
          detail: deps.buildDetailTextForAction("build_aegis_dome", tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            state.techIds.includes("aegis-dome") &&
              aegisDomePartCount >= 3 &&
              !aegisDomeBuilt &&
              !tile.fort &&
              !tile.siegeOutpost &&
              !tile.observatory,
            !state.techIds.includes("aegis-dome")
              ? "Requires Aegis Dome"
              : aegisDomeBuilt
                ? "Aegis Dome already built"
                : aegisDomePartCount < 3
                  ? "Build 3 Aegis Dome parts first"
                  : tile.fort || tile.siegeOutpost || tile.observatory
                    ? "Tile already has structure"
                    : "Unavailable",
            `Free after 3 parts • ${Math.round(economicStructureBuildMs("AEGIS_DOME") / 60000)}m`,
            slots,
            deps
          )
        });
      }
      if (buildShowsOnTile("ASTRAL_DOCK", tile, supportedTowns.length, supportedDocks.length)) {
        out.push({
          id: "build_astral_dock",
          label: "Build Astral Dock",
          detail: deps.buildDetailTextForAction("build_astral_dock", tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            state.techIds.includes("astral-dock") &&
              astralDockPartCount >= 3 &&
              !astralDockBuilt &&
              !tile.fort &&
              !tile.siegeOutpost &&
              !tile.observatory,
            !state.techIds.includes("astral-dock")
              ? "Requires Astral Dock"
              : astralDockBuilt
                ? "Astral Dock already built"
                : astralDockPartCount < 3
                  ? "Build 3 Astral Dock parts first"
                  : tile.fort || tile.siegeOutpost || tile.observatory
                    ? "Tile already has structure"
                    : "Unavailable",
            `Free after 3 parts • ${Math.round(economicStructureBuildMs("ASTRAL_DOCK") / 60000)}m`,
            slots,
            deps
          )
        });
      }
      if (buildShowsOnTile("GOVERNORS_OFFICE", tile, supportedTowns.length, supportedDocks.length)) {
        out.push({
          id: "build_governors_office",
          label: "Build Ministry Hall",
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
            `${deps.structureCostText("GOVERNORS_OFFICE")} • ${Math.round(economicStructureBuildMs("GOVERNORS_OFFICE") / 60000)}m • reduces local upkeep • 3 gold/min`,
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
            `${deps.structureCostText("FOUNDRY")} • ${Math.round(economicStructureBuildMs("FOUNDRY") / 60000)}m • doubles mines within 5 tiles; boosted production raises iron/crystal cap • 5 gold/min`,
            slots,
            deps
          )
        });
      }
      if (buildShowsOnTile("WATERWORKS", tile, supportedTowns.length, supportedDocks.length)) {
        out.push({
          id: "build_waterworks",
          label: "Build Waterworks",
          detail: deps.buildDetailTextForAction("build_waterworks", tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            state.techIds.includes("irrigation") &&
              state.gold >= 600 &&
              (state.strategicResources?.FOOD ?? 0) >= 20 &&
              !tile.fort &&
              !tile.siegeOutpost &&
              !tile.observatory,
            !state.techIds.includes("irrigation")
              ? "Requires Irrigation"
              : tile.fort || tile.siegeOutpost || tile.observatory
                ? "Tile already has structure"
                : state.gold < 600
                  ? "Need 600 gold"
                  : "Need 20 FOOD",
            `${deps.structureCostText("WATERWORKS")} • ${Math.round(economicStructureBuildMs("WATERWORKS") / 60000)}m • +50% farmstead food within 10 tiles; boosted production raises food cap`,
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
            state.techIds.includes("organized-supply") &&
              state.gold >= 2200 &&
              (state.strategicResources.CRYSTAL ?? 0) >= 80 &&
              !tile.fort &&
              !tile.siegeOutpost &&
              !tile.observatory,
            !state.techIds.includes("organized-supply")
              ? "Requires Organized Supply"
              : tile.fort || tile.siegeOutpost || tile.observatory
                ? "Tile already has structure"
                : state.gold < 2200
                  ? "Need 2200 gold"
                  : "Need 80 CRYSTAL",
            `${deps.structureCostText("GARRISON_HALL")} • ${Math.round(economicStructureBuildMs("GARRISON_HALL") / 60000)}m • +20% defense within 10 tiles • 2.5 gold/min`,
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
          state.gold >= deps.structureGoldCost("LIGHT_OUTPOST") && state.manpower >= structureBuildManpowerCost("LIGHT_OUTPOST"),
          state.gold < deps.structureGoldCost("LIGHT_OUTPOST")
            ? `Need ${deps.structureGoldCost("LIGHT_OUTPOST")} gold`
            : `Need ${structureBuildManpowerCost("LIGHT_OUTPOST")} manpower`,
          `${deps.structureCostText("LIGHT_OUTPOST")} • ${Math.round(LIGHT_OUTPOST_BUILD_MS / 60000)}m • atk x${LIGHT_OUTPOST_ATTACK_MULT.toFixed(2)} • 0.05 gold/min`,
          slots,
          deps
        )
      });
    }
    if (
      tile.ownerId === state.me &&
      tile.ownershipState === "SETTLED" &&
      !tile.fort &&
      !tile.observatory &&
      (tile.siegeOutpost || !tile.economicStructure || hasLightOutpost)
    ) {
      const siegeVariant = nextSiegeVariantForTile(state, tile);
      if (siegeVariant) {
        const hasTech = tile.siegeOutpost ? true : state.techIds.includes("leatherworking");
        const canUseTile = Boolean(tile.siegeOutpost) || !tile.economicStructure || hasLightOutpost;
        const hasGold = state.gold >= siegeVariant.gold;
        const hasManpower = state.manpower >= structureBuildManpowerCost("SIEGE_OUTPOST");
        const hasSupply = (state.strategicResources.SUPPLY ?? 0) >= siegeVariant.supply;
        const hasIron = (state.strategicResources.IRON ?? 0) >= siegeVariant.iron;
        out.push({
          id: "build_siege_camp",
          label: tile.siegeOutpost || hasLightOutpost ? `Upgrade to ${siegeVariant.label}` : `Build ${siegeVariant.label}`,
          detail: deps.buildDetailTextForAction("build_siege_camp", tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            hasTech && hasGold && hasManpower && hasSupply && hasIron && canUseTile,
            !hasTech
              ? "Requires Leatherworking"
              : !canUseTile
                  ? "Tile already has structure"
                  : !hasGold
                    ? `Need ${siegeVariant.gold} gold`
                    : !hasManpower
                      ? `Need ${structureBuildManpowerCost("SIEGE_OUTPOST")} manpower`
                    : !hasSupply
                      ? `Need ${siegeVariant.supply} SUPPLY`
                      : !hasIron
                        ? `Need ${siegeVariant.iron} IRON`
                        : "Unavailable",
            `${siegeVariant.summary} • ${Math.round(SIEGE_OUTPOST_BUILD_MS / 60000)}m • atk x${siegeVariant.attackMult.toFixed(2)}`,
            slots,
            deps
          )
        });
      }
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
            tile.resource === "FARM" ? `700 gold + 20 FOOD • ${Math.round(economicStructureBuildMs("FARMSTEAD") / 60000)}m • +50% food • +18 food cap • 0.1 gold/min` : `700 gold + 20 FOOD • ${Math.round(economicStructureBuildMs("FARMSTEAD") / 60000)}m • no fish output bonus • 0.1 gold/min`,
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
            `800 gold + 30 SUPPLY • ${Math.round(economicStructureBuildMs("CAMP") / 60000)}m • +50% supply • +15 supply cap • 0.12 gold/min`,
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
            `800 gold + 30 ${matchingNeed} • ${Math.round(economicStructureBuildMs("MINE") / 60000)}m • +50% ${matchingNeed === "IRON" ? "iron" : "crystal"} • +${matchingNeed === "IRON" ? "15 iron" : "9 crystal"} cap • 0.12 gold/min`,
            slots,
            deps
          )
        });
      }
      if (townBuildSource) {
        const townHasMarket = Boolean(townBuildSource.town?.hasMarket) || deps.townHasSupportStructure(townBuildSource, "MARKET");
        const townHasGranary = Boolean(townBuildSource.town?.hasGranary) || deps.townHasSupportStructure(townBuildSource, "GRANARY");
        const townHasCensusHall = deps.townHasSupportStructure(townBuildSource, "CENSUS_HALL");
        const townHasBank = Boolean(townBuildSource.town?.hasBank) || deps.townHasSupportStructure(townBuildSource, "BANK");
        const townHasClearingHouse = deps.townHasSupportStructure(townBuildSource, "CLEARING_HOUSE");
        const townHasCaravanary = deps.townHasSupportStructure(townBuildSource, "CARAVANARY");
        const townHasFurSynth = deps.townHasSupportStructure(townBuildSource, "FUR_SYNTHESIZER");
        const townHasIronworks = deps.townHasSupportStructure(townBuildSource, "IRONWORKS");
        const townHasCrystalSynth = deps.townHasSupportStructure(townBuildSource, "CRYSTAL_SYNTHESIZER");
        const townHasExchangeHouse = deps.townHasSupportStructure(townBuildSource, "EXCHANGE_HOUSE");
        const townHasRailDepot = deps.townHasSupportStructure(townBuildSource, "RAIL_DEPOT");
        const townHasImperialExchangePart = deps.townHasSupportStructure(townBuildSource, "IMPERIAL_EXCHANGE_PART");
        const townHasWorldEnginePart = deps.townHasSupportStructure(townBuildSource, "WORLD_ENGINE_PART");
        const townHasAegisDomePart = deps.townHasSupportStructure(townBuildSource, "AEGIS_DOME_PART");
        const townHasAstralDockPart = deps.townHasSupportStructure(townBuildSource, "ASTRAL_DOCK_PART");
        const isGreatCity = townBuildSource.town?.populationTier === "GREAT_CITY" || townBuildSource.town?.populationTier === "METROPOLIS";
        out.push({
          id: "build_market",
          label: "Build Market",
          detail: deps.buildDetailTextForAction("build_market", tile, townBuildSource),
          ...tileActionAvailabilityWithDevelopmentSlot(
            !supportPlacementBlocked && !townHasMarket && state.techIds.includes("trade") && state.gold >= deps.structureGoldCost("MARKET"),
            supportPlacementBlocked
              ? "Tile already has structure"
              : townHasMarket
                ? "Nearby town already has Market"
                : !state.techIds.includes("trade")
                  ? "Requires Trade"
                  : `Need ${deps.structureGoldCost("MARKET")} gold`,
            `${deps.structureCostText("MARKET")} • ${Math.round(economicStructureBuildMs("MARKET") / 60000)}m • +50% town gold production • +${Math.round((townBuildSource.town?.goldPerMinute ?? 0) * 360).toLocaleString()} gold cap • 0.05 food/min`,
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
            `700 gold + 40 FOOD • ${Math.round(economicStructureBuildMs("GRANARY") / 60000)}m • +15% town growth • 0.1 gold/min`,
            slots,
            deps
          )
        });
        out.push({
          id: "build_census_hall",
          label: "Build Census Hall",
          detail: deps.buildDetailTextForAction("build_census_hall", tile, townBuildSource),
          ...tileActionAvailabilityWithDevelopmentSlot(
            !supportPlacementBlocked && !townHasCensusHall && state.techIds.includes("census-records") && state.gold >= 900 && (state.strategicResources.FOOD ?? 0) >= 30,
            supportPlacementBlocked
              ? "Tile already has structure"
              : townHasCensusHall
                ? "Nearby town already has Census Hall"
                : !state.techIds.includes("census-records")
                  ? "Requires Census Records"
                  : state.gold < 900
                    ? "Need 900 gold"
                    : "Need 30 FOOD",
            `900 gold + 30 FOOD • ${Math.round(economicStructureBuildMs("CENSUS_HALL") / 60000)}m • +25% town growth • 0.6 gold / minute`,
            slots,
            deps
          )
        });
        out.push({
          id: "build_bank",
          label: "Build Bank",
          detail: deps.buildDetailTextForAction("build_bank", tile, townBuildSource),
          ...tileActionAvailabilityWithDevelopmentSlot(
            !supportPlacementBlocked && !townHasBank && state.techIds.includes("coinage") && state.gold >= 3200,
            supportPlacementBlocked
              ? "Tile already has structure"
              : townHasBank
                ? "Nearby town already has Bank"
                : !state.techIds.includes("coinage")
                  ? "Requires Coinage"
                  : "Need 3200 gold",
            `3200 gold • ${Math.round(economicStructureBuildMs("BANK") / 60000)}m • +50% city income • +1 flat income • 0.1 food/min`,
            slots,
            deps
          )
        });
        out.push({
          id: "build_clearing_house",
          label: "Build Clearing House",
          detail: deps.buildDetailTextForAction("build_clearing_house", tile, townBuildSource),
          ...tileActionAvailabilityWithDevelopmentSlot(
            !supportPlacementBlocked && !townHasClearingHouse && state.techIds.includes("banking") && state.gold >= 3000 && (state.strategicResources.CRYSTAL ?? 0) >= 80,
            supportPlacementBlocked
              ? "Tile already has structure"
              : townHasClearingHouse
                ? "Nearby town already has Clearing House"
                : !state.techIds.includes("banking")
                  ? "Requires Banking"
                  : state.gold < 3000
                    ? "Need 3000 gold"
                    : "Need 80 CRYSTAL",
            `3000 gold + 80 CRYSTAL • ${Math.round(economicStructureBuildMs("CLEARING_HOUSE") / 60000)}m • boosts connected Markets and Banks`,
            slots,
            deps
          )
        });
        out.push({
          id: "build_caravanary",
          label: "Build Caravanary",
          detail: deps.buildDetailTextForAction("build_caravanary", tile, townBuildSource),
          ...tileActionAvailabilityWithDevelopmentSlot(
            !supportPlacementBlocked && !townHasCaravanary && state.techIds.includes("ledger-keeping") && state.gold >= deps.structureGoldCost("CARAVANARY"),
            supportPlacementBlocked ? "Tile already has structure" : townHasCaravanary ? "Nearby town already has Caravanary" : !state.techIds.includes("ledger-keeping") ? "Requires Ledger Keeping" : `Need ${deps.structureGoldCost("CARAVANARY")} gold`,
            `${deps.structureCostText("CARAVANARY")} • ${Math.round(economicStructureBuildMs("CARAVANARY") / 60000)}m • +25% connected-town bonus • 0.075 food/min`,
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
            `2200 gold • ${Math.round(economicStructureBuildMs("FUR_SYNTHESIZER") / 60000)}m • 18 SUPPLY/day • 6 gold/min`,
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
            `2400 gold • ${Math.round(economicStructureBuildMs("IRONWORKS") / 60000)}m • 18 IRON/day • 6 gold/min`,
            slots,
            deps
          )
        });
        out.push({
          id: "build_crystal_synthesizer",
          label: "Build Aether Condenser",
          detail: deps.buildDetailTextForAction("build_crystal_synthesizer", tile, townBuildSource),
          ...tileActionAvailabilityWithDevelopmentSlot(
            !supportPlacementBlocked && !townHasCrystalSynth && state.techIds.includes("crystal-lattices") && state.gold >= 2800,
            supportPlacementBlocked ? "Tile already has structure" : townHasCrystalSynth ? "Nearby town already has Aether Condenser" : !state.techIds.includes("crystal-lattices") ? "Requires Crystal Lattices" : "Need 2800 gold",
            `2800 gold • ${Math.round(economicStructureBuildMs("CRYSTAL_SYNTHESIZER") / 60000)}m • 12 CRYSTAL/day • 8 gold/min`,
            slots,
            deps
          )
        });
        out.push({
          id: "build_exchange_house",
          label: "Build Exchange House",
          detail: deps.buildDetailTextForAction("build_exchange_house", tile, townBuildSource),
          ...tileActionAvailabilityWithDevelopmentSlot(
            !supportPlacementBlocked && !townHasExchangeHouse && state.techIds.includes("imperial-roads") && state.gold >= 5000 && (state.strategicResources.CRYSTAL ?? 0) >= 120,
            supportPlacementBlocked
              ? "Tile already has structure"
              : townHasExchangeHouse
                ? "Nearby town already has Exchange House"
                : !state.techIds.includes("imperial-roads")
                  ? "Requires Monument Cities"
                  : state.gold < 5000
                    ? "Need 5000 gold"
                    : "Need 120 CRYSTAL",
            `5000 gold + 120 CRYSTAL • ${Math.round(economicStructureBuildMs("EXCHANGE_HOUSE") / 60000)}m • scales with nearby support buildings`,
            slots,
            deps
          )
        });
        out.push({
          id: "build_rail_depot",
          label: "Build Rail Depot",
          detail: deps.buildDetailTextForAction("build_rail_depot", tile, townBuildSource),
          ...tileActionAvailabilityWithDevelopmentSlot(
            !supportPlacementBlocked && !townHasRailDepot && state.techIds.includes("global-trade-networks") && state.gold >= 4000 && (state.strategicResources.CRYSTAL ?? 0) >= 100,
            supportPlacementBlocked
              ? "Tile already has structure"
              : townHasRailDepot
                ? "Nearby town already has Rail Depot"
                : !state.techIds.includes("global-trade-networks")
                  ? "Requires Rail Networks"
                  : state.gold < 4000
                    ? "Need 4000 gold"
                    : "Need 100 CRYSTAL",
            `4000 gold + 100 CRYSTAL • ${Math.round(economicStructureBuildMs("RAIL_DEPOT") / 60000)}m • auto-settles nearest frontier within 20 tiles every 10m • +10 connected-town income points`,
            slots,
            deps
          )
        });
        out.push({
          id: "build_imperial_exchange_part",
          label: "Build Imperial Exchange Part",
          detail: deps.buildDetailTextForAction("build_imperial_exchange_part", tile, townBuildSource),
          ...tileActionAvailabilityWithDevelopmentSlot(
            !supportPlacementBlocked &&
              !townHasImperialExchangePart &&
              !townHasWorldEnginePart &&
              !townHasAegisDomePart &&
              !townHasAstralDockPart &&
              isGreatCity &&
              state.techIds.includes("urban-markets") &&
              state.gold >= 8000 &&
              (state.strategicResources.CRYSTAL ?? 0) >= 180,
            supportPlacementBlocked
              ? "Tile already has structure"
              : townHasImperialExchangePart || townHasWorldEnginePart || townHasAegisDomePart || townHasAstralDockPart
                ? "Nearby great city already hosts a monument part"
                : !isGreatCity
                  ? "Requires Great City or Monumental City"
                  : !state.techIds.includes("urban-markets")
                    ? "Requires Imperial Exchange"
                    : state.gold < 8000
                      ? "Need 8000 gold"
                      : "Need 180 CRYSTAL",
            `8000 gold + 180 CRYSTAL • ${Math.round(economicStructureBuildMs("IMPERIAL_EXCHANGE_PART") / 60000)}m • build 3 to unlock the monument`,
            slots,
            deps
          )
        });
        out.push({
          id: "build_world_engine_part",
          label: "Build Worldbreaker Cannon Part",
          detail: deps.buildDetailTextForAction("build_world_engine_part", tile, townBuildSource),
          ...tileActionAvailabilityWithDevelopmentSlot(
            !supportPlacementBlocked &&
              !townHasImperialExchangePart &&
              !townHasWorldEnginePart &&
              !townHasAegisDomePart &&
              !townHasAstralDockPart &&
              isGreatCity &&
              state.techIds.includes("world-engine") &&
              state.gold >= 8000 &&
              (state.strategicResources.CRYSTAL ?? 0) >= 180,
            supportPlacementBlocked
              ? "Tile already has structure"
              : townHasImperialExchangePart || townHasWorldEnginePart || townHasAegisDomePart || townHasAstralDockPart
                ? "Nearby great city already hosts a monument part"
                : !isGreatCity
                  ? "Requires Great City or Monumental City"
                  : !state.techIds.includes("world-engine")
                    ? "Requires Worldbreaker Cannon"
                    : state.gold < 8000
                      ? "Need 8000 gold"
                      : "Need 180 CRYSTAL",
            `8000 gold + 180 CRYSTAL • ${Math.round(economicStructureBuildMs("WORLD_ENGINE_PART") / 60000)}m • build 3 to unlock the monument`,
            slots,
            deps
          )
        });
        out.push({
          id: "build_aegis_dome_part",
          label: "Build Aegis Dome Part",
          detail: deps.buildDetailTextForAction("build_aegis_dome_part", tile, townBuildSource),
          ...tileActionAvailabilityWithDevelopmentSlot(
            !supportPlacementBlocked &&
              !townHasImperialExchangePart &&
              !townHasWorldEnginePart &&
              !townHasAegisDomePart &&
              !townHasAstralDockPart &&
              isGreatCity &&
              state.techIds.includes("aegis-dome") &&
              state.gold >= 8000 &&
              (state.strategicResources.CRYSTAL ?? 0) >= 180,
            supportPlacementBlocked
              ? "Tile already has structure"
              : townHasImperialExchangePart || townHasWorldEnginePart || townHasAegisDomePart || townHasAstralDockPart
                ? "Nearby great city already hosts a monument part"
                : !isGreatCity
                  ? "Requires Great City or Monumental City"
                  : !state.techIds.includes("aegis-dome")
                    ? "Requires Aegis Dome"
                    : state.gold < 8000
                      ? "Need 8000 gold"
                      : "Need 180 CRYSTAL",
            `8000 gold + 180 CRYSTAL • ${Math.round(economicStructureBuildMs("AEGIS_DOME_PART") / 60000)}m • build 3 to unlock the monument`,
            slots,
            deps
          )
        });
        out.push({
          id: "build_astral_dock_part",
          label: "Build Astral Dock Part",
          detail: deps.buildDetailTextForAction("build_astral_dock_part", tile, townBuildSource),
          ...tileActionAvailabilityWithDevelopmentSlot(
            !supportPlacementBlocked &&
              !townHasImperialExchangePart &&
              !townHasWorldEnginePart &&
              !townHasAegisDomePart &&
              !townHasAstralDockPart &&
              isGreatCity &&
              state.techIds.includes("astral-dock") &&
              state.gold >= 8000 &&
              (state.strategicResources.CRYSTAL ?? 0) >= 180,
            supportPlacementBlocked
              ? "Tile already has structure"
              : townHasImperialExchangePart || townHasWorldEnginePart || townHasAegisDomePart || townHasAstralDockPart
                ? "Nearby great city already hosts a monument part"
                : !isGreatCity
                  ? "Requires Great City or Monumental City"
                  : !state.techIds.includes("astral-dock")
                    ? "Requires Astral Dock"
                    : state.gold < 8000
                      ? "Need 8000 gold"
                      : "Need 180 CRYSTAL",
            `8000 gold + 180 CRYSTAL • ${Math.round(economicStructureBuildMs("ASTRAL_DOCK_PART") / 60000)}m • build 3 to unlock the monument`,
            slots,
            deps
          )
        });
      }
      if (tile.dockId) {
        out.push({
          id: "build_customs_house",
          label: "Build Harbor Exchange",
          detail: deps.buildDetailTextForAction("build_customs_house", tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            !hasBlockingStructure && state.techIds.includes("harborcraft") && state.gold >= 1800 && (state.strategicResources.CRYSTAL ?? 0) >= 60,
            hasBlockingStructure ? "Tile already has structure" : !state.techIds.includes("harborcraft") ? "Requires Aether Moorings" : state.gold < 1800 ? "Need 1800 gold" : "Need 60 CRYSTAL",
            `1800 gold + 60 CRYSTAL • ${Math.round(economicStructureBuildMs("CUSTOMS_HOUSE") / 60000)}m • +1 gold/m per connected dock • 1.5 gold/min`,
            slots,
            deps
          )
        });
      }
    }
    out.push(...retortRecastActions());
    out.push(...crystalCoreActions());
    out.push(createMountainAction());
    // ── Own-tile feature actions: add new own-tile actions here ──
    out.push(...buildMusterActions(tile, state));
    // ─────────────────────────────────────────────────────────────
    if (tile.town?.populationTier !== "SETTLEMENT") out.push({ id: "abandon_territory", label: "Abandon Territory" });
    return out;
  }
  if (deps.isTileOwnedByAlly(tile)) return [...crystalCoreActions(), createMountainAction()];
  if (tile.ownerId === "barbarian") {
    const previewDetail = deps.attackPreviewDetailForTarget(tile);
    const previewPending = deps.attackPreviewPendingForTarget(tile);
    const barbOrigin = deps.pickOriginForTarget(tile.x, tile.y, false);
    const reachable = Boolean(barbOrigin) || Boolean(tile.dockId);
    if (tile.dockId && !barbOrigin && tileSyncDebugEnabled()) {
      console.warn("[dock-attack] Launch Attack enabled via tile.dockId shortcut but no dock origin found (barb)", {
        tile: { x: tile.x, y: tile.y, dockId: tile.dockId },
      });
    }
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
    actions.push(...retortRecastActions());
    actions.push(...crystalCoreActions());
    actions.push(createMountainAction());
    return actions;
  }
  const originForDock = deps.pickOriginForTarget(tile.x, tile.y, false);
  const reachable = Boolean(originForDock) || Boolean(tile.dockId);
  if (tile.dockId && !originForDock && tileSyncDebugEnabled()) {
    console.warn("[dock-attack] Launch Attack enabled via tile.dockId shortcut but no dock origin found", {
      tile: { x: tile.x, y: tile.y, dockId: tile.dockId, ownerId: tile.ownerId },
    });
  }
  const targetShielded = Boolean(tile.ownerId && tile.ownerId !== state.me && deps.ownerSpawnShieldActive(tile.ownerId));
  const targetShieldedReason = "Empire is under spawn protection";
  const previewDetail = deps.attackPreviewDetailForTarget(tile);
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
  const observatoryProtection = deps.hostileObservatoryProtectingTile(tile);
  out.push(...crystalCoreActions());
  if (tile.ownerId && tile.ownerId !== state.me && tile.ownerId !== "barbarian") {
    const activeTruce = deps.activeTruceWithPlayer(tile.ownerId);
    const pendingTruce = deps.pendingTruceWithPlayer(tile.ownerId);
    const hasOutgoingPendingTruce = state.outgoingTruceRequests.some((request) => request.expiresAt > Date.now());
    if (activeTruce) {
      out.push({
        id: "break_truce",
        label: "Break Truce",
        ...tileActionAvailability(true, "", "Break current truce")
      });
    } else {
      const pendingTruceReason =
        pendingTruce === "outgoing"
          ? "Truce offer already pending"
          : pendingTruce === "incoming"
            ? "Incoming truce offer pending"
            : hasOutgoingPendingTruce
              ? "You already have a pending truce offer"
              : undefined;
      const truceOfferAvailable = state.activeTruces.length < 1 && !pendingTruce && !hasOutgoingPendingTruce;
      const truceOfferBlocker = pendingTruceReason ?? "You already have an active truce";
      const pendingCost = pendingTruce || hasOutgoingPendingTruce ? "Pending" : undefined;
      out.push({
        id: "offer_truce_12h",
        label:
          pendingTruce === "outgoing" || hasOutgoingPendingTruce
            ? "Truce Offer Pending"
            : pendingTruce === "incoming"
              ? "Respond in Social Panel"
              : "Offer Truce 12h",
        ...tileActionAvailability(truceOfferAvailable, truceOfferBlocker, pendingCost ?? "12h")
      });
      out.push({
        id: "offer_truce_24h",
        label: pendingTruce || hasOutgoingPendingTruce ? "Truce Already Pending" : "Offer Truce 24h",
        ...tileActionAvailability(truceOfferAvailable, truceOfferBlocker, pendingCost ?? "24h")
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
        revealActive ? "Stop revealing this empire" : !hasCapability ? "Requires Beacon Towers" : !hasCapacity ? "Reveal capacity full" : "Need crystal",
        revealActive ? "Cancel current reveal" : "20 CRYSTAL • 0.15 / 10m"
      )
    });
    const obsCooldownForOther = readyOwnedObservatoryCooldownRemainingMs(state.tiles.values(), state.me, tile, Date.now(), ownObservatoryRange(state));
    const revealStatsCooldown = Math.max(obsCooldownForOther, deps.abilityCooldownRemainingMs("reveal_empire_stats"));
    out.push({
      id: "reveal_empire_stats",
      label: "Reveal Empire Stats",
      ...tileActionAvailability(
        hasRevealCapability(state) &&
          !revealActive &&
          revealStatsCooldown <= 0 &&
          (state.strategicResources.CRYSTAL ?? 0) >= 15,
        !hasRevealCapability(state)
          ? "Requires Logistics"
          : revealActive
            ? "Cancel reveal first"
            : revealStatsCooldown > 0
              ? `Cooldown ${deps.formatCooldownShort(revealStatsCooldown)}`
              : "Need 15 CRYSTAL",
        "15 CRYSTAL • one-shot empire intel"
      )
    });
    const sabotageCooldown = Math.max(obsCooldownForOther, deps.abilityCooldownRemainingMs("siphon"));
    out.push({
      id: "siphon_tile",
      label: "Siphon",
      ...tileActionAvailability(
        hasSiphonCapability(state) &&
          !observatoryProtection &&
          sabotageCooldown <= 0 &&
          (state.strategicResources.CRYSTAL ?? 0) >= 15 &&
          Boolean(tile.resource || tile.town) &&
          !tile.sabotage,
        !hasSiphonCapability(state)
          ? "Requires Logistics"
          : observatoryProtection
            ? "Blocked by observatory field"
            : tile.sabotage
              ? "Already siphoned"
              : !(tile.resource || tile.town)
                ? "Town or resource only"
                : sabotageCooldown > 0
                  ? `Cooldown ${deps.formatCooldownShort(sabotageCooldown)}`
                  : "Need 15 CRYSTAL",
        "15 CRYSTAL • siphons a 3x3 for 60m"
      )
    });
  }
  out.push(...retortRecastActions());
  out.push(createMountainAction());
  return out;
};
