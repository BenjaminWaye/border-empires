import {
  buildAetherWallSegments,
  type TownGrowthUpgradeView,
  nextTownGrowthUpgrade,
  type BuildableStructureType,
  EXPAND_MANPOWER_COST, FORT_BUILD_MS,
  FRONTIER_CLAIM_COST,
  RELAY_BEACON_ATTACK_MULT,
  RELAY_BEACON_BUILD_MS,
  RELAY_BEACON_VISION_BONUS,
  OBSERVATORY_BUILD_MS,
  SETTLE_COST, SETTLE_MANPOWER_COST,
  SIEGE_OUTPOST_ATTACK_MULT,
  SIEGE_OUTPOST_BUILD_MS,
  WOODEN_FORT_BUILD_MS,
  WOODEN_FORT_DEFENSE_MULT,
  structureBuildGoldCost,
  structureBuildManpowerCost,
  structureBuildDurationMs,
  structurePlacementMetadata,
  bestFortTierForTech,
  FORT_VARIANT_LABELS,
  nextFortTierForUpgrade,
  type FortTierInfo,
  bestSiegeTierForTech,
  nextSiegeTierForUpgrade,
  SIEGE_VARIANT_LABELS,
  type SiegeTierInfo,
  terrainAt,
  structureSlotRequirements,
  SYNTHESIZER_STRUCTURE_TYPES,
  TILE_SLOT_BOOST_STRUCTURES,
  WATERWORKS_FARMSTEAD_FOOD_SLOT_BONUS,
  type SlotResource,
  type SlotStructureType,
  type StructureSlotRequirement
} from "@border-empires/shared";
import { mintworksGoldProductionMultiplier } from "@border-empires/game-domain";
import { converterStructureMenuEntries } from "../client-converter-menu.js";
import { AIRPORT_BOMBARD_RADIUS, OBSERVATORY_VISION_BONUS, canAffordCost, frontierClaimCostLabelForTile, isForestTile } from "../client-constants.js";
import { tileSyncDebugEnabled } from "../client-debug/client-debug.js";
import { connectedEnemyRegionKeys } from "../client-connected-region/client-connected-region.js";
import { hasQueuedSettlementForTile } from "../client-development-queue/client-development-queue.js";
import { economicStructureBuildMs, economicStructureName, MONUMENT_COMPONENT_KEYS } from "../client-map-display.js";
import type { SupportTownStructureKey } from "../client-support-structures/client-support-structures.js";
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
import { buildShowsOnTile, ownedActiveObservatoryWithinRange } from "../client-tile-action-support/client-tile-action-support.js";
import { readyOwnedObservatoryCooldownRemainingMs } from "../client-observatory-cooldown/client-observatory-cooldown.js";
import { ownObservatoryRange } from "../client-observatory-rules/client-observatory-rules.js";
import { buildMusterActions } from "../client-muster-tile-actions.js";
import { canBuildPlacementStructure } from "../client-structure-effects/client-structure-effects.js";
import { hasFreeResourceSlotsForRelayBeacon, missingRelayBeaconSlotReason } from "../client-relay-beacon-food-slot/client-relay-beacon-food-slot.js";
import { localReachIsInReach } from "../client-reach-overlay/client-reach-overlay.js";
import { planWaypoint } from "../client-waypoint-planner/client-waypoint-planner.js";
import { formatWaypointSummary } from "../client-waypoint-menu-actions/client-waypoint-menu-actions.js";

type BuildableStructureId = BuildableStructureType;
type AbilityCooldownId = keyof ClientState["abilityCooldowns"];
type AetherWallLength = 1 | 2 | 3;

// §5 (resource slots, docs/manpower-economy-rewrite-plan.md): the real
// build-time affordability gate for FOOD/TITANIUM/CRYSTAL/UMBRITE now that Step 5
// item 4 Slice A retired their build-time stockpile spend server-side
// (hasFreeResourceSlots, runtime-structure-command-handlers.ts). Mirrors
// that gate exactly, including the in-place-upgrade netting
// (currentTileFieldSlotRequirements) and the synthesizer skip (a
// synthesizer PROVIDES a slot, never consumes one, §6.4).
// All 18 monument component types, across all 6 monuments — used to check
// "does this town already host a monument component of any kind" without
// hand-listing 6 or 18 types at each call site.
const MONUMENT_COMPONENT_TYPES: readonly SupportTownStructureKey[] = [
  "IMPERIAL_EXCHANGE_PART_1", "IMPERIAL_EXCHANGE_PART_2", "IMPERIAL_EXCHANGE_PART_3",
  "WORLD_ENGINE_PART_1", "WORLD_ENGINE_PART_2", "WORLD_ENGINE_PART_3",
  "AEGIS_DOME_PART_1", "AEGIS_DOME_PART_2", "AEGIS_DOME_PART_3",
  "ASTRAL_DOCK_PART_1", "ASTRAL_DOCK_PART_2", "ASTRAL_DOCK_PART_3",
  "POPULATION_BUREAU_PART_1", "POPULATION_BUREAU_PART_2", "POPULATION_BUREAU_PART_3",
  "TITANIUM_LEVY_PART_1", "TITANIUM_LEVY_PART_2", "TITANIUM_LEVY_PART_3"
];

const freeResourceSlotCount = (state: ClientState, resource: SlotResource): number =>
  (state.resourceSlots?.supply[resource] ?? 0) - (state.resourceSlots?.demand[resource] ?? 0);

// User decision: each additional Observatory a player owns costs progressively
// more CRYSTAL upkeep — 1st = 1 slot, 2nd = 2, 3rd = 3, and so on (mirrors
// applyObservatoryProgressiveCost in apps/simulation's resource-slot-view.ts,
// the server-authoritative version of this same rule). This client-side
// mirror exists purely so the build button's afford-check and "Need a free
// CRYSTAL slot" messaging match what the server will actually charge —
// building still goes through server validation either way.
const ownedActiveOrBuildingObservatoryCount = (state: ClientState): number => {
  let count = 0;
  for (const tile of state.tiles.values()) {
    // Watchtower Engine's own observatory is exempt from upkeep entirely
    // (server-side: buildDemandContributors in resource-slot-view.ts skips it
    // the same way) -- must not count toward a real Observatory's rank here,
    // or this mirror would overstate the CRYSTAL cost the server will charge.
    if (tile.observatory?.ownerId === state.me && tile.naturalWonder?.type !== "WATCHTOWER_ENGINE") count += 1;
  }
  return count;
};

const additionalResourceSlotRequirements = (
  state: ClientState,
  type: SlotStructureType,
  currentType?: SlotStructureType
): StructureSlotRequirement[] => {
  if (SYNTHESIZER_STRUCTURE_TYPES.includes(type as (typeof SYNTHESIZER_STRUCTURE_TYPES)[number])) return [];
  const newRequirements =
    type === "OBSERVATORY"
      ? [{ resource: "CRYSTAL" as const, count: ownedActiveOrBuildingObservatoryCount(state) + 1 }]
      : structureSlotRequirements(type);
  if (!currentType) return newRequirements;
  const currentByResource = new Map(structureSlotRequirements(currentType).map((r) => [r.resource, r.count]));
  return newRequirements
    .map((r) => ({ resource: r.resource, count: r.count - (currentByResource.get(r.resource) ?? 0) }))
    .filter((r) => r.count > 0);
};

const hasFreeResourceSlots = (state: ClientState, type: SlotStructureType, currentType?: SlotStructureType): boolean =>
  additionalResourceSlotRequirements(state, type, currentType).every((r) => freeResourceSlotCount(state, r.resource) >= r.count);

