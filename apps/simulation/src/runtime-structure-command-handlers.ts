import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import {
  MUSTER_SYSTEM_ENABLED,
  STRUCTURE_REGISTRY,
  bestFortTierForTech,
  bestSiegeTierForTech,
  nextFortTierForUpgrade,
  nextSiegeTierForUpgrade,
  structureBuildGoldCost,
  structureBuildManpowerCost,
  structureCostDefinition,
  structurePlacementMetadata,
  structureShowsOnTile,
  structureSlotRequirements,
  SYNTHESIZER_STRUCTURE_TYPES,
  type BuildableStructureType,
  type EconomicStructureType,
  type SlotStructureType
} from "@border-empires/shared";
import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import { parseBuildStructurePayload } from "./runtime-command-parsers.js";
import { currentTileFieldSlotRequirements, totalsFromSlotRequirements, type ResourceSlotTotals } from "./resource-slot-view/resource-slot-view.js";
import { simulationTileKey } from "./seed-state/seed-state.js";
import { multiplicativeEffectForPlayer } from "./tech-domain-bridge/tech-domain-bridge.js";
import type { LockRecord, SimulationTileWireDelta, StrategicResourceKey } from "./runtime-types.js";
import { garrisonCapForVariant, initialGarrisonForVariant } from "./runtime-fort-garrison-tick.js";

export type RuntimeStructureCommandContext = {
  players: Map<string, DomainPlayer>;
  tiles: Map<string, DomainTileState>;
  musterTilesByOwner: Map<string, Set<string>>;
  locksByTile: Map<string, LockRecord>;
  locksByCommandId: Map<string, LockRecord>;
  now: () => number;
  emitEvent: (event: SimulationEvent) => void;
  emitPlayerStateUpdate: (command: Pick<CommandEnvelope, "commandId" | "playerId">, playerId?: string) => void;
  scheduleAfter: (delayMs: number, callback: () => void) => void;
  applyManpowerRegen: (player: DomainPlayer) => void;
  playerManpowerCap: (player: DomainPlayer) => number;
  rejectIfNoDevelopmentSlot: (command: CommandEnvelope, code: string, message: string) => boolean;
  strategicResourceAmount: (player: DomainPlayer, resource: StrategicResourceKey) => number;
  spendStrategicResource: (player: DomainPlayer, resource: StrategicResourceKey, amount: number) => boolean;
  ownedStructureCountForPlayer: (playerId: string, type: BuildableStructureType) => number;
  // §5 (resource slots): the player's current global slot supply/demand
  // pool (§5.6 v1 scope). Demand includes the structure this command would
  // replace on the SAME tile field (upgrades overwrite it synchronously —
  // see currentTileFieldSlotRequirements), so hasFreeResourceSlots nets that
  // back out before checking the new structure's requirement fits.
  resourceSlotSupplyForPlayer: (playerId: string) => ResourceSlotTotals;
  resourceSlotDemandForPlayer: (playerId: string) => ResourceSlotTotals;
  supportedTownKeysForTile: (playerId: string, x: number, y: number) => string[];
  supportedDockKeysForTile: (playerId: string, x: number, y: number) => string[];
  economicStructureForSupportedTown: (playerId: string, townKey: string, type: EconomicStructureType) => DomainTileState | undefined;
  firstAvailableTownSupportTile: (playerId: string, townKey: string, type: EconomicStructureType) => DomainTileState | undefined;
  assignedTownKeyForSupportTile: (playerId: string, x: number, y: number) => string | undefined;
  // §4.4 (docs/manpower-economy-rewrite-plan.md): "only one Rail Depot may be
  // built per connected-town network" — true when townKey's own network
  // already has an active Rail Depot, at that town or any town it's connected to.
  railDepotAlreadyInNetwork: (playerId: string, townKey: string) => boolean;
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  completeStructureBuild: (targetKey: string, ownerId: string, structureType: string, commandId: string) => void;
  completeStructureRemoval: (targetKey: string, ownerId: string, commandId: string) => void;
};

type StrategicCost = Partial<Record<StrategicResourceKey, number>>;

