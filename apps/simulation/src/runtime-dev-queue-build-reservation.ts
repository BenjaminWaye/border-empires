// Dev-queue MP/slot reservation (§ queued-buildings-mp-reimbursement): a
// BUILD entry sitting in the pre-slot dev queue (runtime-dev-queue.ts) now
// reserves manpower and a resource slot up front, at enqueue time, so a
// player can't queue more BUILD entries than they can actually afford --
// refunded exactly on cancel and refunded-then-recharged when the entry
// drains into a real BUILD_STRUCTURE command, so the unchanged, fully
// validated build handler (runtime-structure-command-handlers.ts) always
// does the final, authoritative charge. See runtime-dev-queue-command-
// handlers.ts for where these hooks are called.
import {
  STRUCTURE_REGISTRY,
  bestFortTierForTech,
  bestSiegeTierForTech,
  fortTierForBuild,
  nextSiegeTierForUpgrade,
  siegeTierForFreshBuild,
  structureBuildManpowerCostScaled,
  structureSlotRequirements,
  RELAY_BEACON_FREE_FOOD_SLOT_COUNT,
  SYNTHESIZER_STRUCTURE_TYPES,
  QUARTERMASTERS_OFFICE_WAR_STRUCTURE_MANPOWER_COST_MULT,
  SETTLE_MANPOWER_COST,
  type BuildableStructureType,
  type StructureSpec,
  type SlotResource,
  type SlotStructureType
} from "@border-empires/shared";
import { currentTileFieldSlotRequirements, totalsFromSlotRequirements, emptyResourceSlotTotals, type ResourceSlotTotals } from "./resource-slot-view/resource-slot-view.js";
import { simulationTileKey } from "./seed-state/seed-state.js";
import { structureLabel, type RuntimeStructureCommandContext } from "./runtime-structure-command-handlers.js";
import { creditManpower } from "./runtime-manpower-ceiling.js";
import { structureManpowerCostForPlayer } from "./structure-manpower-cost/structure-manpower-cost.js";
import type { DomainTileState } from "@border-empires/game-domain";

type StructureTileField = StructureSpec["tileField"];

export type DevQueueSlotRequirement = { resource: SlotResource; count: number };

export type DevQueueBuildReservation =
  | { ok: true; manpowerCost: number; slotRequirements: DevQueueSlotRequirement[] }
  | { ok: false; code: "UNKNOWN_STRUCTURE" | "INSUFFICIENT_MANPOWER" | "INSUFFICIENT_SLOT"; message: string };

export type RuntimeDevQueueReservationContext = {
  estimateBuildReservation: (
    playerId: string,
    structureType: string,
    x: number,
    y: number,
    extraSlotDemand: ResourceSlotTotals
  ) => DevQueueBuildReservation;
  estimateSettleReservation: (playerId: string) => DevQueueBuildReservation;
  applyManpowerReservation: (playerId: string, amount: number) => void;
  refundManpowerReservation: (playerId: string, amount: number) => void;
};

/** Sums the slot requirements already reserved by other queued BUILD entries, so a new enqueue's slot check nets them out too (queue-time-only demand -- never double-counted once an entry drains, since it leaves the array). */
export function reservedSlotDemandForQueue(entries: readonly { reservedSlotRequirements?: DevQueueSlotRequirement[] }[]): ResourceSlotTotals {
  const totals = emptyResourceSlotTotals();
  for (const entry of entries) {
    for (const req of entry.reservedSlotRequirements ?? []) {
      totals[req.resource] += req.count;
    }
  }
  return totals;
}

export function devQueueBuildReservationContext(context: RuntimeStructureCommandContext): RuntimeDevQueueReservationContext {
  return {
    estimateBuildReservation: (playerId, structureType, x, y, extraSlotDemand) =>
      estimateDevQueueBuildReservation(context, playerId, structureType, x, y, extraSlotDemand),
    estimateSettleReservation: (playerId) => estimateDevQueueSettleReservation(context, playerId),
    applyManpowerReservation: (playerId, amount) => {
      const player = context.players.get(playerId);
      if (player) player.manpower = Math.max(0, player.manpower - amount);
    },
    refundManpowerReservation: (playerId, amount) => {
      const player = context.players.get(playerId);
      if (player) creditManpower(player, amount, context.playerManpowerCap(player));
    }
  };
}