// First unmet requirement's reason text, or undefined when all are met.
const missingResourceSlotReason = (state: ClientState, type: SlotStructureType, currentType?: SlotStructureType): string | undefined => {
  const missing = additionalResourceSlotRequirements(state, type, currentType).find((r) => freeResourceSlotCount(state, r.resource) < r.count);
  return missing ? `Need a free ${missing.resource} slot` : undefined;
};

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
  // §5.4/user decision: gold + 1 free FOOD slot (the upgrade permanently
  // adds +1 FOOD slot demand to the town, townFoodSlotDemandForTier) —
  // replacing the old FOOD-stockpile lump-sum check now that FOOD has no
  // stockpile.
  const hasGold = state.gold >= upgrade.goldCost;
  const hasFoodSlot = freeResourceSlotCount(state, "FOOD") >= 1;
  const enabled = hasGold && hasFoodSlot;
  const id =
    upgrade.targetTier === "TOWN"
      ? "grow_settlement_to_town"
      : upgrade.targetTier === "CITY"
        ? "grow_town_to_city"
        : upgrade.targetTier === "GREAT_CITY"
          ? "grow_city_to_great_city"
          : "grow_great_city_to_monumental_city";
  const label =
    upgrade.targetTier === "TOWN"
      ? "Upgrade Settlement to Town"
      : upgrade.targetTier === "CITY"
        ? "Upgrade Town to City"
        : upgrade.targetTier === "GREAT_CITY"
          ? "Upgrade City to Great City"
          : "Upgrade Great City to Metropolis";
  const detail =
    upgrade.targetTier === "TOWN"
      ? "Unlocks town-tier growth and upkeep."
      : upgrade.targetTier === "CITY"
        ? "Unlocks city-tier income and manpower."
        : upgrade.targetTier === "GREAT_CITY"
          ? "Unlocks great-city income and manpower."
          : "Unlocks metropolis-tier income and manpower.";
  const missingReason = !hasGold ? `Need ${upgrade.goldCost} gold` : "Need a free FOOD slot";
  return {
    id,
    label,
    ...(enabled ? { detail } : {}),
    ...tileActionAvailability(enabled, missingReason, `${upgrade.goldCost} gold + 1 FOOD slot`)
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
  attackPreviewManpowerCostForTarget: (to: Tile) => string | undefined;
  pickOriginForTarget: (x: number, y: number, allowAdjacentToDock?: boolean, allowOptimisticExpandOrigin?: boolean) => Tile | undefined;
  buildDetailTextForAction: (actionId: string, tile: Tile, supportedTown?: Tile) => string | undefined;
  developmentSlotSummary: () => DevelopmentSlotSummary;
  developmentSlotReason: (summary: DevelopmentSlotSummary) => string;
  structureGoldCost: (structureType: BuildableStructureId) => number;
  structureCostText: (structureType: BuildableStructureId, resourceOverride?: string) => string;
  supportedOwnedTownsForTile: (tile: Tile) => Tile[];
  supportedOwnedDocksForTile: (tile: Tile) => Tile[];
  townHasSupportStructure: (townTile: Tile | undefined, structureType: SupportTownStructureKey) => boolean;
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

// §5 (resource slots): tier.iron is the pre-rewrite stockpile amount --
// FortTierInfo/SiegeTierInfo are shared with legacy code paths, so it stays
// as-is, but the real cost display and affordability check now come from
// structureSlotRequirements(tier.variant) (§14.3).
const slotRequirementSummaryParts = (type: SlotStructureType): string[] =>
  structureSlotRequirements(type).map((r) => `${r.count} ${r.resource} slot${r.count === 1 ? "" : "s"}`);

type FortVariantAction = { label: string; variant: FortTierInfo["variant"]; gold: number; defenseMult: number; summary: string };

const fortActionFromTier = (tier: FortTierInfo): FortVariantAction => ({
  label: FORT_VARIANT_LABELS[tier.variant],
  variant: tier.variant,
  gold: tier.gold,
  defenseMult: tier.defenseMult,
  summary: [
    ...(tier.gold > 0 ? [`${tier.gold} gold`] : []),
    `${tier.manpower} manpower`,
    ...slotRequirementSummaryParts(tier.variant)
  ].join(" + "),
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

type SiegeVariantAction = { label: string; variant: SiegeTierInfo["variant"]; gold: number; attackMult: number; summary: string };

const siegeActionFromTier = (tier: SiegeTierInfo): SiegeVariantAction => ({
  label: SIEGE_VARIANT_LABELS[tier.variant],
  variant: tier.variant,
  gold: tier.gold,
  attackMult: tier.attackMult,
  summary: [
    ...(tier.gold > 0 ? [`${tier.gold} gold`] : []),
    `${tier.manpower} manpower`,
    ...slotRequirementSummaryParts(tier.variant)
  ].join(" + "),
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

const buildNeedsBorderOnly = (structureType: BuildableStructureId): boolean =>
  structurePlacementMetadata(structureType).requiresBorder === "border";

export const isAdjacentToUnexplored = (
  state: ClientState,
  x: number,
  y: number,
  deps: Pick<TileActionLogicDeps, "keyFor" | "wrapX" | "wrapY">
): boolean => {
  const neighbors = [
    deps.keyFor(deps.wrapX(x), deps.wrapY(y - 1)),
    deps.keyFor(deps.wrapX(x + 1), deps.wrapY(y)),
    deps.keyFor(deps.wrapX(x), deps.wrapY(y + 1)),
    deps.keyFor(deps.wrapX(x - 1), deps.wrapY(y))
  ];
  return neighbors.some((key) => !state.discoveredTiles.has(key));
};

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

const chainedBuildAvailabilityFromModule = (
  deps: TileActionLogicDeps,
  state: ClientState,
  tile: Tile,
  structureType: BuildableStructureId,
  eligibleIgnoringAffordability: boolean,
  ineligibleReason: string,
  settledCostText: string,
  goldCostOverride?: number
): [boolean, string, string] => {
  const goldCost = goldCostOverride ?? deps.structureGoldCost(structureType);
  const manpowerCost = structureBuildManpowerCost(structureType);
  if (tile.ownershipState === "FRONTIER") {
    const totalGold = SETTLE_COST + goldCost;
    const totalManpower = SETTLE_MANPOWER_COST + manpowerCost;
    return [
      eligibleIgnoringAffordability && state.gold >= totalGold && state.manpower >= totalManpower,
      !eligibleIgnoringAffordability
        ? ineligibleReason
        : state.gold < totalGold
          ? `Need ${totalGold} gold`
          : state.manpower < totalManpower
            ? `Need ${totalManpower} manpower`
            : "",
      `${totalGold > 0 ? `${totalGold} gold, ` : ""}${totalManpower} m.p. • settle + build • ${Math.round((settleDurationMsForState(state, tile) + structureBuildDurationMs(structureType)) / 60000)}m total`
    ];
  }
  return [
    eligibleIgnoringAffordability && (goldCost <= 0 || state.gold >= goldCost) && state.manpower >= manpowerCost,
    !eligibleIgnoringAffordability
      ? ineligibleReason
      : goldCost > 0 && state.gold < goldCost
        ? `Need ${goldCost} gold`
        : state.manpower < manpowerCost
          ? `Need ${manpowerCost} manpower`
          : "",
    settledCostText
  ];
};

const frontierBuildDetailSuffix = (tile: Tile): string =>
  tile.ownershipState === "FRONTIER" ? " • settles this tile first" : "";

const resourceClassForTile = (resource: Tile["resource"]): "food" | "titanium" | "crystal" | undefined => {
  if (resource === "FARM" || resource === "FISH") return "food";
  if (resource === "TITANIUM") return "titanium";
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
            removeCooldown <= 0,
          !hasTerrainShapingCapability(state)
            ? "Requires Terrain Shaping"
            : observatoryProtection
              ? "Blocked by observatory field"
              : !inObsRange
                ? "Need active observatory in range"
                : removeCooldown > 0
                  ? `Cooldown ${deps.formatCooldownShort(removeCooldown)}`
                  : "",
          "20m cooldown"
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
          createCooldown <= 0,
        !hasTerrainShapingCapability(state)
          ? "Requires Harbor Engineering"
          : observatoryProtection
            ? "Blocked by observatory field"
            : !inObsRange
              ? "Need active observatory in range"
              : blockedBySite
                ? "Town, dock, or structure blocks terrain shaping"
                : createCooldown > 0
                  ? `Cooldown ${deps.formatCooldownShort(createCooldown)}`
                  : "",
        "20m cooldown"
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
      cooldown <= 0;
    const reason = !hasRetortRecastingCapability(state)
      ? "Requires Aether-Infused Synthesis"
      : !inObservatoryRange
        ? "Must be within observatory range"
      : observatoryProtection
        ? "Blocked by observatory field"
        : blockedBySite
          ? "Town, dock, or structure blocks recasting"
          : cooldown > 0
            ? `Cooldown ${deps.formatCooldownShort(cooldown)}`
            : "";
    const targets: Array<{ id: TileActionDef["id"]; label: string; className: "food" | "titanium" | "crystal"; summary: string }> = [
      { id: "retort_recast_food", label: "Recast to Food", className: "food", summary: "retune this tile into food" },
      { id: "retort_recast_titanium", label: "Recast to Titanium", className: "titanium", summary: "retune this tile into titanium" },
      { id: "retort_recast_crystal", label: "Recast to Crystal", className: "crystal", summary: "retune this tile into crystal" }
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
    const isOwnTile = Boolean(tile.ownerId && tile.ownerId === state.me);
    const isUnclaimed = !tile.ownerId;
    const targetHasPurgeableOwnership = tile.ownershipState === "SETTLED" || tile.ownershipState === "FRONTIER";
    const economicStructureType = tile.economicStructure?.type;
    const isMonumentType =
      economicStructureType === "IMPERIAL_EXCHANGE" ||
      economicStructureType === "WORLD_ENGINE" ||
      economicStructureType === "AEGIS_DOME" ||
      economicStructureType === "ASTRAL_DOCK";
    const isMonumentPartType = Boolean(economicStructureType && MONUMENT_COMPONENT_KEYS.has(economicStructureType));

    // Aether Purge (wire command remains AETHER_LANCE for compatibility).
    if (state.techIds.includes("crystal-lattices")) {
      const lanceCooldown = Math.max(obsCooldownMs, deps.abilityCooldownRemainingMs("aether_lance"));
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
                  : "";
      out.push({
        id: "aether_lance",
        label: "Aether Purge",
        ...tileActionAvailability(reason === "", reason, "turn enemy control neutral • 10m cooldown")
      });
    }

    // Aether EMP
    if (state.techIds.includes("cryptography")) {
      const empCooldown = Math.max(obsCooldownMs, deps.abilityCooldownRemainingMs("aether_emp"));
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
                    : "";
      out.push({
        id: "aether_emp",
        label: "Aether EMP",
        ...tileActionAvailability(reason === "", reason, "disable one powered enemy structure for 20m")
      });
    }

    // Aether Wall
    if (hasAetherWallCapability(state)) {
      const devOverride = hasLocalDevAetherWallOverride(state);
      const wallCooldown = Math.max(obsCooldownMs, deps.abilityCooldownRemainingMs("aether_wall"));
      const reason = devOverride
        ? ""
        : !obsInRange
          ? "Need active observatory in range"
          : wallCooldown > 0
            ? `Cooldown ${deps.formatCooldownShort(wallCooldown)}`
            : "";
      out.push({
        id: "aether_wall",
        label: "Aether Wall",
        ...tileActionAvailability(reason === "", reason, "Free • 20m duration • up to 3 borders • 8m cooldown")
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
      const reason =
        !obsInRange
          ? "Need active observatory in range"
          : tile.terrain !== "LAND" || !hasSeaNeighbor
            ? "Target must be coastal land"
            : tile.ownerId && tile.ownerId !== state.me && observatoryProtection
              ? "Landing blocked by enemy observatory"
              : bridgeCooldown > 0
                ? `Cooldown ${deps.formatCooldownShort(bridgeCooldown)}`
                : "";
      out.push({
        id: "aether_bridge",
        label: "Aether Bridge",
        ...tileActionAvailability(reason === "", reason, "Free • crosses up to 4 sea tiles • 30m cooldown")
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
    const isInReach = localReachIsInReach(state.tiles, state.me, deps.keyFor);
    const targetInReach = isInReach(tile.x, tile.y);

    const out: TileActionDef[] = [];
    // Build Relay Beacon does NOT require adjacency: its handler
    // (client-action-flow.ts, actionId === "build_relay_beacon_frontier")
    // already drives a non-adjacent target over via the same waypoint
    // mechanism "Expand Here" uses, then auto-settles and auto-builds once
    // ownership lands (state.autoSettleTargets/autoBuildTargets) -- that's
    // pre-existing, unrelated to reach, and was never broken. The only real
    // gate here is reach itself (an EXPAND landing outside it is rejected
    // server-side regardless of path); "just don't show it" outside reach,
    // same policy as everything below.
    if (targetInReach) {
      const totalExploreGold = FRONTIER_CLAIM_COST + SETTLE_COST; // build cost is 0
      const totalExploreManpower = EXPAND_MANPOWER_COST + SETTLE_MANPOWER_COST + structureBuildManpowerCost("RELAY_BEACON");
      const totalExploreMs = settleDurationMsForState(state, tile) + RELAY_BEACON_BUILD_MS;
      const exploreEnabled =
        canAffordCost(state.gold, totalExploreGold) &&
        state.manpower >= totalExploreManpower &&
        hasFreeResourceSlotsForRelayBeacon(state);
      out.push({
        id: "build_relay_beacon_frontier" as TileActionDef["id"],
        label: "Build Relay Beacon",
        detail: `Push into the unknown • expand + settle + build • +${RELAY_BEACON_VISION_BONUS} vision`,
        ...tileActionAvailability(
          exploreEnabled,
          state.manpower < totalExploreManpower
            ? `Need ${totalExploreManpower} manpower`
            : !canAffordCost(state.gold, totalExploreGold)
              ? `Need ${totalExploreGold} gold`
              : (missingRelayBeaconSlotReason(state) ?? "Unavailable"),
          `${totalExploreGold} gold, ${totalExploreManpower} m.p. • expand + settle + build • ${Math.round(totalExploreMs / 60000)}m total`
        )
      });
    }
    // Settle Land claims any tile inside reach, adjacent or not -- if it's
    // already adjacent that's a direct EXPAND; otherwise it walks there
    // first via the exact same multi-step waypoint chain Add Waypoint used
    // to offer as a SEPARATE button for this case (client-action-flow.ts
    // dispatches "settle_land" on a non-adjacent target straight into
    // handleWaypointAction). One button that does the right thing
    // regardless of distance, instead of two buttons the player has to
    // separately notice for near vs. far reach ground. Hidden entirely
    // when out of reach (server would reject as OUT_OF_REACH regardless of
    // cost) or when no path exists at all (planWaypoint's own check).
    if (reachable && targetInReach) {
      out.push({
        id: "settle_land",
        label: "Settle Land",
        ...tileActionAvailability(
          state.gold >= FRONTIER_CLAIM_COST && state.manpower >= EXPAND_MANPOWER_COST,
          state.manpower < EXPAND_MANPOWER_COST ? `Need ${EXPAND_MANPOWER_COST} manpower` : `Need ${FRONTIER_CLAIM_COST} gold`,
          frontierClaimCostLabelForTile(tile.x, tile.y)
        )
      });
    } else if (targetInReach) {
      const plan = planWaypoint({ x: tile.x, y: tile.y }, { state, keyFor: deps.keyFor, isInReach });
      if (plan.reachable) {
        out.push({
          id: "settle_land",
          label: "Settle Land",
          ...tileActionAvailability(
            canAffordCost(state.gold, plan.totalGold) && state.manpower >= plan.totalManpower,
            state.manpower < plan.totalManpower ? `Need ${plan.totalManpower} manpower` : `Need ${plan.totalGold} gold`,
            formatWaypointSummary(plan)
          )
        });
      }
    }
    out.push({
      id: "build_foundry",
      label: "Build Foundry",
      detail: deps.buildDetailTextForAction("build_foundry", tile),
      ...tileActionAvailabilityWithDevelopmentSlot(
        reachable &&
          state.techIds.includes("industrial-extraction") &&
          state.gold >= deps.structureGoldCost("FOUNDRY") &&
          state.manpower >= structureBuildManpowerCost("FOUNDRY") &&
          !tile.resource &&
          !tile.town &&
          !tile.dockId,
        !reachable
          ? "Must touch your territory"
          : !state.techIds.includes("industrial-extraction")
            ? "Requires Steam-Driven Extraction"
            : tile.resource || tile.town || tile.dockId
              ? "Needs empty land"
              : state.gold < deps.structureGoldCost("FOUNDRY")
                ? `Need ${deps.structureGoldCost("FOUNDRY")} gold`
                : `Need ${structureBuildManpowerCost("FOUNDRY")} manpower`,
        `${deps.structureCostText("FOUNDRY")} • ${Math.round(economicStructureBuildMs("FOUNDRY") / 60000)}m • doubles mines within 5 tiles; boosted production raises iron/crystal cap`,
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
    const chainedBuildAvailability = (
      structureType: BuildableStructureId,
      eligible: boolean,
      ineligible: string,
      cost: string,
      goldCostOverride?: number
    ): [boolean, string, string] => chainedBuildAvailabilityFromModule(deps, state, tile, structureType, eligible, ineligible, cost, goldCostOverride);
    const out: TileActionDef[] = [];
    const isSettlementTile = tile.town?.populationTier === "SETTLEMENT";
    const y = (tile as Tile & { yield?: { gold?: number; strategic?: Record<string, number> } }).yield;
    const hasYield =
      Boolean(y && ((y.gold ?? 0) > 0.01 || Object.values(y.strategic ?? {}).some((v) => Number(v) > 0.01)));
    const hasBlockingStructure = Boolean(tile.siegeOutpost || tile.observatory || tile.economicStructure);
    const supportedTowns = deps.supportedOwnedTownsForTile(tile);
    const supportedTown = supportedTowns[0];
    const supportedDocks = deps.supportedOwnedDocksForTile(tile);
    const townBuildSource =
      tile.town && tile.town.populationTier !== "SETTLEMENT" && tile.ownershipState === "SETTLED" ? tile : supportedTown;
    const supportPlacementBlocked = Boolean(hasBlockingStructure && townBuildSource && townBuildSource !== tile);
    if (tile.observatory?.ownerId === state.me && tile.observatory.status === "active") {
      const cooldown = deps.abilityCooldownRemainingMs("survey_sweep");
      out.push({
        id: "survey_sweep",
        label: "Survey Sweep",
        ...tileActionAvailability(
          state.techIds.includes("surveying") && cooldown <= 0,
          !state.techIds.includes("surveying")
            ? "Requires Survey Sweep"
            : cooldown > 0
              ? `Cooldown ${deps.formatCooldownShort(cooldown)}`
              : "",
          "Free • pings hidden resources + towns in a 50x50 area • 12m cooldown"
        )
      });
    }
    const economicStructure = tile.economicStructure;
    if (economicStructure?.type === "IMPERIAL_EXCHANGE" && economicStructure.ownerId === state.me) {
      // §15/§17: free, single chosen target via crystal-targeting (like World Engine Strike), 24hr cooldown.
      const cooldown = deps.abilityCooldownRemainingMs("imperial_exchange_levy");
      const isPowered = economicStructure.powered !== false;
      out.push({
        id: "imperial_exchange_levy",
        label: "Exchange Levy",
        ...tileActionAvailability(
          economicStructure.status === "active" && isPowered && cooldown <= 0,
          economicStructure.status !== "active"
            ? "Monument still offline"
            : !isPowered
              ? "Needs nearby Aether Tower"
              : cooldown > 0
                ? `Cooldown ${deps.formatCooldownShort(cooldown)}`
                : "",
          "Free • pick a rival, take 100% of their gold • 24h cooldown"
        )
      });
    }
    if (economicStructure?.type === "WORLD_ENGINE" && economicStructure.ownerId === state.me) {
      const cooldown = deps.abilityCooldownRemainingMs("world_engine_strike");
      const isPowered = economicStructure.powered !== false;
      out.push({
        id: "world_engine_strike",
        label: "Worldbreaker Shot",
        ...tileActionAvailability(
          economicStructure.status === "active" && isPowered && cooldown <= 0 && state.gold >= 1_000,
          economicStructure.status !== "active"
            ? "Monument still offline"
            : !isPowered
              ? "Needs nearby Aether Tower"
              : cooldown > 0
                ? `Cooldown ${deps.formatCooldownShort(cooldown)}`
                : state.gold < 1_000
                  ? "Need 1,000 gold"
                  : "",
          "1,000 gold • shatter one enemy land tile into mountain • 10m cooldown"
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
          economicStructure.status === "active" && isPowered && cooldown <= 0,
          economicStructure.status !== "active"
            ? "Monument still offline"
            : !isPowered
              ? "Needs nearby Aether Tower"
              : cooldown > 0
                ? `Cooldown ${deps.formatCooldownShort(cooldown)}`
                : "",
          "Free • 15m regional lockdown • 60m cooldown"
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
          economicStructure.status === "active" && isPowered && cooldown <= 0,
          economicStructure.status !== "active"
            ? "Monument still offline"
            : !isPowered
              ? "Needs nearby Aether Tower"
              : cooldown > 0
                ? `Cooldown ${deps.formatCooldownShort(cooldown)}`
                : "",
          "full-map vision for 24h • wait for current satellite to come down before relaunching"
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
          economicStructure.status === "active" && isPowered && !bombardOnCooldown,
          economicStructure.status !== "active"
            ? "Sky Dock still building"
            : !isPowered
              ? "Needs nearby Aether Tower"
              : bombardOnCooldown
                ? `Cooldown ${deps.formatCooldownShort(Math.max(0, bombardCooldownUntil - Date.now()))}`
                : "",
          "Free • 20m cooldown • strip ownership from 3×3 (per-tile miss, +25% near forts)"
        )
      });
    }
    if (tile.economicStructure) {
      out.push(
        ...converterStructureMenuEntries(tile, {
          buildDetailTextForAction: deps.buildDetailTextForAction,
          formatCooldownShort: deps.formatCooldownShort,
          tileActionAvailability
        })
      );
    }
    if (tile.economicStructure?.type === "UMBRITE_SYNTHESIZER") {
      out.push({
        id: "upgrade_umbrite_synthesizer" as TileActionDef["id"],
        label: "Upgrade Umbrite Works",
        detail: deps.buildDetailTextForAction("upgrade_umbrite_synthesizer", tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          state.techIds.includes("advanced-synthetication") &&
            state.gold >= deps.structureGoldCost("ADVANCED_UMBRITE_SYNTHESIZER") &&
            state.manpower >= structureBuildManpowerCost("ADVANCED_UMBRITE_SYNTHESIZER"),
          !state.techIds.includes("advanced-synthetication")
            ? "Requires Advanced Synthetication"
            : state.gold < deps.structureGoldCost("ADVANCED_UMBRITE_SYNTHESIZER")
              ? `Need ${deps.structureGoldCost("ADVANCED_UMBRITE_SYNTHESIZER")} gold`
              : `Need ${structureBuildManpowerCost("ADVANCED_UMBRITE_SYNTHESIZER")} manpower`,
          `${deps.structureCostText("ADVANCED_UMBRITE_SYNTHESIZER")} • ${Math.round(economicStructureBuildMs("ADVANCED_UMBRITE_SYNTHESIZER") / 60000)}m • 21.6 UMBRITE/day • 45 gold/day`,
          slots,
          deps
        )
      });
    }
    if (tile.economicStructure?.type === "TITANIUM_WORKS") {
      out.push({
        id: "upgrade_titanium_works" as TileActionDef["id"],
        label: "Upgrade Titanium Works",
        detail: deps.buildDetailTextForAction("upgrade_titanium_works", tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          state.techIds.includes("advanced-synthetication") &&
            state.gold >= deps.structureGoldCost("ADVANCED_TITANIUM_WORKS") &&
            state.manpower >= structureBuildManpowerCost("ADVANCED_TITANIUM_WORKS"),
          !state.techIds.includes("advanced-synthetication")
            ? "Requires Advanced Synthetication"
            : state.gold < deps.structureGoldCost("ADVANCED_TITANIUM_WORKS")
              ? `Need ${deps.structureGoldCost("ADVANCED_TITANIUM_WORKS")} gold`
              : `Need ${structureBuildManpowerCost("ADVANCED_TITANIUM_WORKS")} manpower`,
          `${deps.structureCostText("ADVANCED_TITANIUM_WORKS")} • ${Math.round(economicStructureBuildMs("ADVANCED_TITANIUM_WORKS") / 60000)}m • 21.6 TITANIUM/day • 45 gold/day`,
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
          state.techIds.includes("advanced-synthetication") &&
            state.gold >= deps.structureGoldCost("ADVANCED_CRYSTAL_SYNTHESIZER") &&
            state.manpower >= structureBuildManpowerCost("ADVANCED_CRYSTAL_SYNTHESIZER"),
          !state.techIds.includes("advanced-synthetication")
            ? "Requires Advanced Synthetication"
            : state.gold < deps.structureGoldCost("ADVANCED_CRYSTAL_SYNTHESIZER")
              ? `Need ${deps.structureGoldCost("ADVANCED_CRYSTAL_SYNTHESIZER")} gold`
              : `Need ${structureBuildManpowerCost("ADVANCED_CRYSTAL_SYNTHESIZER")} manpower`,
          `${deps.structureCostText("ADVANCED_CRYSTAL_SYNTHESIZER")} • ${Math.round(economicStructureBuildMs("ADVANCED_CRYSTAL_SYNTHESIZER") / 60000)}m • 14.4 CRYSTAL/day • 60 gold/day`,
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
          canAffordCost(state.gold, SETTLE_COST) && state.manpower >= SETTLE_MANPOWER_COST,
          state.manpower < SETTLE_MANPOWER_COST ? `Need ${SETTLE_MANPOWER_COST} manpower` : `Need ${SETTLE_COST} gold`,
          `${SETTLE_COST} gold, ${SETTLE_MANPOWER_COST} manpower • ${Math.round(settleDurationMsForState(state, tile) / 1000)}s${isForestTile(tile.x, tile.y) ? " (Forest)" : ""}`,
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
            canAffordCost(state.gold, SETTLE_COST) && state.manpower >= SETTLE_MANPOWER_COST,
            state.manpower < SETTLE_MANPOWER_COST ? `Need ${SETTLE_MANPOWER_COST} manpower` : `Need ${SETTLE_COST} gold`,
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
    const hasRelayBeacon = tile.economicStructure?.type === "RELAY_BEACON";
    if (
      buildShowsOnTile("WOODEN_FORT", tile, supportedTowns.length, supportedDocks.length) &&
      !tile.fort &&
      !tile.siegeOutpost &&
      !tile.observatory &&
      !tile.economicStructure &&
      // Normally masonry supersedes the Wooden Fort with the full Fort
      // upgrade below, but if a fresh Fort can't actually be built right now
      // (no free TITANIUM slot) keep Wooden Fort visible as the fallback rather
      // than hiding both options.
      (!state.techIds.includes("masonry") || !hasFreeResourceSlots(state, "FORT"))
    ) {
      out.push({
        id: "build_wooden_fort" as TileActionDef["id"],
        label: "Build Palisade",
        detail: deps.buildDetailTextForAction("build_wooden_fort", tile) + frontierBuildDetailSuffix(tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          ...chainedBuildAvailability(
            "WOODEN_FORT",
            hasFreeResourceSlots(state, "WOODEN_FORT"),
            missingResourceSlotReason(state, "WOODEN_FORT") ?? "Unavailable",
            `${deps.structureCostText("WOODEN_FORT")} • ${Math.round(WOODEN_FORT_BUILD_MS / 60000)}m • def x${WOODEN_FORT_DEFENSE_MULT.toFixed(2)}`
          ),
          slots,
          deps
        )
      });
    }
    if (
      tile.ownerId === state.me &&
      !tile.siegeOutpost &&
      !tile.observatory &&
      (tile.fort || !tile.economicStructure || hasWoodenFort)
    ) {
      const fortVariant = nextFortVariantForTile(state, tile);
      if (fortVariant) {
        const hasTech = tile.fort ? true : state.techIds.includes("masonry");
        const canUseTile = Boolean(tile.fort) || !tile.economicStructure || hasWoodenFort;
        const hasFreeSlots = hasFreeResourceSlots(state, fortVariant.variant, tile.fort?.variant);
        out.push({
          id: "build_fortification",
          label: tile.fort || hasWoodenFort ? `Upgrade to ${fortVariant.label}` : `Build ${fortVariant.label}`,
          detail: deps.buildDetailTextForAction("build_fortification", tile) + frontierBuildDetailSuffix(tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            ...chainedBuildAvailability(
              "FORT",
              hasTech && hasFreeSlots && canUseTile,
              !hasTech
                ? "Requires Ironclad Masonry"
                : !canUseTile
                  ? "Tile already has structure"
                  : missingResourceSlotReason(state, fortVariant.variant, tile.fort?.variant) ?? "Unavailable",
              `${fortVariant.summary} • ${Math.round(FORT_BUILD_MS / 60000)}m • def x${fortVariant.defenseMult.toFixed(2)}`,
              fortVariant.gold
            ),
            slots,
            deps
          )
        });
      }
    }
    if (buildShowsOnTile("OBSERVATORY", tile, supportedTowns.length, supportedDocks.length) && !tile.observatory) {
      const hasTech = state.techIds.includes("crystal-lattices");
      const hasFreeSlots = hasFreeResourceSlots(state, "OBSERVATORY");
      out.push({
        id: "build_observatory",
        label: "Build Observatory",
        detail: deps.buildDetailTextForAction("build_observatory", tile) + frontierBuildDetailSuffix(tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          ...chainedBuildAvailability(
            "OBSERVATORY",
            hasTech && hasFreeSlots && !tile.fort && !tile.siegeOutpost && !tile.economicStructure,
            !hasTech
              ? "Requires Aetheric Resonance"
              : tile.fort || tile.siegeOutpost || tile.economicStructure
                ? "Tile already has structure"
                : missingResourceSlotReason(state, "OBSERVATORY") ?? "Unavailable",
            `${deps.structureCostText("OBSERVATORY")} • ${Math.round(OBSERVATORY_BUILD_MS / 60000)}m • +${OBSERVATORY_VISION_BONUS} vision • ${ownedActiveOrBuildingObservatoryCount(state) + 1} CRYSTAL slot${ownedActiveOrBuildingObservatoryCount(state) + 1 === 1 ? "" : "s"} upkeep (rises with each one you own)`
          ),
          slots,
          deps
        )
      });
    }
    if (!tile.economicStructure) {
      const imperialExchangeBuilt = [...state.tiles.values()].some((candidate) => candidate.economicStructure?.type === "IMPERIAL_EXCHANGE");
      const worldEngineBuilt = [...state.tiles.values()].some((candidate) => candidate.economicStructure?.type === "WORLD_ENGINE");
      const aegisDomeBuilt = [...state.tiles.values()].some((candidate) => candidate.economicStructure?.type === "AEGIS_DOME");
      const astralDockBuilt = [...state.tiles.values()].some((candidate) => candidate.economicStructure?.type === "ASTRAL_DOCK");
      const populationBureauBuilt = [...state.tiles.values()].some((candidate) => candidate.economicStructure?.type === "POPULATION_BUREAU");
      const titaniumLevyBuilt = [...state.tiles.values()].some((candidate) => candidate.economicStructure?.type === "TITANIUM_LEVY");
      // Each monument's 3 components are uniquely named now (not 3 copies of
      // one Part type) — "owned" is a per-component boolean, and a
      // monument's total is however many of its 3 are true.
      const ownsComponent = (type: string): boolean =>
        [...state.tiles.values()].some((candidate) => candidate.economicStructure?.ownerId === state.me && candidate.economicStructure?.status === "active" && candidate.economicStructure?.type === type);
      const imperialExchangeComponentsOwned = ["IMPERIAL_EXCHANGE_PART_1", "IMPERIAL_EXCHANGE_PART_2", "IMPERIAL_EXCHANGE_PART_3"].map(ownsComponent);
      const worldEngineComponentsOwned = ["WORLD_ENGINE_PART_1", "WORLD_ENGINE_PART_2", "WORLD_ENGINE_PART_3"].map(ownsComponent);
      const aegisDomeComponentsOwned = ["AEGIS_DOME_PART_1", "AEGIS_DOME_PART_2", "AEGIS_DOME_PART_3"].map(ownsComponent);
      const astralDockComponentsOwned = ["ASTRAL_DOCK_PART_1", "ASTRAL_DOCK_PART_2", "ASTRAL_DOCK_PART_3"].map(ownsComponent);
      const populationBureauComponentsOwned = ["POPULATION_BUREAU_PART_1", "POPULATION_BUREAU_PART_2", "POPULATION_BUREAU_PART_3"].map(ownsComponent);
      const titaniumLevyComponentsOwned = ["TITANIUM_LEVY_PART_1", "TITANIUM_LEVY_PART_2", "TITANIUM_LEVY_PART_3"].map(ownsComponent);
      const imperialExchangePartCount = imperialExchangeComponentsOwned.filter(Boolean).length;
      const worldEnginePartCount = worldEngineComponentsOwned.filter(Boolean).length;
      const aegisDomePartCount = aegisDomeComponentsOwned.filter(Boolean).length;
      const astralDockPartCount = astralDockComponentsOwned.filter(Boolean).length;
      const populationBureauPartCount = populationBureauComponentsOwned.filter(Boolean).length;
      const titaniumLevyPartCount = titaniumLevyComponentsOwned.filter(Boolean).length;
      if (buildShowsOnTile("AIRPORT", tile, supportedTowns.length, supportedDocks.length)) {
        out.push({
          id: "build_airport",
          label: "Build Sky Dock",
          detail: deps.buildDetailTextForAction("build_airport", tile) + frontierBuildDetailSuffix(tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            ...chainedBuildAvailability(
              "AIRPORT",
              state.techIds.includes("aeronautics") && hasFreeResourceSlots(state, "AIRPORT") && !tile.siegeOutpost && !tile.observatory,
              !state.techIds.includes("aeronautics")
                ? "Requires Sky Docks"
                : tile.siegeOutpost || tile.observatory
                  ? "Tile already has structure"
                  : missingResourceSlotReason(state, "AIRPORT") ?? "Unavailable",
              `${deps.structureCostText("AIRPORT")} • ${Math.round(economicStructureBuildMs("AIRPORT") / 60000)}m • ${AIRPORT_BOMBARD_RADIUS}-tile bombard range • 200 crystal + 5k gold/shot • 20m cooldown • 36 crystal/day upkeep`
            ),
            slots,
            deps
          )
        });
      }
      if (buildShowsOnTile("AETHER_TOWER", tile, supportedTowns.length, supportedDocks.length)) {
        out.push({
          id: "build_aether_tower",
          label: "Build Aether Tower",
          detail: deps.buildDetailTextForAction("build_aether_tower", tile) + frontierBuildDetailSuffix(tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            ...chainedBuildAvailability(
              "AETHER_TOWER",
              state.techIds.includes("plastics") && hasFreeResourceSlots(state, "AETHER_TOWER") && !tile.siegeOutpost && !tile.observatory,
              !state.techIds.includes("plastics")
                ? "Requires Aether Towers"
                : tile.siegeOutpost || tile.observatory
                  ? "Tile already has structure"
                  : missingResourceSlotReason(state, "AETHER_TOWER") ?? "Unavailable",
              `${deps.structureCostText("AETHER_TOWER")} • ${Math.round(economicStructureBuildMs("AETHER_TOWER") / 60000)}m • powers nearby late structures`
            ),
            slots,
            deps
          )
        });
      }
      if (buildShowsOnTile("RADAR_SYSTEM", tile, supportedTowns.length, supportedDocks.length)) {
        out.push({
          id: "build_radar_system",
          label: "Build Resonance Grid",
          detail: deps.buildDetailTextForAction("build_radar_system", tile) + frontierBuildDetailSuffix(tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            ...chainedBuildAvailability(
              "RADAR_SYSTEM",
              state.techIds.includes("radar") && hasFreeResourceSlots(state, "RADAR_SYSTEM") && !tile.siegeOutpost && !tile.observatory,
              !state.techIds.includes("radar")
                ? "Requires Resonance Grid"
                : tile.siegeOutpost || tile.observatory
                  ? "Tile already has structure"
                  : missingResourceSlotReason(state, "RADAR_SYSTEM") ?? "Unavailable",
              `${deps.structureCostText("RADAR_SYSTEM")} • ${Math.round(economicStructureBuildMs("RADAR_SYSTEM") / 60000)}m • blocks bombardment within 30 tiles`
            ),
            slots,
            deps
          )
        });
      }
      if (buildShowsOnTile("IMPERIAL_EXCHANGE", tile, supportedTowns.length, supportedDocks.length)) {
        out.push({
          id: "build_imperial_exchange",
          label: "Build Imperial Exchange",
          detail: deps.buildDetailTextForAction("build_imperial_exchange", tile) + frontierBuildDetailSuffix(tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            ...chainedBuildAvailability(
              "IMPERIAL_EXCHANGE",
              state.techIds.includes("urban-mintworks") &&
                imperialExchangePartCount >= 3 &&
                !imperialExchangeBuilt &&
                !tile.siegeOutpost &&
                !tile.observatory &&
                (state.strategicResources.SHARD ?? 0) >= 2 &&
                hasFreeResourceSlots(state, "IMPERIAL_EXCHANGE"),
              !state.techIds.includes("urban-mintworks")
                ? "Requires Imperial Exchange"
                : imperialExchangeBuilt
                  ? "Imperial Exchange already built"
                  : imperialExchangePartCount < 3
                    ? "Build 3 Imperial Exchange parts first"
                    : tile.siegeOutpost || tile.observatory
                      ? "Tile already has structure"
                      : (state.strategicResources.SHARD ?? 0) < 2
                        ? "Need 2 SHARD"
                        : missingResourceSlotReason(state, "IMPERIAL_EXCHANGE") ?? "Unavailable",
              `${deps.structureCostText("IMPERIAL_EXCHANGE")} • ${Math.round(economicStructureBuildMs("IMPERIAL_EXCHANGE") / 60000)}m • build 3 parts first`,
              0
            ),
            slots,
            deps
          )
        });
      }
      if (buildShowsOnTile("WORLD_ENGINE", tile, supportedTowns.length, supportedDocks.length)) {
        out.push({
          id: "build_world_engine",
          label: "Build Worldbreaker Cannon",
          detail: deps.buildDetailTextForAction("build_world_engine", tile) + frontierBuildDetailSuffix(tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            ...chainedBuildAvailability(
              "WORLD_ENGINE",
              state.techIds.includes("world-engine") &&
                worldEnginePartCount >= 3 &&
                !worldEngineBuilt &&
                !tile.siegeOutpost &&
                !tile.observatory &&
                (state.strategicResources.SHARD ?? 0) >= 2 &&
                hasFreeResourceSlots(state, "WORLD_ENGINE"),
              !state.techIds.includes("world-engine")
                ? "Requires Worldbreaker Cannon"
                : worldEngineBuilt
                  ? "Worldbreaker Cannon already built"
                  : worldEnginePartCount < 3
                    ? "Build 3 Worldbreaker Cannon parts first"
                    : tile.siegeOutpost || tile.observatory
                      ? "Tile already has structure"
                      : (state.strategicResources.SHARD ?? 0) < 2
                        ? "Need 2 SHARD"
                        : missingResourceSlotReason(state, "WORLD_ENGINE") ?? "Unavailable",
              `${deps.structureCostText("WORLD_ENGINE")} • ${Math.round(economicStructureBuildMs("WORLD_ENGINE") / 60000)}m • build 3 parts first`,
              0
            ),
            slots,
            deps
          )
        });
      }
      if (buildShowsOnTile("AEGIS_DOME", tile, supportedTowns.length, supportedDocks.length)) {
        out.push({
          id: "build_aegis_dome",
          label: "Build Aegis Dome",
          detail: deps.buildDetailTextForAction("build_aegis_dome", tile) + frontierBuildDetailSuffix(tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            ...chainedBuildAvailability(
              "AEGIS_DOME",
              state.techIds.includes("aegis-dome") &&
                aegisDomePartCount >= 3 &&
                !aegisDomeBuilt &&
                !tile.siegeOutpost &&
                !tile.observatory &&
                (state.strategicResources.SHARD ?? 0) >= 2 &&
                hasFreeResourceSlots(state, "AEGIS_DOME"),
              !state.techIds.includes("aegis-dome")
                ? "Requires Aegis Dome"
                : aegisDomeBuilt
                  ? "Aegis Dome already built"
                  : aegisDomePartCount < 3
                    ? "Build 3 Aegis Dome parts first"
                    : tile.siegeOutpost || tile.observatory
                      ? "Tile already has structure"
                      : (state.strategicResources.SHARD ?? 0) < 2
                        ? "Need 2 SHARD"
                        : missingResourceSlotReason(state, "AEGIS_DOME") ?? "Unavailable",
              `${deps.structureCostText("AEGIS_DOME")} • ${Math.round(economicStructureBuildMs("AEGIS_DOME") / 60000)}m • build 3 parts first`,
              0
            ),
            slots,
            deps
          )
        });
      }
      if (buildShowsOnTile("ASTRAL_DOCK", tile, supportedTowns.length, supportedDocks.length)) {
        out.push({
          id: "build_astral_dock",
          label: "Build Astral Dock",
          detail: deps.buildDetailTextForAction("build_astral_dock", tile) + frontierBuildDetailSuffix(tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            ...chainedBuildAvailability(
              "ASTRAL_DOCK",
              state.techIds.includes("astral-dock") &&
                astralDockPartCount >= 3 &&
                !astralDockBuilt &&
                !tile.siegeOutpost &&
                !tile.observatory &&
                (state.strategicResources.SHARD ?? 0) >= 2 &&
                hasFreeResourceSlots(state, "ASTRAL_DOCK"),
              !state.techIds.includes("astral-dock")
                ? "Requires Astral Dock"
                : astralDockBuilt
                  ? "Astral Dock already built"
                  : astralDockPartCount < 3
                    ? "Build 3 Astral Dock parts first"
                    : tile.siegeOutpost || tile.observatory
                      ? "Tile already has structure"
                      : (state.strategicResources.SHARD ?? 0) < 2
                        ? "Need 2 SHARD"
                        : missingResourceSlotReason(state, "ASTRAL_DOCK") ?? "Unavailable",
              `${deps.structureCostText("ASTRAL_DOCK")} • ${Math.round(economicStructureBuildMs("ASTRAL_DOCK") / 60000)}m • build 3 parts first`,
              0
            ),
            slots,
            deps
          )
        });
      }
      if (buildShowsOnTile("POPULATION_BUREAU", tile, supportedTowns.length, supportedDocks.length)) {
        out.push({
          id: "build_population_bureau",
          label: "Build Population Bureau",
          detail: deps.buildDetailTextForAction("build_population_bureau", tile) + frontierBuildDetailSuffix(tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            ...chainedBuildAvailability(
              "POPULATION_BUREAU",
              state.techIds.includes("demographic-registry") &&
                populationBureauPartCount >= 3 &&
                !populationBureauBuilt &&
                !tile.siegeOutpost &&
                !tile.observatory &&
                (state.strategicResources.SHARD ?? 0) >= 2 &&
                hasFreeResourceSlots(state, "POPULATION_BUREAU"),
              !state.techIds.includes("demographic-registry")
                ? "Requires Demographic Registry"
                : populationBureauBuilt
                  ? "Population Bureau already built"
                  : populationBureauPartCount < 3
                    ? "Build 3 Population Bureau parts first"
                    : tile.siegeOutpost || tile.observatory
                      ? "Tile already has structure"
                      : (state.strategicResources.SHARD ?? 0) < 2
                        ? "Need 2 SHARD"
                        : missingResourceSlotReason(state, "POPULATION_BUREAU") ?? "Unavailable",
              `${deps.structureCostText("POPULATION_BUREAU")} • ${Math.round(economicStructureBuildMs("POPULATION_BUREAU") / 60000)}m • build 3 parts first`,
              0
            ),
            slots,
            deps
          )
        });
      }
      if (buildShowsOnTile("TITANIUM_LEVY", tile, supportedTowns.length, supportedDocks.length)) {
        out.push({
          id: "build_titanium_levy",
          label: "Build The Titanium Levy",
          detail: deps.buildDetailTextForAction("build_titanium_levy", tile) + frontierBuildDetailSuffix(tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            ...chainedBuildAvailability(
              "TITANIUM_LEVY",
              state.techIds.includes("grand-levy-doctrine") &&
                titaniumLevyPartCount >= 3 &&
                !titaniumLevyBuilt &&
                !tile.siegeOutpost &&
                !tile.observatory &&
                (state.strategicResources.SHARD ?? 0) >= 2 &&
                hasFreeResourceSlots(state, "TITANIUM_LEVY"),
              !state.techIds.includes("grand-levy-doctrine")
                ? "Requires Grand Levy Doctrine"
                : titaniumLevyBuilt
                  ? "The Titanium Levy already built"
                  : titaniumLevyPartCount < 3
                    ? "Build 3 Titanium Levy parts first"
                    : tile.siegeOutpost || tile.observatory
                      ? "Tile already has structure"
                      : (state.strategicResources.SHARD ?? 0) < 2
                        ? "Need 2 SHARD"
                        : missingResourceSlotReason(state, "TITANIUM_LEVY") ?? "Unavailable",
              `${deps.structureCostText("TITANIUM_LEVY")} • ${Math.round(economicStructureBuildMs("TITANIUM_LEVY") / 60000)}m • build 3 parts first`,
              0
            ),
            slots,
            deps
          )
        });
      }
      if (buildShowsOnTile("GOVERNORS_OFFICE", tile, supportedTowns.length, supportedDocks.length)) {
        out.push({
          id: "build_governors_office",
          label: "Build Ministry Hall",
          detail: deps.buildDetailTextForAction("build_governors_office", tile) + frontierBuildDetailSuffix(tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            ...chainedBuildAvailability(
              "GOVERNORS_OFFICE",
              state.techIds.includes("civil-service") && hasFreeResourceSlots(state, "GOVERNORS_OFFICE") && !tile.siegeOutpost && !tile.observatory,
              !state.techIds.includes("civil-service")
                ? "Requires Bureaucratic Reform"
                : tile.siegeOutpost || tile.observatory
                  ? "Tile already has structure"
                  : missingResourceSlotReason(state, "GOVERNORS_OFFICE") ?? "Unavailable",
              `${deps.structureCostText("GOVERNORS_OFFICE")} • ${Math.round(economicStructureBuildMs("GOVERNORS_OFFICE") / 60000)}m • reduces local upkeep`
            ),
            slots,
            deps
          )
        });
      }
      if (buildShowsOnTile("FOUNDRY", tile, supportedTowns.length, supportedDocks.length)) {
        const foundryAvail = canBuildPlacementStructure("FOUNDRY", tile, state.me, state.gold, state.techIds, state.resourceSlots);
        const foundryHasManpower = state.manpower >= structureBuildManpowerCost("FOUNDRY");
        out.push({
          id: "build_foundry",
          label: "Build Foundry",
          detail: deps.buildDetailTextForAction("build_foundry", tile) + frontierBuildDetailSuffix(tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            ...chainedBuildAvailability(
              "FOUNDRY",
              foundryAvail.available && foundryHasManpower,
              !foundryAvail.available
                ? foundryAvail.reason
                : !foundryHasManpower
                  ? `Need ${structureBuildManpowerCost("FOUNDRY")} manpower`
                  : missingResourceSlotReason(state, "FOUNDRY") ?? "Unavailable",
              `${deps.structureCostText("FOUNDRY")} • ${Math.round(economicStructureBuildMs("FOUNDRY") / 60000)}m • doubles mines within 5 tiles; boosted production raises iron/crystal cap`
            ),
            slots,
            deps
          )
        });
      }
      if (buildShowsOnTile("WATERWORKS", tile, supportedTowns.length, supportedDocks.length)) {
        const waterworksAvail = canBuildPlacementStructure("WATERWORKS", tile, state.me, state.gold, state.techIds, state.resourceSlots);
        const waterworksHasManpower = state.manpower >= structureBuildManpowerCost("WATERWORKS");
        out.push({
          id: "build_waterworks",
          label: "Build Waterworks",
          detail: deps.buildDetailTextForAction("build_waterworks", tile) + frontierBuildDetailSuffix(tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            ...chainedBuildAvailability(
              "WATERWORKS",
              waterworksAvail.available && waterworksHasManpower,
              !waterworksAvail.available
                ? waterworksAvail.reason
                : !waterworksHasManpower
                  ? `Need ${structureBuildManpowerCost("WATERWORKS")} manpower`
                  : missingResourceSlotReason(state, "WATERWORKS") ?? "Unavailable",
              `${deps.structureCostText("WATERWORKS")} • ${Math.round(economicStructureBuildMs("WATERWORKS") / 60000)}m • +100% farmstead food within 10 tiles; each boosted Farmstead gains +${WATERWORKS_FARMSTEAD_FOOD_SLOT_BONUS} FOOD slots`
            ),
            slots,
            deps
          )
        });
      }
      if (buildShowsOnTile("GARRISON_HALL", tile, supportedTowns.length, supportedDocks.length)) {
        out.push({
          id: "build_garrison_hall",
          label: "Build Ancillary Factory",
          detail: deps.buildDetailTextForAction("build_garrison_hall", tile) + frontierBuildDetailSuffix(tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            ...chainedBuildAvailability(
              "GARRISON_HALL",
              state.techIds.includes("organized-supply") && hasFreeResourceSlots(state, "GARRISON_HALL") && !tile.siegeOutpost && !tile.observatory,
              !state.techIds.includes("organized-supply")
                ? "Requires Supply Directorate"
                : tile.siegeOutpost || tile.observatory
                  ? "Tile already has structure"
                  : missingResourceSlotReason(state, "GARRISON_HALL") ?? "Unavailable",
              `${deps.structureCostText("GARRISON_HALL")} • ${Math.round(economicStructureBuildMs("GARRISON_HALL") / 60000)}m • +150 manpower cap for this town • +300 manpower cap if an Assembly Works is in this town's connected network`
            ),
            slots,
            deps
          )
        });
      }
      // QUARTERMASTERS_OFFICE is retired (weak payoff vs. its escalating
      // tech-gold cost) — no build clause for it, so it stops appearing in
      // any build menu. Legacy copies a player already owns keep
      // functioning; see structure-registry-economic.ts.
      // WEAPONS_WORKSHOP is retired (replaced by the two structures below) —
      // no build clause for it, so it stops appearing in any build menu.
      // Legacy copies a player already owns keep functioning; see
      // structure-registry-economic.ts.
      if (buildShowsOnTile("TITANIUM_WEAPONS_FACTORY", tile, supportedTowns.length, supportedDocks.length)) {
        out.push({
          id: "build_titanium_weapons_factory",
          label: "Build Titanium Weapons Factory",
          detail: deps.buildDetailTextForAction("build_titanium_weapons_factory", tile) + frontierBuildDetailSuffix(tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            ...chainedBuildAvailability(
              "TITANIUM_WEAPONS_FACTORY",
              state.techIds.includes("masonry") && hasFreeResourceSlots(state, "TITANIUM_WEAPONS_FACTORY") && !tile.siegeOutpost && !tile.observatory,
              !state.techIds.includes("masonry")
                ? "Requires Titanium-Clad Masonry"
                : tile.siegeOutpost || tile.observatory
                  ? "Tile already has structure"
                  : missingResourceSlotReason(state, "TITANIUM_WEAPONS_FACTORY") ?? "Unavailable",
              `${deps.structureCostText("TITANIUM_WEAPONS_FACTORY")} (rises with each one you own) • ${Math.round(economicStructureBuildMs("TITANIUM_WEAPONS_FACTORY") / 60000)}m • +1.5% attack / +3% defense per copy, empire-wide • no per-town limit`
            ),
            slots,
            deps
          )
        });
      }
      if (buildShowsOnTile("UMBRITE_WEAPONS_FACTORY", tile, supportedTowns.length, supportedDocks.length)) {
        out.push({
          id: "build_umbrite_weapons_factory",
          label: "Build Umbrite Weapons Factory",
          detail: deps.buildDetailTextForAction("build_umbrite_weapons_factory", tile) + frontierBuildDetailSuffix(tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            ...chainedBuildAvailability(
              "UMBRITE_WEAPONS_FACTORY",
              state.techIds.includes("leatherworking") && hasFreeResourceSlots(state, "UMBRITE_WEAPONS_FACTORY") && !tile.siegeOutpost && !tile.observatory,
              !state.techIds.includes("leatherworking")
                ? "Requires Rigging Works"
                : tile.siegeOutpost || tile.observatory
                  ? "Tile already has structure"
                  : missingResourceSlotReason(state, "UMBRITE_WEAPONS_FACTORY") ?? "Unavailable",
              `${deps.structureCostText("UMBRITE_WEAPONS_FACTORY")} (rises with each one you own) • ${Math.round(economicStructureBuildMs("UMBRITE_WEAPONS_FACTORY") / 60000)}m • +3% attack / +1.5% defense per copy, empire-wide • no per-town limit`
            ),
            slots,
            deps
          )
        });
      }
    }
    if (
      buildShowsOnTile("RELAY_BEACON", tile, supportedTowns.length, supportedDocks.length) &&
      !tile.fort &&
      !tile.siegeOutpost &&
      !tile.observatory &&
      !tile.economicStructure
    ) {
      out.push({
        id: "build_relay_beacon" as TileActionDef["id"],
        label: "Build Relay Beacon",
        detail: deps.buildDetailTextForAction("build_relay_beacon", tile) + frontierBuildDetailSuffix(tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          ...chainedBuildAvailability(
            "RELAY_BEACON",
            hasFreeResourceSlotsForRelayBeacon(state),
            missingRelayBeaconSlotReason(state) ?? "Unavailable",
            `${deps.structureCostText("RELAY_BEACON")} • ${Math.round(RELAY_BEACON_BUILD_MS / 60000)}m • atk x${RELAY_BEACON_ATTACK_MULT.toFixed(2)}`
          ),
          slots,
          deps
        )
      });
    }
    if (
      tile.ownerId === state.me &&
      !tile.fort &&
      !tile.observatory &&
      (tile.siegeOutpost || !tile.economicStructure || hasRelayBeacon)
    ) {
      const siegeVariant = nextSiegeVariantForTile(state, tile);
      if (siegeVariant) {
        const hasTech = tile.siegeOutpost ? true : state.techIds.includes("leatherworking");
        const canUseTile = Boolean(tile.siegeOutpost) || !tile.economicStructure || hasRelayBeacon;
        const hasFreeSlots = hasFreeResourceSlots(state, siegeVariant.variant, tile.siegeOutpost?.variant);
        out.push({
          id: "build_siege_camp",
          label: tile.siegeOutpost || hasRelayBeacon ? `Upgrade to ${siegeVariant.label}` : `Build ${siegeVariant.label}`,
          detail: deps.buildDetailTextForAction("build_siege_camp", tile) + frontierBuildDetailSuffix(tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            ...chainedBuildAvailability(
              "SIEGE_OUTPOST",
              hasTech && hasFreeSlots && canUseTile,
              !hasTech
                ? "Requires Tanner's Craft"
                : !canUseTile
                  ? "Tile already has structure"
                  : missingResourceSlotReason(state, siegeVariant.variant, tile.siegeOutpost?.variant) ?? "Unavailable",
              `${siegeVariant.summary} • ${Math.round(SIEGE_OUTPOST_BUILD_MS / 60000)}m • atk x${siegeVariant.attackMult.toFixed(2)}`,
              siegeVariant.gold
            ),
            slots,
            deps
          )
        });
      }
    }
    if (tile.resource === "FARM" || tile.resource === "FISH") {
      out.push({
        id: "build_farmstead",
        label: "Build Farmstead",
        detail: deps.buildDetailTextForAction("build_farmstead", tile) + frontierBuildDetailSuffix(tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          ...chainedBuildAvailability(
            "FARMSTEAD",
            !hasBlockingStructure && state.techIds.includes("agriculture") && hasFreeResourceSlots(state, "FARMSTEAD"),
            hasBlockingStructure
              ? "Tile already has structure"
              : !state.techIds.includes("agriculture")
                ? "Requires Agrarian Works"
                : missingResourceSlotReason(state, "FARMSTEAD") ?? "Unavailable",
            tile.resource === "FARM"
              ? `${deps.structureCostText("FARMSTEAD")} • ${Math.round(economicStructureBuildMs("FARMSTEAD") / 60000)}m • +50% food • +${TILE_SLOT_BOOST_STRUCTURES.FARMSTEAD} FOOD slot`
              : `${deps.structureCostText("FARMSTEAD")} • ${Math.round(economicStructureBuildMs("FARMSTEAD") / 60000)}m • no fish output bonus`
          ),
          slots,
          deps
        )
      });
    }
    if (tile.resource === "UMBRITE") {
      out.push({
        id: "build_umbrite_rig",
        label: "Build Umbrite Rig",
        detail: deps.buildDetailTextForAction("build_umbrite_rig", tile) + frontierBuildDetailSuffix(tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          ...chainedBuildAvailability(
            "UMBRITE_RIG",
            !hasBlockingStructure && state.techIds.includes("leatherworking") && hasFreeResourceSlots(state, "UMBRITE_RIG"),
            hasBlockingStructure
              ? "Tile already has structure"
              : !state.techIds.includes("leatherworking")
                ? "Requires Rigging Works"
                : missingResourceSlotReason(state, "UMBRITE_RIG") ?? "Unavailable",
            `${deps.structureCostText("UMBRITE_RIG")} • ${Math.round(economicStructureBuildMs("UMBRITE_RIG") / 60000)}m • +50% umbrite • +15 umbrite cap`
          ),
          slots,
          deps
        )
      });
    }
    if (tile.resource === "TITANIUM" || tile.resource === "GEMS") {
      const matchingNeed = tile.resource === "TITANIUM" ? "TITANIUM" : "CRYSTAL";
      out.push({
        id: "build_mine",
        label: "Build Mine",
        detail: deps.buildDetailTextForAction("build_mine", tile) + frontierBuildDetailSuffix(tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          ...chainedBuildAvailability(
            "MINE",
            !hasBlockingStructure && state.techIds.includes("mining") && hasFreeResourceSlots(state, "MINE"),
            hasBlockingStructure
              ? "Tile already has structure"
              : !state.techIds.includes("mining")
                ? "Requires Deep Shaft Mining"
                : missingResourceSlotReason(state, "MINE") ?? "Unavailable",
            `${deps.structureCostText("MINE")} • ${Math.round(economicStructureBuildMs("MINE") / 60000)}m • +50% ${matchingNeed === "TITANIUM" ? "titanium" : "crystal"} • +${matchingNeed === "TITANIUM" ? "15 titanium" : "9 crystal"} cap`
          ),
          slots,
          deps
        )
      });
    }
    if (townBuildSource) {
      // Mintworks moved to same-tile/uncapped placement in the tech-tree
      // redesign (per-town cap removed, specialization is the point) — no
      // townHasMintworks gate anymore, unlike the other town-support structures
      // below that still cap at one per town.
      const townHasGranary = Boolean(townBuildSource.town?.hasGranary) || deps.townHasSupportStructure(townBuildSource, "GRANARY");
      const townHasCensusHall = deps.townHasSupportStructure(townBuildSource, "CENSUS_HALL");
      const townHasClearingHouse = deps.townHasSupportStructure(townBuildSource, "CLEARING_HOUSE");
      const townHasCaravanary = deps.townHasSupportStructure(townBuildSource, "CARAVANARY");
      const townHasUmbriteSynth = deps.townHasSupportStructure(townBuildSource, "UMBRITE_SYNTHESIZER");
      const townHasTitaniumWorks = deps.townHasSupportStructure(townBuildSource, "TITANIUM_WORKS");
      const townHasCrystalSynth = deps.townHasSupportStructure(townBuildSource, "CRYSTAL_SYNTHESIZER");
      const townHasRailDepot = deps.townHasSupportStructure(townBuildSource, "RAIL_DEPOT");
      // One monument component (of any of the 18 unique types, from any of
      // the 6 monuments) per Great City/Monumental City — unified into one
      // check now that each is its own distinct structure type rather than
      // 6 hand-listed "identical Part" types.
      const townHasAnyMonumentPart = MONUMENT_COMPONENT_TYPES.some((type) => deps.townHasSupportStructure(townBuildSource, type));
      const townHasAssemblyWorks = deps.townHasSupportStructure(townBuildSource, "ASSEMBLY_WORKS");
      const townHasLogisticsGuild = deps.townHasSupportStructure(townBuildSource, "LOGISTICS_GUILD");
      const isGreatCity = townBuildSource.town?.populationTier === "GREAT_CITY" || townBuildSource.town?.populationTier === "METROPOLIS";
      out.push({
        id: "build_mintworks",
        label: "Build Mintworks",
        detail: deps.buildDetailTextForAction("build_mintworks", tile, townBuildSource) + frontierBuildDetailSuffix(tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          ...chainedBuildAvailability(
            "MINTWORKS",
            !supportPlacementBlocked && state.techIds.includes("trade") && hasFreeResourceSlots(state, "MINTWORKS"),
            supportPlacementBlocked
              ? "Tile already has structure"
              : !state.techIds.includes("trade")
                ? "Requires Merchant Charters"
                : missingResourceSlotReason(state, "MINTWORKS") ?? "Unavailable",
            `${deps.structureCostText("MINTWORKS")} • ${Math.round(economicStructureBuildMs("MINTWORKS") / 60000)}m • +${Math.round((mintworksGoldProductionMultiplier(1, Boolean(townBuildSource.town?.clearingHouseActive)) - 1) * 100)}% town gold production (stacks) • +${Math.round((townBuildSource.town?.goldPerMinute ?? 0) * 360).toLocaleString()} gold cap`
          ),
          slots,
          deps
        )
      });
      out.push({
        id: "build_granary",
        label: "Build Granary",
        detail: deps.buildDetailTextForAction("build_granary", tile, townBuildSource) + frontierBuildDetailSuffix(tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          ...chainedBuildAvailability(
            "GRANARY",
            !supportPlacementBlocked && !townHasGranary && state.techIds.includes("pottery") && hasFreeResourceSlots(state, "GRANARY"),
            supportPlacementBlocked
              ? "Tile already has structure"
              : townHasGranary
                ? "Nearby town already has Granary"
                : !state.techIds.includes("pottery")
                  ? "Requires Kiln Craft"
                  : missingResourceSlotReason(state, "GRANARY") ?? "Unavailable",
            `${deps.structureCostText("GRANARY")} • ${Math.round(economicStructureBuildMs("GRANARY") / 60000)}m • +15% town growth`
          ),
          slots,
          deps
        )
      });
      out.push({
        id: "build_census_hall",
        label: "Build Census Hall",
        detail: deps.buildDetailTextForAction("build_census_hall", tile, townBuildSource) + frontierBuildDetailSuffix(tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          ...chainedBuildAvailability(
            "CENSUS_HALL",
            !supportPlacementBlocked && !townHasCensusHall && state.techIds.includes("census-records") && hasFreeResourceSlots(state, "CENSUS_HALL"),
            supportPlacementBlocked
              ? "Tile already has structure"
              : townHasCensusHall
                ? "Nearby town already has Census Hall"
                : !state.techIds.includes("census-records")
                  ? "Requires Census Bureau"
                  : missingResourceSlotReason(state, "CENSUS_HALL") ?? "Unavailable",
            `${deps.structureCostText("CENSUS_HALL")} • ${Math.round(economicStructureBuildMs("CENSUS_HALL") / 60000)}m • +25% town growth`
          ),
          slots,
          deps
        )
      });
      out.push({
        id: "build_clearing_house",
        label: "Build Clearing House",
        detail: deps.buildDetailTextForAction("build_clearing_house", tile, townBuildSource) + frontierBuildDetailSuffix(tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          ...chainedBuildAvailability(
            "CLEARING_HOUSE",
            !supportPlacementBlocked && !townHasClearingHouse && state.techIds.includes("coinage") && hasFreeResourceSlots(state, "CLEARING_HOUSE"),
            supportPlacementBlocked
              ? "Tile already has structure"
              : townHasClearingHouse
                ? "Nearby town already has Clearing House"
                : !state.techIds.includes("coinage")
                  ? "Requires Minting Works"
                  : missingResourceSlotReason(state, "CLEARING_HOUSE") ?? "Unavailable",
            `${deps.structureCostText("CLEARING_HOUSE")} • ${Math.round(economicStructureBuildMs("CLEARING_HOUSE") / 60000)}m • connected Mintworks gold bonus: +${Math.round((mintworksGoldProductionMultiplier(1, false) - 1) * 100)}% → +${Math.round((mintworksGoldProductionMultiplier(1, true) - 1) * 100)}% per copy`
          ),
          slots,
          deps
        )
      });
      out.push({
        id: "build_caravanary",
        label: "Build Trade Nexus",
        detail: deps.buildDetailTextForAction("build_caravanary", tile, townBuildSource) + frontierBuildDetailSuffix(tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          ...chainedBuildAvailability(
            "CARAVANARY",
            !supportPlacementBlocked && !townHasCaravanary && state.techIds.includes("ledger-keeping") && hasFreeResourceSlots(state, "CARAVANARY"),
            supportPlacementBlocked
              ? "Tile already has structure"
              : townHasCaravanary
                ? "Nearby town already has Trade Nexus"
                : !state.techIds.includes("ledger-keeping")
                  ? "Requires Double-Entry Ledgers"
                  : missingResourceSlotReason(state, "CARAVANARY") ?? "Unavailable",
            `${deps.structureCostText("CARAVANARY")} • ${Math.round(economicStructureBuildMs("CARAVANARY") / 60000)}m • +25% connected-town bonus`
          ),
          slots,
          deps
        )
      });
      out.push({
        id: "build_umbrite_synthesizer",
        label: "Build Umbrite Works",
        detail: deps.buildDetailTextForAction("build_umbrite_synthesizer", tile, townBuildSource) + frontierBuildDetailSuffix(tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          ...chainedBuildAvailability(
            "UMBRITE_SYNTHESIZER",
            !supportPlacementBlocked && !townHasUmbriteSynth && state.techIds.includes("workshops"),
            supportPlacementBlocked
              ? "Tile already has structure"
              : townHasUmbriteSynth
                ? "Nearby town already has Umbrite Works"
                : !state.techIds.includes("workshops")
                  ? "Requires Artisan Workshops"
                  : "Unavailable",
            `${deps.structureCostText("UMBRITE_SYNTHESIZER")} • ${Math.round(economicStructureBuildMs("UMBRITE_SYNTHESIZER") / 60000)}m • 18 UMBRITE/day • 30 gold/day`
          ),
          slots,
          deps
        )
      });
      out.push({
        id: "build_titanium_works",
        label: "Build Titanium Works",
        detail: deps.buildDetailTextForAction("build_titanium_works", tile, townBuildSource) + frontierBuildDetailSuffix(tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          ...chainedBuildAvailability(
            "TITANIUM_WORKS",
            !supportPlacementBlocked && !townHasTitaniumWorks && state.techIds.includes("alchemy"),
            supportPlacementBlocked
              ? "Tile already has structure"
              : townHasTitaniumWorks
                ? "Nearby town already has Titanium Works"
                : !state.techIds.includes("alchemy")
                  ? "Requires Alchemical Forges"
                  : "Unavailable",
            `${deps.structureCostText("TITANIUM_WORKS")} • ${Math.round(economicStructureBuildMs("TITANIUM_WORKS") / 60000)}m • 18 TITANIUM/day • 30 gold/day`
          ),
          slots,
          deps
        )
      });
      out.push({
        id: "build_crystal_synthesizer",
        label: "Build Aether Condenser",
        detail: deps.buildDetailTextForAction("build_crystal_synthesizer", tile, townBuildSource) + frontierBuildDetailSuffix(tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          ...chainedBuildAvailability(
            "CRYSTAL_SYNTHESIZER",
            !supportPlacementBlocked && !townHasCrystalSynth && state.techIds.includes("crystal-lattices"),
            supportPlacementBlocked
              ? "Tile already has structure"
              : townHasCrystalSynth
                ? "Nearby town already has Aether Condenser"
                : !state.techIds.includes("crystal-lattices")
                  ? "Requires Aetheric Resonance"
                  : "Unavailable",
            `${deps.structureCostText("CRYSTAL_SYNTHESIZER")} • ${Math.round(economicStructureBuildMs("CRYSTAL_SYNTHESIZER") / 60000)}m • 12 CRYSTAL/day • 40 gold/day`
          ),
          slots,
          deps
        )
      });
      out.push({
        id: "build_rail_depot",
        label: "Build Rail Depot",
        detail: deps.buildDetailTextForAction("build_rail_depot", tile, townBuildSource) + frontierBuildDetailSuffix(tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          ...chainedBuildAvailability(
            "RAIL_DEPOT",
            !supportPlacementBlocked &&
              !townHasRailDepot &&
              state.techIds.includes("global-trade-networks") &&
              hasFreeResourceSlots(state, "RAIL_DEPOT"),
            supportPlacementBlocked
              ? "Tile already has structure"
              : townHasRailDepot
                ? "Nearby town already has Rail Depot"
                : !state.techIds.includes("global-trade-networks")
                  ? "Requires Rail & Wire Networks"
                  : (missingResourceSlotReason(state, "RAIL_DEPOT") ?? "Unavailable"),
            `${deps.structureCostText("RAIL_DEPOT")} • ${Math.round(economicStructureBuildMs("RAIL_DEPOT") / 60000)}m • amplifies every Garrison Hall in this connected-town network (+300 manpower cap, +0.1 manpower/min each) • boosts outpost muster within 50 tiles • one per connected-town network`
          ),
          slots,
          deps
        )
      });
      // Every monument's 3 uniquely-named components share the exact same
      // gating shape (Great City/Monumental City, no other monument
      // component already in that city, the monument's own tech
      // researched) — generated from one table instead of 18 hand-copied
      // blocks.
      const MONUMENT_COMPONENT_BUILD_DEFS: ReadonlyArray<{
        actionId: TileActionDef["id"];
        structureType: NonNullable<Tile["economicStructure"]>["type"];
        actionLabel: string;
        techId: string;
        techLabel: string;
        monumentLabel: string;
      }> = [
        { actionId: "build_imperial_exchange_part_1", structureType: "IMPERIAL_EXCHANGE_PART_1", actionLabel: "Build Golden Ledger", techId: "urban-mintworks", techLabel: "Imperial Exchange", monumentLabel: "Imperial Exchange" },
        { actionId: "build_imperial_exchange_part_2", structureType: "IMPERIAL_EXCHANGE_PART_2", actionLabel: "Build Counting Engine", techId: "urban-mintworks", techLabel: "Imperial Exchange", monumentLabel: "Imperial Exchange" },
        { actionId: "build_imperial_exchange_part_3", structureType: "IMPERIAL_EXCHANGE_PART_3", actionLabel: "Build Sovereign Seal", techId: "urban-mintworks", techLabel: "Imperial Exchange", monumentLabel: "Imperial Exchange" },
        { actionId: "build_world_engine_part_1", structureType: "WORLD_ENGINE_PART_1", actionLabel: "Build The Long Barrel", techId: "world-engine", techLabel: "Worldbreaker Cannon", monumentLabel: "Worldbreaker Cannon" },
        { actionId: "build_world_engine_part_2", structureType: "WORLD_ENGINE_PART_2", actionLabel: "Build Fracture Core", techId: "world-engine", techLabel: "Worldbreaker Cannon", monumentLabel: "Worldbreaker Cannon" },
        { actionId: "build_world_engine_part_3", structureType: "WORLD_ENGINE_PART_3", actionLabel: "Build Sky-Marking Array", techId: "world-engine", techLabel: "Worldbreaker Cannon", monumentLabel: "Worldbreaker Cannon" },
        { actionId: "build_aegis_dome_part_1", structureType: "AEGIS_DOME_PART_1", actionLabel: "Build Shield Lattice", techId: "aegis-dome", techLabel: "Aegis Dome", monumentLabel: "Aegis Dome" },
        { actionId: "build_aegis_dome_part_2", structureType: "AEGIS_DOME_PART_2", actionLabel: "Build Ward Anchor", techId: "aegis-dome", techLabel: "Aegis Dome", monumentLabel: "Aegis Dome" },
        { actionId: "build_aegis_dome_part_3", structureType: "AEGIS_DOME_PART_3", actionLabel: "Build Aegis Crown", techId: "aegis-dome", techLabel: "Aegis Dome", monumentLabel: "Aegis Dome" },
        { actionId: "build_astral_dock_part_1", structureType: "ASTRAL_DOCK_PART_1", actionLabel: "Build Launch Cradle", techId: "astral-dock", techLabel: "Astral Dock", monumentLabel: "Astral Dock" },
        { actionId: "build_astral_dock_part_2", structureType: "ASTRAL_DOCK_PART_2", actionLabel: "Build Orbital Array", techId: "astral-dock", techLabel: "Astral Dock", monumentLabel: "Astral Dock" },
        { actionId: "build_astral_dock_part_3", structureType: "ASTRAL_DOCK_PART_3", actionLabel: "Build Aether Sail", techId: "astral-dock", techLabel: "Astral Dock", monumentLabel: "Astral Dock" },
        { actionId: "build_population_bureau_part_1", structureType: "POPULATION_BUREAU_PART_1", actionLabel: "Build Census Engine", techId: "demographic-registry", techLabel: "Demographic Registry", monumentLabel: "Population Bureau" },
        { actionId: "build_population_bureau_part_2", structureType: "POPULATION_BUREAU_PART_2", actionLabel: "Build Registry Vault", techId: "demographic-registry", techLabel: "Demographic Registry", monumentLabel: "Population Bureau" },
        { actionId: "build_population_bureau_part_3", structureType: "POPULATION_BUREAU_PART_3", actionLabel: "Build Levy Charter", techId: "demographic-registry", techLabel: "Demographic Registry", monumentLabel: "Population Bureau" },
        { actionId: "build_titanium_levy_part_1", structureType: "TITANIUM_LEVY_PART_1", actionLabel: "Build Muster Klaxon", techId: "grand-levy-doctrine", techLabel: "Grand Levy Doctrine", monumentLabel: "The Titanium Levy" },
        { actionId: "build_titanium_levy_part_2", structureType: "TITANIUM_LEVY_PART_2", actionLabel: "Build Titanium Standard", techId: "grand-levy-doctrine", techLabel: "Grand Levy Doctrine", monumentLabel: "The Titanium Levy" },
        { actionId: "build_titanium_levy_part_3", structureType: "TITANIUM_LEVY_PART_3", actionLabel: "Build Levy Writ", techId: "grand-levy-doctrine", techLabel: "Grand Levy Doctrine", monumentLabel: "The Titanium Levy" }
      ];
      for (const def of MONUMENT_COMPONENT_BUILD_DEFS) {
        out.push({
          id: def.actionId,
          label: def.actionLabel,
          detail: deps.buildDetailTextForAction(def.actionId, tile, townBuildSource) + frontierBuildDetailSuffix(tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            ...chainedBuildAvailability(
              def.structureType,
              !supportPlacementBlocked &&
                !townHasAnyMonumentPart &&
                isGreatCity &&
                state.techIds.includes(def.techId) &&
                hasFreeResourceSlots(state, def.structureType),
              supportPlacementBlocked
                ? "Tile already has structure"
                : townHasAnyMonumentPart
                  ? "Nearby great city already hosts a monument component"
                  : !isGreatCity
                    ? "Requires Great City or Monumental City"
                    : !state.techIds.includes(def.techId)
                      ? `Requires ${def.techLabel}`
                      : (missingResourceSlotReason(state, def.structureType) ?? "Unavailable"),
              `${deps.structureCostText(def.structureType)} • ${Math.round(economicStructureBuildMs(def.structureType) / 60000)}m • 1 of 3 unique components for the ${def.monumentLabel}`
            ),
            slots,
            deps
          )
        });
      }
      out.push({
        id: "build_assembly_works",
        label: "Build Assembly Works",
        detail: deps.buildDetailTextForAction("build_assembly_works", tile, townBuildSource) + frontierBuildDetailSuffix(tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          ...chainedBuildAvailability(
            "ASSEMBLY_WORKS",
            !supportPlacementBlocked &&
              !townHasAssemblyWorks &&
              state.techIds.includes("conveyor-networks") &&
              hasFreeResourceSlots(state, "ASSEMBLY_WORKS"),
            supportPlacementBlocked
              ? "Tile already has structure"
              : townHasAssemblyWorks
                ? "Nearby town already has Assembly Works"
                : !state.techIds.includes("conveyor-networks")
                  ? "Requires Conveyor Networks"
                  : (missingResourceSlotReason(state, "ASSEMBLY_WORKS") ?? "Unavailable"),
            `${deps.structureCostText("ASSEMBLY_WORKS")} • ${Math.round(economicStructureBuildMs("ASSEMBLY_WORKS") / 60000)}m • +300 manpower cap for every Ancillary Factory in this connected-town network • one per connected-town network`
          ),
          slots,
          deps
        )
      });
      out.push({
        id: "build_logistics_guild",
        label: "Build Logistics Guild",
        detail: deps.buildDetailTextForAction("build_logistics_guild", tile, townBuildSource) + frontierBuildDetailSuffix(tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          ...chainedBuildAvailability(
            "LOGISTICS_GUILD",
            !supportPlacementBlocked &&
              !townHasLogisticsGuild &&
              state.techIds.includes("remade-concordat") &&
              hasFreeResourceSlots(state, "LOGISTICS_GUILD"),
            supportPlacementBlocked
              ? "Tile already has structure"
              : townHasLogisticsGuild
                ? "Town already has Logistics Guild"
                : !state.techIds.includes("remade-concordat")
                  ? "Requires The Remade Concordat"
                  : (missingResourceSlotReason(state, "LOGISTICS_GUILD") ?? "Unavailable"),
            `${deps.structureCostText("LOGISTICS_GUILD")} • ${Math.round(economicStructureBuildMs("LOGISTICS_GUILD") / 60000)}m • +0.05 manpower/min empire-wide, +0.1/min if a Rail Depot is in this town's connected network`
          ),
          slots,
          deps
        )
      });
    }
    if (tile.dockId) {
      out.push({
        id: "build_customs_house",
        label: "Build Harbor Exchange",
        detail: deps.buildDetailTextForAction("build_customs_house", tile) + frontierBuildDetailSuffix(tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          ...chainedBuildAvailability(
            "CUSTOMS_HOUSE",
            !hasBlockingStructure &&
              state.techIds.includes("harborcraft") &&
              hasFreeResourceSlots(state, "CUSTOMS_HOUSE"),
            hasBlockingStructure
              ? "Tile already has structure"
              : !state.techIds.includes("harborcraft")
                ? "Requires Harbor Engineering"
                : (missingResourceSlotReason(state, "CUSTOMS_HOUSE") ?? "Unavailable"),
            `${deps.structureCostText("CUSTOMS_HOUSE")} • ${Math.round(economicStructureBuildMs("CUSTOMS_HOUSE") / 60000)}m • +1440 gold/day per connected dock`
          ),
          slots,
          deps
        )
      });
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
    const previewManpowerCost = deps.attackPreviewManpowerCostForTarget(tile);
    const barbOrigin = deps.pickOriginForTarget(tile.x, tile.y, false);
    const reachable = Boolean(barbOrigin);
    const actions: TileActionDef[] = [
      {
        id: "launch_attack",
        label: "Launch Attack",
        ...(previewDetail || previewPending ? { detail: previewDetail ?? "Calculating win chance...", loading: previewPending } : {}),
        ...tileActionAvailability(reachable, "No bordering origin tile or linked dock", previewManpowerCost)
      }
    ];
    actions.push(...retortRecastActions());
    actions.push(...crystalCoreActions());
    actions.push(createMountainAction());
    return actions;
  }
  const originForDock = deps.pickOriginForTarget(tile.x, tile.y, false);
  const reachable = Boolean(originForDock);
  const targetShielded = Boolean(tile.ownerId && tile.ownerId !== state.me && deps.ownerSpawnShieldActive(tile.ownerId));
  const targetShieldedReason = "Empire is under spawn protection";
  const previewDetail = deps.attackPreviewDetailForTarget(tile);
  const previewPending = deps.attackPreviewPendingForTarget(tile);
  const previewManpowerCost = deps.attackPreviewManpowerCostForTarget(tile);
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
        !targetShielded && reachable,
        targetShielded ? targetShieldedReason : "No bordering origin tile or linked dock",
        previewManpowerCost
      )
    }
  ];
  if (connectedRegionSize > 1) {
    out.push({
      id: "attack_connected_region",
      label: `Attack Connected Region (${connectedRegionSize})`,
      detail: "Queue attacks across this visible connected enemy region from the edge inward.",
      ...tileActionAvailability(
        !targetShielded && reachable,
        targetShielded ? targetShieldedReason : "No bordering origin tile or linked dock",
        previewManpowerCost ? `${previewManpowerCost} each` : undefined
      )
    });
  }
  const observatoryProtection = deps.hostileObservatoryProtectingTile(tile);
  out.push(...crystalCoreActions());
  if (tile.ownerId && tile.ownerId !== state.me && tile.ownerId !== "barbarian") {
    const isBarbarianOwner = tile.ownerId.startsWith("barbarian");
    const activeTruce = isBarbarianOwner ? undefined : deps.activeTruceWithPlayer(tile.ownerId);
    const pendingTruce = isBarbarianOwner ? undefined : deps.pendingTruceWithPlayer(tile.ownerId);
    const hasOutgoingPendingTruce = state.outgoingTruceRequests.some((request) => request.expiresAt > Date.now());
    if (isBarbarianOwner) {
      // Barbarians cannot be truced with — no truce actions for barbarian-owned tiles.
    } else if (activeTruce) {
      out.push({
        id: "break_truce",
        label: "Break Truce",
        ...tileActionAvailability(true, "", "Locks you out of new truces for 24h")
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
    const revealActive = state.activeRevealTargets.includes(tile.ownerId);
    const hasCapability = hasRevealCapability(state);
    const hasCapacity = state.revealCapacity > 0 && state.activeRevealTargets.length < 1;
    out.push({
      id: "reveal_empire",
      label: revealActive ? "Cancel Reveal Empire" : "Reveal Empire",
      ...tileActionAvailability(
        revealActive || (hasCapability && hasCapacity),
        revealActive ? "Stop revealing this empire" : !hasCapability ? "Requires Beacon Network" : !hasCapacity ? "Reveal capacity full" : "",
        revealActive ? "Cancel current reveal" : "Free • toggle, no cooldown"
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
          revealStatsCooldown <= 0,
        !hasRevealCapability(state)
          ? "Requires Beacon Network"
          : revealActive
            ? "Cancel reveal first"
            : revealStatsCooldown > 0
              ? `Cooldown ${deps.formatCooldownShort(revealStatsCooldown)}`
              : "",
        "Free • one-shot empire intel • 5m cooldown"
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
          Boolean(tile.resource || tile.town) &&
          !tile.sabotage,
        !hasSiphonCapability(state)
          ? "Requires Covert Logistics"
          : observatoryProtection
            ? "Blocked by observatory field"
            : tile.sabotage
              ? "Already siphoned"
              : !(tile.resource || tile.town)
                ? "Town or resource only"
                : sabotageCooldown > 0
                  ? `Cooldown ${deps.formatCooldownShort(sabotageCooldown)}`
                  : "",
        "Free • siphons a 3x3 for 60m • 10m cooldown"
      )
    });
  }
  out.push(...retortRecastActions());
  out.push(createMountainAction());
  return out;
};