function rejectCommand(
  context: RuntimeStructureCommandContext,
  command: CommandEnvelope,
  code: string,
  message: string
): void {
  context.emitEvent({
    eventType: "COMMAND_REJECTED",
    commandId: command.commandId,
    playerId: command.playerId,
    code,
    message
  });
}

function structureLabel(type: string): string {
  return type.toLowerCase().replaceAll("_", " ");
}

function activeOrInactive(structure: { status: string } | undefined): boolean {
  return structure?.status === "active" || structure?.status === "inactive";
}

function resolveTownSupportTarget(
  context: RuntimeStructureCommandContext,
  command: CommandEnvelope,
  target: DomainTileState,
  structureType: BuildableStructureType
): DomainTileState | undefined {
  const placement = structurePlacementMetadata(structureType);
  if (placement.placementMode !== "town_support") return target;
  const economicType = structureType as EconomicStructureType;

  if (target.town) {
    if (target.town.populationTier === "SETTLEMENT") {
      rejectCommand(context, command, "BUILD_INVALID", "settlements cannot support economic structures — grow this town first");
      return undefined;
    }
    const townKey = simulationTileKey(target.x, target.y);
    if (context.economicStructureForSupportedTown(command.playerId, townKey, economicType)) {
      rejectCommand(context, command, "BUILD_INVALID", `town already has ${structureLabel(structureType)}`);
      return undefined;
    }
    if (economicType === "RAIL_DEPOT" && context.railDepotAlreadyInNetwork(command.playerId, townKey)) {
      rejectCommand(context, command, "BUILD_INVALID", "connected town network already has a Rail Depot");
      return undefined;
    }
    const supportTarget = context.firstAvailableTownSupportTile(command.playerId, townKey, economicType);
    if (!supportTarget) {
      rejectCommand(context, command, "BUILD_INVALID", `${structureLabel(structureType)} needs an open support tile next to this town`);
      return undefined;
    }
    return supportTarget;
  }

  const supportedTownKey = context.assignedTownKeyForSupportTile(command.playerId, target.x, target.y);
  if (supportedTownKey && context.economicStructureForSupportedTown(command.playerId, supportedTownKey, economicType)) {
    rejectCommand(context, command, "BUILD_INVALID", `town already has ${structureLabel(structureType)}`);
    return undefined;
  }
  if (economicType === "RAIL_DEPOT" && supportedTownKey && context.railDepotAlreadyInNetwork(command.playerId, supportedTownKey)) {
    rejectCommand(context, command, "BUILD_INVALID", "connected town network already has a Rail Depot");
    return undefined;
  }
  return target;
}

function upgradeBaseType(structureType: BuildableStructureType): string | undefined {
  if (structureType === "ADVANCED_FUR_SYNTHESIZER") return "FUR_SYNTHESIZER";
  if (structureType === "ADVANCED_IRONWORKS") return "IRONWORKS";
  if (structureType === "ADVANCED_CRYSTAL_SYNTHESIZER") return "CRYSTAL_SYNTHESIZER";
  if (structureType === "SEED_GRANARY") return "GRANARY";
  return undefined;
}

// §6.4: "hard-capped at 1, forever" — a player may never own more than one
// synthesizer of a given family (base + Advanced count as the same slot,
// since Advanced replaces base in place). Base+Advanced pairs, keyed either
// way so a lookup on either member finds the whole family.
const SYNTHESIZER_FAMILY: Partial<Record<BuildableStructureType, readonly BuildableStructureType[]>> = {
  FUR_SYNTHESIZER: ["FUR_SYNTHESIZER", "ADVANCED_FUR_SYNTHESIZER"],
  ADVANCED_FUR_SYNTHESIZER: ["FUR_SYNTHESIZER", "ADVANCED_FUR_SYNTHESIZER"],
  IRONWORKS: ["IRONWORKS", "ADVANCED_IRONWORKS"],
  ADVANCED_IRONWORKS: ["IRONWORKS", "ADVANCED_IRONWORKS"],
  CRYSTAL_SYNTHESIZER: ["CRYSTAL_SYNTHESIZER", "ADVANCED_CRYSTAL_SYNTHESIZER"],
  ADVANCED_CRYSTAL_SYNTHESIZER: ["CRYSTAL_SYNTHESIZER", "ADVANCED_CRYSTAL_SYNTHESIZER"]
};

