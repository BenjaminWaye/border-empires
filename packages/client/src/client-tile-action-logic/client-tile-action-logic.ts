import {
  buildAetherWallSegments,
  type TownGrowthUpgradeView,
  nextTownGrowthUpgrade,
  type BuildableStructureType,
  EXPAND_MANPOWER_COST, FORT_BUILD_MS,
  FRONTIER_CLAIM_COST,
  LIGHT_OUTPOST_ATTACK_MULT,
  LIGHT_OUTPOST_BUILD_MS,
  LIGHT_OUTPOST_VISION_BONUS,
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
  type SlotResource,
  type SlotStructureType,
  type StructureSlotRequirement
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
import { buildShowsOnTile, ownedActiveObservatoryWithinRange } from "../client-tile-action-support/client-tile-action-support.js";
import { readyOwnedObservatoryCooldownRemainingMs } from "../client-observatory-cooldown/client-observatory-cooldown.js";
import { ownObservatoryRange } from "../client-observatory-rules/client-observatory-rules.js";
import { buildMusterActions } from "../client-muster-tile-actions.js";
import { canBuildPlacementStructure } from "../client-structure-effects/client-structure-effects.js";
import { hasFreeResourceSlotsForLightOutpost, missingLightOutpostSlotReason } from "../client-light-outpost-food-slot/client-light-outpost-food-slot.js";

type BuildableStructureId = BuildableStructureType;
type AbilityCooldownId = keyof ClientState["abilityCooldowns"];
type AetherWallLength = 1 | 2 | 3;

// §5 (resource slots, docs/manpower-economy-rewrite-plan.md): the real
// build-time affordability gate for FOOD/IRON/CRYSTAL/SUPPLY now that Step 5
// item 4 Slice A retired their build-time stockpile spend server-side
// (hasFreeResourceSlots, runtime-structure-command-handlers.ts). Mirrors
// that gate exactly, including the in-place-upgrade netting
// (currentTileFieldSlotRequirements) and the synthesizer skip (a
// synthesizer PROVIDES a slot, never consumes one, §6.4).
const freeResourceSlotCount = (state: ClientState, resource: SlotResource): number =>
  (state.resourceSlots?.supply[resource] ?? 0) - (state.resourceSlots?.demand[resource] ?? 0);

const additionalResourceSlotRequirements = (
  type: SlotStructureType,
  currentType?: SlotStructureType
): StructureSlotRequirement[] => {
  if (SYNTHESIZER_STRUCTURE_TYPES.includes(type as (typeof SYNTHESIZER_STRUCTURE_TYPES)[number])) return [];
  const newRequirements = structureSlotRequirements(type);
  if (!currentType) return newRequirements;
  const currentByResource = new Map(structureSlotRequirements(currentType).map((r) => [r.resource, r.count]));
  return newRequirements
    .map((r) => ({ resource: r.resource, count: r.count - (currentByResource.get(r.resource) ?? 0) }))
    .filter((r) => r.count > 0);
};

const hasFreeResourceSlots = (state: ClientState, type: SlotStructureType, currentType?: SlotStructureType): boolean =>
  additionalResourceSlotRequirements(type, currentType).every((r) => freeResourceSlotCount(state, r.resource) >= r.count);

// First unmet requirement's reason text, or undefined when all are met.
const missingResourceSlotReason = (state: ClientState, type: SlotStructureType, currentType?: SlotStructureType): string | undefined => {
  const missing = additionalResourceSlotRequirements(type, currentType).find((r) => freeResourceSlotCount(state, r.resource) < r.count);
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
      `${totalGold} gold, ${totalManpower} m.p. • settle + build • ${Math.round((settleDurationMsForState(state, tile) + structureBuildDurationMs(structureType)) / 60000)}m total`
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
            state.gold >= 8000,
          !hasTerrainShapingCapability(state)
            ? "Requires Aether Moorings"
            : observatoryProtection
              ? "Blocked by observatory field"
              : !inObsRange
                ? "Need active observatory in range"
                : removeCooldown > 0
                  ? `Cooldown ${deps.formatCooldownShort(removeCooldown)}`
                  : "Need 8000 gold",
          "8000 gold • 20m cooldown"
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
          state.gold >= 8000,
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
                  : "Need 8000 gold",
        "8000 gold • 20m cooldown"
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
                    : "";
      out.push({
        id: "aether_lance",
        label: "Aether Purge",
        ...tileActionAvailability(reason === "", reason, "3000 gold • turn enemy control neutral • 10m cooldown")
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
    const hasGold = state.gold >= FRONTIER_CLAIM_COST; const hasManpower = state.manpower >= EXPAND_MANPOWER_COST;
    const frontierCostLabel = frontierClaimCostLabelForTile(tile.x, tile.y);

    const totalExploreGold = FRONTIER_CLAIM_COST + SETTLE_COST; // build cost is 0
    const totalExploreManpower = EXPAND_MANPOWER_COST + SETTLE_MANPOWER_COST + structureBuildManpowerCost("LIGHT_OUTPOST");
    const totalExploreMs = settleDurationMsForState(state, tile) + LIGHT_OUTPOST_BUILD_MS;
    const exploreHasGold = canAffordCost(state.gold, totalExploreGold);
    const exploreHasManpower = state.manpower >= totalExploreManpower;

    const out: TileActionDef[] = [];
    if (isAdjacentToUnexplored(state, tile.x, tile.y, deps)) {
      const exploreEnabled = exploreHasGold && exploreHasManpower && hasFreeResourceSlotsForLightOutpost(state);
      out.push({
        id: "build_light_outpost_frontier" as TileActionDef["id"],
        label: "Build Light Outpost",
        detail: `Push into the unknown • expand + settle + build • +${LIGHT_OUTPOST_VISION_BONUS} vision`,
        ...tileActionAvailability(
          exploreEnabled,
          !exploreHasManpower ? `Need ${totalExploreManpower} manpower` : !exploreHasGold ? `Need ${totalExploreGold} gold` : (missingLightOutpostSlotReason(state) ?? "Unavailable"),
          `${totalExploreGold} gold, ${totalExploreManpower} m.p. • expand + settle + build • ${Math.round(totalExploreMs / 60000)}m total`
        )
      });
    }
    out.push({
        id: "settle_land",
        label: "Settle Land",
        ...tileActionAvailability(
          reachable && hasGold && hasManpower,
          !reachable ? "Must touch your territory" : !hasManpower ? `Need ${EXPAND_MANPOWER_COST} manpower` : `Need ${FRONTIER_CLAIM_COST} gold`,
          frontierCostLabel
        )
      }
    );
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
            ? "Requires Industrial Extraction"
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
            ? "Requires Surveying"
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
          "Free • full-map vision for 24h • wait for current satellite to come down before relaunching"
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
            && (state.gold ?? 0) >= 5_000,
          economicStructure.status !== "active"
            ? "Sky Dock still building"
            : !isPowered
              ? "Needs nearby Aether Tower"
              : bombardOnCooldown
                ? `Cooldown ${deps.formatCooldownShort(Math.max(0, bombardCooldownUntil - Date.now()))}`
                : "Need 5,000 gold",
          "5,000 gold • 20m cooldown • strip ownership from 3×3 (per-tile miss, +25% near forts)"
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
    if (tile.economicStructure) {
      const downtimeRemainingMs = Math.max(0, (tile.economicStructure.disabledUntil ?? 0) - Date.now());
      const isConverter = isConverterStructureType(tile.economicStructure.type);
      if (tile.economicStructure.status === "active") {
        out.push({
          id: "disable_converter_structure" as TileActionDef["id"],
          label: `Disable ${economicStructureName(tile.economicStructure.type)}`,
          detail: deps.buildDetailTextForAction("disable_converter_structure", tile)
        });
      } else if (tile.economicStructure.status === "inactive") {
        out.push({
          id: "enable_converter_structure" as TileActionDef["id"],
          label: `Enable ${economicStructureName(tile.economicStructure.type)}`,
          detail: deps.buildDetailTextForAction("enable_converter_structure", tile),
          ...tileActionAvailability(
            downtimeRemainingMs <= 0,
            downtimeRemainingMs > 0
              ? `Recovering for ${Math.ceil(downtimeRemainingMs / 3600000)}h`
              : "Needs enough gold for one upkeep tick",
            isConverter ? "Pays one upkeep tick immediately" : "Resource slots and bonuses resume"
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
          state.techIds.includes("advanced-synthetication") &&
            state.gold >= deps.structureGoldCost("ADVANCED_FUR_SYNTHESIZER") &&
            state.manpower >= structureBuildManpowerCost("ADVANCED_FUR_SYNTHESIZER"),
          !state.techIds.includes("advanced-synthetication")
            ? "Requires Advanced Synthetication"
            : state.gold < deps.structureGoldCost("ADVANCED_FUR_SYNTHESIZER")
              ? `Need ${deps.structureGoldCost("ADVANCED_FUR_SYNTHESIZER")} gold`
              : `Need ${structureBuildManpowerCost("ADVANCED_FUR_SYNTHESIZER")} manpower`,
          `${deps.structureCostText("ADVANCED_FUR_SYNTHESIZER")} • ${Math.round(economicStructureBuildMs("ADVANCED_FUR_SYNTHESIZER") / 60000)}m • 21.6 SUPPLY/day • 45 gold/day`,
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
          state.techIds.includes("advanced-synthetication") &&
            state.gold >= deps.structureGoldCost("ADVANCED_IRONWORKS") &&
            state.manpower >= structureBuildManpowerCost("ADVANCED_IRONWORKS"),
          !state.techIds.includes("advanced-synthetication")
            ? "Requires Advanced Synthetication"
            : state.gold < deps.structureGoldCost("ADVANCED_IRONWORKS")
              ? `Need ${deps.structureGoldCost("ADVANCED_IRONWORKS")} gold`
              : `Need ${structureBuildManpowerCost("ADVANCED_IRONWORKS")} manpower`,
          `${deps.structureCostText("ADVANCED_IRONWORKS")} • ${Math.round(economicStructureBuildMs("ADVANCED_IRONWORKS") / 60000)}m • 21.6 IRON/day • 45 gold/day`,
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
    const hasLightOutpost = tile.economicStructure?.type === "LIGHT_OUTPOST";
    if (
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
                ? "Requires Stoneworks"
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
      const hasTech = state.techIds.includes("cartography");
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
              ? "Requires Cartography"
              : tile.fort || tile.siegeOutpost || tile.economicStructure
                ? "Tile already has structure"
                : missingResourceSlotReason(state, "OBSERVATORY") ?? "Unavailable",
            `${deps.structureCostText("OBSERVATORY")} • ${Math.round(OBSERVATORY_BUILD_MS / 60000)}m • +${OBSERVATORY_VISION_BONUS} vision • 36 crystal/day`
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
      const imperialExchangePartCount = [...state.tiles.values()].filter((candidate) => candidate.economicStructure?.ownerId === state.me && candidate.economicStructure?.type === "IMPERIAL_EXCHANGE_PART").length;
      const worldEnginePartCount = [...state.tiles.values()].filter((candidate) => candidate.economicStructure?.ownerId === state.me && candidate.economicStructure?.type === "WORLD_ENGINE_PART").length;
      const aegisDomePartCount = [...state.tiles.values()].filter((candidate) => candidate.economicStructure?.ownerId === state.me && candidate.economicStructure?.type === "AEGIS_DOME_PART").length;
      const astralDockPartCount = [...state.tiles.values()].filter((candidate) => candidate.economicStructure?.ownerId === state.me && candidate.economicStructure?.type === "ASTRAL_DOCK_PART").length;
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
              state.techIds.includes("urban-markets") &&
                imperialExchangePartCount >= 3 &&
                !imperialExchangeBuilt &&
                !tile.siegeOutpost &&
                !tile.observatory &&
                (state.strategicResources.SHARD ?? 0) >= 2 &&
                hasFreeResourceSlots(state, "IMPERIAL_EXCHANGE"),
              !state.techIds.includes("urban-markets")
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
                ? "Requires Civil Service"
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
              `${deps.structureCostText("WATERWORKS")} • ${Math.round(economicStructureBuildMs("WATERWORKS") / 60000)}m • +100% farmstead food within 10 tiles; boosted production raises food cap`
            ),
            slots,
            deps
          )
        });
      }
      if (buildShowsOnTile("GARRISON_HALL", tile, supportedTowns.length, supportedDocks.length)) {
        out.push({
          id: "build_garrison_hall",
          label: "Build Garrison Hall",
          detail: deps.buildDetailTextForAction("build_garrison_hall", tile) + frontierBuildDetailSuffix(tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            ...chainedBuildAvailability(
              "GARRISON_HALL",
              state.techIds.includes("organized-supply") && hasFreeResourceSlots(state, "GARRISON_HALL") && !tile.siegeOutpost && !tile.observatory,
              !state.techIds.includes("organized-supply")
                ? "Requires Organized Supply"
                : tile.siegeOutpost || tile.observatory
                  ? "Tile already has structure"
                  : missingResourceSlotReason(state, "GARRISON_HALL") ?? "Unavailable",
              `${deps.structureCostText("GARRISON_HALL")} • ${Math.round(economicStructureBuildMs("GARRISON_HALL") / 60000)}m • +150 manpower cap for this town • +300 manpower cap and +0.1 manpower/min empire-wide if a Rail Depot is in this town's connected network`
            ),
            slots,
            deps
          )
        });
      }
    }
    if (
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
        detail: deps.buildDetailTextForAction("build_light_outpost", tile) + frontierBuildDetailSuffix(tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          ...chainedBuildAvailability(
            "LIGHT_OUTPOST",
            hasFreeResourceSlotsForLightOutpost(state),
            missingLightOutpostSlotReason(state) ?? "Unavailable",
            `${deps.structureCostText("LIGHT_OUTPOST")} • ${Math.round(LIGHT_OUTPOST_BUILD_MS / 60000)}m • atk x${LIGHT_OUTPOST_ATTACK_MULT.toFixed(2)}`
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
      (tile.siegeOutpost || !tile.economicStructure || hasLightOutpost)
    ) {
      const siegeVariant = nextSiegeVariantForTile(state, tile);
      if (siegeVariant) {
        const hasTech = tile.siegeOutpost ? true : state.techIds.includes("leatherworking");
        const canUseTile = Boolean(tile.siegeOutpost) || !tile.economicStructure || hasLightOutpost;
        const hasFreeSlots = hasFreeResourceSlots(state, siegeVariant.variant, tile.siegeOutpost?.variant);
        out.push({
          id: "build_siege_camp",
          label: tile.siegeOutpost || hasLightOutpost ? `Upgrade to ${siegeVariant.label}` : `Build ${siegeVariant.label}`,
          detail: deps.buildDetailTextForAction("build_siege_camp", tile) + frontierBuildDetailSuffix(tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            ...chainedBuildAvailability(
              "SIEGE_OUTPOST",
              hasTech && hasFreeSlots && canUseTile,
              !hasTech
                ? "Requires Leatherworking"
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
                ? "Requires Agriculture"
                : missingResourceSlotReason(state, "FARMSTEAD") ?? "Unavailable",
            tile.resource === "FARM"
              ? `${deps.structureCostText("FARMSTEAD")} • ${Math.round(economicStructureBuildMs("FARMSTEAD") / 60000)}m • +50% food • +18 food cap`
              : `${deps.structureCostText("FARMSTEAD")} • ${Math.round(economicStructureBuildMs("FARMSTEAD") / 60000)}m • no fish output bonus`
          ),
          slots,
          deps
        )
      });
    }
    if (tile.resource === "WOOD" || tile.resource === "FUR") {
      out.push({
        id: "build_camp",
        label: "Build Camp",
        detail: deps.buildDetailTextForAction("build_camp", tile) + frontierBuildDetailSuffix(tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          ...chainedBuildAvailability(
            "CAMP",
            !hasBlockingStructure && state.techIds.includes("leatherworking") && hasFreeResourceSlots(state, "CAMP"),
            hasBlockingStructure
              ? "Tile already has structure"
              : !state.techIds.includes("leatherworking")
                ? "Requires Leatherworking"
                : missingResourceSlotReason(state, "CAMP") ?? "Unavailable",
            `${deps.structureCostText("CAMP")} • ${Math.round(economicStructureBuildMs("CAMP") / 60000)}m • +50% supply • +15 supply cap`
          ),
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
        detail: deps.buildDetailTextForAction("build_mine", tile) + frontierBuildDetailSuffix(tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          ...chainedBuildAvailability(
            "MINE",
            !hasBlockingStructure && state.techIds.includes("mining") && hasFreeResourceSlots(state, "MINE"),
            hasBlockingStructure
              ? "Tile already has structure"
              : !state.techIds.includes("mining")
                ? "Requires Mining"
                : missingResourceSlotReason(state, "MINE") ?? "Unavailable",
            `${deps.structureCostText("MINE")} • ${Math.round(economicStructureBuildMs("MINE") / 60000)}m • +50% ${matchingNeed === "IRON" ? "iron" : "crystal"} • +${matchingNeed === "IRON" ? "15 iron" : "9 crystal"} cap`
          ),
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
        detail: deps.buildDetailTextForAction("build_market", tile, townBuildSource) + frontierBuildDetailSuffix(tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          ...chainedBuildAvailability(
            "MARKET",
            !supportPlacementBlocked && !townHasMarket && state.techIds.includes("trade") && hasFreeResourceSlots(state, "MARKET"),
            supportPlacementBlocked
              ? "Tile already has structure"
              : townHasMarket
                ? "Nearby town already has Market"
                : !state.techIds.includes("trade")
                  ? "Requires Trade"
                  : missingResourceSlotReason(state, "MARKET") ?? "Unavailable",
            `${deps.structureCostText("MARKET")} • ${Math.round(economicStructureBuildMs("MARKET") / 60000)}m • +50% town gold production • +${Math.round((townBuildSource.town?.goldPerMinute ?? 0) * 360).toLocaleString()} gold cap`
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
                  ? "Requires Pottery"
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
                  ? "Requires Census Records"
                  : missingResourceSlotReason(state, "CENSUS_HALL") ?? "Unavailable",
            `${deps.structureCostText("CENSUS_HALL")} • ${Math.round(economicStructureBuildMs("CENSUS_HALL") / 60000)}m • +25% town growth`
          ),
          slots,
          deps
        )
      });
      out.push({
        id: "build_bank",
        label: "Build Bank",
        detail: deps.buildDetailTextForAction("build_bank", tile, townBuildSource) + frontierBuildDetailSuffix(tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          ...chainedBuildAvailability(
            "BANK",
            !supportPlacementBlocked && !townHasBank && state.techIds.includes("coinage") && hasFreeResourceSlots(state, "BANK"),
            supportPlacementBlocked
              ? "Tile already has structure"
              : townHasBank
                ? "Nearby town already has Bank"
                : !state.techIds.includes("coinage")
                  ? "Requires Coinage"
                  : missingResourceSlotReason(state, "BANK") ?? "Unavailable",
            `${deps.structureCostText("BANK")} • ${Math.round(economicStructureBuildMs("BANK") / 60000)}m • +50% city income • +1 flat income`
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
            !supportPlacementBlocked && !townHasClearingHouse && state.techIds.includes("banking") && hasFreeResourceSlots(state, "CLEARING_HOUSE"),
            supportPlacementBlocked
              ? "Tile already has structure"
              : townHasClearingHouse
                ? "Nearby town already has Clearing House"
                : !state.techIds.includes("banking")
                  ? "Requires Banking"
                  : missingResourceSlotReason(state, "CLEARING_HOUSE") ?? "Unavailable",
            `${deps.structureCostText("CLEARING_HOUSE")} • ${Math.round(economicStructureBuildMs("CLEARING_HOUSE") / 60000)}m • boosts connected Markets and Banks`
          ),
          slots,
          deps
        )
      });
      out.push({
        id: "build_caravanary",
        label: "Build Caravanary",
        detail: deps.buildDetailTextForAction("build_caravanary", tile, townBuildSource) + frontierBuildDetailSuffix(tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          ...chainedBuildAvailability(
            "CARAVANARY",
            !supportPlacementBlocked && !townHasCaravanary && state.techIds.includes("ledger-keeping") && hasFreeResourceSlots(state, "CARAVANARY"),
            supportPlacementBlocked
              ? "Tile already has structure"
              : townHasCaravanary
                ? "Nearby town already has Caravanary"
                : !state.techIds.includes("ledger-keeping")
                  ? "Requires Ledger Keeping"
                  : missingResourceSlotReason(state, "CARAVANARY") ?? "Unavailable",
            `${deps.structureCostText("CARAVANARY")} • ${Math.round(economicStructureBuildMs("CARAVANARY") / 60000)}m • +25% connected-town bonus`
          ),
          slots,
          deps
        )
      });
      out.push({
        id: "build_fur_synthesizer",
        label: "Build Fur Synthesizer",
        detail: deps.buildDetailTextForAction("build_fur_synthesizer", tile, townBuildSource) + frontierBuildDetailSuffix(tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          ...chainedBuildAvailability(
            "FUR_SYNTHESIZER",
            !supportPlacementBlocked && !townHasFurSynth && state.techIds.includes("workshops"),
            supportPlacementBlocked
              ? "Tile already has structure"
              : townHasFurSynth
                ? "Nearby town already has Fur Synthesizer"
                : !state.techIds.includes("workshops")
                  ? "Requires Workshops"
                  : "Unavailable",
            `${deps.structureCostText("FUR_SYNTHESIZER")} • ${Math.round(economicStructureBuildMs("FUR_SYNTHESIZER") / 60000)}m • 18 SUPPLY/day • 30 gold/day`
          ),
          slots,
          deps
        )
      });
      out.push({
        id: "build_ironworks",
        label: "Build Ironworks",
        detail: deps.buildDetailTextForAction("build_ironworks", tile, townBuildSource) + frontierBuildDetailSuffix(tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          ...chainedBuildAvailability(
            "IRONWORKS",
            !supportPlacementBlocked && !townHasIronworks && state.techIds.includes("alchemy"),
            supportPlacementBlocked
              ? "Tile already has structure"
              : townHasIronworks
                ? "Nearby town already has Ironworks"
                : !state.techIds.includes("alchemy")
                  ? "Requires Alchemy"
                  : "Unavailable",
            `${deps.structureCostText("IRONWORKS")} • ${Math.round(economicStructureBuildMs("IRONWORKS") / 60000)}m • 18 IRON/day • 30 gold/day`
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
                  ? "Requires Crystal Lattices"
                  : "Unavailable",
            `${deps.structureCostText("CRYSTAL_SYNTHESIZER")} • ${Math.round(economicStructureBuildMs("CRYSTAL_SYNTHESIZER") / 60000)}m • 12 CRYSTAL/day • 40 gold/day`
          ),
          slots,
          deps
        )
      });
      out.push({
        id: "build_exchange_house",
        label: "Build Exchange House",
        detail: deps.buildDetailTextForAction("build_exchange_house", tile, townBuildSource) + frontierBuildDetailSuffix(tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          ...chainedBuildAvailability(
            "EXCHANGE_HOUSE",
            !supportPlacementBlocked &&
              !townHasExchangeHouse &&
              state.techIds.includes("imperial-roads") &&
              hasFreeResourceSlots(state, "EXCHANGE_HOUSE"),
            supportPlacementBlocked
              ? "Tile already has structure"
              : townHasExchangeHouse
                ? "Nearby town already has Exchange House"
                : !state.techIds.includes("imperial-roads")
                  ? "Requires Monument Cities"
                  : (missingResourceSlotReason(state, "EXCHANGE_HOUSE") ?? "Unavailable"),
            `${deps.structureCostText("EXCHANGE_HOUSE")} • ${Math.round(economicStructureBuildMs("EXCHANGE_HOUSE") / 60000)}m • scales with nearby support buildings`
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
                  ? "Requires Rail Networks"
                  : (missingResourceSlotReason(state, "RAIL_DEPOT") ?? "Unavailable"),
            `${deps.structureCostText("RAIL_DEPOT")} • ${Math.round(economicStructureBuildMs("RAIL_DEPOT") / 60000)}m • amplifies every Garrison Hall in this connected-town network (+300 manpower cap, +0.1 manpower/min each) • boosts outpost muster within 50 tiles • one per connected-town network`
          ),
          slots,
          deps
        )
      });
      out.push({
        id: "build_imperial_exchange_part",
        label: "Build Imperial Exchange Part",
        detail: deps.buildDetailTextForAction("build_imperial_exchange_part", tile, townBuildSource) + frontierBuildDetailSuffix(tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          ...chainedBuildAvailability(
            "IMPERIAL_EXCHANGE_PART",
            !supportPlacementBlocked &&
              !townHasImperialExchangePart &&
              !townHasWorldEnginePart &&
              !townHasAegisDomePart &&
              !townHasAstralDockPart &&
              isGreatCity &&
              state.techIds.includes("urban-markets") &&
              hasFreeResourceSlots(state, "IMPERIAL_EXCHANGE_PART"),
            supportPlacementBlocked
              ? "Tile already has structure"
              : townHasImperialExchangePart || townHasWorldEnginePart || townHasAegisDomePart || townHasAstralDockPart
                ? "Nearby great city already hosts a monument part"
                : !isGreatCity
                  ? "Requires Great City or Monumental City"
                  : !state.techIds.includes("urban-markets")
                    ? "Requires Imperial Exchange"
                    : (missingResourceSlotReason(state, "IMPERIAL_EXCHANGE_PART") ?? "Unavailable"),
            `${deps.structureCostText("IMPERIAL_EXCHANGE_PART")} • ${Math.round(economicStructureBuildMs("IMPERIAL_EXCHANGE_PART") / 60000)}m • build 3 to unlock the monument`
          ),
          slots,
          deps
        )
      });
      out.push({
        id: "build_world_engine_part",
        label: "Build Worldbreaker Cannon Part",
        detail: deps.buildDetailTextForAction("build_world_engine_part", tile, townBuildSource) + frontierBuildDetailSuffix(tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          ...chainedBuildAvailability(
            "WORLD_ENGINE_PART",
            !supportPlacementBlocked &&
              !townHasImperialExchangePart &&
              !townHasWorldEnginePart &&
              !townHasAegisDomePart &&
              !townHasAstralDockPart &&
              isGreatCity &&
              state.techIds.includes("world-engine") &&
              hasFreeResourceSlots(state, "WORLD_ENGINE_PART"),
            supportPlacementBlocked
              ? "Tile already has structure"
              : townHasImperialExchangePart || townHasWorldEnginePart || townHasAegisDomePart || townHasAstralDockPart
                ? "Nearby great city already hosts a monument part"
                : !isGreatCity
                  ? "Requires Great City or Monumental City"
                  : !state.techIds.includes("world-engine")
                    ? "Requires Worldbreaker Cannon"
                    : (missingResourceSlotReason(state, "WORLD_ENGINE_PART") ?? "Unavailable"),
            `${deps.structureCostText("WORLD_ENGINE_PART")} • ${Math.round(economicStructureBuildMs("WORLD_ENGINE_PART") / 60000)}m • build 3 to unlock the monument`
          ),
          slots,
          deps
        )
      });
      out.push({
        id: "build_aegis_dome_part",
        label: "Build Aegis Dome Part",
        detail: deps.buildDetailTextForAction("build_aegis_dome_part", tile, townBuildSource) + frontierBuildDetailSuffix(tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          ...chainedBuildAvailability(
            "AEGIS_DOME_PART",
            !supportPlacementBlocked &&
              !townHasImperialExchangePart &&
              !townHasWorldEnginePart &&
              !townHasAegisDomePart &&
              !townHasAstralDockPart &&
              isGreatCity &&
              state.techIds.includes("aegis-dome") &&
              hasFreeResourceSlots(state, "AEGIS_DOME_PART"),
            supportPlacementBlocked
              ? "Tile already has structure"
              : townHasImperialExchangePart || townHasWorldEnginePart || townHasAegisDomePart || townHasAstralDockPart
                ? "Nearby great city already hosts a monument part"
                : !isGreatCity
                  ? "Requires Great City or Monumental City"
                  : !state.techIds.includes("aegis-dome")
                    ? "Requires Aegis Dome"
                    : (missingResourceSlotReason(state, "AEGIS_DOME_PART") ?? "Unavailable"),
            `${deps.structureCostText("AEGIS_DOME_PART")} • ${Math.round(economicStructureBuildMs("AEGIS_DOME_PART") / 60000)}m • build 3 to unlock the monument`
          ),
          slots,
          deps
        )
      });
      out.push({
        id: "build_astral_dock_part",
        label: "Build Astral Dock Part",
        detail: deps.buildDetailTextForAction("build_astral_dock_part", tile, townBuildSource) + frontierBuildDetailSuffix(tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          ...chainedBuildAvailability(
            "ASTRAL_DOCK_PART",
            !supportPlacementBlocked &&
              !townHasImperialExchangePart &&
              !townHasWorldEnginePart &&
              !townHasAegisDomePart &&
              !townHasAstralDockPart &&
              isGreatCity &&
              state.techIds.includes("astral-dock") &&
              hasFreeResourceSlots(state, "ASTRAL_DOCK_PART"),
            supportPlacementBlocked
              ? "Tile already has structure"
              : townHasImperialExchangePart || townHasWorldEnginePart || townHasAegisDomePart || townHasAstralDockPart
                ? "Nearby great city already hosts a monument part"
                : !isGreatCity
                  ? "Requires Great City or Monumental City"
                  : !state.techIds.includes("astral-dock")
                    ? "Requires Astral Dock"
                    : (missingResourceSlotReason(state, "ASTRAL_DOCK_PART") ?? "Unavailable"),
            `${deps.structureCostText("ASTRAL_DOCK_PART")} • ${Math.round(economicStructureBuildMs("ASTRAL_DOCK_PART") / 60000)}m • build 3 to unlock the monument`
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
                ? "Requires Aether Moorings"
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
    const barbOrigin = deps.pickOriginForTarget(tile.x, tile.y, true);
    const reachable = Boolean(barbOrigin);
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
  const originForDock = deps.pickOriginForTarget(tile.x, tile.y, true);
  const reachable = Boolean(originForDock);
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
        revealActive ? "Stop revealing this empire" : !hasCapability ? "Requires Beacon Towers" : !hasCapacity ? "Reveal capacity full" : "",
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
          ? "Requires Logistics"
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
          ? "Requires Logistics"
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
