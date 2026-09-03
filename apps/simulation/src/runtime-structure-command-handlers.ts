import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import {
  STRUCTURE_REGISTRY,
  bestFortTierForTech,
  bestSiegeTierForTech,
  nextFortTierForUpgrade,
  nextSiegeTierForUpgrade,
  structureBuildGoldCost,
  structureBuildManpowerCostScaled,
  structureCostDefinition,
  structureShowsOnTile,
  structureSlotRequirements,
  RELAY_BEACON_FREE_FOOD_SLOT_COUNT, SYNTHESIZER_STRUCTURE_TYPES,
  QUARTERMASTERS_OFFICE_WAR_STRUCTURE_MANPOWER_COST_MULT,
  type BuildableStructureType,
  type EconomicStructureType,
  type SlotStructureType
} from "@border-empires/shared";
import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import { parseBuildStructurePayload } from "./runtime-command-parsers.js";
import { currentTileFieldSlotRequirements, totalsFromSlotRequirements, emptyResourceSlotTotals, type ResourceSlotTotals } from "./resource-slot-view/resource-slot-view.js";
import { simulationTileKey } from "./seed-state/seed-state.js";
import { multiplicativeEffectForPlayer } from "./tech-domain-bridge/tech-domain-bridge.js";
import { isMonumentBaseType, monumentBaseTypeForPartType, monumentClaimOwnerId } from "./monument-uniqueness.js";
import type { LockRecord, SimulationTileWireDelta, StrategicResourceKey } from "./runtime-types.js";
import { activeOrInactive, rejectCommand, structureLabel } from "./runtime-structure-command-handlers-reject.js";
import { resolveTownSupportTarget } from "./runtime-structure-town-support-target.js";

export { structureLabel } from "./runtime-structure-command-handlers-reject.js";

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
  // Fixed-border reach: gates a FRONTIER build target the same way SETTLE does (outposts skip the SETTLED requirement below).
  isPlayerTileInReach: (playerId: string, x: number, y: number) => boolean;
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
  // Same shape, retargeted at Assembly Works (tech-tree redesign): "only one
  // Assembly Works may be built per connected-town network."
  assemblyWorksAlreadyInNetwork: (playerId: string, townKey: string) => boolean;
  // Quartermaster's Office (tech-tree redesign): true when the player has an
  // active Quartermaster's Office within QUARTERMASTERS_OFFICE_RADIUS tiles
  // of (x, y) -- reduces manpower cost for War-branch structures built
  // there.
  hasNearbyQuartermastersOffice: (playerId: string, x: number, y: number) => boolean;
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  completeStructureBuild: (targetKey: string, ownerId: string, structureType: string, commandId: string) => void;
  completeStructureRemoval: (targetKey: string, ownerId: string, commandId: string) => void;
  // Timer completions (scheduleAfter) skip queueCommandForProcessing's flush, so
  // completion handlers must flush reach updates themselves (Relay Beacon border lag).
  flushReachUpdates: (causeCommandId: string) => void;
  // §20/§16: durable per-player log entry, used here for monument-claim/
  // race-consolation notices broadcast to every player.
  appendPlayerEventLogEntry: (
    player: DomainPlayer,
    input: { type: "MONUMENT_CLAIMED" | "MONUMENT_LOST_TO_RIVAL"; text: string; occurredAt: number; x?: number; y?: number }
  ) => void;
};

type StrategicCost = Partial<Record<StrategicResourceKey, number>>;

function upgradeBaseType(structureType: BuildableStructureType): string | undefined {
  if (structureType === "ADVANCED_UMBRITE_SYNTHESIZER") return "UMBRITE_SYNTHESIZER";
  if (structureType === "ADVANCED_TITANIUM_WORKS") return "TITANIUM_WORKS";
  if (structureType === "ADVANCED_CRYSTAL_SYNTHESIZER") return "CRYSTAL_SYNTHESIZER";
  if (structureType === "SEED_GRANARY") return "GRANARY";
  return undefined;
}