// `upgrading` is true exactly when this build is the in-place Advanced
// upgrade of the synthesizer already standing on THIS tile — that's the one
// case allowed to "already own one." Any other synthesizer build (fresh, or
// on a different tile) is blocked once the player owns any member of the
// same family anywhere, since resourceSlotSupplyForPlayer grants +1 SUPPLY/
// IRON/CRYSTAL per synthesizer with no cap of its own (resource-slot-view.ts).
function synthesizerFamilyAlreadyOwnedElsewhere(
  context: RuntimeStructureCommandContext,
  playerId: string,
  structureType: BuildableStructureType,
  upgrading: boolean
): boolean {
  if (upgrading) return false;
  const family = SYNTHESIZER_FAMILY[structureType];
  if (!family) return false;
  return family.some((member) => context.ownedStructureCountForPlayer(playerId, member) > 0);
}

function strategicCostForStructure(
  structureType: BuildableStructureType,
  registryStrategicCost: StrategicCost | undefined
): StrategicCost | undefined {
  if (registryStrategicCost) return registryStrategicCost;
  const strategicDef = structureCostDefinition(structureType);
  if (!strategicDef?.resourceCost) return undefined;
  return { [strategicDef.resourceCost.resource]: strategicDef.resourceCost.amount };
}

// Step 5 item 3 (Slice A): FOOD/IRON/CRYSTAL/SUPPLY are retired as a
// spendable build-time stockpile -- hasFreeResourceSlots (§5.1) is the real
// gate for those four keys now. SHARD stays a real spend (monument
// assembly, §5.5 -- event-gated, not slot-shaped, never a stockpile in the
// first place). Exported so applyStructureCancelRefund's refund builders
// (runtime-structure-lifecycle-command-handlers.ts) apply the identical
// filter and can never refund a key that build time never actually spent.
const RETIRED_STOCKPILE_RESOURCE_KEYS: ReadonlySet<StrategicResourceKey> = new Set(["FOOD", "IRON", "CRYSTAL", "SUPPLY"]);

export function stripRetiredStockpileCost(cost: StrategicCost | undefined): StrategicCost {
  const filtered: StrategicCost = {};
  if (!cost) return filtered;
  for (const resource of Object.keys(cost) as StrategicResourceKey[]) {
    if (!RETIRED_STOCKPILE_RESOURCE_KEYS.has(resource)) filtered[resource] = cost[resource] ?? 0;
  }
  return filtered;
}

function spendStrategicCost(
  context: RuntimeStructureCommandContext,
  actor: DomainPlayer,
  command: CommandEnvelope,
  structureType: BuildableStructureType,
  cost: StrategicCost | undefined
): boolean {
  if (!cost) return true;
  const orderedKeys = Object.keys(cost).sort() as StrategicResourceKey[];
  for (const resource of orderedKeys) {
    const amount = cost[resource] ?? 0;
    if (amount > 0 && context.strategicResourceAmount(actor, resource) + 1e-6 < amount) {
      rejectCommand(context, command, "BUILD_INVALID", `insufficient ${resource} for ${structureLabel(structureType)}`);
      return false;
    }
  }
  for (const resource of orderedKeys) {
    const amount = cost[resource] ?? 0;
    if (amount > 0) context.spendStrategicResource(actor, resource, amount);
  }
  return true;
}

