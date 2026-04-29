import {
  buildAetherWallSegments,
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
import type { RealtimeSocket } from "./client-socket-types.js";
import type { ClientState } from "./client-state.js";
import type {
  ActiveTruceView,
  CrystalTargetingAbility,
  FeedSeverity,
  FeedType,
  Tile,
  TileActionDef
} from "./client-types.js";
import { ownedActiveObservatoryWithinRange } from "./client-tile-action-support.js";

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

type TileActionLogicDeps = {
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
  hideHoldBuildMenu: () => void;
  selectedTile: () => Tile | undefined;
  renderHud: () => void;
  requireAuthedSession: (message?: string) => boolean;
  ws: RealtimeSocket;
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
      | "FUEL_PLANT"
      | "EXCHANGE_HOUSE"
      | "RAIL_DEPOT"
      | "IMPERIAL_EXCHANGE_PART"
      | "WORLD_ENGINE_PART"
      | "AEGIS_DOME_PART"
      | "ASTRAL_DOCK_PART"
  ) => boolean;
  activeTruceWithPlayer: (playerId?: string | null) => ActiveTruceView | undefined;
  ownerSpawnShieldActive: (ownerId: string) => boolean;
};

export const hasRevealCapability = (state: ClientState): boolean =>
  state.techIds.includes("beacon-towers") || state.activeRevealTargets.length > 0;

export const hasBreakthroughCapability = (_state: ClientState): boolean => false;

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

export const crystalTargetingTitle = (ability: CrystalTargetingAbility): string =>
  ability === "aether_bridge"
    ? "Aether Bridge"
    : ability === "aether_wall"
      ? "Aether Wall"
      : ability === "aether_emp"
        ? "Aether EMP"
        : ability === "world_engine_strike"
          ? "Worldbreaker Shot"
          : "Siphon";

export const crystalTargetingTone = (ability: CrystalTargetingAbility): "amber" | "cyan" | "red" =>
  ability === "aether_bridge" ? "cyan" : ability === "aether_wall" || ability === "aether_emp" ? "amber" : "red";

