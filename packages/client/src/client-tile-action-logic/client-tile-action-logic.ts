import {
  buildAetherWallSegments,
  nextTownGrowthUpgrade,
  type BuildableStructureType,
  SETTLE_COST, SETTLE_MANPOWER_COST,
  SIEGE_BATTERY_ATTACK_MULT,
  PALISADE_DEFENSE_MULT,
  structureBuildGoldCost,
  structureBuildManpowerCost,
  structureBuildDurationMs,
  structurePlacementMetadata,
  terrainAt,
  structureSlotRequirements,
  observatoryCrystalSlotCostForOwnedCount,
  structureSkipsSettledRequirement,
  SYNTHESIZER_STRUCTURE_TYPES,
  TILE_SLOT_BOOST_STRUCTURES,
  HYDROWORKS_HYDROGARDEN_FOOD_SLOT_BONUS,
  retortResourceClassForTarget,
  retortResourceClassForTile,
  type ResourceType,
  type RetortTargetResource,
  type SlotResource,
  type SlotStructureType,
  type StructureSlotRequirement
} from "@border-empires/shared";
import { mintworksGoldProductionMultiplier, playerHasAbilityTech } from "@border-empires/game-domain";
import { townGrowthActionForUpgrade } from "./client-tile-action-town-growth.js";
import { structureToggleMenuEntries } from "../client-observatory-toggle/client-observatory-toggle.js";
import { SKY_DOCK_BOMBARD_RADIUS, OBSERVATORY_VISION_BONUS } from "../client-constants.js";
import { tileSyncDebugEnabled } from "../client-debug/client-debug.js";
import { connectedEnemyRegionKeys } from "../client-connected-region/client-connected-region.js";
import { hasQueuedSettlementForTile } from "../client-development-queue/client-development-queue.js";
import { economicStructureName, MONUMENT_COMPONENT_KEYS } from "../client-map-display.js";
import { economicBuildMsForState, fortBuildMsForState } from "../client-build-speed/client-build-speed.js";
import { structureLabelForRemoval } from "../client-structure-time-labels/client-structure-time-labels.js";
import type { SupportTownStructureKey } from "../client-support-structures/client-support-structures.js";
import {
  MONUMENT_COMPONENT_BUILD_DEFS,
  MONUMENT_COMPONENT_TYPES,
  playerOwnsActiveOrBuildingMonumentPart
} from "../client-tile-action-monument-parts/client-tile-action-monument-parts.js";
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
import { buildShowsOnTile, hasAdjacentSeaEightWay, knownTerrainAt, ownedActiveObservatoryWithinRange, ownedActiveOrBuildingObservatoryCount } from "../client-tile-action-support/client-tile-action-support.js";
import { upkeepSuffixFor } from "../client-structure-upkeep-text/client-structure-upkeep-text.js";
import { readyOwnedObservatoryCooldownRemainingMs } from "../client-observatory-cooldown/client-observatory-cooldown.js";
import { ownObservatoryRange } from "../client-observatory-rules/client-observatory-rules.js";
import { buildMusterActions } from "../client-muster-tile-actions.js";
import { appendMarchCancelAction } from "../client-muster-march-targeting.js";
import { nextFortVariantForTile } from "./client-tile-action-fort-siege-variants.js";
import { siegeCampAction } from "./client-tile-action-siege-camp.js";
import { canBuildPlacementStructure } from "../client-structure-effects/client-structure-effects.js";
import { hasFreeResourceSlotsForRelayBeacon, missingRelayBeaconSlotReason, ownedRelayBeaconCount } from "../client-relay-beacon-food-slot/client-relay-beacon-food-slot.js";
import { buildDurationMsForState, buildManpowerCostForState, buildTimeLabel, relayBeaconBuildTimeLabel } from "../client-relay-beacon-build-time/client-relay-beacon-build-time.js";
import { authoritativeIsInReach } from "../client-reach-authoritative/client-reach-authoritative.js";
import { neutralTileActions, foggedTileActions } from "./client-tile-action-neutral.js";
import { settleActionsForFrontierTile } from "./client-tile-action-settle-visibility.js";
import { afcModuleActionsForTile, buildAfcActionForTile } from "../client-afc-actions.js";
import {
  hasAetherBridgeCapability,
  hasAetherWallCapability,
  hasLocalDevAetherWallOverride,
  hasRevealCapability,
  hasSiphonCapability
} from "./client-tile-action-capabilities.js";

export { hasAetherBridgeCapability, hasAetherWallCapability, hasLocalDevAetherWallOverride, hasRevealCapability, hasSiphonCapability } from "./client-tile-action-capabilities.js";
export { hasOwnedLandWithinClientRange } from "../client-owned-land-range.js";

type BuildableStructureId = BuildableStructureType;
type AbilityCooldownId = keyof ClientState["abilityCooldowns"];
type AetherWallLength = 1 | 2 | 3;

// Resource slots: the real
// build-time affordability gate for FOOD/TITANIUM/CRYSTAL/UMBRITE now that Step 5
// item 4 Slice A retired their build-time stockpile spend server-side
// (hasFreeResourceSlots, runtime-structure-command-handlers.ts). Mirrors
// that gate exactly, including the in-place-upgrade netting
// (currentTileFieldSlotRequirements) and the synthesizer skip (a
// synthesizer PROVIDES a slot, never consumes one, §6.4).
const freeResourceSlotCount = (state: ClientState, resource: SlotResource): number =>
  (state.resourceSlots?.supply[resource] ?? 0) - (state.resourceSlots?.demand[resource] ?? 0);

const additionalResourceSlotRequirements = (
  state: ClientState,
  type: SlotStructureType,
  currentType?: SlotStructureType
): StructureSlotRequirement[] => {
  if (SYNTHESIZER_STRUCTURE_TYPES.includes(type as (typeof SYNTHESIZER_STRUCTURE_TYPES)[number])) return [];
  const newRequirements =
    type === "OBSERVATORY"
      ? [{ resource: "CRYSTAL" as const, count: observatoryCrystalSlotCostForOwnedCount(ownedActiveOrBuildingObservatoryCount(state)) }]
      : structureSlotRequirements(type);
  if (!currentType) return newRequirements;
  const currentByResource = new Map(structureSlotRequirements(currentType).map((r) => [r.resource, r.count]));
  return newRequirements
    .map((r) => ({ resource: r.resource, count: r.count - (currentByResource.get(r.resource) ?? 0) }))
    .filter((r) => r.count > 0);
};

export const hasFreeResourceSlots = (state: ClientState, type: SlotStructureType, currentType?: SlotStructureType): boolean =>
  additionalResourceSlotRequirements(state, type, currentType).every((r) => freeResourceSlotCount(state, r.resource) >= r.count);