// §5.1/§5.6: a structure permanently occupies a slot of its required
// resource(s) for as long as it exists — construction just needs a free
// slot at build time, no stockpile spend. `tileField`/`target` let an
// in-place upgrade (Fort/Siege tier ladders, granary Advanced pair) net out
// the requirement it's about to overwrite on its own tile, so it only needs
// *additional* capacity for the delta, not the new tier's full requirement
// stacked on top of the old one it's replacing.
//
// Synthesizers (SYNTHESIZER_STRUCTURE_TYPES) skip this gate entirely: per
// §6.4 they're a slot *source*, not a consumer (resource-slot-view.ts) — a
// landlocked player with zero free slots of that resource must still be
// able to build the one synthesizer that grants them their first one.
function hasFreeResourceSlots(
  context: RuntimeStructureCommandContext,
  command: CommandEnvelope,
  structureType: BuildableStructureType,
  slotStructureType: SlotStructureType,
  target: DomainTileState,
  tileField: "fort" | "observatory" | "siegeOutpost" | "economicStructure"
): boolean {
  if (SYNTHESIZER_STRUCTURE_TYPES.includes(structureType)) return true;
  const requirements = structureSlotRequirements(slotStructureType);
  if (requirements.length === 0) return true;
  const supply = context.resourceSlotSupplyForPlayer(command.playerId);
  const demand = context.resourceSlotDemandForPlayer(command.playerId);
  const alreadyOnThisTile = totalsFromSlotRequirements(currentTileFieldSlotRequirements(target, tileField, command.playerId));
  for (const req of requirements) {
    const freeExcludingThisTile = supply[req.resource] - demand[req.resource] + alreadyOnThisTile[req.resource];
    if (freeExcludingThisTile < req.count) {
      rejectCommand(context, command, "INSUFFICIENT_SLOT", `no free ${req.resource} slot for ${structureLabel(structureType)}`);
      return false;
    }
  }
  return true;
}

