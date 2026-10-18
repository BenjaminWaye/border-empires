import { slotWaiversForPlayer } from "./tech-domain-bridge/slot-waivers.js";
import type { DomainTileState } from "@border-empires/game-domain";
import {
  fortIsWithinSlotWaiver,
  RELAY_BEACON_FREE_FOOD_SLOT_COUNT,
  SYNTHESIZER_STRUCTURE_TYPES,
  structureSlotRequirements, observatoryCrystalSlotCostForOwnedCount,
  type BuildableStructureType,
  type SlotStructureType
} from "@border-empires/shared";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { currentTileFieldSlotRequirements, totalsFromSlotRequirements } from "./resource-slot-view/resource-slot-view.js";
import { rejectCommand, structureLabel } from "./runtime-structure-command-handlers-reject.js";
import type { RuntimeStructureCommandContext } from "./runtime-structure-command-handlers.js";

// Split out of runtime-structure-command-handlers.ts (over the repo's 500-line
// growth cap): the free-slot gate a build command has to pass.
// §5.1/§5.6: a structure permanently occupies a slot of its required
// resource(s) for as long as it exists — construction just needs a free slot
// at build time, no stockpile spend. `tileField`/`target` let an in-place
// upgrade (Fort/Siege tier ladders, incubation engine Advanced pair) net out the
// requirement it's about to overwrite on its own tile, so it only needs
// *additional* capacity for the delta, not the new tier's full requirement
// stacked on top of the old one it's replacing.
// Synthesizers skip this gate entirely (§6.4: a slot *source*, not a
// consumer — must be buildable even with zero free slots). RELAY_BEACON
// skips it too below RELAY_BEACON_FREE_FOOD_SLOT_COUNT owned, waived to 0
// FOOD demand once built (slot-waivers.ts).
type SlotGateContext = Pick<RuntimeStructureCommandContext, "players" | "tiles" | "ownedStructureCountForPlayer" | "summaryForPlayer" | "resourceSlotSupplyForPlayer" | "resourceSlotDemandForPlayer" | "emitEvent">;

function hasFortWaiver(context: SlotGateContext, target: DomainTileState, playerId: string, count: number, ownedCount: number): boolean {
  if (count <= 0) return false;
  if (!target.fort) return ownedCount < count;
  const tiles: DomainTileState[] = [];
  for (const key of context.summaryForPlayer?.(playerId).territoryTileKeys ?? context.tiles.keys()) {
    const tile = context.tiles.get(key);
    if (tile?.ownerId === playerId && tile.fort) tiles.push(tile);
  }
  return fortIsWithinSlotWaiver(target, tiles, playerId, count);
}

export function hasFreeResourceSlots(
  context: SlotGateContext,
  command: CommandEnvelope,
  structureType: BuildableStructureType,
  slotStructureType: SlotStructureType,
  target: DomainTileState,
  tileField: "fort" | "observatory" | "siegeBattery" | "economicStructure"
): boolean {
  if (SYNTHESIZER_STRUCTURE_TYPES.includes(structureType)) return true;
  if (structureType === "RELAY_BEACON" && context.ownedStructureCountForPlayer(command.playerId, "RELAY_BEACON") < RELAY_BEACON_FREE_FOOD_SLOT_COUNT) return true;
  const player = context.players.get(command.playerId);
  const waivers = player ? slotWaiversForPlayer(player) : undefined;
  const fortCount = context.ownedStructureCountForPlayer(command.playerId, "FORT");
  const towerCount = context.ownedStructureCountForPlayer(command.playerId, "OBSERVATORY");
  const requirements = (structureType === "OBSERVATORY"
    ? [{ resource: "CRYSTAL" as const, count: observatoryCrystalSlotCostForOwnedCount(towerCount) }]
    : structureSlotRequirements(slotStructureType)).filter(req => !(
      (tileField === "fort" && req.resource === "TITANIUM" && hasFortWaiver(context, target, command.playerId, waivers?.fortTitaniumSlotWaiverCount ?? 0, fortCount)) ||
      (tileField === "observatory" && req.resource === "CRYSTAL" && !target.observatory && towerCount < (waivers?.observatoryCrystalSlotWaiverCount ?? 0))
    ));
  if (requirements.length === 0) return true;
  const supply = context.resourceSlotSupplyForPlayer(command.playerId);
  const demand = context.resourceSlotDemandForPlayer(command.playerId);
  const alreadyOnThisTile = totalsFromSlotRequirements(currentTileFieldSlotRequirements(target, tileField, command.playerId));
  for (const req of requirements) {
    const freeExcludingThisTile = supply[req.resource] - demand[req.resource] + alreadyOnThisTile[req.resource];
    if (freeExcludingThisTile < req.count) {
      // Name the actual count required, not just the resource -- a
      // requirement of 2+ slots (SIEGE_TOWER needs 2 UMBRITE, DREAD_TOWER
      // needs 3) previously always said "no free UMBRITE slot" regardless
      // of how many were missing, so freeing exactly one slot left the
      // message unchanged and looked like nothing had happened.
      const message = req.count === 1
        ? `no free ${req.resource} slot for ${structureLabel(structureType)}`
        : `${structureLabel(structureType)} needs ${req.count} free ${req.resource} slots, only ${Math.max(0, freeExcludingThisTile)} free`;
      rejectCommand(context, command, "INSUFFICIENT_SLOT", message);
      return false;
    }
  }
  return true;
}