// First unmet requirement's reason text, or undefined when all are met.
// Names the actual count still required, not just the resource -- a
// requirement of 2+ slots (e.g. SIEGE_TOWER needs 2 free UMBRITE, DREAD_TOWER
// needs 3) previously always read as "Need a free UMBRITE slot" regardless of
// how many were missing, so freeing exactly one slot left the message
// unchanged and looked like a stuck/buggy button instead of "still short one
// more".
export const missingResourceSlotReason = (state: ClientState, type: SlotStructureType, currentType?: SlotStructureType): string | undefined => {
  const missing = additionalResourceSlotRequirements(state, type, currentType).find((r) => freeResourceSlotCount(state, r.resource) < r.count);
  if (!missing) return undefined;
  if (missing.count === 1) return `Need a free ${missing.resource} slot`;
  const free = Math.max(0, freeResourceSlotCount(state, missing.resource));
  return `Need ${missing.count} free ${missing.resource} slots (have ${free})`;
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

export const hasRetortRecastingCapability = (state: ClientState): boolean => playerHasAbilityTech(state.techIds, "retort_recast");

export const hasTerrainShapingCapability = (state: ClientState): boolean => state.techIds.includes("terrain-engineering");


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

// fortActionFromTier/siegeActionFromTier and their build/upgrade lookups
// live in client-tile-action-fort-siege-variants.ts (extracted to keep this
// oversized file from growing).

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

export const chainedBuildAvailabilityFromModule = (
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
  const manpowerCost = buildManpowerCostForState(state, structureType);
  // The siege ladder never needs SETTLED (see runtime-structure-command-
  // handlers.ts's OUTPOST-kind skip) -- it builds straight onto FRONTIER
  // ground, so it never pays the settle-then-build combined cost below,
  // even on a FRONTIER tile.
  if (tile.ownershipState === "FRONTIER" && !structureSkipsSettledRequirement(structureType)) {
    const totalGold = SETTLE_COST + goldCost;
    const totalManpower = SETTLE_MANPOWER_COST + manpowerCost;
    return [
      eligibleIgnoringAffordability && state.gold >= totalGold && state.manpower >= totalManpower,
      !eligibleIgnoringAffordability
        ? ineligibleReason
        : state.gold < totalGold
          ? `Need ${totalGold} coin`
          : state.manpower < totalManpower
            ? `Need ${totalManpower} manpower`
            : "",
      `${totalGold > 0 ? `${totalGold} coin, ` : ""}${totalManpower} m.p. • garrison + build • ${buildTimeLabel(settleDurationMsForState(state, tile) + buildDurationMsForState(state, structureType))} total`
    ];
  }
  return [
    eligibleIgnoringAffordability && (goldCost <= 0 || state.gold >= goldCost) && state.manpower >= manpowerCost,
    !eligibleIgnoringAffordability
      ? ineligibleReason
      : goldCost > 0 && state.gold < goldCost
        ? `Need ${goldCost} coin`
        : state.manpower < manpowerCost
          ? `Need ${manpowerCost} manpower`
          : "",
    settledCostText
  ];
};

const frontierBuildDetailSuffix = (tile: Tile): string =>
  tile.ownershipState === "FRONTIER" ? " • garrisons this tile first" : "";

// Also appends "Cancel March" on an own March-To order's destination tile (client-muster-march-targets.ts).
export const menuActionsForSingleTile = (state: ClientState, tile: Tile, deps: TileActionLogicDeps): TileActionDef[] =>
  appendMarchCancelAction(menuActionsForSingleTileInner(state, tile, deps), state, tile);

const menuActionsForSingleTileInner = (state: ClientState, tile: Tile, deps: TileActionLogicDeps): TileActionDef[] => {
  if (tile.fogged) return foggedTileActions(state, tile, deps);
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
              ? "Blocked by Aether Tower field"
              : !inObsRange
                ? "Need active Aether Tower in range"
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
    const blockedBySite = Boolean(tile.town || tile.dockId || tile.fort || tile.siegeBattery || tile.observatory || tile.economicStructure);
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
            ? "Blocked by Aether Tower field"
            : !inObsRange
              ? "Need active Aether Tower in range"
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
    const currentClass = retortResourceClassForTile(tile.resource as ResourceType | undefined);
    if (!currentClass) return [];
    const inObservatoryRange = ownedActiveObservatoryWithinRange(state, tile);
    const observatoryProtection = deps.hostileObservatoryProtectingTile(tile);
    const blockedBySite = Boolean(tile.town || tile.dockId || tile.fort || tile.siegeBattery || tile.observatory || tile.economicStructure);
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
      ? "Requires Matterwright Retort Module"
      : !inObservatoryRange
        ? "Must be within Aether Tower range"
      : observatoryProtection
        ? "Blocked by Aether Tower field"
        : blockedBySite
          ? "Town, dock, or structure blocks recasting"
          : cooldown > 0
            ? `Cooldown ${deps.formatCooldownShort(cooldown)}`
            : "";
    const targets: Array<{ id: TileActionDef["id"]; label: string; targetResource: RetortTargetResource; summary: string }> = [
      { id: "retort_recast_food", label: "Recast to Food", targetResource: "FARM", summary: "retune this tile into food" },
      { id: "retort_recast_titanium", label: "Recast to Titanium", targetResource: "TITANIUM", summary: "retune this tile into titanium" },
      { id: "retort_recast_crystal", label: "Recast to Crystal", targetResource: "GEMS", summary: "retune this tile into crystal" },
      { id: "retort_recast_umbrite", label: "Recast to Umbrite", targetResource: "UMBRITE", summary: "retune this tile into umbrite" }
    ];
    return targets
      .filter((target) => retortResourceClassForTarget(target.targetResource) !== currentClass)
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
    out.push(...afcModuleActionsForTile(state, tile, tileActionAvailability));
    const now = Date.now();
    const obsInRange = ownedActiveObservatoryWithinRange(state, tile);
    const obsCooldownMs = readyOwnedObservatoryCooldownRemainingMs(state.tiles.values(), state.me, tile, now, ownObservatoryRange(state));
    const observatoryProtection = deps.hostileObservatoryProtectingTile(tile);
    const isOwnOrAllyTile = Boolean(tile.ownerId && tile.ownerId === state.me) || deps.isTileOwnedByAlly(tile);
    const isUnclaimed = !tile.ownerId;
    const targetHasPurgeableOwnership = tile.ownershipState === "SETTLED" || tile.ownershipState === "FRONTIER";
    const economicStructureType = tile.economicStructure?.type;
    const isMonumentType =
      economicStructureType === "IMPERIAL_EXCHANGE" ||
      economicStructureType === "SOVEREIGN_SIEGE_ENGINE" ||
      economicStructureType === "AEGIS_DOME" ||
      economicStructureType === "ASTRAL_DOCK";
    const isMonumentPartType = Boolean(economicStructureType && MONUMENT_COMPONENT_KEYS.has(economicStructureType));

    // Aether Purge (wire command remains AETHER_LANCE for compatibility).
    if (state.techIds.includes("crystal-lattices")) {
      const lanceCooldown = Math.max(obsCooldownMs, deps.abilityCooldownRemainingMs("aether_lance"));
      const reason =
        !obsInRange
          ? "Need active Aether Tower in range"
          : isOwnOrAllyTile
            ? "Cannot purge your own or allied tiles"
            : isUnclaimed || !targetHasPurgeableOwnership
              ? "Target enemy garrisoned or frontier land"
              : observatoryProtection
                ? "Blocked by Aether Tower field"
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
          ? "Need active Aether Tower in range"
          : isOwnOrAllyTile
            ? "Cannot EMP your own or allied tiles"
            : isUnclaimed
              ? "Cannot EMP unclaimed land"
              : !isMonumentType &&
                !isMonumentPartType &&
                economicStructureType !== "AMBARIC_TRANSFORMER" &&
                economicStructureType !== "SKY_DOCK" &&
                economicStructureType !== "RESONANCE_GRID"
                ? "Target a powered structure or monument"
                : observatoryProtection
                  ? "Blocked by Aether Tower field"
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
          ? "Need active Aether Tower in range"
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
      const hasSeaNeighbor = hasAdjacentSeaEightWay(tile.x, tile.y, knownTerrainAt(state, deps.keyFor, deps.wrapX, deps.wrapY, deps.terrainAt));
      const reason =
        !obsInRange
          ? "Need active Aether Tower in range"
          : tile.terrain !== "LAND" || !hasSeaNeighbor
            ? "Target must be coastal land"
            : tile.ownerId && tile.ownerId !== state.me && observatoryProtection
              ? "Landing blocked by enemy Aether Tower"
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
    return neutralTileActions(state, tile, deps, { retortRecastActions, crystalCoreActions, createMountainAction });
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
    const hasBlockingStructure = Boolean(tile.siegeBattery || tile.observatory || tile.economicStructure);
    const buildAfcAction = buildAfcActionForTile(state, tile, tileActionAvailability);
    if (buildAfcAction) out.push(buildAfcAction);
    const supportedTowns = deps.supportedOwnedTownsForTile(tile);
    const supportedTown = supportedTowns[0];
    const supportedDocks = deps.supportedOwnedDocksForTile(tile);
    const townBuildSource =
      tile.town && tile.town.populationTier !== "SETTLEMENT" && tile.ownershipState === "SETTLED" ? tile : supportedTown;
    const supportPlacementBlocked = Boolean(hasBlockingStructure && townBuildSource && townBuildSource !== tile);
    // Fixed-border reach: EXPAND itself is no longer reach-gated, but SETTLE
    // and outpost-family builds (siege batteries/relay beacon, which skip the
    // SETTLED requirement server-side) still are -- see runtime-structure-
    // command-handlers.ts. On a FRONTIER tile outside reach, show these
    // actions disabled with the reason instead of hiding them.
    const frontierOutOfReach = tile.ownershipState === "FRONTIER" && !authoritativeIsInReach(state, deps.keyFor)(tile.x, tile.y);
    const withReachGate = ([eligible, reason, cost]: [boolean, string, string]): [boolean, string, string] =>
      frontierOutOfReach ? [false, "Outside your reach", cost] : [eligible, reason, cost];
    if (tile.observatory?.ownerId === state.me && tile.observatory.status === "active") {
      const cooldown = deps.abilityCooldownRemainingMs("survey_sweep");
      out.push({
        id: "survey_sweep",
        label: "Survey Sweep",
        ...tileActionAvailability(
          playerHasAbilityTech(state.techIds, "survey_sweep") && cooldown <= 0,
          !playerHasAbilityTech(state.techIds, "survey_sweep")
            ? "Requires Echo-Reader Crew"
            : cooldown > 0
              ? `Cooldown ${deps.formatCooldownShort(cooldown)}`
              : "",
          "Free • pings hidden resources + towns in a 50x50 area • 12m cooldown"
        )
      });
    }
    const economicStructure = tile.economicStructure;
    if (economicStructure?.type === "IMPERIAL_EXCHANGE" && economicStructure.ownerId === state.me) {
      // §15/§17: free, single chosen target via crystal-targeting (like Sovereign Siege Engine Strike), 24hr cooldown.
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
          "Free • pick a rival, take 100% of their coin • 24h cooldown"
        )
      });
    }
    if (economicStructure?.type === "SOVEREIGN_SIEGE_ENGINE" && economicStructure.ownerId === state.me) {
      const cooldown = deps.abilityCooldownRemainingMs("sovereign_siege_engine_strike");
      const isPowered = economicStructure.powered !== false;
      out.push({
        id: "sovereign_siege_engine_strike",
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
                  ? "Need 1,000 coin"
                  : "",
          "1,000 coin • shatter one enemy land tile into mountain • 10m cooldown"
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
    if (economicStructure?.type === "SKY_DOCK" && economicStructure.ownerId === state.me) {
      const isPowered = economicStructure.powered !== false;
      const bombardCooldownUntil = economicStructure.bombardCooldownUntil ?? 0;
      const bombardOnCooldown = bombardCooldownUntil > Date.now();
      out.push({
        id: "sky_dock_bombard",
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
    // ── Own-tile feature actions: add new own-tile actions here ──
    out.push(...buildMusterActions(tile, state));
    // ─────────────────────────────────────────────────────────────
    if (tile.economicStructure || tile.observatory) {
      out.push(
        ...structureToggleMenuEntries(tile, {
          buildDetailTextForAction: deps.buildDetailTextForAction,
          formatCooldownShort: deps.formatCooldownShort,
          tileActionAvailability
        })
      );
    }
    if (tile.economicStructure?.type === "UMBRITE_WORKS") {
      out.push({
        id: "upgrade_umbrite_works" as TileActionDef["id"],
        label: "Upgrade Umbrite Works",
        detail: deps.buildDetailTextForAction("upgrade_umbrite_works", tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          state.techIds.includes("advanced-synthetication") &&
            state.gold >= deps.structureGoldCost("HIGH_YIELD_UMBRITE_WORKS") &&
            state.manpower >= structureBuildManpowerCost("HIGH_YIELD_UMBRITE_WORKS"),
          !state.techIds.includes("advanced-synthetication")
            ? "Requires Advanced Synthetication"
            : state.gold < deps.structureGoldCost("HIGH_YIELD_UMBRITE_WORKS")
              ? `Need ${deps.structureGoldCost("HIGH_YIELD_UMBRITE_WORKS")} coin`
              : `Need ${structureBuildManpowerCost("HIGH_YIELD_UMBRITE_WORKS")} manpower`,
          `${deps.structureCostText("HIGH_YIELD_UMBRITE_WORKS")} • ${buildTimeLabel(economicBuildMsForState(state, "HIGH_YIELD_UMBRITE_WORKS"))}${upkeepSuffixFor("HIGH_YIELD_UMBRITE_WORKS")}`,
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
            state.gold >= deps.structureGoldCost("HIGH_YIELD_TITANIUM_WORKS") &&
            state.manpower >= structureBuildManpowerCost("HIGH_YIELD_TITANIUM_WORKS"),
          !state.techIds.includes("advanced-synthetication")
            ? "Requires Advanced Synthetication"
            : state.gold < deps.structureGoldCost("HIGH_YIELD_TITANIUM_WORKS")
              ? `Need ${deps.structureGoldCost("HIGH_YIELD_TITANIUM_WORKS")} coin`
              : `Need ${structureBuildManpowerCost("HIGH_YIELD_TITANIUM_WORKS")} manpower`,
          `${deps.structureCostText("HIGH_YIELD_TITANIUM_WORKS")} • ${buildTimeLabel(economicBuildMsForState(state, "HIGH_YIELD_TITANIUM_WORKS"))}${upkeepSuffixFor("HIGH_YIELD_TITANIUM_WORKS")}`,
          slots,
          deps
        )
      });
    }
    if (tile.economicStructure?.type === "AETHER_CONDENSER") {
      out.push({
        id: "upgrade_aether_condenser" as TileActionDef["id"],
        label: "Upgrade Crystal Synth",
        detail: deps.buildDetailTextForAction("upgrade_aether_condenser", tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          state.techIds.includes("advanced-synthetication") &&
            state.gold >= deps.structureGoldCost("HIGH_YIELD_AETHER_CONDENSER") &&
            state.manpower >= structureBuildManpowerCost("HIGH_YIELD_AETHER_CONDENSER"),
          !state.techIds.includes("advanced-synthetication")
            ? "Requires Advanced Synthetication"
            : state.gold < deps.structureGoldCost("HIGH_YIELD_AETHER_CONDENSER")
              ? `Need ${deps.structureGoldCost("HIGH_YIELD_AETHER_CONDENSER")} coin`
              : `Need ${structureBuildManpowerCost("HIGH_YIELD_AETHER_CONDENSER")} manpower`,
          `${deps.structureCostText("HIGH_YIELD_AETHER_CONDENSER")} • ${buildTimeLabel(economicBuildMsForState(state, "HIGH_YIELD_AETHER_CONDENSER"))}${upkeepSuffixFor("HIGH_YIELD_AETHER_CONDENSER")}`,
          slots,
          deps
        )
      });
    }
    const removableStructure = structureLabelForRemoval(tile);
    const structureBusyRemoving =
      tile.fort?.status === "removing" ||
      tile.observatory?.status === "removing" ||
      tile.siegeBattery?.status === "removing" ||
      tile.economicStructure?.status === "removing";
    const structureBusyConstructing =
      tile.fort?.status === "under_construction" ||
      tile.observatory?.status === "under_construction" ||
      tile.siegeBattery?.status === "under_construction" ||
      tile.economicStructure?.status === "under_construction";
    if (removableStructure && !structureBusyConstructing && !structureBusyRemoving) {
      out.push({
        id: "remove_structure",
        label: `Remove ${removableStructure.label}`,
        detail: deps.buildDetailTextForAction("remove_structure", tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          tile.ownershipState === "SETTLED",
          "Requires garrisoned owned tile",
          `${buildTimeLabel(removableStructure.durationMs)} • disables structure effects during removal`,
          slots,
          deps
        )
      });
    }
    const townGrowthAction = tile.town?.populationTier && typeof tile.town.population === "number"
      ? townGrowthActionForUpgrade(state, nextTownGrowthUpgrade(tile.town.populationTier, tile.town.population))
      : undefined;
    if (townGrowthAction) out.push(townGrowthAction);
    const hasPalisade = tile.fort?.variant === "PALISADE";
    const hasRelayBeacon = tile.economicStructure?.type === "RELAY_BEACON";
    if (
      buildShowsOnTile("PALISADE", tile, supportedTowns.length, supportedDocks.length) &&
      !tile.fort &&
      !tile.siegeBattery &&
      !tile.observatory &&
      (!tile.economicStructure || hasRelayBeacon || tile.economicStructure?.type === "HARBOR_EXCHANGE") && // Fort/Palisade may also coexist with a Harbor Exchange, same as Relay Beacon.
      // Normally masonry supersedes the Palisade with the full Fort
      // upgrade below, but if a fresh Fort can't actually be built right now
      // (no free TITANIUM slot) keep Palisade visible as the fallback rather
      // than hiding both options.
      (!state.techIds.includes("masonry") || !hasFreeResourceSlots(state, "FORT"))
    ) {
      out.push({
        id: "build_palisade" as TileActionDef["id"],
        label: "Build Palisade",
        detail: deps.buildDetailTextForAction("build_palisade", tile) + frontierBuildDetailSuffix(tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          ...chainedBuildAvailability(
            "PALISADE",
            hasFreeResourceSlots(state, "PALISADE"),
            missingResourceSlotReason(state, "PALISADE") ?? "Unavailable",
            `${deps.structureCostText("PALISADE")} • ${buildTimeLabel(fortBuildMsForState(state, "PALISADE"))} • def x${PALISADE_DEFENSE_MULT.toFixed(2)}${upkeepSuffixFor("PALISADE")}`
          ),
          slots,
          deps
        )
      });
    }
    if (
      tile.ownerId === state.me &&
      !tile.siegeBattery &&
      !tile.observatory &&
      (tile.fort || !tile.economicStructure || hasRelayBeacon || tile.economicStructure?.type === "HARBOR_EXCHANGE")
    ) {
      const fortVariant = nextFortVariantForTile(state, tile);
      if (fortVariant) {
        const hasTech = tile.fort && !hasPalisade ? true : state.techIds.includes("masonry"); // a Palisade upgrade still needs masonry
        const canUseTile = Boolean(tile.fort) || !tile.economicStructure || hasRelayBeacon || tile.economicStructure?.type === "HARBOR_EXCHANGE";
        const hasFreeSlots = hasFreeResourceSlots(state, fortVariant.variant, tile.fort?.variant);
        out.push({
          id: "build_fortification",
          label: tile.fort ? `Upgrade to ${fortVariant.label}` : `Build ${fortVariant.label}`,
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
              `${fortVariant.summary} • ${buildTimeLabel(fortBuildMsForState(state, fortVariant.variant))} • def x${fortVariant.defenseMult.toFixed(2)}${fortVariant.upkeepSuffix}`,
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
        label: "Build Aether Tower",
        detail: deps.buildDetailTextForAction("build_observatory", tile) + frontierBuildDetailSuffix(tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          ...chainedBuildAvailability(
            "OBSERVATORY",
            hasTech && hasFreeSlots && !tile.siegeBattery && !tile.economicStructure,
            !hasTech
              ? "Requires Aether Resonance Core"
              : tile.siegeBattery || tile.economicStructure
                ? "Tile already has structure"
                : missingResourceSlotReason(state, "OBSERVATORY") ?? "Unavailable",
            `${deps.structureCostText("OBSERVATORY")} • ${buildTimeLabel(structureBuildDurationMs("OBSERVATORY"))} • +${OBSERVATORY_VISION_BONUS} vision${upkeepSuffixFor("OBSERVATORY", ownedActiveOrBuildingObservatoryCount(state))}`
          ),
          slots,
          deps
        )
      });
    }
    if (!tile.economicStructure) {
      const imperialExchangeBuilt = [...state.tiles.values()].some((candidate) => candidate.economicStructure?.type === "IMPERIAL_EXCHANGE");
      const sovereignSiegeEngineBuilt = [...state.tiles.values()].some((candidate) => candidate.economicStructure?.type === "SOVEREIGN_SIEGE_ENGINE");
      const aegisDomeBuilt = [...state.tiles.values()].some((candidate) => candidate.economicStructure?.type === "AEGIS_DOME");
      const astralDockBuilt = [...state.tiles.values()].some((candidate) => candidate.economicStructure?.type === "ASTRAL_DOCK");
      const censusDirectorateBuilt = [...state.tiles.values()].some((candidate) => candidate.economicStructure?.type === "CENSUS_DIRECTORATE");
      const titaniumLevyBuilt = [...state.tiles.values()].some((candidate) => candidate.economicStructure?.type === "TITANIUM_LEVY");
      // Each monument's 3 components are uniquely named now (not 3 copies of
      // one Part type) — "owned" is a per-component boolean, and a
      // monument's total is however many of its 3 are true.
      const ownsComponent = (type: string): boolean =>
        [...state.tiles.values()].some((candidate) => candidate.economicStructure?.ownerId === state.me && candidate.economicStructure?.status === "active" && candidate.economicStructure?.type === type);
      const imperialExchangeComponentsOwned = ["IMPERIAL_EXCHANGE_PART_1", "IMPERIAL_EXCHANGE_PART_2", "IMPERIAL_EXCHANGE_PART_3"].map(ownsComponent);
      const sovereignSiegeEngineComponentsOwned = ["SOVEREIGN_SIEGE_ENGINE_PART_1", "SOVEREIGN_SIEGE_ENGINE_PART_2", "SOVEREIGN_SIEGE_ENGINE_PART_3"].map(ownsComponent);
      const aegisDomeComponentsOwned = ["AEGIS_DOME_PART_1", "AEGIS_DOME_PART_2", "AEGIS_DOME_PART_3"].map(ownsComponent);
      const astralDockComponentsOwned = ["ASTRAL_DOCK_PART_1", "ASTRAL_DOCK_PART_2", "ASTRAL_DOCK_PART_3"].map(ownsComponent);
      const censusDirectorateComponentsOwned = ["CENSUS_DIRECTORATE_PART_1", "CENSUS_DIRECTORATE_PART_2", "CENSUS_DIRECTORATE_PART_3"].map(ownsComponent);
      const titaniumLevyComponentsOwned = ["TITANIUM_LEVY_PART_1", "TITANIUM_LEVY_PART_2", "TITANIUM_LEVY_PART_3"].map(ownsComponent);
      const imperialExchangePartCount = imperialExchangeComponentsOwned.filter(Boolean).length;
      const sovereignSiegeEnginePartCount = sovereignSiegeEngineComponentsOwned.filter(Boolean).length;
      const aegisDomePartCount = aegisDomeComponentsOwned.filter(Boolean).length;
      const astralDockPartCount = astralDockComponentsOwned.filter(Boolean).length;
      const censusDirectoratePartCount = censusDirectorateComponentsOwned.filter(Boolean).length;
      const titaniumLevyPartCount = titaniumLevyComponentsOwned.filter(Boolean).length;
      if (buildShowsOnTile("SKY_DOCK", tile, supportedTowns.length, supportedDocks.length)) {
        out.push({
          id: "build_sky_dock",
          label: "Build Sky Dock",
          detail: deps.buildDetailTextForAction("build_sky_dock", tile) + frontierBuildDetailSuffix(tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            ...chainedBuildAvailability(
              "SKY_DOCK",
              state.techIds.includes("aeronautics") && hasFreeResourceSlots(state, "SKY_DOCK") && !tile.siegeBattery && !tile.observatory,
              !state.techIds.includes("aeronautics")
                ? "Requires Sky Docks"
                : tile.siegeBattery || tile.observatory
                  ? "Tile already has structure"
                  : missingResourceSlotReason(state, "SKY_DOCK") ?? "Unavailable",
              `${deps.structureCostText("SKY_DOCK")} • ${buildTimeLabel(economicBuildMsForState(state, "SKY_DOCK"))} • ${SKY_DOCK_BOMBARD_RADIUS}-tile bombard range • 200 crystal + 5k coin/shot • 20m cooldown${upkeepSuffixFor("SKY_DOCK")}`
            ),
            slots,
            deps
          )
        });
      }
      if (buildShowsOnTile("AMBARIC_TRANSFORMER", tile, supportedTowns.length, supportedDocks.length)) {
        out.push({
          id: "build_ambaric_transformer",
          label: "Build Ambaric Transformer",
          detail: deps.buildDetailTextForAction("build_ambaric_transformer", tile) + frontierBuildDetailSuffix(tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            ...chainedBuildAvailability(
              "AMBARIC_TRANSFORMER",
              state.techIds.includes("plastics") && hasFreeResourceSlots(state, "AMBARIC_TRANSFORMER") && !tile.siegeBattery && !tile.observatory,
              !state.techIds.includes("plastics")
                ? "Requires Ambaric Transformers"
                : tile.siegeBattery || tile.observatory
                  ? "Tile already has structure"
                  : missingResourceSlotReason(state, "AMBARIC_TRANSFORMER") ?? "Unavailable",
              `${deps.structureCostText("AMBARIC_TRANSFORMER")} • ${buildTimeLabel(economicBuildMsForState(state, "AMBARIC_TRANSFORMER"))} • powers nearby late structures${upkeepSuffixFor("AMBARIC_TRANSFORMER")}`
            ),
            slots,
            deps
          )
        });
      }
      if (buildShowsOnTile("RESONANCE_GRID", tile, supportedTowns.length, supportedDocks.length)) {
        out.push({
          id: "build_resonance_grid",
          label: "Build Resonance Grid",
          detail: deps.buildDetailTextForAction("build_resonance_grid", tile) + frontierBuildDetailSuffix(tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            ...chainedBuildAvailability(
              "RESONANCE_GRID",
              state.techIds.includes("radar") && hasFreeResourceSlots(state, "RESONANCE_GRID") && !tile.siegeBattery && !tile.observatory,
              !state.techIds.includes("radar")
                ? "Requires Resonance Grid"
                : tile.siegeBattery || tile.observatory
                  ? "Tile already has structure"
                  : missingResourceSlotReason(state, "RESONANCE_GRID") ?? "Unavailable",
              `${deps.structureCostText("RESONANCE_GRID")} • ${buildTimeLabel(economicBuildMsForState(state, "RESONANCE_GRID"))} • blocks bombardment within 30 tiles${upkeepSuffixFor("RESONANCE_GRID")}`
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
                !tile.siegeBattery &&
                !tile.observatory &&
                (state.strategicResources.SHARD ?? 0) >= 2 &&
                hasFreeResourceSlots(state, "IMPERIAL_EXCHANGE"),
              !state.techIds.includes("urban-mintworks")
                ? "Requires Imperial Exchange"
                : imperialExchangeBuilt
                  ? "Imperial Exchange already built"
                  : imperialExchangePartCount < 3
                    ? "Build 3 Imperial Exchange parts first"
                    : tile.siegeBattery || tile.observatory
                      ? "Tile already has structure"
                      : (state.strategicResources.SHARD ?? 0) < 2
                        ? "Need 2 SHARD"
                        : missingResourceSlotReason(state, "IMPERIAL_EXCHANGE") ?? "Unavailable",
              `${deps.structureCostText("IMPERIAL_EXCHANGE")} • ${buildTimeLabel(economicBuildMsForState(state, "IMPERIAL_EXCHANGE"))} • build 3 parts first${upkeepSuffixFor("IMPERIAL_EXCHANGE")}`,
              0
            ),
            slots,
            deps
          )
        });
      }
      if (buildShowsOnTile("SOVEREIGN_SIEGE_ENGINE", tile, supportedTowns.length, supportedDocks.length)) {
        out.push({
          id: "build_sovereign_siege_engine",
          label: "Build Sovereign Siege Engine",
          detail: deps.buildDetailTextForAction("build_sovereign_siege_engine", tile) + frontierBuildDetailSuffix(tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            ...chainedBuildAvailability(
              "SOVEREIGN_SIEGE_ENGINE",
              state.techIds.includes("world-engine") &&
                sovereignSiegeEnginePartCount >= 3 &&
                !sovereignSiegeEngineBuilt &&
                !tile.siegeBattery &&
                !tile.observatory &&
                (state.strategicResources.SHARD ?? 0) >= 2 &&
                hasFreeResourceSlots(state, "SOVEREIGN_SIEGE_ENGINE"),
              !state.techIds.includes("world-engine")
                ? "Requires Sovereign Siege Engine"
                : sovereignSiegeEngineBuilt
                  ? "Sovereign Siege Engine already built"
                  : sovereignSiegeEnginePartCount < 3
                    ? "Build 3 Sovereign Siege Engine parts first"
                    : tile.siegeBattery || tile.observatory
                      ? "Tile already has structure"
                      : (state.strategicResources.SHARD ?? 0) < 2
                        ? "Need 2 SHARD"
                        : missingResourceSlotReason(state, "SOVEREIGN_SIEGE_ENGINE") ?? "Unavailable",
              `${deps.structureCostText("SOVEREIGN_SIEGE_ENGINE")} • ${buildTimeLabel(economicBuildMsForState(state, "SOVEREIGN_SIEGE_ENGINE"))} • build 3 parts first${upkeepSuffixFor("SOVEREIGN_SIEGE_ENGINE")}`,
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
                !tile.siegeBattery &&
                !tile.observatory &&
                (state.strategicResources.SHARD ?? 0) >= 2 &&
                hasFreeResourceSlots(state, "AEGIS_DOME"),
              !state.techIds.includes("aegis-dome")
                ? "Requires Aegis Dome"
                : aegisDomeBuilt
                  ? "Aegis Dome already built"
                  : aegisDomePartCount < 3
                    ? "Build 3 Aegis Dome parts first"
                    : tile.siegeBattery || tile.observatory
                      ? "Tile already has structure"
                      : (state.strategicResources.SHARD ?? 0) < 2
                        ? "Need 2 SHARD"
                        : missingResourceSlotReason(state, "AEGIS_DOME") ?? "Unavailable",
              `${deps.structureCostText("AEGIS_DOME")} • ${buildTimeLabel(economicBuildMsForState(state, "AEGIS_DOME"))} • build 3 parts first${upkeepSuffixFor("AEGIS_DOME")}`,
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
                !tile.siegeBattery &&
                !tile.observatory &&
                (state.strategicResources.SHARD ?? 0) >= 2 &&
                hasFreeResourceSlots(state, "ASTRAL_DOCK"),
              !state.techIds.includes("astral-dock")
                ? "Requires Astral Dock"
                : astralDockBuilt
                  ? "Astral Dock already built"
                  : astralDockPartCount < 3
                    ? "Build 3 Astral Dock parts first"
                    : tile.siegeBattery || tile.observatory
                      ? "Tile already has structure"
                      : (state.strategicResources.SHARD ?? 0) < 2
                        ? "Need 2 SHARD"
                        : missingResourceSlotReason(state, "ASTRAL_DOCK") ?? "Unavailable",
              `${deps.structureCostText("ASTRAL_DOCK")} • ${buildTimeLabel(economicBuildMsForState(state, "ASTRAL_DOCK"))} • build 3 parts first${upkeepSuffixFor("ASTRAL_DOCK")}`,
              0
            ),
            slots,
            deps
          )
        });
      }
      if (buildShowsOnTile("CENSUS_DIRECTORATE", tile, supportedTowns.length, supportedDocks.length)) {
        out.push({
          id: "build_census_directorate",
          label: "Build Census Directorate",
          detail: deps.buildDetailTextForAction("build_census_directorate", tile) + frontierBuildDetailSuffix(tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            ...chainedBuildAvailability(
              "CENSUS_DIRECTORATE",
              state.techIds.includes("demographic-registry") &&
                censusDirectoratePartCount >= 3 &&
                !censusDirectorateBuilt &&
                !tile.siegeBattery &&
                !tile.observatory &&
                (state.strategicResources.SHARD ?? 0) >= 2 &&
                hasFreeResourceSlots(state, "CENSUS_DIRECTORATE"),
              !state.techIds.includes("demographic-registry")
                ? "Requires Demographic Registry"
                : censusDirectorateBuilt
                  ? "Census Directorate already built"
                  : censusDirectoratePartCount < 3
                    ? "Build 3 Census Directorate parts first"
                    : tile.siegeBattery || tile.observatory
                      ? "Tile already has structure"
                      : (state.strategicResources.SHARD ?? 0) < 2
                        ? "Need 2 SHARD"
                        : missingResourceSlotReason(state, "CENSUS_DIRECTORATE") ?? "Unavailable",
              `${deps.structureCostText("CENSUS_DIRECTORATE")} • ${buildTimeLabel(economicBuildMsForState(state, "CENSUS_DIRECTORATE"))} • build 3 parts first${upkeepSuffixFor("CENSUS_DIRECTORATE")}`,
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
                !tile.siegeBattery &&
                !tile.observatory &&
                (state.strategicResources.SHARD ?? 0) >= 2 &&
                hasFreeResourceSlots(state, "TITANIUM_LEVY"),
              !state.techIds.includes("grand-levy-doctrine")
                ? "Requires Grand Levy Doctrine"
                : titaniumLevyBuilt
                  ? "The Titanium Levy already built"
                  : titaniumLevyPartCount < 3
                    ? "Build 3 Titanium Levy parts first"
                    : tile.siegeBattery || tile.observatory
                      ? "Tile already has structure"
                      : (state.strategicResources.SHARD ?? 0) < 2
                        ? "Need 2 SHARD"
                        : missingResourceSlotReason(state, "TITANIUM_LEVY") ?? "Unavailable",
              `${deps.structureCostText("TITANIUM_LEVY")} • ${buildTimeLabel(economicBuildMsForState(state, "TITANIUM_LEVY"))} • build 3 parts first${upkeepSuffixFor("TITANIUM_LEVY")}`,
              0
            ),
            slots,
            deps
          )
        });
      }
      if (buildShowsOnTile("MINISTRY_HALL", tile, supportedTowns.length, supportedDocks.length)) {
        out.push({
          id: "build_ministry_hall",
          label: "Build Ministry Hall",
          detail: deps.buildDetailTextForAction("build_ministry_hall", tile) + frontierBuildDetailSuffix(tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            ...chainedBuildAvailability(
              "MINISTRY_HALL",
              state.techIds.includes("civil-service") && hasFreeResourceSlots(state, "MINISTRY_HALL") && !tile.siegeBattery && !tile.observatory,
              !state.techIds.includes("civil-service")
                ? "Requires Bureaucratic Reform"
                : tile.siegeBattery || tile.observatory
                  ? "Tile already has structure"
                  : missingResourceSlotReason(state, "MINISTRY_HALL") ?? "Unavailable",
              `${deps.structureCostText("MINISTRY_HALL")} • ${buildTimeLabel(economicBuildMsForState(state, "MINISTRY_HALL"))} • reduces local town FOOD-slot demand${upkeepSuffixFor("MINISTRY_HALL")}`
            ),
            slots,
            deps
          )
        });
      }
      if (buildShowsOnTile("ORE_REFINERY", tile, supportedTowns.length, supportedDocks.length)) {
        const oreRefineryAvail = canBuildPlacementStructure("ORE_REFINERY", tile, state.me, state.gold, state.techIds, state.resourceSlots);
        const oreRefineryHasManpower = state.manpower >= structureBuildManpowerCost("ORE_REFINERY");
        out.push({
          id: "build_ore_refinery",
          label: "Build Ore Refinery",
          detail: deps.buildDetailTextForAction("build_ore_refinery", tile) + frontierBuildDetailSuffix(tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            ...chainedBuildAvailability(
              "ORE_REFINERY",
              oreRefineryAvail.available && oreRefineryHasManpower,
              !oreRefineryAvail.available
                ? oreRefineryAvail.reason
                : !oreRefineryHasManpower
                  ? `Need ${structureBuildManpowerCost("ORE_REFINERY")} manpower`
                  : missingResourceSlotReason(state, "ORE_REFINERY") ?? "Unavailable",
              `${deps.structureCostText("ORE_REFINERY")} • ${buildTimeLabel(economicBuildMsForState(state, "ORE_REFINERY"))} • doubles active Mine slot output within 5 tiles${upkeepSuffixFor("ORE_REFINERY")}`
            ),
            slots,
            deps
          )
        });
      }
      if (buildShowsOnTile("HYDROWORKS", tile, supportedTowns.length, supportedDocks.length)) {
        const hydroworksAvail = canBuildPlacementStructure("HYDROWORKS", tile, state.me, state.gold, state.techIds, state.resourceSlots);
        const hydroworksHasManpower = state.manpower >= structureBuildManpowerCost("HYDROWORKS");
        out.push({
          id: "build_hydroworks",
          label: "Build Hydroworks",
          detail: deps.buildDetailTextForAction("build_hydroworks", tile) + frontierBuildDetailSuffix(tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            ...chainedBuildAvailability(
              "HYDROWORKS",
              hydroworksAvail.available && hydroworksHasManpower,
              !hydroworksAvail.available
                ? hydroworksAvail.reason
                : !hydroworksHasManpower
                  ? `Need ${structureBuildManpowerCost("HYDROWORKS")} manpower`
                  : missingResourceSlotReason(state, "HYDROWORKS") ?? "Unavailable",
              `${deps.structureCostText("HYDROWORKS")} • ${buildTimeLabel(economicBuildMsForState(state, "HYDROWORKS"))} • every Hydrogarden within 10 tiles gains +${HYDROWORKS_HYDROGARDEN_FOOD_SLOT_BONUS} FOOD slots${upkeepSuffixFor("HYDROWORKS")}`
            ),
            slots,
            deps
          )
        });
      }
      if (buildShowsOnTile("ANCILLARY_DEPOT", tile, supportedTowns.length, supportedDocks.length)) {
        out.push({
          id: "build_ancillary_depot",
          label: "Build Ancillary Depot",
          detail: deps.buildDetailTextForAction("build_ancillary_depot", tile) + frontierBuildDetailSuffix(tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            ...chainedBuildAvailability(
              "ANCILLARY_DEPOT",
              state.techIds.includes("organized-supply") && hasFreeResourceSlots(state, "ANCILLARY_DEPOT") && !tile.siegeBattery && !tile.observatory,
              !state.techIds.includes("organized-supply")
                ? "Requires Reserve Custody Cadre"
                : tile.siegeBattery || tile.observatory
                  ? "Tile already has structure"
                  : missingResourceSlotReason(state, "ANCILLARY_DEPOT") ?? "Unavailable",
              `${deps.structureCostText("ANCILLARY_DEPOT")} • ${buildTimeLabel(economicBuildMsForState(state, "ANCILLARY_DEPOT"))} • +150 manpower cap plus +10% of this town's terrain-adjusted base capacity • +35% instead when covered by a Reserve Lattice network${upkeepSuffixFor("ANCILLARY_DEPOT")}`
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
              state.techIds.includes("masonry") && hasFreeResourceSlots(state, "TITANIUM_WEAPONS_FACTORY") && !tile.siegeBattery && !tile.observatory,
              !state.techIds.includes("masonry")
                ? "Requires Titanium-Clad Masonry"
                : tile.siegeBattery || tile.observatory
                  ? "Tile already has structure"
                  : missingResourceSlotReason(state, "TITANIUM_WEAPONS_FACTORY") ?? "Unavailable",
              `${deps.structureCostText("TITANIUM_WEAPONS_FACTORY")} (rises with each one you own) • ${buildTimeLabel(economicBuildMsForState(state, "TITANIUM_WEAPONS_FACTORY"))} • Arsenal District concentration amplifies all factories assigned to this town • +1.5% attack / +3% defense per copy${upkeepSuffixFor("TITANIUM_WEAPONS_FACTORY")}`
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
              state.techIds.includes("leatherworking") && hasFreeResourceSlots(state, "UMBRITE_WEAPONS_FACTORY") && !tile.siegeBattery && !tile.observatory,
              !state.techIds.includes("leatherworking")
                ? "Requires Rigging Works"
                : tile.siegeBattery || tile.observatory
                  ? "Tile already has structure"
                  : missingResourceSlotReason(state, "UMBRITE_WEAPONS_FACTORY") ?? "Unavailable",
              `${deps.structureCostText("UMBRITE_WEAPONS_FACTORY")} (rises with each one you own) • ${buildTimeLabel(economicBuildMsForState(state, "UMBRITE_WEAPONS_FACTORY"))} • Arsenal District concentration amplifies all factories assigned to this town • +3% attack / +1.5% defense per copy${upkeepSuffixFor("UMBRITE_WEAPONS_FACTORY")}`
            ),
            slots,
            deps
          )
        });
      }
    }
    // A Fort and a Relay Beacon are allowed to share a tile, so no !tile.fort guard here.
    if (
      buildShowsOnTile("RELAY_BEACON", tile, supportedTowns.length, supportedDocks.length) &&
      !tile.siegeBattery &&
      !tile.observatory &&
      !tile.economicStructure
    ) {
      out.push({
        id: "build_relay_beacon" as TileActionDef["id"],
        label: "Build Relay Beacon",
        detail: deps.buildDetailTextForAction("build_relay_beacon", tile) + frontierBuildDetailSuffix(tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          ...withReachGate(chainedBuildAvailability(
            "RELAY_BEACON",
            hasFreeResourceSlotsForRelayBeacon(state),
            missingRelayBeaconSlotReason(state) ?? "Unavailable",
            `${deps.structureCostText("RELAY_BEACON")} • ${relayBeaconBuildTimeLabel(state)}${upkeepSuffixFor("RELAY_BEACON", ownedRelayBeaconCount(state))}`
          )),
          slots,
          deps
        )
      });
    }
    const siegeCamp = siegeCampAction(state, tile, deps, slots, hasRelayBeacon);
    if (siegeCamp) out.push(siegeCamp);
    if (tile.resource === "FARM") {
      out.push({
        id: "build_hydrogarden",
        label: "Build Hydrogarden",
        detail: deps.buildDetailTextForAction("build_hydrogarden", tile) + frontierBuildDetailSuffix(tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          ...chainedBuildAvailability(
            "HYDROGARDEN",
            !hasBlockingStructure && state.techIds.includes("agriculture") && hasFreeResourceSlots(state, "HYDROGARDEN"),
            hasBlockingStructure
              ? "Tile already has structure"
              : !state.techIds.includes("agriculture")
                ? "Requires Agrarian Works"
                : missingResourceSlotReason(state, "HYDROGARDEN") ?? "Unavailable",
            `${deps.structureCostText("HYDROGARDEN")} • ${buildTimeLabel(economicBuildMsForState(state, "HYDROGARDEN"))} • +${TILE_SLOT_BOOST_STRUCTURES.HYDROGARDEN} FOOD slot${upkeepSuffixFor("HYDROGARDEN")}`
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
            `${deps.structureCostText("UMBRITE_RIG")} • ${buildTimeLabel(economicBuildMsForState(state, "UMBRITE_RIG"))} • +1 UMBRITE slot${upkeepSuffixFor("UMBRITE_RIG")}`
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
            `${deps.structureCostText("MINE")} • ${buildTimeLabel(economicBuildMsForState(state, "MINE"))} • +1 ${matchingNeed} slot${upkeepSuffixFor("MINE")}`
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
      const townHasIncubationEngine = Boolean(townBuildSource.town?.hasIncubationEngine) || deps.townHasSupportStructure(townBuildSource, "INCUBATION_ENGINE");
      const townHasCensusHall = deps.townHasSupportStructure(townBuildSource, "CENSUS_HALL");
      const townHasClearingHouse = deps.townHasSupportStructure(townBuildSource, "CLEARING_HOUSE");
      const townHasTradeNexus = deps.townHasSupportStructure(townBuildSource, "TRADE_NEXUS");
      const townHasUmbriteSynth = deps.townHasSupportStructure(townBuildSource, "UMBRITE_WORKS");
      const townHasTitaniumWorks = deps.townHasSupportStructure(townBuildSource, "TITANIUM_WORKS");
      const townHasNeuralWorks = deps.townHasSupportStructure(townBuildSource, "NEURAL_WORKS");
      // One monument component (of any of the 18 unique types, from any of
      // the 6 monuments) per Great City/Monumental City — unified into one
      // check now that each is its own distinct structure type rather than
      // 6 hand-listed "identical Part" types.
      const townHasAnyMonumentPart = MONUMENT_COMPONENT_TYPES.some((type) => deps.townHasSupportStructure(townBuildSource, type));
      const townHasReserveLattice = deps.townHasSupportStructure(townBuildSource, "RESERVE_LATTICE");
      const townHasAncillaryFactory = deps.townHasSupportStructure(townBuildSource, "ANCILLARY_FACTORY");
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
            `${deps.structureCostText("MINTWORKS")} • ${buildTimeLabel(economicBuildMsForState(state, "MINTWORKS"))} • +${Math.round((mintworksGoldProductionMultiplier(1, Boolean(townBuildSource.town?.clearingHouseActive)) - 1) * 100)}% town coin production (stacks)${upkeepSuffixFor("MINTWORKS")}`
          ),
          slots,
          deps
        )
      });
      out.push({
        id: "build_incubation_engine",
        label: `Build ${economicStructureName("INCUBATION_ENGINE")}`,
        detail: deps.buildDetailTextForAction("build_incubation_engine", tile, townBuildSource) + frontierBuildDetailSuffix(tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          ...chainedBuildAvailability(
            "INCUBATION_ENGINE",
            !supportPlacementBlocked && !townHasIncubationEngine && state.techIds.includes("pottery") && hasFreeResourceSlots(state, "INCUBATION_ENGINE"),
            supportPlacementBlocked
              ? "Tile already has structure"
              : townHasIncubationEngine
                ? `Nearby town already has an ${economicStructureName("INCUBATION_ENGINE")}`
                : !state.techIds.includes("pottery")
                  ? "Requires Kiln Craft"
                  : missingResourceSlotReason(state, "INCUBATION_ENGINE") ?? "Unavailable",
            `${deps.structureCostText("INCUBATION_ENGINE")} • ${buildTimeLabel(economicBuildMsForState(state, "INCUBATION_ENGINE"))} • +10,000 population burst on completion (one-time)${upkeepSuffixFor("INCUBATION_ENGINE")}`
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
            `${deps.structureCostText("CENSUS_HALL")} • ${buildTimeLabel(economicBuildMsForState(state, "CENSUS_HALL"))} • +25% town growth${upkeepSuffixFor("CENSUS_HALL")}`
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
            `${deps.structureCostText("CLEARING_HOUSE")} • ${buildTimeLabel(economicBuildMsForState(state, "CLEARING_HOUSE"))} • connected Mintworks coin bonus: +${Math.round((mintworksGoldProductionMultiplier(1, false) - 1) * 100)}% → +${Math.round((mintworksGoldProductionMultiplier(1, true) - 1) * 100)}% per copy${upkeepSuffixFor("CLEARING_HOUSE")}`
          ),
          slots,
          deps
        )
      });
      out.push({
        id: "build_trade_nexus",
        label: "Build Trade Nexus",
        detail: deps.buildDetailTextForAction("build_trade_nexus", tile, townBuildSource) + frontierBuildDetailSuffix(tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          ...chainedBuildAvailability(
            "TRADE_NEXUS",
            !supportPlacementBlocked && !townHasTradeNexus && state.techIds.includes("ledger-keeping") && hasFreeResourceSlots(state, "TRADE_NEXUS"),
            supportPlacementBlocked
              ? "Tile already has structure"
              : townHasTradeNexus
                ? "Nearby town already has Trade Nexus"
                : !state.techIds.includes("ledger-keeping")
                  ? "Requires Double-Entry Ledgers"
                  : missingResourceSlotReason(state, "TRADE_NEXUS") ?? "Unavailable",
            `${deps.structureCostText("TRADE_NEXUS")} • ${buildTimeLabel(economicBuildMsForState(state, "TRADE_NEXUS"))} • +25% connected-town bonus${upkeepSuffixFor("TRADE_NEXUS")}`
          ),
          slots,
          deps
        )
      });
      out.push({
        id: "build_umbrite_works",
        label: "Build Umbrite Works",
        detail: deps.buildDetailTextForAction("build_umbrite_works", tile, townBuildSource) + frontierBuildDetailSuffix(tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          ...chainedBuildAvailability(
            "UMBRITE_WORKS",
            !supportPlacementBlocked && !townHasUmbriteSynth && state.techIds.includes("workshops"),
            supportPlacementBlocked
              ? "Tile already has structure"
              : townHasUmbriteSynth
                ? "Nearby town already has Umbrite Works"
                : !state.techIds.includes("workshops")
                  ? "Requires Artisan Workshops"
                  : "Unavailable",
            `${deps.structureCostText("UMBRITE_WORKS")} • ${buildTimeLabel(economicBuildMsForState(state, "UMBRITE_WORKS"))}${upkeepSuffixFor("UMBRITE_WORKS")}`
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
            `${deps.structureCostText("TITANIUM_WORKS")} • ${buildTimeLabel(economicBuildMsForState(state, "TITANIUM_WORKS"))}${upkeepSuffixFor("TITANIUM_WORKS")}`
          ),
          slots,
          deps
        )
      });
      out.push({
        id: "build_aether_condenser",
        label: "Build Aether Condenser",
        detail: deps.buildDetailTextForAction("build_aether_condenser", tile, townBuildSource) + frontierBuildDetailSuffix(tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          ...chainedBuildAvailability(
            "AETHER_CONDENSER",
            // Unlike the town-support types above, Aether Condensers stack
            // server-side (STACKING_TOWN_SUPPORT_STRUCTURE_TYPES) -- no
            // townHasCrystalSynth gate here, or Build falsely disables.
            !supportPlacementBlocked && state.techIds.includes("crystal-lattices"),
            supportPlacementBlocked
              ? "Tile already has structure"
              : !state.techIds.includes("crystal-lattices")
                ? "Requires Aether Resonance Core"
                : "Unavailable",
            `${deps.structureCostText("AETHER_CONDENSER")} • ${buildTimeLabel(economicBuildMsForState(state, "AETHER_CONDENSER"))}${upkeepSuffixFor("AETHER_CONDENSER")}`
          ),
          slots,
          deps
        )
      });
      out.push({
        id: "build_neural_works",
        label: "Build Neural Works",
        detail: deps.buildDetailTextForAction("build_neural_works", tile, townBuildSource) + frontierBuildDetailSuffix(tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          ...chainedBuildAvailability(
            "NEURAL_WORKS",
            !supportPlacementBlocked &&
              !townHasNeuralWorks &&
              state.techIds.includes("global-trade-networks") &&
              hasFreeResourceSlots(state, "NEURAL_WORKS"),
            supportPlacementBlocked
              ? "Tile already has structure"
              : townHasNeuralWorks
                ? "Nearby town already has Neural Works"
                : !state.techIds.includes("global-trade-networks")
                  ? "Requires Neural Assembly Core"
                  : (missingResourceSlotReason(state, "NEURAL_WORKS") ?? "Unavailable"),
            `${deps.structureCostText("NEURAL_WORKS")} • ${buildTimeLabel(economicBuildMsForState(state, "NEURAL_WORKS"))} • amplifies every Ancillary Depot in this connected-town network (+300 manpower cap, +0.1 manpower/min each) • boosts outpost muster within 50 tiles • one per connected-town network${upkeepSuffixFor("NEURAL_WORKS")}`
          ),
          slots,
          deps
        )
      });
      // Monument-component build defs and the per-player "already built this
      // part" ownership check live in client-tile-action-monument-parts.ts
      // (500-line file budget, AGENTS.md).
      for (const def of MONUMENT_COMPONENT_BUILD_DEFS) {
        const alreadyOwnsThisPart = playerOwnsActiveOrBuildingMonumentPart(state, def.structureType);
        out.push({
          id: def.actionId,
          label: def.actionLabel,
          detail: deps.buildDetailTextForAction(def.actionId, tile, townBuildSource) + frontierBuildDetailSuffix(tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            ...chainedBuildAvailability(
              def.structureType,
              !supportPlacementBlocked &&
                !alreadyOwnsThisPart &&
                !townHasAnyMonumentPart &&
                isGreatCity &&
                state.techIds.includes(def.techId) &&
                hasFreeResourceSlots(state, def.structureType),
              supportPlacementBlocked
                ? "Tile already has structure"
                : alreadyOwnsThisPart
                  ? "Part already built in nearby town"
                  : townHasAnyMonumentPart
                    ? "Nearby great city already hosts a monument component"
                    : !isGreatCity
                      ? "Requires Great City or Monumental City"
                      : !state.techIds.includes(def.techId)
                        ? `Requires ${def.techLabel}`
                        : (missingResourceSlotReason(state, def.structureType) ?? "Unavailable"),
              `${deps.structureCostText(def.structureType)} • ${buildTimeLabel(economicBuildMsForState(state, def.structureType))} • 1 of 3 unique components for the ${def.monumentLabel}${upkeepSuffixFor(def.structureType)}`
            ),
            slots,
            deps
          )
        });
      }
      out.push({
        id: "build_reserve_lattice",
        label: "Build Reserve Lattice",
        detail: deps.buildDetailTextForAction("build_reserve_lattice", tile, townBuildSource) + frontierBuildDetailSuffix(tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          ...chainedBuildAvailability(
            "RESERVE_LATTICE",
            !supportPlacementBlocked &&
              !townHasReserveLattice &&
              state.techIds.includes("conveyor-networks") &&
              hasFreeResourceSlots(state, "RESERVE_LATTICE"),
            supportPlacementBlocked
              ? "Tile already has structure"
              : townHasReserveLattice
                ? "Nearby town already has Reserve Lattice"
                : !state.techIds.includes("conveyor-networks")
                  ? "Requires Reserve Lattice Module"
                  : (missingResourceSlotReason(state, "RESERVE_LATTICE") ?? "Unavailable"),
            `${deps.structureCostText("RESERVE_LATTICE")} • ${buildTimeLabel(economicBuildMsForState(state, "RESERVE_LATTICE"))} • changes connected Ancillary Factories to +150 cap and +35% of local terrain-adjusted base capacity • one per connected-town network${upkeepSuffixFor("RESERVE_LATTICE")}`
          ),
          slots,
          deps
        )
      });
      out.push({
        id: "build_ancillary_factory",
        label: "Build Ancillary Factory",
        detail: deps.buildDetailTextForAction("build_ancillary_factory", tile, townBuildSource) + frontierBuildDetailSuffix(tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          ...chainedBuildAvailability(
            "ANCILLARY_FACTORY",
            !supportPlacementBlocked &&
              !townHasAncillaryFactory &&
              state.techIds.includes("remade-concordat") &&
              hasFreeResourceSlots(state, "ANCILLARY_FACTORY"),
            supportPlacementBlocked
              ? "Tile already has structure"
              : townHasAncillaryFactory
                ? "Town already has Ancillary Factory"
                : !state.techIds.includes("remade-concordat")
                  ? "Requires Ancillary Control Core"
                  : (missingResourceSlotReason(state, "ANCILLARY_FACTORY") ?? "Unavailable"),
            `${deps.structureCostText("ANCILLARY_FACTORY")} • ${buildTimeLabel(economicBuildMsForState(state, "ANCILLARY_FACTORY"))} • +0.05 manpower/min empire-wide, +0.1/min if a Neural Works is in this town's connected network${upkeepSuffixFor("ANCILLARY_FACTORY")}`
          ),
          slots,
          deps
        )
      });
    }
    if (tile.dockId) {
      out.push({
        id: "build_harbor_exchange",
        label: "Build Harbor Exchange",
        detail: deps.buildDetailTextForAction("build_harbor_exchange", tile) + frontierBuildDetailSuffix(tile),
        ...tileActionAvailabilityWithDevelopmentSlot(
          ...chainedBuildAvailability(
            "HARBOR_EXCHANGE",
            !hasBlockingStructure &&
              state.techIds.includes("harborcraft") &&
              hasFreeResourceSlots(state, "HARBOR_EXCHANGE"),
            hasBlockingStructure
              ? "Tile already has structure"
              : !state.techIds.includes("harborcraft")
                ? "Requires Harbor Engineering"
                : (missingResourceSlotReason(state, "HARBOR_EXCHANGE") ?? "Unavailable"),
            `${deps.structureCostText("HARBOR_EXCHANGE")} • ${buildTimeLabel(economicBuildMsForState(state, "HARBOR_EXCHANGE"))} • +1440 coin/day per connected dock${upkeepSuffixFor("HARBOR_EXCHANGE")}`
          ),
          slots,
          deps
        )
      });
    }
    // Settle Land / Settle Connected are pushed last (bottom of the actions list) and hidden
    // until the player has an established economy -- see client-tile-action-settle-visibility.ts.
    out.push(...settleActionsForFrontierTile(state, tile, deps, slots, queuedSettlement));
    out.push(...retortRecastActions());
    out.push(...crystalCoreActions());
    out.push(createMountainAction());
    if (tile.town?.populationTier !== "SETTLEMENT" && tile.afc?.ownerId !== tile.ownerId) out.push({ id: "abandon_territory", label: "Abandon Territory", detail: deps.buildDetailTextForAction("abandon_territory", tile) });
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
    if (isBarbarianOwner) {
      // Barbarians cannot be truced with — no truce actions for barbarian-owned tiles.
    } else if (activeTruce) {
      out.push({
        id: "break_truce",
        label: "Break Truce",
        ...tileActionAvailability(true, "", "Locks you out of new truces for 24h")
      });
    } else {
      // A player can hold a truce (or pending offer) with each opponent independently —
      // truces/pending offers with other players never block offering one here.
      const pendingTruceReason =
        pendingTruce === "outgoing"
          ? "Truce offer already pending"
          : pendingTruce === "incoming"
            ? "Incoming truce offer pending"
            : undefined;
      const truceOfferAvailable = !pendingTruce;
      const truceOfferBlocker = pendingTruceReason ?? "";
      const pendingCost = pendingTruce ? "Pending" : undefined;
      out.push({
        id: "offer_truce_12h",
        label:
          pendingTruce === "outgoing"
            ? "Truce Offer Pending"
            : pendingTruce === "incoming"
              ? "Respond in Social Panel"
              : "Offer Truce 12h",
        ...tileActionAvailability(truceOfferAvailable, truceOfferBlocker, pendingCost ?? "12h")
      });
      out.push({
        id: "offer_truce_24h",
        label: pendingTruce ? "Truce Already Pending" : "Offer Truce 24h",
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
        revealActive ? "Stop revealing this empire" : !hasCapability ? "Requires Augury Office" : !hasCapacity ? "Reveal capacity full" : "",
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
          ? "Requires Augury Office"
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
          ? "Requires Transposition Array Module"
          : observatoryProtection
            ? "Blocked by Aether Tower field"
            : tile.sabotage
              ? "Already siphoned"
              : !(tile.resource || tile.town)
                ? "Town or resource only"
                : sabotageCooldown > 0
                  ? `Cooldown ${deps.formatCooldownShort(sabotageCooldown)}`
                  : "",
        "Free • drains a 3x3 until you cancel it from your tower • tower locked meanwhile"
      )
    });
  }
  out.push(...retortRecastActions());
  out.push(createMountainAction());
  return out;
};