export function handleBuildStructureCommand(context: RuntimeStructureCommandContext, command: CommandEnvelope): void {
  const actor = context.players.get(command.playerId);
  const payload = parseBuildStructurePayload(command.payloadJson);
  if (!actor || !payload) {
    rejectCommand(context, command, "BAD_COMMAND", "invalid command payload");
    return;
  }
  const structureType = payload.structureType as BuildableStructureType;
  const spec = STRUCTURE_REGISTRY[structureType];
  if (!spec) {
    rejectCommand(context, command, "UNKNOWN_STRUCTURE", `unknown structure type: ${payload.structureType}`);
    return;
  }
  context.applyManpowerRegen(actor);

  let target = context.tiles.get(simulationTileKey(payload.x, payload.y));
  if (!target) {
    rejectCommand(context, command, "UNKNOWN_TILE", "tile not found");
    return;
  }
  for (const techId of spec.techIds) {
    if (!actor.techIds.has(techId)) {
      rejectCommand(context, command, "BUILD_INVALID", `unlock ${structureLabel(structureType)} first`);
      return;
    }
  }

  if (spec.kind === "ECONOMIC") {
    const supportTarget = resolveTownSupportTarget(context, command, target, structureType);
    if (!supportTarget) return;
    target = supportTarget;
  }

  if (target.terrain !== "LAND") {
    rejectCommand(context, command, "BUILD_INVALID", "structure requires land tile");
    return;
  }
  const targetKey = simulationTileKey(target.x, target.y);
  if (!structureShowsOnTile(structureType, {
    ownershipState: target.ownershipState,
    resource: target.resource,
    dockId: target.dockId,
    townPopulationTier: target.town?.populationTier,
    supportedTownCount: context.supportedTownKeysForTile(command.playerId, target.x, target.y).length,
    supportedDockCount: context.supportedDockKeysForTile(command.playerId, target.x, target.y).length
  })) {
    rejectCommand(context, command, "BUILD_INVALID", `${structureLabel(structureType)} cannot be built on this tile`);
    return;
  }
  if (target.ownerId !== command.playerId) {
    rejectCommand(context, command, "BUILD_INVALID", "tile must be owned");
    return;
  }
  if ((spec.kind !== "OUTPOST" || structureType === "LIGHT_OUTPOST") && target.ownershipState !== "SETTLED") {
    rejectCommand(context, command, "BUILD_INVALID", "tile must be settled");
    return;
  }

  const hasTech = (id: string) => actor.techIds.has(id);
  let upgrading = false;
  if (spec.kind === "FORT") {
    upgrading = target.economicStructure?.ownerId === command.playerId &&
      target.economicStructure.type === "WOODEN_FORT" &&
      activeOrInactive(target.economicStructure);
  } else if (spec.kind === "OUTPOST" && structureType !== "LIGHT_OUTPOST") {
    upgrading = target.economicStructure?.ownerId === command.playerId &&
      target.economicStructure.type === "LIGHT_OUTPOST" &&
      activeOrInactive(target.economicStructure);
  } else if (spec.kind === "ECONOMIC") {
    const base = upgradeBaseType(structureType);
    upgrading = !!base &&
      target.economicStructure?.ownerId === command.playerId &&
      target.economicStructure.type === base &&
      activeOrInactive(target.economicStructure);
  }

  const sameFamilyUpgrade = (spec.kind === "FORT" && target.fort?.ownerId === command.playerId) ||
    (spec.kind === "OUTPOST" && structureType !== "LIGHT_OUTPOST" && target.siegeOutpost?.ownerId === command.playerId);
  if (!upgrading && !sameFamilyUpgrade && (target.observatory || target.siegeOutpost || target.economicStructure || (target.fort && spec.kind !== "ECONOMIC"))) {
    rejectCommand(context, command, "BUILD_INVALID", "tile already has structure");
    return;
  }
  if (synthesizerFamilyAlreadyOwnedElsewhere(context, command.playerId, structureType, upgrading)) {
    rejectCommand(context, command, "BUILD_INVALID", `already own a ${structureLabel(upgradeBaseType(structureType) ?? structureType)} — only one allowed per empire`);
    return;
  }

  if (spec.kind === "FORT" && target.fort && !nextFortTierForUpgrade(target.fort.variant, hasTech)) {
    rejectCommand(context, command, "BUILD_INVALID", target.fort.variant === "THUNDER_BASTION" ? "fort already at maximum tier" : "research the next tier first");
    return;
  }
  if (spec.kind === "OUTPOST" && structureType !== "LIGHT_OUTPOST" && target.siegeOutpost && !nextSiegeTierForUpgrade(target.siegeOutpost.variant, hasTech)) {
    rejectCommand(context, command, "BUILD_INVALID", target.siegeOutpost.variant === "DREAD_TOWER" ? "siege outpost already at maximum tier" : "research the next tier first");
    return;
  }
  if (context.rejectIfNoDevelopmentSlot(command, "BUILD_INVALID", "development slots are busy")) return;

  let goldCost: number;
  let manpowerCost: number;
  let strategicCost = spec.cost.strategic as StrategicCost | undefined;
  let slotStructureType: SlotStructureType = structureType;
  if (spec.kind === "FORT") {
    const fortTier = target.fort ? nextFortTierForUpgrade(target.fort.variant, hasTech)! : bestFortTierForTech(hasTech);
    goldCost = Math.max(0, Math.round(fortTier.gold * multiplicativeEffectForPlayer(actor, "fortBuildGoldCostMult")));
    manpowerCost = fortTier.manpower;
    strategicCost = { IRON: fortTier.iron };
    slotStructureType = fortTier.variant;
  } else if (spec.kind === "OUTPOST" && structureType !== "LIGHT_OUTPOST") {
    const siegeTier = target.siegeOutpost ? nextSiegeTierForUpgrade(target.siegeOutpost.variant, hasTech)! : bestSiegeTierForTech(hasTech);
    goldCost = siegeTier.gold;
    manpowerCost = siegeTier.manpower;
    strategicCost = { SUPPLY: siegeTier.supply, ...(siegeTier.iron > 0 ? { IRON: siegeTier.iron } : {}) };
    slotStructureType = siegeTier.variant;
  } else {
    goldCost = structureBuildGoldCost(structureType, context.ownedStructureCountForPlayer(command.playerId, structureType));
    manpowerCost = structureBuildManpowerCost(structureType);
  }
  if (actor.points < goldCost) {
    rejectCommand(context, command, "INSUFFICIENT_GOLD", `insufficient gold for ${structureLabel(structureType)}`);
    return;
  }
  if (actor.manpower < manpowerCost) {
    rejectCommand(context, command, "INSUFFICIENT_MANPOWER", `need ${manpowerCost.toFixed(0)} manpower for ${structureLabel(structureType)}`);
    return;
  }
  if (!hasFreeResourceSlots(context, command, structureType, slotStructureType, target, spec.tileField)) return;
  // Step 5 item 3 (Slice A): hasFreeResourceSlots above is now the ONLY gate
  // for FOOD/IRON/CRYSTAL/SUPPLY at build time -- stripRetiredStockpileCost
  // strips those keys out before spendStrategicCost ever sees them, so the
  // build-time stockpile check/spend is fully retired for them. SHARD still
  // spends normally (monument assembly). The stockpile *fields themselves*
  // (production, storage caps, ability/tech spend paths) are untouched here
  // — that's the larger, separate remainder of plan item 4.
  if (!spendStrategicCost(context, actor, command, structureType, stripRetiredStockpileCost(strategicCostForStructure(structureType, strategicCost)))) return;

  actor.points -= goldCost;
  actor.manpower = Math.max(0, actor.manpower - manpowerCost);

  const buildMs = spec.kind === "FORT"
    ? Math.max(1, Math.round(spec.buildMs / multiplicativeEffectForPlayer(actor, "fortBuildSpeedMult")))
    : spec.kind === "OUTPOST" && structureType !== "LIGHT_OUTPOST"
      ? Math.max(1, Math.round(spec.buildMs / multiplicativeEffectForPlayer(actor, "outpostDeploymentSpeedMult")))
      : spec.kind === "ECONOMIC"
        ? Math.max(1, Math.round(spec.buildMs / multiplicativeEffectForPlayer(actor, "economicStructureBuildSpeedMult")))
        : spec.buildMs;
  const completesAt = context.now() + buildMs;
  const isSiegeFamily = spec.kind === "OUTPOST" && structureType !== "LIGHT_OUTPOST";
  const isEcoStruct = spec.kind === "ECONOMIC" || structureType === "LIGHT_OUTPOST";
  let resolvedVariant: string | undefined;
  if (spec.kind === "FORT") {
    resolvedVariant = target.fort ? nextFortTierForUpgrade(target.fort.variant, hasTech)?.variant : bestFortTierForTech(hasTech).variant;
  } else if (isSiegeFamily) {
    resolvedVariant = target.siegeOutpost ? nextSiegeTierForUpgrade(target.siegeOutpost.variant, hasTech)?.variant : bestSiegeTierForTech(hasTech).variant;
  }

  const startedTile = {
    ...target,
    [spec.tileField]: {
      ownerId: command.playerId,
      status: "under_construction",
      ...(resolvedVariant ? { variant: resolvedVariant } : {}),
      ...(isEcoStruct ? { type: structureType } : {}),
      completesAt
    }
  } as DomainTileState;

  context.replaceTileState(targetKey, startedTile);
  context.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId: command.commandId, playerId: command.playerId, tileDeltas: [context.tileDeltaFromState(startedTile)] });
  context.emitPlayerStateUpdate(command);
  context.scheduleAfter(buildMs, () => context.completeStructureBuild(targetKey, command.playerId, structureType, command.commandId));
}