// Estimated from the clicked tile's *current* state, not necessarily the
// exact eventual build target (an ECONOMIC structure may still auto-place
// onto a support tile at drain time -- its manpower cost doesn't depend on
// which support tile, so this stays exact for that case; FORT tier
// resolution only depends on the clicked tile + tech, so it's exact there
// too). A fresh siege build is the exception: siegeTierForFreshBuild steps
// down to the best tier whose UMBRITE slots fit, so the tier reserved here
// (net of other queued entries) can differ from the tier the build handler
// picks at drain time from the then-current free slots. If conditions shift
// before the entry drains (tech researched, tile lost, tier maxed out, slots
// freed or taken), the real build handler re-validates and re-charges
// from scratch after the reservation is refunded -- so a stale estimate
// here only affects the soft queue-time hold, never actual correctness.
function estimateDevQueueBuildReservation(
  context: RuntimeStructureCommandContext,
  playerId: string,
  structureType: string,
  x: number,
  y: number,
  extraSlotDemand: ResourceSlotTotals
): DevQueueBuildReservation {
  const actor = context.players.get(playerId);
  const spec = STRUCTURE_REGISTRY[structureType as BuildableStructureType];
  const target = context.tiles.get(simulationTileKey(x, y));
  if (!actor || !spec || !target) {
    return { ok: false, code: "UNKNOWN_STRUCTURE", message: `unknown structure type: ${structureType}` };
  }
  const hasTech = (id: string) => actor.techIds.has(id);
  let manpowerCost: number;
  let slotStructureType: SlotStructureType = structureType as BuildableStructureType;
  if (spec.kind === "FORT") {
    const fortTier = fortTierForBuild(structureType, target.fort?.variant, hasTech) ?? bestFortTierForTech(hasTech);
    manpowerCost = fortTier.manpower;
    slotStructureType = fortTier.variant;
  } else if (spec.kind === "OUTPOST" && structureType !== "RELAY_BEACON") {
    // Mirrors the build handler: a fresh build steps down to the best tier whose UMBRITE slots fit.
    const siegeTier = target.siegeBattery
      ? (nextSiegeTierForUpgrade(target.siegeBattery.variant, hasTech) ?? bestSiegeTierForTech(hasTech))
      : siegeTierForFreshBuild(hasTech, (variant) => !firstSlotShortfall(context, playerId, target, spec.tileField, extraSlotDemand, structureSlotRequirements(variant)));
    manpowerCost = siegeTier.manpower;
    slotStructureType = siegeTier.variant;
  } else {
    manpowerCost = structureBuildManpowerCostScaled(structureType as BuildableStructureType, context.ownedStructureCountForPlayer(playerId, structureType as BuildableStructureType));
  }
  const isWarBranchStructure = spec.kind === "FORT" || spec.kind === "OUTPOST";
  if (isWarBranchStructure && context.hasNearbyQuartermastersOffice(playerId, x, y)) {
    manpowerCost = Math.round(manpowerCost * QUARTERMASTERS_OFFICE_WAR_STRUCTURE_MANPOWER_COST_MULT);
  }
  manpowerCost = structureManpowerCostForPlayer(actor, slotStructureType, manpowerCost);
  if (actor.manpower < manpowerCost) {
    return { ok: false, code: "INSUFFICIENT_MANPOWER", message: `need ${manpowerCost.toFixed(0)} manpower for ${structureLabel(structureType)}` };
  }
  const skipSlotGate = SYNTHESIZER_STRUCTURE_TYPES.includes(structureType as BuildableStructureType) ||
    (structureType === "RELAY_BEACON" && context.ownedStructureCountForPlayer(playerId, "RELAY_BEACON") < RELAY_BEACON_FREE_FOOD_SLOT_COUNT);
  const slotRequirements = skipSlotGate ? [] : structureSlotRequirements(slotStructureType);
  const shortfall = firstSlotShortfall(context, playerId, target, spec.tileField, extraSlotDemand, slotRequirements);
  if (shortfall) {
    const { req, free } = shortfall;
    // See the matching comment in runtime-structure-slot-gate.ts:
    // name the actual count required for a 2+-slot requirement instead
    // of always saying "no free X slot" regardless of how many are missing.
    const message = req.count === 1
      ? `no free ${req.resource} slot for ${structureLabel(structureType)}`
      : `${structureLabel(structureType)} needs ${req.count} free ${req.resource} slots, only ${Math.max(0, free)} free`;
    return { ok: false, code: "INSUFFICIENT_SLOT", message };
  }
  return { ok: true, manpowerCost, slotRequirements };
}

// First requirement that doesn't fit the player's free slots (net of this
// tile's own current occupant and of other queued entries' reservations).
function firstSlotShortfall(
  context: RuntimeStructureCommandContext,
  playerId: string,
  target: DomainTileState,
  tileField: StructureTileField,
  extraSlotDemand: ResourceSlotTotals,
  requirements: readonly DevQueueSlotRequirement[]
): { req: DevQueueSlotRequirement; free: number } | undefined {
  if (requirements.length === 0) return undefined;
  const supply = context.resourceSlotSupplyForPlayer(playerId);
  const demand = context.resourceSlotDemandForPlayer(playerId);
  const alreadyOnThisTile = totalsFromSlotRequirements(currentTileFieldSlotRequirements(target, tileField, playerId));
  for (const req of requirements) {
    const reserved = extraSlotDemand[req.resource] ?? 0;
    const free = supply[req.resource] - demand[req.resource] + alreadyOnThisTile[req.resource] - reserved;
    if (free < req.count) return { req, free };
  }
  return undefined;
}

// SETTLE reserves only manpower (no resource slot -- the slot it will
// eventually occupy is a settled-tile field slot, not a dev-queue build
// slot). The gold cost (SETTLE_COST) is charged later, at
// startSettlementProcess, same as today -- only the manpower half moved
// earlier per the immediate-deduction-on-queue fix.
function estimateDevQueueSettleReservation(context: RuntimeStructureCommandContext, playerId: string): DevQueueBuildReservation {
  const actor = context.players.get(playerId);
  if (!actor) {
    return { ok: false, code: "UNKNOWN_STRUCTURE", message: "unknown player" };
  }
  if (actor.manpower < SETTLE_MANPOWER_COST) {
    return { ok: false, code: "INSUFFICIENT_MANPOWER", message: `need ${SETTLE_MANPOWER_COST} manpower to garrison` };
  }
  return { ok: true, manpowerCost: SETTLE_MANPOWER_COST, slotRequirements: [] };
}