export const clearCrystalTargeting = (state: ClientState): void => {
  state.crystalTargeting.active = false;
  state.crystalTargeting.validTargets.clear();
  state.crystalTargeting.originByTarget.clear();
  state.aetherWallTargeting.active = false;
  state.aetherWallTargeting.validOrigins.clear();
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

const collectValidAetherWallOrigins = (
  state: ClientState,
  deps: Pick<TileActionLogicDeps, "wrapX" | "wrapY" | "keyFor" | "terrainAt">
): Set<string> => {
  const out = new Set<string>();
  for (const tile of state.tiles.values()) {
    if (validAetherWallDirectionsForTile(state, tile, deps).length > 0) out.add(deps.keyFor(tile.x, tile.y));
  }
  return out;
};

const fortBuildVariantForState = (state: ClientState): {
  label: string;
  gold: number;
  iron: number;
  defenseMult: number;
  summary: string;
} => {
  if (state.techIds.includes("steelworking")) {
    return { label: "Thunder Bastion", gold: 4200, iron: 180, defenseMult: 8, summary: "4200 gold + 180 IRON" };
  }
  if (state.techIds.includes("fortified-walls")) {
    return { label: "Iron Bastion", gold: 1800, iron: 90, defenseMult: 4, summary: "1800 gold + 90 IRON" };
  }
  return { label: "Fort", gold: structureBuildGoldCost("FORT", 0), iron: 45, defenseMult: FORT_DEFENSE_MULT, summary: "900 gold + 45 IRON" };
};

const nextFortVariantForTile = (
  state: ClientState,
  tile: Tile
):
  | {
      label: string;
      gold: number;
      iron: number;
      defenseMult: number;
      summary: string;
    }
  | undefined => {
  if (tile.fort) {
    const current = tile.fort.variant ?? "FORT";
    if (current === "FORT" && state.techIds.includes("fortified-walls")) {
      return { label: "Iron Bastion", gold: 1800, iron: 90, defenseMult: 4, summary: "1800 gold + 90 IRON" };
    }
    if (current === "IRON_BASTION" && state.techIds.includes("steelworking")) {
      return { label: "Thunder Bastion", gold: 4200, iron: 180, defenseMult: 8, summary: "4200 gold + 180 IRON" };
    }
    return undefined;
  }
  return fortBuildVariantForState(state);
};

const siegeBuildVariantForState = (state: ClientState): {
  label: string;
  gold: number;
  supply: number;
  iron: number;
  attackMult: number;
  summary: string;
} => {
  if (state.techIds.includes("standing-army")) {
    return { label: "Dread Tower", gold: 4200, supply: 140, iron: 120, attackMult: 3, summary: "4200 gold + 140 SUPPLY + 120 IRON" };
  }
  if (state.techIds.includes("siegecraft")) {
    return { label: "Siege Tower", gold: 1800, supply: 90, iron: 60, attackMult: 2, summary: "1800 gold + 90 SUPPLY + 60 IRON" };
  }
  return {
    label: "Siege Outpost",
    gold: structureBuildGoldCost("SIEGE_OUTPOST", 0),
    supply: 45,
    iron: 0,
    attackMult: SIEGE_OUTPOST_ATTACK_MULT,
    summary: "900 gold + 45 SUPPLY"
  };
};

const nextSiegeVariantForTile = (
  state: ClientState,
  tile: Tile
):
  | {
      label: string;
      gold: number;
      supply: number;
      iron: number;
      attackMult: number;
      summary: string;
    }
  | undefined => {
  if (tile.siegeOutpost) {
    const current = tile.siegeOutpost.variant ?? "SIEGE_OUTPOST";
    if (current === "SIEGE_OUTPOST" && state.techIds.includes("siegecraft")) {
      return { label: "Siege Tower", gold: 1800, supply: 90, iron: 60, attackMult: 2, summary: "1800 gold + 90 SUPPLY + 60 IRON" };
    }
    if (current === "SIEGE_TOWER" && state.techIds.includes("standing-army")) {
      return { label: "Dread Tower", gold: 4200, supply: 140, iron: 120, attackMult: 3, summary: "4200 gold + 140 SUPPLY + 120 IRON" };
    }
    return undefined;
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

export const computeCrystalTargets = (
  state: ClientState,
  ability: CrystalTargetingAbility,
  deps: Pick<TileActionLogicDeps, "keyFor" | "terrainAt" | "isTileOwnedByAlly" | "hostileObservatoryProtectingTile" | "selectedTile">
): { validTargets: Set<string>; originByTarget: Map<string, string> } => {
  const validTargets = new Set<string>();
  const originByTarget = new Map<string, string>();
  const selected = deps.selectedTile();
  const selectedKey = selected ? deps.keyFor(selected.x, selected.y) : "";
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
    if (ability === "world_engine_strike") {
      if (!selectedKey || selected?.economicStructure?.type !== "WORLD_ENGINE" || selected.economicStructure.ownerId !== state.me) continue;
      if (!tile.ownerId || tile.ownerId === state.me || deps.isTileOwnedByAlly(tile) || tile.dockId) continue;
      if (!(tile.ownershipState === "SETTLED" || tile.town || tile.resource || tile.economicStructure || tile.fort || tile.observatory || tile.siegeOutpost)) continue;
      const targetKey = deps.keyFor(tile.x, tile.y);
      validTargets.add(targetKey);
      originByTarget.set(targetKey, selectedKey);
      continue;
    }
    if (ability === "aether_emp") {
      if (!tile.ownerId || tile.ownerId === state.me || deps.isTileOwnedByAlly(tile)) continue;
      if (deps.hostileObservatoryProtectingTile(tile)) continue;
      if (
        tile.economicStructure &&
        (tile.economicStructure.type === "AETHER_TOWER" ||
          tile.economicStructure.type === "AIRPORT" ||
          tile.economicStructure.type === "RADAR_SYSTEM" ||
          tile.economicStructure.type === "IMPERIAL_EXCHANGE" ||
          tile.economicStructure.type === "WORLD_ENGINE" ||
          tile.economicStructure.type === "AEGIS_DOME" ||
          tile.economicStructure.type === "ASTRAL_DOCK") &&
        tile.economicStructure.status === "active"
      ) {
        validTargets.add(deps.keyFor(tile.x, tile.y));
      }
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
    | "wrapX"
    | "wrapY"
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
    | "wrapX"
    | "wrapY"
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
      deps.pushFeed("Siphon requires Logistics.", "combat", "warn");
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
  if (ability === "world_engine_strike") {
    const cooldown = deps.abilityCooldownRemainingMs("world_engine_strike");
    const current = deps.selectedTile();
    if (!current?.economicStructure || current.economicStructure.ownerId !== state.me || current.economicStructure.type !== "WORLD_ENGINE") {
      deps.pushFeed("Select your Worldbreaker Cannon first.", "combat", "warn");
      return;
    }
    if ((state.strategicResources.CRYSTAL ?? 0) < 400) {
      deps.pushFeed("Worldbreaker Shot needs 400 CRYSTAL.", "combat", "warn");
      return;
    }
    if (cooldown > 0) {
      deps.pushFeed(`Worldbreaker Cannon cooling down for ${deps.formatCooldownShort(cooldown)}.`, "combat", "warn");
      return;
    }
  }
  if (ability === "aether_emp") {
    const cooldown = deps.abilityCooldownRemainingMs("aether_emp");
    if ((state.strategicResources.CRYSTAL ?? 0) < 160) {
      deps.pushFeed("Aether EMP needs 160 CRYSTAL.", "combat", "warn");
      return;
    }
    if (cooldown > 0) {
      deps.pushFeed(`Aether EMP cooling down for ${deps.formatCooldownShort(cooldown)}.`, "combat", "warn");
      return;
    }
  }
  if (ability === "aether_wall") {
    const cooldown = deps.abilityCooldownRemainingMs("aether_wall");
    const localhostOverride = hasLocalDevAetherWallOverride(state);
    if (!hasAetherWallCapability(state)) {
      deps.pushFeed("Aether Wall requires Aether Moorings.", "combat", "warn");
      return;
    }
    if (!localhostOverride && (state.strategicResources.CRYSTAL ?? 0) < 25) {
      deps.pushFeed("Aether Wall needs 25 CRYSTAL.", "combat", "warn");
      return;
    }
    if (!localhostOverride && cooldown > 0) {
      deps.pushFeed(`Aether Wall cooling down for ${deps.formatCooldownShort(cooldown)}.`, "combat", "warn");
      return;
    }
    const validOrigins = collectValidAetherWallOrigins(state, deps);
    if (validOrigins.size === 0) {
      deps.pushFeed(`Aether Wall has no valid ${localhostOverride ? "owned" : "settled border"} origins in view.`, "combat", "warn");
      return;
    }
    state.aetherWallTargeting.active = true;
    state.aetherWallTargeting.validOrigins = validOrigins;
    deps.hideTileActionMenu();
    deps.hideHoldBuildMenu();
    deps.renderHud();
    return;
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
  if (state.crystalTargeting.ability !== "aether_bridge" && state.crystalTargeting.ability !== "world_engine_strike" && deps.hostileObservatoryProtectingTile(tile)) {
    deps.pushFeed("Blocked by observatory field.", "combat", "warn");
    return false;
  }
  if (!deps.requireAuthedSession()) return false;
  const ability = state.crystalTargeting.ability;
  if (ability === "aether_bridge") {
    deps.ws.send(JSON.stringify({ type: "CAST_AETHER_BRIDGE", x: tile.x, y: tile.y }));
  } else if (ability === "aether_emp") {
    deps.ws.send(JSON.stringify({ type: "AETHER_EMP", x: tile.x, y: tile.y }));
  } else if (ability === "world_engine_strike") {
    const originKey = state.crystalTargeting.originByTarget.get(targetKey);
    if (!originKey) return false;
    const [fromX, fromY] = originKey.split(",").map((value) => Number(value));
    deps.ws.send(JSON.stringify({ type: "WORLD_ENGINE_STRIKE", fromX, fromY, toX: tile.x, toY: tile.y }));
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
  type === "ADVANCED_CRYSTAL_SYNTHESIZER" ||
  type === "FUEL_PLANT";

const resourceClassForTile = (resource: Tile["resource"]): "food" | "supply" | "iron" | "crystal" | undefined => {
  if (resource === "FARM" || resource === "FISH") return "food";
  if (resource === "WOOD" || resource === "FUR") return "supply";
  if (resource === "IRON") return "iron";
  if (resource === "GEMS") return "crystal";
  return undefined;
};

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
            ? "Requires Aether Moorings"
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
          ? "Requires Aether Moorings"
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
  const retortRecastActions = (): TileActionDef[] => {
    const currentClass = resourceClassForTile(tile.resource);
    if (!currentClass) return [];
    const inObservatoryRange = ownedActiveObservatoryWithinRange(state, tile);
    const observatoryProtection = deps.hostileObservatoryProtectingTile(tile);
    const blockedBySite = Boolean(tile.town || tile.dockId || tile.fort || tile.siegeOutpost || tile.observatory || tile.economicStructure);
    const cooldown = deps.abilityCooldownRemainingMs("retort_recasting");
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
      ...retortRecastActions(),
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
    out.push(...retortRecastActions());
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
    if (tile.observatory?.ownerId === state.me && tile.observatory.status === "active") {
      const cooldown = deps.abilityCooldownRemainingMs("survey_sweep");
      out.push({
        id: "survey_sweep",
        label: "Survey Sweep",
        ...tileActionAvailability(
          state.techIds.includes("beacon-towers") && cooldown <= 0 && (state.strategicResources.CRYSTAL ?? 0) >= 30,
          !state.techIds.includes("beacon-towers")
            ? "Requires Surveying"
            : cooldown > 0
              ? `Cooldown ${deps.formatCooldownShort(cooldown)}`
              : "Need 30 CRYSTAL",
          "30 CRYSTAL • reveals 50 tiles in each direction for 2m"
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
      !tile.siegeOutpost &&
      !tile.observatory &&
      (tile.fort || !tile.economicStructure || hasWoodenFort)
    ) {
      const fortVariant = nextFortVariantForTile(state, tile);
      if (fortVariant) {
        const hasTech = tile.fort ? true : state.techIds.includes("masonry");
        const canUseTile = Boolean(tile.fort) || !tile.economicStructure || hasWoodenFort;
        const hasGold = state.gold >= fortVariant.gold;
        const hasIron = (state.strategicResources.IRON ?? 0) >= fortVariant.iron;
        out.push({
          id: "build_fortification",
          label: tile.fort || hasWoodenFort ? `Upgrade to ${fortVariant.label}` : `Build ${fortVariant.label}`,
          detail: deps.buildDetailTextForAction("build_fortification", tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            hasTech && hasGold && hasIron && canUseTile,
            !hasTech
              ? "Requires Stoneworks"
              : !canUseTile
                  ? "Tile already has structure"
                  : !hasGold
                    ? `Need ${fortVariant.gold} gold`
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
          `${deps.structureCostText("OBSERVATORY")} • ${Math.round(OBSERVATORY_BUILD_MS / 60000)}m`,
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
            `${deps.structureCostText("AIRPORT")} • ${Math.round(economicStructureBuildMs("AIRPORT") / 60000)}m`,
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
            `${deps.structureCostText("RADAR_SYSTEM")} • ${Math.round(economicStructureBuildMs("RADAR_SYSTEM") / 60000)}m • blocks bombardment within 30 tiles`,
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
      !tile.fort &&
      !tile.observatory &&
      (tile.siegeOutpost || !tile.economicStructure || hasLightOutpost)
    ) {
      const siegeVariant = nextSiegeVariantForTile(state, tile);
      if (siegeVariant) {
        const hasTech = tile.siegeOutpost ? true : state.techIds.includes("leatherworking");
        const canUseTile = Boolean(tile.siegeOutpost) || !tile.economicStructure || hasLightOutpost;
        const hasGold = state.gold >= siegeVariant.gold;
        const hasSupply = (state.strategicResources.SUPPLY ?? 0) >= siegeVariant.supply;
        const hasIron = (state.strategicResources.IRON ?? 0) >= siegeVariant.iron;
        out.push({
          id: "build_siege_camp",
          label: tile.siegeOutpost || hasLightOutpost ? `Upgrade to ${siegeVariant.label}` : `Build ${siegeVariant.label}`,
          detail: deps.buildDetailTextForAction("build_siege_camp", tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            hasTech && hasGold && hasSupply && hasIron && canUseTile,
            !hasTech
              ? "Requires Leatherworking"
              : !canUseTile
                  ? "Tile already has structure"
                  : !hasGold
                    ? `Need ${siegeVariant.gold} gold`
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
            `700 gold + 20 FOOD • ${Math.round(economicStructureBuildMs("FARMSTEAD") / 60000)}m`,
            slots,
            deps
          )
        });
        if (tile.economicStructure?.type === "FARMSTEAD") {
          out.push({
            id: "build_waterworks",
            label: "Upgrade to Waterworks",
            detail: deps.buildDetailTextForAction("build_waterworks", tile),
            ...tileActionAvailabilityWithDevelopmentSlot(
              state.techIds.includes("irrigation") && state.gold >= 600 && (state.strategicResources.FOOD ?? 0) >= 20,
              !state.techIds.includes("irrigation") ? "Requires Irrigation" : state.gold < 600 ? "Need 600 gold" : "Need 20 FOOD",
              `600 gold + 20 FOOD • ${Math.round(economicStructureBuildMs("WATERWORKS") / 60000)}m • +80% food output`,
              slots,
              deps
            )
          });
        }
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
        const townHasCensusHall = deps.townHasSupportStructure(townBuildSource, "CENSUS_HALL");
        const townHasBank = Boolean(townBuildSource.town?.hasBank) || deps.townHasSupportStructure(townBuildSource, "BANK");
        const townHasClearingHouse = deps.townHasSupportStructure(townBuildSource, "CLEARING_HOUSE");
        const townHasCaravanary = deps.townHasSupportStructure(townBuildSource, "CARAVANARY");
        const townHasFurSynth = deps.townHasSupportStructure(townBuildSource, "FUR_SYNTHESIZER");
        const townHasIronworks = deps.townHasSupportStructure(townBuildSource, "IRONWORKS");
        const townHasCrystalSynth = deps.townHasSupportStructure(townBuildSource, "CRYSTAL_SYNTHESIZER");
        const townHasFuelPlant = deps.townHasSupportStructure(townBuildSource, "FUEL_PLANT");
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
            `3200 gold • ${Math.round(economicStructureBuildMs("BANK") / 60000)}m`,
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
          label: "Build Aether Condenser",
          detail: deps.buildDetailTextForAction("build_crystal_synthesizer", tile, townBuildSource),
          ...tileActionAvailabilityWithDevelopmentSlot(
            !supportPlacementBlocked && !townHasCrystalSynth && state.techIds.includes("crystal-lattices") && state.gold >= 2800,
            supportPlacementBlocked ? "Tile already has structure" : townHasCrystalSynth ? "Nearby town already has Aether Condenser" : !state.techIds.includes("crystal-lattices") ? "Requires Crystal Lattices" : "Need 2800 gold",
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
                  ? "Requires Great City or Metropolis"
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
                  ? "Requires Great City or Metropolis"
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
                  ? "Requires Great City or Metropolis"
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
                  ? "Requires Great City or Metropolis"
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
        out.push({ id: "build_census_hall", label: "Build Census Hall", disabled: true, disabledReason: "Support tile touches multiple towns" });
        out.push({ id: "build_bank", label: "Build Bank", disabled: true, disabledReason: "Support tile touches multiple towns" });
        out.push({ id: "build_clearing_house", label: "Build Clearing House", disabled: true, disabledReason: "Support tile touches multiple towns" });
        out.push({ id: "build_caravanary", label: "Build Caravanary", disabled: true, disabledReason: "Support tile touches multiple towns" });
        out.push({ id: "build_fur_synthesizer", label: "Build Fur Synthesizer", disabled: true, disabledReason: "Support tile touches multiple towns" });
        out.push({ id: "build_ironworks", label: "Build Ironworks", disabled: true, disabledReason: "Support tile touches multiple towns" });
        out.push({ id: "build_crystal_synthesizer", label: "Build Aether Condenser", disabled: true, disabledReason: "Support tile touches multiple towns" });
        out.push({ id: "build_fuel_plant", label: "Build Fuel Plant", disabled: true, disabledReason: "Support tile touches multiple towns" });
        out.push({ id: "build_exchange_house", label: "Build Exchange House", disabled: true, disabledReason: "Support tile touches multiple towns" });
        out.push({ id: "build_rail_depot", label: "Build Rail Depot", disabled: true, disabledReason: "Support tile touches multiple towns" });
        out.push({ id: "build_imperial_exchange_part", label: "Build Imperial Exchange Part", disabled: true, disabledReason: "Support tile touches multiple towns" });
        out.push({ id: "build_world_engine_part", label: "Build Worldbreaker Cannon Part", disabled: true, disabledReason: "Support tile touches multiple towns" });
        out.push({ id: "build_aegis_dome_part", label: "Build Aegis Dome Part", disabled: true, disabledReason: "Support tile touches multiple towns" });
        out.push({ id: "build_astral_dock_part", label: "Build Astral Dock Part", disabled: true, disabledReason: "Support tile touches multiple towns" });
      }
      if (tile.dockId) {
        out.push({
          id: "build_customs_house",
          label: "Build Harbor Exchange",
          detail: deps.buildDetailTextForAction("build_customs_house", tile),
          ...tileActionAvailabilityWithDevelopmentSlot(
            !hasBlockingStructure && state.techIds.includes("harborcraft") && state.gold >= 1800 && (state.strategicResources.CRYSTAL ?? 0) >= 60,
            hasBlockingStructure ? "Tile already has structure" : !state.techIds.includes("harborcraft") ? "Requires Aether Moorings" : state.gold < 1800 ? "Need 1800 gold" : "Need 60 CRYSTAL",
            `1800 gold + 60 CRYSTAL • ${Math.round(economicStructureBuildMs("CUSTOMS_HOUSE") / 60000)}m • +1 gold/m per connected dock • 0.5 gold / minute`,
            slots,
            deps
          )
        });
        if (tile.economicStructure?.type === "CUSTOMS_HOUSE") {
          out.push({
            id: "build_lockworks_port",
            label: "Upgrade to Lockworks Port",
            detail: deps.buildDetailTextForAction("build_lockworks_port", tile),
            ...tileActionAvailabilityWithDevelopmentSlot(
              state.techIds.includes("port-infrastructure") && state.gold >= 900 && (state.strategicResources.CRYSTAL ?? 0) >= 30,
              !state.techIds.includes("port-infrastructure") ? "Requires Port Infrastructure" : state.gold < 900 ? "Need 900 gold" : "Need 30 CRYSTAL",
              `900 gold + 30 CRYSTAL • ${Math.round(economicStructureBuildMs("LOCKWORKS_PORT") / 60000)}m • stronger dock income and storage`,
              slots,
              deps
            )
          });
        }
      }
    }
    out.push(...retortRecastActions());
    out.push({
      id: "aether_wall",
      label: "Aether Wall",
      ...tileActionAvailability(
        hasAetherWallCapability(state) &&
          (hasLocalDevAetherWallOverride(state) || (deps.abilityCooldownRemainingMs("aether_wall") <= 0 && (state.strategicResources.CRYSTAL ?? 0) >= 25)),
        !hasAetherWallCapability(state)
          ? "Requires Terrain Engineering"
          : !hasLocalDevAetherWallOverride(state) && deps.abilityCooldownRemainingMs("aether_wall") > 0
            ? `Cooldown ${deps.formatCooldownShort(deps.abilityCooldownRemainingMs("aether_wall"))}`
            : !hasLocalDevAetherWallOverride(state) && (state.strategicResources.CRYSTAL ?? 0) < 25
              ? "Need 25 CRYSTAL"
              : "",
        "25 CRYSTAL • 20m duration • up to 3 borders"
      )
    });
    out.push(createMountainAction());
    if (tile.town?.populationTier !== "SETTLEMENT") out.push({ id: "abandon_territory", label: "Abandon Territory" });
    return out;
  }
  if (deps.isTileOwnedByAlly(tile)) return [];
  if (tile.ownerId === "barbarian") {
    const previewDetail = deps.attackPreviewDetailForTarget(tile);
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
    actions.push(...retortRecastActions());
    actions.push(createMountainAction());
    return actions;
  }
  const reachable = Boolean(deps.pickOriginForTarget(tile.x, tile.y, false)) || Boolean(tile.dockId);
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
  out.push({
    id: "aether_wall",
    label: "Aether Wall",
    ...tileActionAvailability(
      hasAetherWallCapability(state) &&
        (hasLocalDevAetherWallOverride(state) || (deps.abilityCooldownRemainingMs("aether_wall") <= 0 && (state.strategicResources.CRYSTAL ?? 0) >= 25)),
      !hasAetherWallCapability(state)
        ? "Requires Aether Moorings"
        : !hasLocalDevAetherWallOverride(state) && deps.abilityCooldownRemainingMs("aether_wall") > 0
          ? `Cooldown ${deps.formatCooldownShort(deps.abilityCooldownRemainingMs("aether_wall"))}`
          : !hasLocalDevAetherWallOverride(state) && (state.strategicResources.CRYSTAL ?? 0) < 25
            ? "Need 25 CRYSTAL"
            : "",
      "25 CRYSTAL • 20m duration • up to 3 borders"
    )
  });
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
  const economicStructureType = tile.economicStructure?.type;
  const hasTargetableAetherLanceStructure =
    !tile.town &&
    !tile.dockId &&
    (Boolean(tile.fort) ||
      Boolean(tile.observatory) ||
      Boolean(tile.siegeOutpost) ||
      (economicStructureType !== undefined &&
        economicStructureType !== "IMPERIAL_EXCHANGE_PART" &&
        economicStructureType !== "WORLD_ENGINE_PART" &&
        economicStructureType !== "IMPERIAL_EXCHANGE" &&
        economicStructureType !== "WORLD_ENGINE" &&
        economicStructureType !== "AEGIS_DOME_PART" &&
        economicStructureType !== "AEGIS_DOME" &&
        economicStructureType !== "ASTRAL_DOCK_PART" &&
        economicStructureType !== "ASTRAL_DOCK"));
  if (tile.ownerId && tile.ownerId !== state.me && hasTargetableAetherLanceStructure) {
    const lanceCooldown = deps.abilityCooldownRemainingMs("aether_lance");
    out.push({
      id: "aether_lance",
      label: "Aether Lance",
      ...tileActionAvailability(
        state.techIds.includes("signal-fires") &&
          !observatoryProtection &&
          lanceCooldown <= 0 &&
          state.gold >= 3000 &&
          (state.strategicResources.CRYSTAL ?? 0) >= 100,
        !state.techIds.includes("signal-fires")
          ? "Requires Signal Fires"
          : observatoryProtection
            ? "Blocked by observatory field"
            : lanceCooldown > 0
              ? `Cooldown ${deps.formatCooldownShort(lanceCooldown)}`
              : state.gold < 3000
                ? "Need 3000 gold"
                : "Need 100 CRYSTAL",
        "3000 gold + 100 CRYSTAL • destroy one hostile structure"
      )
    });
  }
  const hasTargetableEmpStructure =
    economicStructureType === "AETHER_TOWER" ||
    economicStructureType === "AIRPORT" ||
    economicStructureType === "RADAR_SYSTEM" ||
    economicStructureType === "IMPERIAL_EXCHANGE" ||
    economicStructureType === "WORLD_ENGINE" ||
    economicStructureType === "AEGIS_DOME" ||
    economicStructureType === "ASTRAL_DOCK";
  if (tile.ownerId && tile.ownerId !== state.me && hasTargetableEmpStructure) {
    const empCooldown = deps.abilityCooldownRemainingMs("aether_emp");
    out.push({
      id: "aether_emp",
      label: "Aether EMP",
      ...tileActionAvailability(
        state.techIds.includes("cryptography") &&
          !observatoryProtection &&
          empCooldown <= 0 &&
          (state.strategicResources.CRYSTAL ?? 0) >= 160,
        !state.techIds.includes("cryptography")
          ? "Requires Cipher Bureaus"
          : observatoryProtection
            ? "Blocked by observatory field"
            : empCooldown > 0
              ? `Cooldown ${deps.formatCooldownShort(empCooldown)}`
              : "Need 160 CRYSTAL",
        "160 CRYSTAL • disable one powered enemy structure for 20m"
      )
    });
  }
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
        revealActive ? "Stop revealing this empire" : !hasCapability ? "Requires Beacon Towers" : !hasCapacity ? "Reveal capacity full" : "Need crystal",
        revealActive ? "Cancel current reveal" : "20 CRYSTAL • 0.15 / 10m"
      )
    });
    const revealStatsCooldown = deps.abilityCooldownRemainingMs("reveal_empire_stats");
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
          ? "Requires Logistics"
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
  out.push(...retortRecastActions());
  out.push(createMountainAction());
  return out;
};