// §6.4's former "hard-capped at 1 per family, forever" rule (base + Advanced
// counted as the same slot) is removed per the converter-mode-flip plan
// (Decision 5): unlimited SYNTHESIZE-mode converters per family, flat
// upkeep, no curve. The slot gate is still bypassed for synthesizers because
// they are supply sources (§6.4) — they must be buildable even with zero
// free slots.

function strategicCostForStructure(
  structureType: BuildableStructureType,
  registryStrategicCost: StrategicCost | undefined
): StrategicCost | undefined {
  if (registryStrategicCost) return registryStrategicCost;
  const strategicDef = structureCostDefinition(structureType);
  if (!strategicDef?.resourceCost) return undefined;
  return { [strategicDef.resourceCost.resource]: strategicDef.resourceCost.amount };
}

// Step 5 item 3 (Slice A): FOOD/TITANIUM/CRYSTAL/UMBRITE are retired as a
// spendable build-time stockpile -- hasFreeResourceSlots (§5.1) is the real
// gate for those four keys now. SHARD stays a real spend (monument
// assembly, §5.5 -- event-gated, not slot-shaped, never a stockpile in the
// first place). Exported so applyStructureCancelRefund's refund builders
// (runtime-structure-lifecycle-command-handlers.ts) apply the identical
// filter and can never refund a key that build time never actually spent.
const RETIRED_STOCKPILE_RESOURCE_KEYS: ReadonlySet<StrategicResourceKey> = new Set(["FOOD", "TITANIUM", "CRYSTAL", "UMBRITE"]);

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
// resource(s) for as long as it exists — construction just needs a free slot
// at build time, no stockpile spend. `tileField`/`target` let an in-place
// upgrade (Fort/Siege tier ladders, granary Advanced pair) net out the
// requirement it's about to overwrite on its own tile, so it only needs
// *additional* capacity for the delta, not the new tier's full requirement
// stacked on top of the old one it's replacing.
// Synthesizers skip this gate entirely (§6.4: a slot *source*, not a
// consumer — must be buildable even with zero free slots). RELAY_BEACON
// skips it too below RELAY_BEACON_FREE_FOOD_SLOT_COUNT owned, waived to 0
// FOOD demand once built (slot-waivers.ts).
function hasFreeResourceSlots(
  context: RuntimeStructureCommandContext,
  command: CommandEnvelope,
  structureType: BuildableStructureType,
  slotStructureType: SlotStructureType,
  target: DomainTileState,
  tileField: "fort" | "observatory" | "siegeOutpost" | "economicStructure"
): boolean {
  if (SYNTHESIZER_STRUCTURE_TYPES.includes(structureType)) return true;
  if (structureType === "RELAY_BEACON" && context.ownedStructureCountForPlayer(command.playerId, "RELAY_BEACON") < RELAY_BEACON_FREE_FOOD_SLOT_COUNT) return true;
  const requirements = structureSlotRequirements(slotStructureType);
  if (requirements.length === 0) return true;
  const supply = context.resourceSlotSupplyForPlayer(command.playerId);
  const demand = context.resourceSlotDemandForPlayer(command.playerId);
  // A Relay Beacon's own FOOD demand is frequently waived to 0 (the
  // player's earliest RELAY_BEACON_FREE_FOOD_SLOT_COUNT beacons never count
  // against demand at all -- slot-waivers.ts), so crediting back its raw,
  // unwaived requirement here would double-count a slot that was never
  // actually consumed and let a Palisade build bypass this gate with zero
  // real free FOOD capacity. Building WOODEN_FORT over a Relay Beacon
  // therefore gets no netting credit for the beacon it's replacing.
  const alreadyOnThisTile = structureType === "WOODEN_FORT" && target.economicStructure?.type === "RELAY_BEACON"
    ? emptyResourceSlotTotals()
    : totalsFromSlotRequirements(currentTileFieldSlotRequirements(target, tileField, command.playerId));
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

  // §16: each monument type (Imperial Exchange/World Engine/Aegis Dome/
  // Astral Dock) is a single, global, season-unique prize — once anyone's
  // assembly is complete, nobody (including the winner, since only one can
  // ever stand) may build another part or assembly of that type.
  const monumentBaseType = isMonumentBaseType(structureType) ? structureType : monumentBaseTypeForPartType(structureType);
  if (monumentBaseType) {
    const claimedBy = monumentClaimOwnerId(context.tiles, monumentBaseType);
    if (claimedBy) {
      rejectCommand(context, command, "MONUMENT_CLAIMED", `${structureLabel(monumentBaseType)} has already been claimed this season`);
      return;
    }
  }

  // A monument component (e.g. IMPERIAL_EXCHANGE_PART_2) is a uniquely-named
  // one-of, not a stackable structure -- a player assembles exactly one of
  // each of the 3 parts before the base monument itself can go up. Without
  // this gate a player could spam the same part type on multiple tiles
  // (each one individually a legal CRYSTAL-slot build) and never actually
  // need the other two.
  if (monumentBaseType && monumentBaseType !== structureType) {
    for (const tile of context.tiles.values()) {
      if (
        tile.economicStructure?.ownerId === command.playerId &&
        tile.economicStructure.type === structureType &&
        (tile.economicStructure.status === "active" || tile.economicStructure.status === "under_construction")
      ) {
        rejectCommand(context, command, "BUILD_INVALID", `${structureLabel(structureType)} already built`);
        return;
      }
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
  if ((spec.kind !== "OUTPOST" || structureType === "RELAY_BEACON") && target.ownershipState !== "SETTLED") {
    rejectCommand(context, command, "BUILD_INVALID", "tile must be settled");
    return;
  }
  // Outposts skip SETTLED above; a FRONTIER target must still be in reach (no-op once settled — settled tiles are always already inside the border).
  if (target.ownershipState !== "SETTLED" && !context.isPlayerTileInReach(command.playerId, target.x, target.y)) {
    rejectCommand(context, command, "OUT_OF_REACH", "target is outside your reach");
    return;
  }

  const hasTech = (id: string) => actor.techIds.has(id);
  const buildingFort = spec.kind === "FORT";
  const buildingWoodenFort = structureType === "WOODEN_FORT";
  const buildingRelayBeacon = spec.kind === "OUTPOST" && structureType === "RELAY_BEACON";
  let upgrading = false;
  if (spec.kind === "FORT") {
    upgrading = target.economicStructure?.ownerId === command.playerId &&
      target.economicStructure.type === "WOODEN_FORT" &&
      activeOrInactive(target.economicStructure);
  } else if (spec.kind === "ECONOMIC") {
    const base = upgradeBaseType(structureType);
    upgrading = !!base &&
      target.economicStructure?.ownerId === command.playerId &&
      target.economicStructure.type === base &&
      activeOrInactive(target.economicStructure);
  }

  const sameFamilyUpgrade = (spec.kind === "FORT" && target.fort?.ownerId === command.playerId) ||
    (spec.kind === "OUTPOST" && structureType !== "RELAY_BEACON" && target.siegeOutpost?.ownerId === command.playerId);
  // A Fort and a Relay Beacon are allowed to share a tile: a Fort build
  // ignores an existing Relay Beacon in economicStructure, and a Relay
  // Beacon build ignores an existing Fort.
  //
  // WOODEN_FORT (Palisade) is itself kind "ECONOMIC" and lives in
  // economicStructure like a Relay Beacon does, so it can't share the tile
  // the way a full Fort can (same tile field, only one value fits). Building
  // a Palisade onto a Relay Beacon tile replaces the beacon instead of being
  // rejected outright -- consistent with how any other economic-slot build
  // overwrites the field below (`[spec.tileField]: {...}`).
  const economicConflict = !!target.economicStructure &&
    !((buildingFort || buildingWoodenFort) && target.economicStructure.type === "RELAY_BEACON");
  const fortConflict = !!target.fort && spec.kind !== "ECONOMIC" && !buildingRelayBeacon;
  if (!upgrading && !sameFamilyUpgrade && (target.observatory || target.siegeOutpost || economicConflict || fortConflict)) {
    rejectCommand(context, command, "BUILD_INVALID", "tile already has structure");
    return;
  }

  if (spec.kind === "FORT" && target.fort && !nextFortTierForUpgrade(target.fort.variant, hasTech)) {
    rejectCommand(context, command, "BUILD_INVALID", target.fort.variant === "THUNDER_BASTION" ? "fort already at maximum tier" : "research the next tier first");
    return;
  }
  if (spec.kind === "OUTPOST" && structureType !== "RELAY_BEACON" && target.siegeOutpost && !nextSiegeTierForUpgrade(target.siegeOutpost.variant, hasTech)) {
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
    strategicCost = { TITANIUM: fortTier.titanium };
    slotStructureType = fortTier.variant;
  } else if (spec.kind === "OUTPOST" && structureType !== "RELAY_BEACON") {
    const siegeTier = target.siegeOutpost ? nextSiegeTierForUpgrade(target.siegeOutpost.variant, hasTech)! : bestSiegeTierForTech(hasTech);
    goldCost = siegeTier.gold;
    manpowerCost = siegeTier.manpower;
    strategicCost = { UMBRITE: siegeTier.umbrite, ...(siegeTier.titanium > 0 ? { TITANIUM: siegeTier.titanium } : {}) };
    slotStructureType = siegeTier.variant;
  } else {
    goldCost = structureBuildGoldCost(structureType, context.ownedStructureCountForPlayer(command.playerId, structureType));
    // structureBuildManpowerCostScaled is a flat pass-through to
    // structureBuildManpowerCost for every type except TITANIUM_WEAPONS_FACTORY/
    // UMBRITE_WEAPONS_FACTORY, which escalate with the player's existing
    // empire-wide count (design doc "escalating build cost").
    manpowerCost = structureBuildManpowerCostScaled(structureType, context.ownedStructureCountForPlayer(command.playerId, structureType));
  }
  // Quartermaster's Office (tech-tree redesign): reduces manpower cost for
  // War-branch structures (Fort ladder, Siege ladder) built within its
  // radius. Checked after the base cost is resolved above so it applies to
  // fort/siege tier upgrades too, not just the first tier.
  const isWarBranchStructure = spec.kind === "FORT" || spec.kind === "OUTPOST";
  if (isWarBranchStructure && context.hasNearbyQuartermastersOffice(command.playerId, target.x, target.y)) {
    manpowerCost = Math.round(manpowerCost * QUARTERMASTERS_OFFICE_WAR_STRUCTURE_MANPOWER_COST_MULT);
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
  // for FOOD/TITANIUM/CRYSTAL/UMBRITE at build time -- stripRetiredStockpileCost
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
    : spec.kind === "OUTPOST" && structureType !== "RELAY_BEACON"
      ? Math.max(1, Math.round(spec.buildMs / multiplicativeEffectForPlayer(actor, "outpostDeploymentSpeedMult")))
      : spec.kind === "ECONOMIC"
        ? Math.max(1, Math.round(spec.buildMs / multiplicativeEffectForPlayer(actor, "economicStructureBuildSpeedMult")))
        : spec.buildMs;
  const completesAt = context.now() + buildMs;
  const isSiegeFamily = spec.kind === "OUTPOST" && structureType !== "RELAY_BEACON";
  const isEcoStruct = spec.kind === "ECONOMIC" || structureType === "RELAY_BEACON";
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

// completeStructureBuild lives in runtime-structure-build-completion.ts (500-
// line budget extraction) — re-exported here so existing importers of this
// module keep working unchanged.
export { completeStructureBuild } from "./runtime-structure-build-completion.js";