export function completeStructureBuild(context: RuntimeStructureCommandContext, targetKey: string, ownerId: string, structureType: string, commandId: string): void {
  const spec = STRUCTURE_REGISTRY[structureType];
  if (!spec) return;
  const latest = context.tiles.get(targetKey);
  if (!latest || latest.ownerId !== ownerId) return;
  const structure = latest[spec.tileField];
  if (!structure || structure.ownerId !== ownerId || structure.status !== "under_construction") return;
  if (spec.tileField === "economicStructure" && latest.economicStructure?.type !== structureType) return;

  const { completesAt: _, ...activeStructure } = structure;
  const activeVariant = "variant" in activeStructure ? activeStructure.variant : undefined;
  const garrisonInit = spec.tileField === "fort" && MUSTER_SYSTEM_ENABLED
    ? {
        garrison: initialGarrisonForVariant(activeVariant),
        garrisonCap: garrisonCapForVariant(activeVariant),
        garrisonUpdatedAt: context.now()
      }
    : {};
  const clearingWoodenFort =
    spec.tileField === "fort" &&
    latest.economicStructure?.type === "WOODEN_FORT" &&
    latest.economicStructure?.ownerId === ownerId;

  const completedTile = {
    ...latest,
    ...(clearingWoodenFort ? { economicStructure: undefined } : {}),
    [spec.tileField]: { ...activeStructure, status: "active", ...garrisonInit }
  } as DomainTileState;

  context.replaceTileState(targetKey, completedTile);
  context.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId, playerId: ownerId, tileDeltas: [context.tileDeltaFromState(completedTile)] });
  context.emitPlayerStateUpdate({ commandId, playerId: ownerId });
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId, playerId: ownerId });
}
